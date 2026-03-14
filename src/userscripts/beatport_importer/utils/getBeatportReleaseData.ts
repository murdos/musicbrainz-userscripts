import { Logger } from '~/lib/logger';
import type { BeatportPageData, BeatportSSRState, BeatportTrackData } from '../types';

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

function getReleaseSlugFromPath(): string | null {
    const match = window.location.pathname.match(/\/release\/([^/]+)\/\d+/);
    return match?.[1] ?? null;
}

async function fetchReleaseFromNextDataApi(
    buildId: string,
    releaseId: string,
    logger: Logger,
    page?: number,
): Promise<BeatportPageData | null> {
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
        return pageData;
    } catch (error) {
        logger.error('Error fetching release data:', error);
        return null;
    }
}

/**
 * For releases with 100+ tracks, Beatport paginates the track data. Each page returns only
 * that page's tracks (page 1 = 100, page 2 = 9 for a 109-track release). The initial data
 * may be from whichever page the user is viewing, so we always fetch all pages to ensure
 * we get the complete track list regardless of the current view.
 */
async function ensureFullTrackData(
    pageData: BeatportPageData,
    buildId: string,
    releaseId: string,
    logger: Logger,
): Promise<BeatportPageData> {
    const release = pageData.pageProps.release;
    if (!release || release.track_count <= 100) {
        return pageData;
    }

    const tracksQuery = pageData.pageProps.dehydratedState.queries.find(q => /tracks/.test(q.queryKey));

    const currentTrackCount = tracksQuery?.state?.data.results.length ?? 0;
    if (currentTrackCount >= release.track_count) {
        return pageData;
    }

    const totalPages = Math.ceil(release.track_count / 100);
    const allResults: BeatportTrackData[] = [];

    for (let page = 1; page <= totalPages; page++) {
        logger.info(`Fetching page ${page}/${totalPages} to get full track list (${release.track_count} tracks)`);
        const paginatedData = await fetchReleaseFromNextDataApi(buildId, releaseId, logger, page);
        if (!paginatedData) continue;

        const pageTracksQuery = paginatedData.pageProps.dehydratedState.queries.find(q => /tracks/.test(q.queryKey));
        const pageResults = pageTracksQuery?.state?.data.results ?? [];
        allResults.push(...pageResults);
    }

    if (allResults.length < release.track_count) {
        logger.info('Could not fetch all paginated track data, using partial data');
        return pageData;
    }

    // Merge full track data into our page data
    const updatedQueries = pageData.pageProps.dehydratedState.queries.map(q => {
        if (!/tracks/.test(q.queryKey)) return q;
        const updatedState = q.state ? { ...q.state, data: { ...q.state.data, results: allResults } } : undefined;
        return updatedState != null ? { ...q, state: updatedState } : q;
    });

    return {
        pageProps: {
            ...pageData.pageProps,
            dehydratedState: {
                ...pageData.pageProps.dehydratedState,
                queries: updatedQueries,
            },
        },
    };
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

export const getBeatportReleaseData = async (logger: Logger): Promise<BeatportPageData | null> => {
    const releaseIdFromURL = window.location.pathname.match(/release\/[^/]+\/(\d+)/)?.[1];
    if (!releaseIdFromURL) {
        return null;
    }

    let pageData: BeatportPageData | null = null;
    let buildId: string | undefined;

    const cached = interceptedReleaseCache.get(releaseIdFromURL);
    if (cached) {
        interceptedReleaseCache.delete(releaseIdFromURL);
        pageData = cached;
    }

    const initialNextDataElement = document.getElementById('__NEXT_DATA__');
    if (initialNextDataElement && !pageData) {
        const data = JSON.parse(initialNextDataElement.innerHTML) as unknown as BeatportSSRState;
        const initialReleaseId = data.props.pageProps.release?.id.toString();
        buildId = data.buildId;

        if (initialReleaseId === releaseIdFromURL) {
            pageData = data.props;
        } else if (buildId) {
            pageData = await fetchReleaseFromNextDataApi(buildId, releaseIdFromURL, logger);
        }
    }

    if (!pageData) {
        logger.error('Cannot fetch release data: no __NEXT_DATA__ or buildId found');
        return null;
    }

    buildId ??= getBuildId();
    if (buildId) {
        pageData = await ensureFullTrackData(pageData, buildId, releaseIdFromURL, logger);
    }

    return pageData;
};
