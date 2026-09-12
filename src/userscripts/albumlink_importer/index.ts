import { runSmartLinkImporter, type ServiceElement } from '~/lib/smart-link-importer';
import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/lib/smart-link-importer/logic';

import { actionFromAriaLabel, cleanAlbumLinkPageUrl, extractAlbumLinkPageData, serviceLabelFromAriaLabel } from './logic';

function readPageData(): ReturnType<typeof extractAlbumLinkPageData> {
    const nextData = document.querySelector<HTMLScriptElement>('script#__NEXT_DATA__')?.textContent;
    if (!nextData) return undefined;
    try {
        return extractAlbumLinkPageData(JSON.parse(nextData) as unknown);
    } catch {
        return undefined;
    }
}

function collectServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[data-test-id="link"][href]')) {
        const ariaLabel = element.getAttribute('aria-label') ?? '';
        const label = serviceLabelFromAriaLabel(ariaLabel) || element.textContent.trim();
        const service = normalizeServiceName(label);
        const action = actionFromAriaLabel(ariaLabel);
        if (!service || isIgnoredService(service) || isPhysicalMediaLink(service, action) || !element.href) continue;

        const count = (counters.get(service) ?? 0) + 1;
        counters.set(service, count);
        elements.push({
            cacheKey: count === 1 ? service : `${service}:${count}`,
            element,
            service,
            label,
            action,
            sourceUrl: element.href,
        });
    }
    return elements;
}

const pageData = readPageData();
if (pageData) {
    const cleanUrl = cleanAlbumLinkPageUrl(window.location.href, pageData.canonicalUrl);
    if (new URL(cleanUrl).origin === window.location.origin && cleanUrl !== window.location.href) {
        window.history.replaceState(window.history.state, '', cleanUrl);
    }

    if (pageData.entityType === 'album') {
        void runSmartLinkImporter({
            id: 'albumlink',
            siteName: 'album.link',
            collectServiceElements,
            resolveDestination: element => element.sourceUrl,
        });
    }
}
