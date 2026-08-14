export const HARMONY_SERVICE_PREFERENCE = ['spotify', 'tidal', 'deezer', 'bandcamp', 'apple', 'itunes'] as const;

const TRACKING_PARAMETER_NAMES = new Set(['at', 'ct', 'ffm', 'lid', 'ref', 'ref_', 'src', 'tag']);
const IGNORED_SERVICES = new Set(['junodownload']);
const STREAMING_SERVICES = new Set([
    'amazon',
    'apple',
    'boomplay',
    'deezer',
    'itunes',
    'pandora',
    'qobuz',
    'soundcloud',
    'spotify',
    'tidal',
    'youtube',
    'youtubemusic',
]);

export const URL_RELATIONSHIP_TYPES = {
    asin: 77,
    purchaseForDownload: 74,
    downloadForFree: 75,
    otherDatabases: 82,
    streamForFree: 85,
    streaming: 980,
} as const;

export interface ServiceLink {
    service: string;
    label: string;
    action: string;
    sourceUrl: string;
    url: string;
}

export interface ReleaseMatch {
    releaseId: string;
    matchedUrls: string[];
}

export interface ReleaseUrlRelation {
    url?: { resource?: string };
}

function findStringProperty(value: unknown, names: ReadonlySet<string>): string | undefined {
    if (!value || typeof value !== 'object') return undefined;

    for (const [key, child] of Object.entries(value)) {
        if (names.has(key.toLowerCase()) && typeof child === 'string') return child;
    }
    for (const child of Object.values(value)) {
        const found = findStringProperty(child, names);
        if (found) return found;
    }
    return undefined;
}

/** Extract the destination URL carried in an FFM `cd` tracking payload. */
export function decodeFfmDestination(sourceUrl: string): string | undefined {
    try {
        const encoded = new URL(sourceUrl).searchParams.get('cd');
        if (!encoded) return undefined;

        const base64 = encoded
            .replaceAll('-', '+')
            .replaceAll('_', '/')
            .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return findStringProperty(payload, new Set(['desturl', 'destinationurl', 'destination']));
    } catch {
        return undefined;
    }
}

export function normalizeServiceName(service: string): string {
    const normalized = service
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]/g, '');
    if (normalized === 'applemusic') return 'apple';
    if (normalized === 'amazonmusic') return 'amazon';
    if (normalized === 'ytmusic') return 'youtubemusic';
    return normalized;
}

export function isIgnoredService(service: string): boolean {
    return IGNORED_SERVICES.has(normalizeServiceName(service));
}

function removeTrackingParameters(url: URL): void {
    for (const name of [...url.searchParams.keys()]) {
        if (name.toLowerCase().startsWith('utm_') || TRACKING_PARAMETER_NAMES.has(name.toLowerCase())) {
            url.searchParams.delete(name);
        }
    }
}

