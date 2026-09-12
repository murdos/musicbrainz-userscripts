import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/userscripts/smartlink_importer/utils/logic';
import { record } from '~/userscripts/smartlink_importer/utils/misc/record';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

interface AlbumLinkPageData {
    canonicalUrl: string;
    entityType: string;
}

/** Read the entity type and canonical smart-link URL from album.link’s Next.js payload. */
export function extractAlbumLinkPageData(payload: unknown): AlbumLinkPageData | undefined {
    const root = record(payload);
    const props = record(root?.['props']);
    const pageProps = record(props?.['pageProps']);
    const pageData = record(pageProps?.['pageData']);
    const entityData = record(pageData?.['entityData']);
    const entityType = entityData?.['type'];
    const canonicalUrl = pageData?.['pageUrl'];
    if (typeof entityType !== 'string' || typeof canonicalUrl !== 'string' || !canonicalUrl) return undefined;

    return { canonicalUrl, entityType };
}

/** Remove tracking parameters and fragments, preferring album.link’s canonical URL. */
export function cleanAlbumLinkPageUrl(currentUrl: string, canonicalUrl?: string): string {
    let url: URL;
    try {
        url = new URL(canonicalUrl ?? currentUrl, currentUrl);
    } catch {
        url = new URL(currentUrl);
    }
    url.search = '';
    url.hash = '';
    return url.toString();
}

/** Extract “Listen” or “Purchase and download” from album.link’s accessible link label. */
export function actionFromAriaLabel(ariaLabel: string): string {
    if (/^purchase and download\b/i.test(ariaLabel)) return 'Purchase and download';
    if (/^listen to\b/i.test(ariaLabel)) return 'Listen';
    return '';
}

/** Extract the provider name without including text embedded in its SVG icon. */
export function serviceLabelFromAriaLabel(ariaLabel: string): string {
    return ariaLabel.match(/\s+on\s+(.+)$/i)?.[1]?.trim() ?? '';
}

export function collectAlbumLinkServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[data-test-id="link"][href]')) {
        const ariaLabel = element.getAttribute('aria-label') ?? '';
        const label = serviceLabelFromAriaLabel(ariaLabel) || element.textContent.trim();
        const service = normalizeServiceName(label);
        const action = actionFromAriaLabel(ariaLabel);
        if (!service || isIgnoredService(service) || isPhysicalMediaLink(service, action) || !element.href) continue;
        elements.push({
            cacheKey: nextCacheKey(counters, service),
            element,
            service,
            label,
            action,
            sourceUrl: element.href,
        });
    }
    return elements;
}
