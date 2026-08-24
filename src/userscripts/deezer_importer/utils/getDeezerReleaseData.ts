import { Logger } from '../../../lib/logger';
import { getGmApi } from '../../../lib/userscript-api';
import type { DeezerAlbum, DeezerTracksResponse } from '../types';

const releaseCache = new Map<string, DeezerAlbum>();

function httpGetJson<T>(url: string, logger: Logger): Promise<T | null> {
    const request = getGmApi('xmlHttpRequest');

    if (!request) {
        logger.error('Userscript requires GM_xmlHttpRequest or GM.xmlHttpRequest');
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        request({
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
    });
}

/**
 * Fetches complete Deezer album data and all paginated tracks.
 * If any track pagination request fails, returns null without caching partial data.
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
        if (!tracksResponse || !tracksResponse.data) {
            logger.error(`Failed to fetch complete track list for album ${releaseId}`);
            return null;
        }

        album.tracks.data.push(...tracksResponse.data);
        nextTracksUrl = tracksResponse.next;
    }

    releaseCache.set(releaseId, album);
    return album;
}
