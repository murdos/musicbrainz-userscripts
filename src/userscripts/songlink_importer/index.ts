import { runSmartLinkImporter, type ServiceElement } from '~/lib/smart-link-importer';
import { isIgnoredService, isPhysicalMediaLink, normalizeServiceName } from '~/lib/smart-link-importer/logic';

import { extractSonglinkSourceRelease, isTrackLevelServiceUrl, parseSonglinkAriaLabel } from './logic';

function readSourceRelease(): ReturnType<typeof extractSonglinkSourceRelease> {
    const nextData = document.querySelector<HTMLScriptElement>('script#__NEXT_DATA__')?.textContent;
    if (!nextData) return undefined;
    try {
        return extractSonglinkSourceRelease(JSON.parse(nextData) as unknown);
    } catch {
        return undefined;
    }
}

function collectServiceElements(): ServiceElement[] {
    const sourceRelease = readSourceRelease();
    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];

    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[data-test-id="link"][href]')) {
        const fallbackLabel = element.querySelector<HTMLElement>('div:last-child')?.textContent.trim() ?? '';
        const { label, action } = parseSonglinkAriaLabel(element.getAttribute('aria-label') ?? '', fallbackLabel);
        const service = normalizeServiceName(label);
        const sourceUrl = sourceRelease?.service === service ? sourceRelease.url : element.href;
        if (
            !service ||
            isIgnoredService(service) ||
            isPhysicalMediaLink(service, action) ||
            !sourceUrl ||
            isTrackLevelServiceUrl(sourceUrl, service)
        ) {
            continue;
        }

        const count = (counters.get(service) ?? 0) + 1;
        counters.set(service, count);
        elements.push({
            cacheKey: count === 1 ? service : `${service}:${count}`,
            element,
            service,
            label,
            action,
            sourceUrl,
        });
    }

    return elements;
}

void runSmartLinkImporter({
    id: 'songlink',
    siteName: 'Songlink',
    collectServiceElements,
    resolveDestination: element => element.sourceUrl,
});
