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

const SERVER_PREFERENCE_KEY = 'smartlink-mb-importer:server';
const HYDRATION_SETTLE_MS = 1_000;
const MUSICBRAINZ_SERVERS = ['https://musicbrainz.org', 'https://beta.musicbrainz.org'] as const;

type MusicBrainzServer = (typeof MUSICBRAINZ_SERVERS)[number];

interface PageCache {
    links: Record<string, ServiceLink>;
}

export interface ServiceElement {
    cacheKey: string;
    element: HTMLElement;
    service: string;
    label: string;
    action: string;
    sourceUrl: string;
}

export interface SmartLinkImporterConfig {
    /** Short identifier used for DOM IDs, cache isolation, and log messages. */
    id: string;
    siteName: string;
    collectServiceElements: () => ServiceElement[];
    resolveDestination: (element: ServiceElement) => string | Promise<string>;
    mountPanel?: (panel: HTMLElement) => void;
}

interface GmResponse {
    finalUrl?: string;
    responseURL?: string;
    status: number;
}

interface GmRequestDetails {
    method: string;
    url: string;
    timeout: number;
    onload: (response: GmResponse) => void;
    onerror: () => void;
    ontimeout: () => void;
}

type GmRequest = (details: GmRequestDetails) => unknown;

interface ImportPanel {
    root: HTMLElement;
    status: HTMLElement;
    release: HTMLAnchorElement;
    server: HTMLSelectElement;
    harmonyButton: HTMLAnchorElement;
    missingLinksButton: HTMLButtonElement;
    missingLinksLabel: HTMLElement;
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

function readServerPreference(): MusicBrainzServer {
    try {
        const stored = window.localStorage.getItem(SERVER_PREFERENCE_KEY);
        if (MUSICBRAINZ_SERVERS.includes(stored as MusicBrainzServer)) return stored as MusicBrainzServer;
    } catch {
        // Fall through to production.
    }
    return MUSICBRAINZ_SERVERS[0];
}

function saveServerPreference(server: MusicBrainzServer): void {
    try {
        window.localStorage.setItem(SERVER_PREFERENCE_KEY, server);
    } catch {
        // Preference persistence is optional.
    }
}

function gmRequest(): GmRequest | undefined {
    const userscriptGlobal = globalThis as typeof globalThis & {
        GM?: { xmlHttpRequest?: GmRequest };
        GM_xmlhttpRequest?: GmRequest;
    };
    return userscriptGlobal.GM?.xmlHttpRequest ?? userscriptGlobal.GM_xmlhttpRequest;
}

export function followRedirect(sourceUrl: string): Promise<string> {
    const request = gmRequest();
    if (!request) return Promise.reject(new Error('No userscript cross-origin request API is available'));

    return new Promise((resolve, reject) => {
        const failed = (): void => {
            reject(new Error(`Could not resolve ${sourceUrl}`));
        };
        request({
            method: 'GET',
            url: sourceUrl,
            timeout: 20_000,
            onload: response => {
                const destination = response.finalUrl ?? response.responseURL;
                if (response.status >= 200 && response.status < 400 && destination) resolve(destination);
                else failed();
            },
            onerror: failed,
            ontimeout: failed,
        });
    });
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

        const observer = new MutationObserver(() => {
            waitUntilStable();
        });
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

function panelId(config: SmartLinkImporterConfig): string {
    return `${config.id}-mb-importer`;
}

function styleId(config: SmartLinkImporterConfig): string {
    return `${panelId(config)}-style`;
}

function addStyles(config: SmartLinkImporterConfig): void {
    const importerPanelId = panelId(config);
    if (document.getElementById(styleId(config))) return;
    const style = document.createElement('style');
    style.id = styleId(config);
    style.textContent = `
        #${importerPanelId} {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 2147483646;
            width: min(340px, calc(100vw - 32px));
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            box-sizing: border-box;
            padding: 12px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.96);
            color: #222;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
            font: 13px/1.4 Arial, sans-serif;
        }
        @media (max-width: 720px) {
            #${importerPanelId} {
                top: auto;
                right: 8px;
                bottom: 8px;
                width: min(340px, calc(100vw - 16px));
                max-height: 50vh;
            }
        }
        #${importerPanelId} .smartlink-mb-heading,
        #${importerPanelId} .smartlink-mb-controls,
        #${importerPanelId} .smartlink-mb-buttons {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        #${importerPanelId} .smartlink-mb-heading { font-weight: bold; margin-bottom: 8px; }
        #${importerPanelId} [hidden] { display: none !important; }
        #${importerPanelId} .smartlink-mb-controls { margin: 8px 0; }
        #${importerPanelId} .smartlink-mb-status { color: #555; }
        #${importerPanelId} .smartlink-mb-release { color: #0875bd; font-weight: bold; }
        #${importerPanelId} .smartlink-mb-button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-height: 30px;
            padding: 5px 10px;
            box-sizing: border-box;
            border: 1px solid #a7a7a7;
            border-radius: 5px;
            background: #f4f4f4;
            color: #222;
            cursor: pointer;
            font: bold 12px Arial, sans-serif;
            text-decoration: none;
        }
        #${importerPanelId} .smartlink-mb-button:hover:not(:disabled) { background: #fff; }
        #${importerPanelId} .smartlink-mb-button:disabled { cursor: default; opacity: 0.55; }
        #${importerPanelId} .smartlink-mb-button img { flex: none; }
        .smartlink-mb-present { position: relative; outline: 3px solid #32a852 !important; }
        .smartlink-mb-present::after {
            content: '\u2713';
            position: absolute;
            top: -7px;
            right: -7px;
            width: 21px;
            height: 21px;
            border-radius: 25%;
            background: #ba478f;
            color: #fff;
            font: bold 15px/21px Arial, sans-serif;
            text-align: center;
            z-index: 2;
        }
    `;
    document.head.appendChild(style);
}

function createPanel(config: SmartLinkImporterConfig, server: MusicBrainzServer): ImportPanel {
    addStyles(config);
    document.getElementById(panelId(config))?.remove();

    const root = document.createElement('section');
    root.id = panelId(config);
    root.innerHTML = `
        <div class="smartlink-mb-heading">
            <img src="https://musicbrainz.org/static/images/entity/release.svg" width="18" height="18" alt="" />
            MusicBrainz release importer
        </div>
        <div class="smartlink-mb-status">Resolving provider links…</div>
        <div class="smartlink-mb-controls">
            <label>MusicBrainz server <select class="smartlink-mb-server"></select></label>
            <a class="smartlink-mb-release" target="_blank" hidden></a>
        </div>
        <div class="smartlink-mb-buttons">
            <a class="smartlink-mb-button smartlink-mb-harmony" target="_blank" hidden>
                <img src="https://harmony.pulsewidth.org.uk/favicon.svg" width="16" height="16" alt="" />
                Import with Harmony
            </a>
            <button class="smartlink-mb-button smartlink-mb-missing" type="button" hidden>
                <img src="https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg" width="16" height="16" alt="" />
                <span class="smartlink-mb-missing-label">Add Missing Links</span>
            </button>
        </div>
    `;

    mountPanel(config, root);

    const serverSelect = root.querySelector<HTMLSelectElement>('.smartlink-mb-server')!;
    for (const value of MUSICBRAINZ_SERVERS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === MUSICBRAINZ_SERVERS[0] ? 'musicbrainz.org' : 'beta.musicbrainz.org';
        option.selected = value === server;
        serverSelect.appendChild(option);
    }

    return {
        root,
        status: root.querySelector<HTMLElement>('.smartlink-mb-status')!,
        release: root.querySelector<HTMLAnchorElement>('.smartlink-mb-release')!,
        server: serverSelect,
        harmonyButton: root.querySelector<HTMLAnchorElement>('.smartlink-mb-harmony')!,
        missingLinksButton: root.querySelector<HTMLButtonElement>('.smartlink-mb-missing')!,
        missingLinksLabel: root.querySelector<HTMLElement>('.smartlink-mb-missing-label')!,
    };
}

function mountPanel(config: SmartLinkImporterConfig, root: HTMLElement): void {
    if (config.mountPanel) config.mountPanel(root);
    else document.body.appendChild(root);
}

function keepPanelMounted(config: SmartLinkImporterConfig, panel: ImportPanel, onRemount: () => void): void {
    let remountScheduled = false;
    const ensureMounted = (): void => {
        if (panel.root.isConnected || remountScheduled) return;
        remountScheduled = true;
        window.setTimeout(() => {
            remountScheduled = false;
            if (panel.root.isConnected) return;
            mountPanel(config, panel.root);
            onRemount();
        }, 250);
    };
    const observer = new MutationObserver(ensureMounted);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ensureMounted();
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

    const userscriptInfo = (globalThis as typeof globalThis & { GM_info?: { script?: { name?: string; version?: string } } }).GM_info
        ?.script;
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

    const server = readServerPreference();
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
        saveServerPreference(selectedServer);
        void checkMusicBrainz(selectedServer);
    });
    keepPanelMounted(config, panel, () => {
        void checkMusicBrainz(panel.server.value as MusicBrainzServer);
    });
    await checkMusicBrainz(server);
}
