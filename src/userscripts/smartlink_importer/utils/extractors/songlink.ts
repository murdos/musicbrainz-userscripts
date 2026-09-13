import { normalizeServiceName, skipReasonForServiceLink } from '~/userscripts/smartlink_importer/utils/logic';
import { record } from '~/userscripts/smartlink_importer/utils/misc/record';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

interface SonglinkAnchorDetails {
    label: string;
    action: string;
}

/** Build the parent release URL exposed for Songlink’s source track. */
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

/** Read the CTA and provider name from Songlink’s accessible link label. */
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

function readSourceRelease(): ReturnType<typeof extractSonglinkSourceRelease> {
    const nextData = document.querySelector<HTMLScriptElement>('script#__NEXT_DATA__')?.textContent;
    if (!nextData) return undefined;
    try {
        return extractSonglinkSourceRelease(JSON.parse(nextData) as unknown);
    } catch {
        return undefined;
    }
}

export function collectSonglinkServiceElements(): ServiceElement[] {
    const sourceRelease = readSourceRelease();
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];

    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[data-test-id="link"][href]')) {
        const fallbackLabel = element.querySelector<HTMLElement>('div:last-child')?.textContent.trim() ?? '';
        const { label, action } = parseSonglinkAriaLabel(element.getAttribute('aria-label') ?? '', fallbackLabel);
        const service = normalizeServiceName(label);
        const sourceUrl = sourceRelease?.service === service ? sourceRelease.url : element.href;
        if (!service || !sourceUrl) continue;

        elements.push({
            cacheKey: nextCacheKey(counters, service),
            element,
            service,
            label,
            action,
            sourceUrl,
            skipReason: skipReasonForServiceLink(service, action, sourceUrl),
        });
    }
    return elements;
}
