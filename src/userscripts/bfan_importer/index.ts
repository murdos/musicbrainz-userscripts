import { runSmartLinkImporter, type ServiceElement } from '~/lib/smart-link-importer';
import { normalizeServiceName } from '~/lib/smart-link-importer/logic';

import { extractBfanServiceData } from './logic';

function readServiceData(): ReturnType<typeof extractBfanServiceData> {
    const nextData = document.querySelector<HTMLScriptElement>('script#__NEXT_DATA__')?.textContent;
    if (!nextData) return [];
    try {
        return extractBfanServiceData(JSON.parse(nextData) as unknown);
    } catch {
        return [];
    }
}

function collectServiceElements(): ServiceElement[] {
    const dataByService = new Map(readServiceData().map(data => [data.service, data]));
    const elements: ServiceElement[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('[data-testid="call-to-actions"] > [data-testid]')) {
        const rawService = element.dataset['testid'] ?? '';
        const service = normalizeServiceName(rawService);
        const data = dataByService.get(service);
        if (!data) continue;

        elements.push({
            cacheKey: service,
            element,
            service,
            label: element.querySelector<HTMLImageElement>('img[alt]')?.alt || data.label,
            action: element.querySelector<HTMLButtonElement>('button')?.textContent.trim() || data.action,
            sourceUrl: data.sourceUrl,
        });
    }
    return elements;
}

void runSmartLinkImporter({
    id: 'bfan',
    siteName: 'bfan.link',
    collectServiceElements,
    resolveDestination: element => element.sourceUrl,
});
