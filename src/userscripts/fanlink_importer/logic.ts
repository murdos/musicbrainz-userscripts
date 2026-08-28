import { normalizeServiceName } from '~/lib/smart-link-importer/logic';

export interface FanlinkServiceData {
    service: string;
    label: string;
    sourceUrl: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function serviceLabel(serviceName: string): string {
    return serviceName
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
        .join(' ');
}

/** Read active provider destinations from Fanlink's `window.preloadLink` payload. */
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
        links.push({
            service,
            label: serviceLabel(rawService),
            sourceUrl,
        });
    }
    return links;
}

/** Parse the preload assignment from Fanlink's inline page script. */
export function extractFanlinkServiceDataFromScript(source: string): FanlinkServiceData[] {
    const serializedPayload = /window\.preloadLink\s*=\s*(\{[\s\S]*?\});\s*window\.preloadCustomDomain\s*=/.exec(source)?.[1];
    if (!serializedPayload) return [];

    try {
        return extractFanlinkServiceData(JSON.parse(serializedPayload) as unknown);
    } catch {
        return [];
    }
}
