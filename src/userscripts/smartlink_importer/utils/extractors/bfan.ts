import { normalizeServiceName } from '~/userscripts/smartlink_importer/utils/logic';
import { record } from '~/userscripts/smartlink_importer/utils/misc/record';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

interface BfanServiceData {
    service: string;
    label: string;
    action: string;
    sourceUrl: string;
}

/** Read release-provider destinations from bfan.link’s Next.js hydration payload. */
export function extractBfanServiceData(payload: unknown): BfanServiceData[] {
    const root = record(payload);
    const props = record(root?.['props']);
    const pageProps = record(props?.['pageProps']);
    const backlink = record(pageProps?.['backlinkStaticData']);
    const stores = record(backlink?.['stores']);
    if (!backlink || !stores) return [];

    const mode = backlink['mode'] === 'prerelease' ? 'prereleaseLandingCTAs' : 'postreleaseLandingCTAs';
    const ctas = record(backlink[mode]);
    const options = record(ctas?.['options']);
    const displayOrder = Array.isArray(ctas?.['displayOrder'])
        ? ctas['displayOrder'].filter(value => typeof value === 'string')
        : Object.keys(stores);

    const links: BfanServiceData[] = [];
    for (const storeName of displayOrder) {
        const store = record(stores[storeName]);
        const urls = record(store?.['urls']);
        const option = record(options?.[storeName]);
        const sourceUrl = urls?.['default'];
        if (typeof sourceUrl !== 'string' || !sourceUrl || option?.['isDisplayed'] === false) continue;

        const service = normalizeServiceName(storeName);
        if (!service) continue;
        links.push({
            service,
            label: typeof store?.['displayName'] === 'string' ? store['displayName'] : storeName,
            action: typeof option?.['label'] === 'string' ? option['label'] : '',
            sourceUrl,
        });
    }
    return links;
}

function readServiceData(): BfanServiceData[] {
    const nextData = document.querySelector<HTMLScriptElement>('script#__NEXT_DATA__')?.textContent;
    if (!nextData) return [];
    try {
        return extractBfanServiceData(JSON.parse(nextData) as unknown);
    } catch {
        return [];
    }
}

export function collectBfanServiceElements(): ServiceElement[] {
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
