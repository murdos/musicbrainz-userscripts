import type { BeatportPageData, BeatportSSRState } from '../types';
import { Logger } from '~/lib/logger';

/**
 * Cache for release data intercepted from Beatport's own fetch requests.
 * When the user navigates via SPA, Beatport fetches the release JSON — we capture
 * it here to avoid making a duplicate request.
 */
const interceptedReleaseCache = new Map<string, BeatportPageData>();

/**
 * Install a fetch interceptor to capture Beatport's release data responses.
 * Call once at script load, before any navigation can occur.
 * Skips installation if fetch is read-only (e.g. Firefox/Greasemonkey sandbox).
 */
export function installFetchInterceptor(logger: Logger): void {
    const originalFetch = window.fetch.bind(window);
    const interceptor = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const response = await originalFetch(input, init);
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const releaseMatch = url.match(/beatport\.com\/_next\/data\/[^/]+\/[a-z]{2}(?:-[a-z]{2})?\/release\/[^/]+\/(\d+)\.json/);
        const releaseId = releaseMatch?.[1];
        if (releaseId && response.ok) {
            response
                .clone()
                .json()
                .then((data: unknown) => {
                    const pageData = data as BeatportPageData;
                    const releaseIdFromData = pageData.pageProps.release?.id.toString();
                    if (releaseIdFromData === releaseId) {
                        interceptedReleaseCache.set(releaseId, pageData);
                    }
                })
                .catch((error: unknown) => {
                    logger.error('Error parsing release data: ', error as Error);
                });
        }
        return response;
    };
    try {
        window.fetch = interceptor;
    } catch {
        // fetch is read-only in Firefox/Greasemonkey sandbox; script works without interceptor
    }
}

function getLocaleFromPath(): string {
    const match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
    return match?.[1] ?? 'en';
}

async function fetchReleaseFromNextDataApi(buildId: string, releaseId: string, logger: Logger): Promise<BeatportPageData | null> {
    const locale = getLocaleFromPath();
    const name_placeholder = '0'; // NextJS ignores this parameter
    const pageDataURL = `https://www.beatport.com/_next/data/${buildId}/${locale}/release/${name_placeholder}/${releaseId}.json?id=${releaseId}`;
    try {
        const response = await fetch(pageDataURL);
        const pageData = (await response.json()) as unknown as BeatportPageData;
        return pageData;
    } catch (error) {
        logger.error('Error fetching release data:', error);
        return null;
    }
}

export const getBeatportReleaseData = async (logger: Logger): Promise<BeatportPageData | null> => {
    const releaseIdFromURL = window.location.pathname.match(/release\/[^/]+\/(\d+)/)?.[1];
    if (!releaseIdFromURL) {
        return null;
    }

    const cached = interceptedReleaseCache.get(releaseIdFromURL);
    if (cached) {
        interceptedReleaseCache.delete(releaseIdFromURL);
        return cached;
    }

    const initialNextDataElement = document.getElementById('__NEXT_DATA__');
    if (initialNextDataElement) {
        const data = JSON.parse(initialNextDataElement.innerHTML) as unknown as BeatportSSRState;
        const initialReleaseId = data.props.pageProps.release?.id.toString();
        const buildId = data.buildId;

        if (initialReleaseId === releaseIdFromURL) {
            return data.props;
        }

        if (buildId) {
            return fetchReleaseFromNextDataApi(buildId, releaseIdFromURL, logger);
        }
    }

    logger.error('Cannot fetch release data: no __NEXT_DATA__ or buildId found');
    return null;
};
