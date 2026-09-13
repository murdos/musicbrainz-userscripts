import { isIgnoredService, isTrackOnlyServiceUrl, normalizeServiceName } from '~/userscripts/smartlink_importer/utils/logic';
import { record } from '~/userscripts/smartlink_importer/utils/misc/record';
import type { ServiceElement } from '~/userscripts/smartlink_importer/utils/types';

import { nextCacheKey } from './common';

interface PromoLinksServiceData {
    service: string;
    label: string;
    sourceUrl: string;
}

const PROVIDERS_BY_DOMAIN: Readonly<Record<string, readonly [service: string, label: string]>> = {
    'amazon.com': ['amazon', 'Amazon Music'],
    'apple.com': ['apple', 'Apple Music'],
    'bandcamp.com': ['bandcamp', 'Bandcamp'],
    'boomplay.com': ['boomplay', 'Boomplay'],
    'deezer.com': ['deezer', 'Deezer'],
    'kkbox.com': ['kkbox', 'KKBOX'],
    'pandora.com': ['pandora', 'Pandora'],
    'qobuz.com': ['qobuz', 'Qobuz'],
    'soundcloud.com': ['soundcloud', 'SoundCloud'],
    'spotify.com': ['spotify', 'Spotify'],
    'tidal.com': ['tidal', 'Tidal'],
    'youtube.com': ['youtube', 'YouTube'],
};

/** PromoLinks uses provider search pages when it cannot find an exact destination. */
export function isPromoLinksSearchFallback(rawUrl: string): boolean {
    try {
        return new URL(rawUrl).pathname.toLowerCase().split('/').includes('search');
    } catch {
        return false;
    }
}

function providerForUrl(rawUrl: string): readonly [service: string, label: string] | undefined {
    try {
        const url = new URL(rawUrl);
        if (url.hostname === 'music.youtube.com') return ['youtubemusic', 'YouTube Music'];
        for (const [domain, provider] of Object.entries(PROVIDERS_BY_DOMAIN)) {
            if (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) return provider;
        }
    } catch {
        // Ignore malformed structured data.
    }
    return undefined;
}

function findMusicRelease(value: unknown): Record<string, unknown> | undefined {
    const object = record(value);
    if (!object) return undefined;

    const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']];
    if (types.includes('MusicRelease')) return object;

    const graph = object['@graph'];
    if (!Array.isArray(graph)) return undefined;
    for (const node of graph) {
        const release = findMusicRelease(node);
        if (release) return release;
    }
    return undefined;
}

/** Read exact provider destinations from PromoLinks’ schema.org metadata. */
export function extractPromoLinksServiceData(payload: unknown): PromoLinksServiceData[] {
    const sameAs = findMusicRelease(payload)?.['sameAs'];
    if (!Array.isArray(sameAs)) return [];

    const links: PromoLinksServiceData[] = [];
    for (const sourceUrl of sameAs) {
        if (typeof sourceUrl !== 'string' || isPromoLinksSearchFallback(sourceUrl)) continue;
        const provider = providerForUrl(sourceUrl);
        if (!provider) continue;
        const [service, label] = provider;
        if (!isIgnoredService(service) && !isTrackOnlyServiceUrl(sourceUrl, service)) {
            links.push({ service: normalizeServiceName(service), label, sourceUrl });
        }
    }
    return links;
}

function readServiceData(): PromoLinksServiceData[] {
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
        try {
            const links = extractPromoLinksServiceData(JSON.parse(script.textContent) as unknown);
            if (links.length > 0) return links;
        } catch {
            // Continue past unrelated or malformed JSON-LD blocks.
        }
    }
    return [];
}

function normalizedHref(rawUrl: string): string {
    try {
        return new URL(rawUrl, window.location.href).href;
    } catch {
        return rawUrl;
    }
}

export function collectPromoLinksServiceElements(): ServiceElement[] {
    const anchorsByUrl = new Map<string, HTMLAnchorElement[]>();
    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const href = normalizedHref(element.href);
        const anchors = anchorsByUrl.get(href) ?? [];
        anchors.push(element);
        anchorsByUrl.set(href, anchors);
    }

    const counters = new Map<string, number>();
    const elements: ServiceElement[] = [];
    for (const data of readServiceData()) {
        const element = anchorsByUrl.get(normalizedHref(data.sourceUrl))?.shift();
        if (!element) continue;
        elements.push({
            cacheKey: nextCacheKey(counters, data.service),
            element,
            service: data.service,
            label: data.label,
            action: '',
            sourceUrl: data.sourceUrl,
        });
    }
    return elements;
}
