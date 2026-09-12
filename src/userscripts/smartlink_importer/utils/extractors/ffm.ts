import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/userscripts/smartlink_importer/utils/logic';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

export function collectFfmServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[service][href]')) {
        const rawService = element.getAttribute('service') ?? '';
        const service = normalizeServiceName(rawService);
        const action = element.querySelector<HTMLElement>('.service-text, .music-service-cta-text__overflow')?.textContent.trim() || '';
        if (!service || isIgnoredService(service) || isPhysicalMediaLink(service, action) || !element.href) continue;
        elements.push({
            cacheKey: nextCacheKey(counters, service),
            element,
            service,
            label:
                element.querySelector<HTMLElement>('.service-title')?.textContent.trim() ||
                element.querySelector<HTMLImageElement>('img[alt]')?.alt ||
                rawService,
            action,
            sourceUrl: element.href,
        });
    }
    return elements;
}
