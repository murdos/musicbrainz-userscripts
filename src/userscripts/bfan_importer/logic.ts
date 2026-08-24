import { normalizeServiceName } from '~/lib/smart-link-importer/logic';

export interface BfanServiceData {
    service: string;
    label: string;
    action: string;
    sourceUrl: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Read release-provider destinations from bfan.link's Next.js hydration payload. */
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
