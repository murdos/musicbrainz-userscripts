import { Logger } from '../../../lib/logger';
import type { DeezerAlbum, DeezerTracksResponse } from '../types';

declare const GM: { xmlHttpRequest?: (details: GmRequestDetails) => unknown } | undefined;
declare const GM_xmlhttpRequest: ((details: GmRequestDetails) => unknown) | undefined;

interface GmResponse {
    responseText: string;
    status: number;
}

interface GmRequestDetails {
    method: string;
    url: string;
    onload: (response: GmResponse) => void;
    onerror: (response: GmResponse) => void;
}

const releaseCache = new Map<string, DeezerAlbum>();

function httpGetJson<T>(url: string, logger: Logger): Promise<T | null> {
    return new Promise(resolve => {
        const gmReq = (typeof GM !== 'undefined' && GM.xmlHttpRequest) || (typeof GM_xmlhttpRequest !== 'undefined' && GM_xmlhttpRequest);

        if (gmReq) {
            gmReq({
                method: 'GET',
                url,
                onload: res => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            const data = JSON.parse(res.responseText) as T;
                            resolve(data);
                        } catch (err: unknown) {
                            logger.error(`Failed to parse JSON from ${url}:`, err);
                            resolve(null);
                        }
                    } else {
                        logger.error(`HTTP request to ${url} failed with status ${res.status}`);
                        resolve(null);
                    }
                },
                onerror: res => {
                    logger.error(`Network error requesting ${url} (status: ${res.status})`);
                    resolve(null);
                },
            });
        } else {
            fetch(url)
                .then(res => (res.ok ? (res.json() as Promise<T>) : null))
                .then(data => {
                    resolve(data);
                })
                .catch((err: unknown) => {
                    logger.error(`Fetch request to ${url} failed:`, err);
                    resolve(null);
                });
        }
    });
}

/**
 * Fetches complete Deezer album data and all paginated tracks.
 */
export async function getDeezerReleaseData(releaseId: string, logger: Logger): Promise<DeezerAlbum | null> {
    const cached = releaseCache.get(releaseId);
    if (cached) {
        return cached;
    }

    const albumApiUrl = `https://api.deezer.com/album/${releaseId}?limit=1`;
    const album = await httpGetJson<DeezerAlbum>(albumApiUrl, logger);

    if (!album || !album.title) {
        logger.error(`Could not retrieve Deezer album info for release ID ${releaseId}`);
        return null;
    }

    album.tracks = { data: [] };

    let nextTracksUrl: string | undefined = `https://api.deezer.com/album/${releaseId}/tracks?limit=100`;
    while (nextTracksUrl) {
        const tracksResponse: DeezerTracksResponse | null = await httpGetJson<DeezerTracksResponse>(nextTracksUrl, logger);
        if (!tracksResponse?.data) {
            break;
        }

        album.tracks.data.push(...tracksResponse.data);
        nextTracksUrl = tracksResponse.next;
    }

    releaseCache.set(releaseId, album);
    return album;
}