/** Produce stable provider URLs suitable for Harmony and exact MusicBrainz URL lookup. */
export function normalizeServiceUrl(rawUrl: string, rawService: string): string {
    const service = normalizeServiceName(rawService);
    const url = new URL(rawUrl);

    const nestedPandoraUrl = url.searchParams.get('$desktop_url');
    if (nestedPandoraUrl) return normalizeServiceUrl(nestedPandoraUrl, 'pandora');

    url.protocol = 'https:';
    url.hash = '';

    if (service === 'apple' || service === 'itunes') {
        url.hostname = 'music.apple.com';
        url.search = '';
    } else if (service === 'spotify') {
        url.hostname = 'open.spotify.com';
        url.search = '';
    } else if (service === 'tidal') {
        url.hostname = 'tidal.com';
        url.search = '';
    } else if (service === 'deezer') {
        url.hostname = 'www.deezer.com';
        url.pathname = url.pathname.replace(/^\/[a-z]{2}\/album\//i, '/album/');
        url.search = '';
    } else if (service === 'youtube' || service === 'youtubemusic') {
        const list = url.searchParams.get('list');
        const video = url.searchParams.get('v');
        url.search = '';
        if (list) url.searchParams.set('list', list);
        if (!list && video) url.searchParams.set('v', video);
    } else {
        removeTrackingParameters(url);
    }

    return url.toString();
}

function pathValueAfter(url: URL, segment: string): string | undefined {
    const parts = url.pathname.split('/').filter(Boolean);
    const segmentIndex = parts.indexOf(segment);
    if (segmentIndex < 0) return undefined;
    return parts.at(-1);
}

function hostnameMatches(url: URL, domain: string): boolean {
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
}

function amazonAsinFromUrl(rawUrl: string): string | undefined {
    try {
        const url = new URL(rawUrl);
        if (!/(^|\.)amazon\.[a-z]{2,}(\.[a-z]{2})?$/i.test(url.hostname)) return undefined;

        const parts = url.pathname.split('/').filter(Boolean);
        const asinIndex = parts.findIndex((part, index) => /^(dp|product)$/i.test(part) && index < parts.length - 1);
        const asin = asinIndex >= 0 ? parts[asinIndex + 1] : undefined;
        return asin && /^[A-Z0-9]{10}$/i.test(asin) ? asin.toUpperCase() : undefined;
    } catch {
        return undefined;
    }
}

/** Identify the provider entity represented by a URL while ignoring storefront and tracking differences. */
export function canonicalServiceUrlKey(rawUrl: string, rawService: string): string {
    const service = normalizeServiceName(rawService);
    try {
        const url = new URL(rawUrl);
        let providerId: string | undefined;

        switch (service) {
            case 'apple':
            case 'itunes':
                if (!hostnameMatches(url, 'apple.com')) return rawUrl;
                providerId = pathValueAfter(url, 'album');
                return providerId ? `apple:album:${providerId}` : normalizeServiceUrl(rawUrl, service);
            case 'spotify':
                if (!hostnameMatches(url, 'spotify.com')) return rawUrl;
                providerId = pathValueAfter(url, 'album');
                return providerId ? `${service}:album:${providerId}` : normalizeServiceUrl(rawUrl, service);
            case 'tidal':
                if (!hostnameMatches(url, 'tidal.com')) return rawUrl;
                providerId = pathValueAfter(url, 'album');
                return providerId ? `${service}:album:${providerId}` : normalizeServiceUrl(rawUrl, service);
            case 'deezer':
                if (!hostnameMatches(url, 'deezer.com')) return rawUrl;
                providerId = pathValueAfter(url, 'album');
                return providerId ? `${service}:album:${providerId}` : normalizeServiceUrl(rawUrl, service);
            case 'amazon':
            case 'amazonstore': {
                const asin = amazonAsinFromUrl(rawUrl);
                if (asin) return `amazon:asin:${asin}`;
                if (service === 'amazonstore') return normalizeServiceUrl(rawUrl, service);
                if (!url.hostname.startsWith('music.amazon.')) return rawUrl;
                providerId = pathValueAfter(url, 'albums');
                return providerId ? `amazon:album:${providerId}` : normalizeServiceUrl(rawUrl, service);
            }
            case 'youtube':
            case 'youtubemusic':
                if (!hostnameMatches(url, 'youtube.com')) return rawUrl;
                providerId = url.searchParams.get('list') ?? undefined;
                return providerId ? `${service}:playlist:${providerId}` : normalizeServiceUrl(rawUrl, service);
            case 'qobuz':
                if (!hostnameMatches(url, 'qobuz.com')) return rawUrl;
                providerId = pathValueAfter(url, 'album');
                return providerId ? `qobuz:album:${providerId}` : normalizeServiceUrl(rawUrl, service);
            default:
                return normalizeServiceUrl(rawUrl, service);
        }
    } catch {
        return rawUrl;
    }
}

export function extractReleaseUrlResources(response: unknown): string[] {
    if (!response || typeof response !== 'object') return [];
    const relations = (response as Record<string, unknown>)['relations'];
    if (!Array.isArray(relations)) return [];

    const resources: string[] = [];
    for (const relation of relations as ReleaseUrlRelation[]) {
        const resource = relation.url?.resource;
        if (resource) resources.push(resource);
    }
    return resources;
}

export function findCanonicallyMatchedLinkUrls(links: ServiceLink[], releaseResources: string[]): string[] {
    return links
        .filter(link => {
            const linkKey = canonicalServiceUrlKey(link.url, link.service);
            return releaseResources.some(resource => canonicalServiceUrlKey(resource, link.service) === linkKey);
        })
        .map(link => link.url);
}

/** Return every resolved provider link that is not linked to the matched release. */
export function findMissingLinks(links: ServiceLink[], matchedUrls: ReadonlySet<string>): ServiceLink[] {
    return links.filter(link => !matchedUrls.has(link.url));
}

export function chooseHarmonyLink(links: ServiceLink[]): ServiceLink | undefined {
    for (const preferredService of HARMONY_SERVICE_PREFERENCE) {
        const match = links.find(link => normalizeServiceName(link.service) === preferredService);
        if (match) return match;
    }
    return undefined;
}

export function relationshipTypeFor(link: ServiceLink): number {
    const action = link.action.toLowerCase();
    const service = normalizeServiceName(link.service);
    if (amazonAsinFromUrl(link.url)) return URL_RELATIONSHIP_TYPES.asin;
    if (action.includes('free') && action.includes('download')) return URL_RELATIONSHIP_TYPES.downloadForFree;
    if (action.includes('buy') || action.includes('download') || ['amazonstore', 'beatport'].includes(service)) {
        return URL_RELATIONSHIP_TYPES.purchaseForDownload;
    }
    if (STREAMING_SERVICES.has(service)) {
        return URL_RELATIONSHIP_TYPES.streaming;
    }
    if (action.includes('play') || action.includes('listen') || action.includes('stream')) {
        return URL_RELATIONSHIP_TYPES.streamForFree;
    }
    return URL_RELATIONSHIP_TYPES.otherDatabases;
}

function readReleaseIds(relations: unknown): string[] {
    if (!Array.isArray(relations)) return [];
    const ids: string[] = [];
    for (const relation of relations) {
        if (!relation || typeof relation !== 'object') continue;
        const release = (relation as Record<string, unknown>)['release'];
        if (!release || typeof release !== 'object') continue;
        const id = (release as Record<string, unknown>)['id'];
        if (typeof id === 'string') ids.push(id);
    }
    return ids;
}

/** Collect every release matched by any of the queried provider URLs. */
export function findReleaseMatches(response: unknown): ReleaseMatch[] {
    if (!response || typeof response !== 'object') return [];
    const record = response as Record<string, unknown>;
    const urlEntries = Array.isArray(record['urls']) ? record['urls'] : [record];
    const matches = new Map<string, Set<string>>();

    for (const entry of urlEntries) {
        if (!entry || typeof entry !== 'object') continue;
        const urlRecord = entry as Record<string, unknown>;
        const resource = urlRecord['resource'];
        if (typeof resource !== 'string') continue;
        for (const releaseId of readReleaseIds(urlRecord['relations'])) {
            const resources = matches.get(releaseId) ?? new Set<string>();
            resources.add(resource);
            matches.set(releaseId, resources);
        }
    }

    return [...matches].map(([releaseId, resources]) => ({ releaseId, matchedUrls: [...resources] }));
}
