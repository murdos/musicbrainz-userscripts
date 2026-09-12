import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/userscripts/smartlink_importer/utils/logic';
import { record } from '~/userscripts/smartlink_importer/utils/misc/record';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

interface FanlinkServiceData {
    service: string;
    label: string;
    sourceUrl: string;
}

function serviceLabel(serviceName: string): string {
    return serviceName
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
        .join(' ');
}

/** Read active provider destinations from Fanlink’s `window.preloadLink` payload. */
export function extractFanlinkServiceData(payload: unknown): FanlinkServiceData[] {
    const services = record(payload)?.['services'];
    if (!Array.isArray(services)) return [];

    const links: FanlinkServiceData[] = [];
    for (const value of services) {
        const serviceData = record(value);
        const rawService = serviceData?.['service_name'];
        const sourceUrl = serviceData?.['url'];
        if (typeof rawService !== 'string' || typeof sourceUrl !== 'string' || !sourceUrl || serviceData['active'] === false) continue;

        const service = normalizeServiceName(rawService);
        if (!service) continue;
        links.push({ service, label: serviceLabel(rawService), sourceUrl });
    }
    return links;
}

/** Parse the preload assignment from Fanlink’s inline page script. */
export function extractFanlinkServiceDataFromScript(source: string): FanlinkServiceData[] {
    const serializedPayload = /window\.preloadLink\s*=\s*(\{[\s\S]*?\});\s*window\.preloadCustomDomain\s*=/.exec(source)?.[1];
    if (!serializedPayload) return [];

    try {
        return extractFanlinkServiceData(JSON.parse(serializedPayload) as unknown);
    } catch {
        return [];
    }
}

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
        return normalizeServiceName(
            new URL(imageUrl).pathname
                .split('/')
                .pop()
                ?.replace(/\.[^.]+$/, '') ?? '',
        );
    } catch {
        return '';
    }
}

export function collectFanlinkServiceElements(): ServiceElement[] {
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
        elements.push({
            cacheKey: nextCacheKey(counters, service),
            element,
            service,
            label: element.querySelector<HTMLImageElement>('img[alt]')?.alt || data.label,
            action,
            sourceUrl: data.sourceUrl,
        });
    }
    return elements;
}
