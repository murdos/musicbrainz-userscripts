import {
    cleanAlbumLinkPageUrl,
    collectAlbumLinkServiceElements,
    extractAlbumLinkPageData,
} from '~/userscripts/smartlink_importer/utils/extractors/albumlink';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createAlbumLinkConfig(): SmartLinkImporterConfig | undefined {
    const nextData = document.querySelector<HTMLScriptElement>('script#__NEXT_DATA__')?.textContent;
    if (!nextData) return undefined;

    let pageData: ReturnType<typeof extractAlbumLinkPageData>;
    try {
        pageData = extractAlbumLinkPageData(JSON.parse(nextData) as unknown);
    } catch {
        return undefined;
    }
    if (!pageData) return undefined;

    const cleanUrl = cleanAlbumLinkPageUrl(window.location.href, pageData.canonicalUrl);
    if (new URL(cleanUrl).origin === window.location.origin && cleanUrl !== window.location.href) {
        window.history.replaceState(window.history.state, '', cleanUrl);
    }
    if (pageData.entityType !== 'album') return undefined;

    return {
        id: 'albumlink',
        siteName: 'album.link',
        collectServiceElements: collectAlbumLinkServiceElements,
        resolveDestination: element => element.sourceUrl,
    };
}
