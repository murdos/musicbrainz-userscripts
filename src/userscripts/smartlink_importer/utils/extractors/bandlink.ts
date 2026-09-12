import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/userscripts/smartlink_importer/utils/logic';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

export function collectBandLinkServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('.mod-music-services a.el-link[href]')) {
        const label = element.querySelector<HTMLElement>('.el-link__service-text')?.textContent.trim() || '';
        const service = normalizeServiceName(label);
        const action = element.querySelector<HTMLElement>('.el-link__action')?.textContent.trim() || '';
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
