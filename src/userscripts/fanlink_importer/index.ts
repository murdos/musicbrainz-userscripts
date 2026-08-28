import { followRedirect, runSmartLinkImporter, type ServiceElement } from '~/lib/smart-link-importer';
import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/lib/smart-link-importer/logic';

import { extractFanlinkServiceDataFromScript, type FanlinkServiceData } from './logic';

function readServiceData(): FanlinkServiceData[] {
    for (const script of document.scripts) {
        const links = extractFanlinkServiceDataFromScript(script.textContent);
        if (links.length > 0) return links;
    }
    return [];
}

function serviceFromElement(element: HTMLElement): string {
    const imageUrl = element.querySelector<HTMLImageElement>('.link-option-row-img')?.src;
    if (!imageUrl) return '';

    try {
        const filename = new URL(imageUrl).pathname.split('/').pop() ?? '';
        return normalizeServiceName(filename.replace(/\.[^.]+$/, ''));
    } catch {
        return '';
    }
}

function collectServiceElements(): ServiceElement[] {
    const dataByService = new Map<string, FanlinkServiceData[]>();
    for (const data of readServiceData()) {
        const services = dataByService.get(data.service) ?? [];
        services.push(data);
        dataByService.set(data.service, services);
    }

    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('.link-options a.link-option-row')) {
        const service = serviceFromElement(element);
        const data = dataByService.get(service)?.shift();
        const action = element.querySelector<HTMLElement>('.link-option-row-action')?.textContent.trim() || '';
        if (!data || isIgnoredService(service) || isPhysicalMediaLink(service, action)) continue;

        const count = (counters.get(service) ?? 0) + 1;
        counters.set(service, count);
        elements.push({
            cacheKey: count === 1 ? service : `${service}:${count}`,
            element,
            service,
            label: element.querySelector<HTMLImageElement>('img[alt]')?.alt || data.label,
            action,
            sourceUrl: data.sourceUrl,
        });
    }
    return elements;
}

void runSmartLinkImporter({
    id: 'fanlink',
    siteName: 'Fanlink',
    collectServiceElements,
    resolveDestination: element => followRedirect(element.sourceUrl).catch(() => element.sourceUrl),
});
