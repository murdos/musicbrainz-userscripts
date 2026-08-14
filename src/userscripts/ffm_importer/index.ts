import { followRedirect, runSmartLinkImporter, type ServiceElement } from '~/lib/smart-link-importer';
import { decodeFfmDestination, isIgnoredService, normalizeServiceName } from '~/lib/smart-link-importer/logic';

function collectServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[service][href]')) {
        const rawService = element.getAttribute('service') ?? '';
        const service = normalizeServiceName(rawService);
        if (!service || isIgnoredService(service) || !element.href) continue;

        const count = (counters.get(service) ?? 0) + 1;
        counters.set(service, count);
        elements.push({
            cacheKey: count === 1 ? service : `${service}:${count}`,
            element,
            service,
            label: element.querySelector<HTMLElement>('.service-title')?.textContent.trim() || rawService,
            action: element.querySelector<HTMLElement>('.service-text')?.textContent.trim() || '',
            sourceUrl: element.href,
        });
    }
    return elements;
}

void runSmartLinkImporter({
    id: 'ffm',
    siteName: 'FFM',
    collectServiceElements,
    resolveDestination: element => decodeFfmDestination(element.sourceUrl) ?? followRedirect(element.sourceUrl),
    mountPanel: panel => {
        const musicServices = document.querySelector('.music-services-section');
        if (musicServices?.parentElement) musicServices.parentElement.insertBefore(panel, musicServices);
        else document.body.appendChild(panel);
    },
});
