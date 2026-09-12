import { normalizeServiceName } from '~/lib/smart-link-importer/logic';

export interface SonglinkAnchorDetails {
    label: string;
    action: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Build the parent release URL exposed for Songlink's source track. */
export function extractSonglinkSourceRelease(payload: unknown): { service: string; url: string } | undefined {
    const root = record(payload);
    const props = record(root?.['props']);
    const pageProps = record(props?.['pageProps']);
    const pageData = record(pageProps?.['pageData']);
    const entityData = record(pageData?.['entityData']);
    if (entityData?.['type'] !== 'song' && entityData?.['type'] !== 'track') return undefined;

    const rawProvider = entityData['provider'];
    const rawAlbumId = entityData['albumId'];
    if (typeof rawProvider !== 'string' || (typeof rawAlbumId !== 'string' && typeof rawAlbumId !== 'number')) return undefined;

    const service = normalizeServiceName(rawProvider);
    const albumId = encodeURIComponent(String(rawAlbumId));
    if (service === 'spotify') return { service, url: `https://open.spotify.com/album/${albumId}` };
    if (service === 'tidal') return { service, url: `https://tidal.com/album/${albumId}` };
    if (service === 'deezer') return { service, url: `https://www.deezer.com/album/${albumId}` };
    if (service === 'amazon') return { service, url: `https://music.amazon.com/albums/${albumId}` };
    return undefined;
}

/** Identify destinations which cannot represent a MusicBrainz release relationship. */
export function isTrackLevelServiceUrl(rawUrl: string, rawService: string): boolean {
    const service = normalizeServiceName(rawService);
    try {
        const url = new URL(rawUrl);
        if (['spotify', 'tidal', 'deezer', 'bandcamp', 'amazon'].includes(service)) {
            return /\/(?:track|tracks)\//i.test(url.pathname);
        }
        if (service === 'pandora') return /\/(?:TR:|track\/)/i.test(url.pathname);
        if (service === 'youtube' || service === 'youtubemusic') {
            return (url.hostname === 'youtu.be' || /\/watch\/?$/i.test(url.pathname)) && !url.searchParams.has('list');
        }
        return false;
    } catch {
        return true;
    }
}

/** Read the CTA and provider name from Songlink's accessible link label. */
export function parseSonglinkAriaLabel(ariaLabel: string, fallbackLabel = ''): SonglinkAnchorDetails {
    const providerSeparator = ariaLabel.lastIndexOf(' on ');
    if (providerSeparator < 0) return { label: fallbackLabel.trim(), action: '' };

    const description = ariaLabel.slice(0, providerSeparator).trim();
    const label = ariaLabel.slice(providerSeparator + 4).trim() || fallbackLabel.trim();
    let action = description;
    if (description.startsWith('Listen to ')) action = 'Listen';
    else if (description.startsWith('Purchase and download ')) action = 'Purchase and download';
    else {
        const titleSeparator = description.indexOf(' to ');
        if (titleSeparator >= 0) action = description.slice(0, titleSeparator).trim();
    }
    return { label, action };
}
