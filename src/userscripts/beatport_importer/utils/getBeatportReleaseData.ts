import { Logger } from '~/lib/logger';

import type { BeatportPageData, BeatportReleaseData, BeatportSSRState, BeatportTrackData, BeatportTracksResponse as BeatportTracksResponse } from '../types';

/**
 * Cache for release data intercepted from Beatport's own fetch requests.
 * When the user navigates via SPA, Beatport fetches the release JSON — we capture
 * it here to avoid making a duplicate request.
 */
const interceptedReleaseCache = new Map<string, BeatportReleaseData>();
const interceptedTracksCache = new Map<string, BeatportTrackData[]>();
const tracksCacheKey = (releaseId: string, page: string): string => `${releaseId}/${page}`;

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
                    const release = pageData.pageProps.release;
                    const releaseIdFromData = release?.id.toString();
                    if (release && releaseIdFromData === releaseId) {
                        interceptedReleaseCache.set(releaseId, release);
                    }
                })
                .catch((error: unknown) => {
                    logger.error('Error parsing release data: ', error as Error);
                });
        }

        const tracksMatch = url.match(/api\.beatport\.com\/v4\/catalog\/releases\/(\d+)\/tracks\/\?.*page=(\d+).*/);
        const tracksReleaseId = tracksMatch?.[1];
        const page = tracksMatch?.[2];
        if (tracksReleaseId && page && response.ok) {
            response.clone().json()
                .then((data: unknown) => {
                    const tracks = (data as BeatportTracksResponse).results;
                    const key = tracksCacheKey(tracksReleaseId, page);
                    interceptedTracksCache.set(key, tracks);
                })
                .catch((error: unknown) => {
                    logger.error('Error parsing tracks data: ', error as Error);
                });
        }

        return response;
    };
    try {
        window.fetch = interceptor;
    } catch (error) {
        logger.debug("Couldn't install interceptor", error)
        // fetch is read-only in Firefox/Greasemonkey sandbox; script works without interceptor
    }
}

function getLocaleFromPath(): string {
    const match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
    return match?.[1] ?? 'en';
}

function getReleaseSlugFromPath(): string | null {
    const match = window.location.pathname.match(/\/release\/([^/]+)\/\d+/);
    return match?.[1] ?? null;
}

async function fetchReleaseFromNextDataApi(
    buildId: string,
    releaseId: string,
    logger: Logger,
    page?: number,
): Promise<BeatportReleaseData | null> {
    const locale = getLocaleFromPath();
    const slug = getReleaseSlugFromPath();
    const name_placeholder = slug ?? '0'; // Use actual slug when available for pagination
    let pageDataURL = `https://www.beatport.com/_next/data/${buildId}/${locale}/release/${name_placeholder}/${releaseId}.json?id=${releaseId}`;
    if (page != null && page > 1) {
        pageDataURL += `&per_page=100&page=${page}`;
        if (slug) {
            pageDataURL += `&description=${encodeURIComponent(slug)}`;
        }
    }
    try {
        const response = await fetch(pageDataURL);
        const pageData = (await response.json()) as unknown as BeatportPageData;
        return pageData.pageProps.release ?? null;
    } catch (error) {
        logger.error('Error fetching release data:', error);
        return null;
    }
}

async function fetchTracks(releaseId: string, logger: Logger, page?: number): Promise<BeatportTrackData[] | null> {
    const tokenJson = localStorage.getItem('token-refresh-result')
    if (!tokenJson) {
        logger.error('Failed to retrieve token from localStorage: the `token-refresh-results` key is not set')
        return null
    }
    const token = JSON.parse(tokenJson)?.accessToken;
    if (!token) {
        logger.error('Failed to parse token saved in localStorage')
        return null
    }

    const url = `https://api.beatport.com/v4/catalog/releases/${releaseId}/tracks/?page=${page ?? 1}&per_page=100`
    try {
        const response = await fetch(url, {headers: {'Authorization': `Bearer ${token}`}});
        const trackData = (await response.json()) as unknown as BeatportTracksResponse;
        return trackData.results;
    } catch (error) {
        logger.error('Error fetching release data:', error);
        return null;
    }
}

function getBuildId(): string | undefined {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return undefined;
    try {
        const data = JSON.parse(el.innerHTML) as BeatportSSRState;
        return data.buildId;
    } catch {
        return undefined;
    }
}

/**
 * Release ID always comes from the URL. On SPA navigation, use interceptor cache;
 * on initial load, read __NEXT_DATA__ (its release id only verifies URL match — Next does not refresh it on client nav).
 */
export const getBeatportReleaseData = async (logger: Logger): Promise<{release: BeatportReleaseData, tracks: BeatportTrackData[]} | null> => {
    const releaseIdFromURL = window.location.pathname.match(/release\/[^/]+\/(\d+)/)?.[1];
    if (!releaseIdFromURL) {
        /** Early return to avoid running the script on non-release pages */
        return null;
    }

    let releaseData: BeatportReleaseData | null = null;
    let buildId: string | undefined;

    // SPA navigation: fresh JSON from Beatport's own fetch (see installFetchInterceptor).
    const cached = interceptedReleaseCache.get(releaseIdFromURL);
    if (cached) {
        interceptedReleaseCache.delete(releaseIdFromURL);
        releaseData = cached;
    }

    const initialNextDataElement = document.getElementById('__NEXT_DATA__');
    if (initialNextDataElement && !releaseData) {
        const data = JSON.parse(initialNextDataElement.innerHTML) as unknown as BeatportSSRState;
        // Initial load only: confirm embedded payload matches the URL before trusting it.
        const initialReleaseId = data.props.pageProps.release?.id.toString();
        buildId = data.buildId;

        if (initialReleaseId === releaseIdFromURL) {
            releaseData = data.props.pageProps.release ?? null;
        } else if (buildId) {
            releaseData = await fetchReleaseFromNextDataApi(buildId, releaseIdFromURL, logger);
        }
    }

    if (!releaseData) {
        logger.error('Cannot fetch release data: no __NEXT_DATA__ or buildId found');
        return null;
    }

    buildId ??= getBuildId();

    let tracksData: BeatportTrackData[] = [];
    let page = 1;
    for (; page <= Math.ceil(releaseData.track_count / 100); page++) {
        const key = tracksCacheKey(releaseIdFromURL, `${page}`);
        const cachedTracks = interceptedTracksCache.get(key);
        if (cachedTracks) {
            interceptedTracksCache.delete(key);
            tracksData = tracksData.concat(cachedTracks);
        }
    }
    for (; page <= Math.ceil(releaseData.track_count / 100); page++) {
        let res = await fetchTracks(releaseIdFromURL, logger, page);
        if (res)
            tracksData = tracksData.concat(res);
    }

    if (releaseData && tracksData)
        return { release: releaseData, tracks: tracksData };
    else
        return null;
};
