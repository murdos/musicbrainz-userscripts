import { getOptionalGlobal } from '~/lib/userscript-api';

import { followRedirect } from './follow-redirect';
import {
    chooseHarmonyLink,
    expandLegacyBoomplayResources,
    extractReleaseUrlResources,
    findCanonicallyMatchedLinkUrls,
    findMissingLinks,
    findReleaseMatches,
    normalizeServiceName,
    normalizeServiceUrl,
    relationshipTypeFor,
    type ReleaseMatch,
    type ServiceLink,
} from './logic';
import { createPanel, keepPanelMounted, panelId, type ImportPanel } from './mb-panel';
import { readServerPreference, saveServerPreference, type MusicBrainzServer } from './server-preference';
import type { ServiceElement, SmartLinkImporterConfig } from './types';

const HYDRATION_SETTLE_MS = 1_000;

interface PageCache {
    links: Record<string, ServiceLink>;
}

function pageCacheKey(config: SmartLinkImporterConfig): string {
    return `${config.id}-mb-importer:v1:${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
}

function readPageCache(config: SmartLinkImporterConfig): PageCache {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(pageCacheKey(config)) ?? 'null');
        if (parsed && typeof parsed === 'object') {
            const record = parsed as Record<string, unknown>;
            if (record['links'] && typeof record['links'] === 'object') {
                return { links: record['links'] as Record<string, ServiceLink> };
            }
        }
    } catch {
        // Ignore unavailable storage and obsolete/corrupt cache entries.
    }
    return { links: {} };
}

function savePageCache(config: SmartLinkImporterConfig, cache: PageCache): void {
    try {
        window.localStorage.setItem(pageCacheKey(config), JSON.stringify(cache));
    } catch {
        // The importer still works for this page load when storage is unavailable.
    }
}

function waitForServiceElements(config: SmartLinkImporterConfig): Promise<ServiceElement[]> {
    return new Promise(resolve => {
        let settleTimer: number | undefined;
        let finished = false;

        const finish = (elements: ServiceElement[]): void => {
            if (finished) return;
            finished = true;
            observer.disconnect();
            if (settleTimer !== undefined) window.clearTimeout(settleTimer);
            window.clearTimeout(maximumWaitTimer);
            resolve(elements);
        };

        const waitUntilStable = (): void => {
            const elements = config.collectServiceElements();
            if (elements.length === 0) return;

            if (settleTimer !== undefined) window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => {
                const stableAnchors = config.collectServiceElements();
                if (stableAnchors.length > 0) finish(stableAnchors);
                else waitUntilStable();
            }, HYDRATION_SETTLE_MS);
        };

        const observer = new MutationObserver(waitUntilStable);
        const maximumWaitTimer = window.setTimeout(() => {
            finish(config.collectServiceElements());
        }, 20_000);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        waitUntilStable();
    });
}

async function resolveServiceLinks(config: SmartLinkImporterConfig, elements: ServiceElement[], cache: PageCache): Promise<ServiceLink[]> {
    const resolved = await Promise.all(
        elements.map(async element => {
            const cached = cache.links[element.cacheKey];
            if (cached?.sourceUrl === element.sourceUrl) {
                const refreshed = { ...cached, label: element.label, action: element.action };
                cache.links[element.cacheKey] = refreshed;
                return refreshed;
            }

            try {
                const destination = await config.resolveDestination(element);
                const link: ServiceLink = {
                    service: element.service,
                    label: element.label,
                    action: element.action,
                    sourceUrl: element.sourceUrl,
                    url: normalizeServiceUrl(destination, element.service),
                };
                cache.links[element.cacheKey] = link;
                return link;
            } catch (error) {
                console.warn(`${config.siteName} importer: could not resolve ${element.label}`, error);
                return undefined;
            }
        }),
    );
    savePageCache(config, cache);
    return resolved.filter(link => link !== undefined);
}

function lookupReleases(links: ServiceLink[], server: MusicBrainzServer): Promise<ReleaseMatch[]> {
    const resources = [...new Set(links.map(link => link.url))];
    if (resources.length === 0) return Promise.resolve([]);

    const endpoint = new URL('/ws/2/url', server);
    for (const resource of resources) endpoint.searchParams.append('resource', resource);
    endpoint.searchParams.set('inc', 'release-rels');
    endpoint.searchParams.set('fmt', 'json');

    return fetch(endpoint, { headers: { Accept: 'application/json' } }).then(async response => {
        if (!response.ok) throw new Error(`MusicBrainz URL lookup failed with HTTP ${response.status}`);
        return findReleaseMatches(await response.json());
    });
}

async function includeReleaseRelationships(links: ServiceLink[], server: MusicBrainzServer, match: ReleaseMatch): Promise<ReleaseMatch> {
    const endpoint = new URL(`/ws/2/release/${match.releaseId}`, server);
    endpoint.searchParams.set('inc', 'url-rels');
    endpoint.searchParams.set('fmt', 'json');

    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`MusicBrainz release lookup failed with HTTP ${response.status}`);
    let resources = extractReleaseUrlResources(await response.json());
    if (links.some(link => normalizeServiceName(link.service) === 'boomplay')) {
        resources = await expandLegacyBoomplayResources(resources, followRedirect);
    }
    return { releaseId: match.releaseId, matchedUrls: findCanonicallyMatchedLinkUrls(links, resources) };
}

function markExistingLinks(elements: ServiceElement[], links: ServiceLink[], matchedUrls: ReadonlySet<string>): void {
    for (const element of elements) {
        const serviceMatches = links.filter(candidate => candidate.service === element.service);
        const link = serviceMatches.find(candidate => candidate.sourceUrl === element.sourceUrl) ?? serviceMatches[0];
        const present = link ? matchedUrls.has(link.url) : false;
        element.element.classList.toggle('smartlink-mb-present', present);
        if (present) element.element.title = 'This URL is already linked to the MusicBrainz release';
    }
}

function submitMissingLinks(config: SmartLinkImporterConfig, server: MusicBrainzServer, releaseId: string, links: ServiceLink[]): void {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = `${server}/release/${releaseId}/edit`;
    form.target = '_blank';
    form.acceptCharset = 'UTF-8';
    form.hidden = true;

    const userscriptInfo = (getOptionalGlobal('GM_info') as Partial<typeof GM_info> | undefined)?.script;
    const scriptName = userscriptInfo?.name ?? `${config.siteName} MusicBrainz importer`;
    const scriptVersion = userscriptInfo?.version ? ` ${userscriptInfo.version}` : '';
    const parameters: Array<[string, string]> = [
        [
            'edit_note',
            `Added URL relationships from ${window.location.href.replace(/[?#].*$/, '')}\n\nUsing '''${scriptName}'''${scriptVersion} from https://github.com/murdos/musicbrainz-userscripts`,
        ],
        ['redirect_uri', `${server}/release/${releaseId}`],
    ];
    links.forEach((link, index) => {
        parameters.push([`urls.${index}.link_type`, String(relationshipTypeFor(link))]);
        parameters.push([`urls.${index}.url`, link.url]);
    });
    for (const [name, value] of parameters) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove();
}

function configureHarmonyButton(panel: ImportPanel, links: ServiceLink[]): void {
    const harmonyLink = chooseHarmonyLink(links);
    if (!harmonyLink) return;
    const harmonyUrl = new URL('https://harmony.pulsewidth.org.uk/release');
    harmonyUrl.searchParams.set('category', 'preferred');
    harmonyUrl.searchParams.set('url', harmonyLink.url);
    panel.harmonyButton.href = harmonyUrl.toString();
    panel.harmonyButton.title = `Import using ${harmonyLink.label}`;
    panel.harmonyButton.hidden = false;
}

export async function runSmartLinkImporter(config: SmartLinkImporterConfig): Promise<void> {
    const mbPanelId = panelId(config);
    if (document.getElementById(mbPanelId)) return;

    const server = await readServerPreference();
    const cache = readPageCache(config);
    const elements = await waitForServiceElements(config);

    if (document.getElementById(mbPanelId)) return;

    const panel = createPanel(config, server);
    if (elements.length === 0) {
        panel.status.textContent = `No ${config.siteName} provider links were found on this page.`;
        return;
    }

    const links = await resolveServiceLinks(config, elements, cache);
    panel.status.textContent = `Resolved ${links.length} of ${elements.length} provider links. Checking MusicBrainz…`;
    configureHarmonyButton(panel, links);

    let lookupGeneration = 0;
    const checkMusicBrainz = async (selectedServer: MusicBrainzServer): Promise<void> => {
        const generation = ++lookupGeneration;
        panel.status.textContent = `Resolved ${links.length} provider links. Checking MusicBrainz…`;
        panel.release.hidden = true;
        panel.missingLinksButton.hidden = true;
        configureHarmonyButton(panel, links);
        markExistingLinks(config.collectServiceElements(), links, new Set());

        try {
            const discoveredMatches = await lookupReleases(links, selectedServer);
            if (generation !== lookupGeneration) return;
            const discoveredMatch = discoveredMatches[0];
            if (!discoveredMatch) {
                panel.status.textContent = 'No existing MusicBrainz release found. Import with Harmony, then reload this page.';
                return;
            }
            if (discoveredMatches.length > 1) {
                panel.harmonyButton.hidden = true;
                panel.status.textContent = `Ambiguous MusicBrainz match: these provider links belong to ${discoveredMatches.length} releases. No links can be added.`;
                return;
            }
            const match = await includeReleaseRelationships(links, selectedServer, discoveredMatch);
            if (generation !== lookupGeneration) return;

            const matchedUrls = new Set(match.matchedUrls);
            markExistingLinks(config.collectServiceElements(), links, matchedUrls);
            panel.release.href = `${selectedServer}/release/${match.releaseId}`;
            panel.release.textContent = 'View matched release';
            panel.release.hidden = false;

            const missing = findMissingLinks(links, matchedUrls);
            panel.status.textContent = `${matchedUrls.size} provider link${matchedUrls.size === 1 ? '' : 's'} already present; ${missing.length} additional link${missing.length === 1 ? '' : 's'} available.`;
            panel.missingLinksButton.hidden = false;
            panel.missingLinksButton.disabled = missing.length === 0;
            panel.missingLinksLabel.textContent = missing.length === 0 ? 'All Links Present' : 'Add Missing Links';
            panel.missingLinksButton.onclick = () => {
                submitMissingLinks(config, selectedServer, match.releaseId, missing);
            };
        } catch (error) {
            if (generation !== lookupGeneration) return;
            console.error(`${config.siteName} importer: MusicBrainz lookup failed`, error);
            panel.status.textContent = 'MusicBrainz lookup failed. Reload the page to try again.';
        }
    };

    panel.server.addEventListener('change', () => {
        const selectedServer = panel.server.value as MusicBrainzServer;
        void saveServerPreference(selectedServer);
        void checkMusicBrainz(selectedServer);
    });
    keepPanelMounted(config, panel, () => {
        void checkMusicBrainz(panel.server.value as MusicBrainzServer);
    });
    await checkMusicBrainz(server);
}
