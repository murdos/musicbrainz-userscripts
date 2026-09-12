export interface AlbumLinkPageData {
    canonicalUrl: string;
    entityType: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Read the entity type and canonical smart-link URL from album.link's Next.js payload. */
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

/** Remove tracking parameters and fragments, preferring album.link's canonical URL. */
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

/** Extract “Listen” or “Purchase and download” from album.link's accessible link label. */
export function actionFromAriaLabel(ariaLabel: string): string {
    if (/^purchase and download\b/i.test(ariaLabel)) return 'Purchase and download';
    if (/^listen to\b/i.test(ariaLabel)) return 'Listen';
    return '';
}

/** Extract the provider name without including text embedded in its SVG icon. */
export function serviceLabelFromAriaLabel(ariaLabel: string): string {
    return ariaLabel.match(/\s+on\s+(.+)$/i)?.[1]?.trim() ?? '';
}
