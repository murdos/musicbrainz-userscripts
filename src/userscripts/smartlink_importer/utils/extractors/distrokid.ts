import { normalizeServiceName, skipReasonForServiceLink } from '~/userscripts/smartlink_importer/utils/logic';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

const SERVICE_ALIASES: Readonly<Record<string, string>> = {
    google: 'youtubemusic',
};

export function distrokidServiceName(store: string): string {
    const normalized = normalizeServiceName(store);
    return SERVICE_ALIASES[normalized] ?? normalized;
}

export function distrokidServiceAction(store: string): string {
    return distrokidServiceName(store) === 'itunes' ? 'Download' : 'Listen';
}

export function collectDistrokidServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>(
        'a[data-testid="hyperfollow-store-link"][data-hyperfollow-store][href]',
    )) {
        const rawService = element.dataset['hyperfollowStore'] ?? '';
        const service = distrokidServiceName(rawService);
        const label = element.textContent.trim().replaceAll(/\s+/g, ' ') || rawService;
        const action = distrokidServiceAction(rawService);
        if (!service || !element.href) continue;

        elements.push({
            cacheKey: nextCacheKey(counters, service),
            element,
            service,
            label,
            action,
            sourceUrl: element.href,
            skipReason: skipReasonForServiceLink(service, action, element.href),
        });
    }
    return elements;
}
