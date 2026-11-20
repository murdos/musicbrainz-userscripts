import type { Logger } from '~/lib/logger';
import type { BeatportTrackData } from '~/userscripts/beatport_importer/types';

type TracksResponse = { results: BeatportTrackData[] };
type TracksRequest = Promise<BeatportTrackData[] | null>;
type XHRRequest = { url: string; headers: Headers };

const API_ORIGIN = 'https://api.beatport.com';
const trackRequests = new Map<string, TracksRequest>();
let authorization: string | null = null;

const readTracks = async (request: Promise<Response>): TracksRequest => {
    try {
        const response = await request;

        if (!response.ok) {
            return null;
        }

        const copy = response.clone();
        const data = (await copy.json()) as TracksResponse;

        return data.results;
    } catch {
        return null;
    }
};

// Called before awaiting fetch so the importer can reuse an in-flight request.
export const captureTrackRequest = (input: RequestInfo | URL, init: RequestInit | undefined, request: Promise<Response>): void => {
    let requestURL = String(input);
    let requestHeaders = init?.headers;

    if (input instanceof Request) {
        requestURL = input.url;
        requestHeaders ??= input.headers;
    }

    const url = new URL(requestURL, window.location.href);

    if (url.origin !== API_ORIGIN) {
        return;
    }

    const headers = new Headers(requestHeaders);
    authorization = headers.get('Authorization') ?? authorization;
    const isTracksRequest = /^\/v4\/catalog\/releases\/\d+\/tracks\/$/.test(url.pathname);

    if (isTracksRequest) {
        url.searchParams.sort();
        const tracks = readTracks(request);
        trackRequests.set(url.href, tracks);
    }
};

const readXHRResponse = (xhr: XMLHttpRequest): Response => {
    try {
        if (xhr.status >= 200 && xhr.status < 300) {
            let response: Response;

            if (xhr.responseType === 'json') {
                response = Response.json(xhr.response);
            } else {
                response = new Response(xhr.responseText);
            }

            return response;
        }
    } catch {
        // Unsupported response types are ignored without affecting Beatport.
    }

    const failedResponse = Response.error();

    return failedResponse;
};

/** Beatport’s API client uses XHR rather than fetch on some pages. */
export const installXHRInterceptor = (logger: Logger): void => {
    const requests = new WeakMap<XMLHttpRequest, XHRRequest>();
    const prototype = XMLHttpRequest.prototype;
    const originalOpen = prototype.open;
    const originalSetRequestHeader = prototype.setRequestHeader;
    const originalSend = prototype.send;

    try {
        prototype.open = function (
            method: string,
            url: string | URL,
            async: boolean = true,
            username?: string | null,
            password?: string | null,
        ) {
            originalOpen.call(this, method, url, async, username, password);
            const requestURL = new URL(url, window.location.href);

            // Clear metadata when the same XHR object is reused for another origin.
            requests.delete(this);

            if (requestURL.origin === API_ORIGIN) {
                const headers = new Headers();
                const request = { url: requestURL.href, headers };
                requests.set(this, request);
            }
        };

        prototype.setRequestHeader = function (name, value) {
            originalSetRequestHeader.call(this, name, value);
            const request = requests.get(this);

            request?.headers.append(name, value);
        };

        prototype.send = function (body) {
            const request = requests.get(this);

            if (request) {
                const response = new Promise<Response>(resolve => {
                    const onLoadEnd = () => {
                        const capturedResponse = readXHRResponse(this);
                        resolve(capturedResponse);
                    };
                    this.addEventListener('loadend', onLoadEnd, { once: true });
                });
                const options: RequestInit = { headers: request.headers };
                captureTrackRequest(request.url, options, response);
            }

            originalSend.call(this, body);
        };
    } catch {
        logger.error('Could not intercept Beatport’s XMLHttpRequest requests');
    }
};

export const getBeatportTracks = async (releaseId: string, trackCount: number, logger: Logger): Promise<BeatportTrackData[] | null> => {
    const path = `/v4/catalog/releases/${releaseId}/tracks/`;
    const startedAt = Date.now();
    const deadline = startedAt + 10_000;

    // Beatport may start its authenticated request after the importer runs.
    while (!authorization) {
        const now = Date.now();

        if (now >= deadline) {
            logger.error('Could not load tracks: no authenticated Beatport request was observed. Reload the page and try again.');

            return null;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const tracks: BeatportTrackData[] = [];
    const totalPages = Math.ceil(trackCount / 100);

    for (let page = 1; page <= totalPages; page++) {
        const url = new URL(path, API_ORIGIN);
        const pageNumber = String(page);
        url.searchParams.set('page', pageNumber);
        url.searchParams.set('per_page', '100');
        url.searchParams.sort();
        const cached = trackRequests.get(url.href);
        let pageTracks: BeatportTrackData[] | null = null;

        if (cached) {
            pageTracks = await cached;
        }

        if (!pageTracks) {
            const options: RequestInit = {
                headers: { Authorization: authorization },
                redirect: 'error',
            };
            const request = fetch(url.href, options);
            pageTracks = await readTracks(request);
        }

        if (!pageTracks) {
            // Do not log request objects or credentials.
            logger.error('Could not fetch Beatport tracks');

            return null;
        }

        tracks.push(...pageTracks);
    }

    return tracks;
};
