import { normalizeServiceName, skipReasonForServiceLink } from '~/userscripts/smartlink_importer/utils/logic';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

const NON_RELEASE_SERVICES = new Set(['bandsintown', 'facebook', 'goout', 'instagram', 'songkick']);

export function linkfireSkipReasonForServiceLink(service: string, action: string, sourceUrl: string): string | undefined {
    if (NON_RELEASE_SERVICES.has(normalizeServiceName(service))) return 'Non-release link';
    return skipReasonForServiceLink(service, action, sourceUrl);
}

export function collectLinkfireServiceElements(): ServiceElement[] {
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>(
        '#music-services a[data-test="music-service-list-link"][data-label][href]',
    )) {
        const rawService = element.dataset['label'] ?? '';
        const service = normalizeServiceName(rawService);
        const action = element.dataset['action'] ?? '';
        if (!service || !element.href) continue;

        elements.push({
            cacheKey: nextCacheKey(counters, service),
            element,
            service,
            label: element.querySelector<HTMLImageElement>('img[alt]')?.alt || rawService,
            action,
            sourceUrl: element.href,
            skipReason: linkfireSkipReasonForServiceLink(service, action, element.href),
        });
    }
    return elements;
}
