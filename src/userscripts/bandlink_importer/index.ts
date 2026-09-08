import { runSmartLinkImporter, type ServiceElement } from '~/lib/smart-link-importer';
import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/lib/smart-link-importer/logic';

function collectServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('.mod-music-services a.el-link[href]')) {
        const label = element.querySelector<HTMLElement>('.el-link__service-text')?.textContent.trim() || '';
        const service = normalizeServiceName(label);
        const action = element.querySelector<HTMLElement>('.el-link__action')?.textContent.trim() || '';
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

void runSmartLinkImporter({
    id: 'bandlink',
    siteName: 'BandLink',
    collectServiceElements,
    resolveDestination: element => element.sourceUrl,
});
