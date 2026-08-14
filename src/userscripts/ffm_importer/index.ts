import {
    chooseHarmonyLink,
    decodeFfmDestination,
    extractReleaseUrlResources,
    findCanonicallyMatchedLinkUrls,
    findMissingLinks,
    findReleaseMatches,
    isIgnoredService,
    normalizeServiceName,
    normalizeServiceUrl,
    relationshipTypeFor,
    resolveLegacyBoomplayResources,
    type ReleaseMatch,
    type ServiceLink,
} from './logic';

const PANEL_ID = 'ffm-mb-importer';
const STYLE_ID = 'ffm-mb-importer-style';
const CACHE_PREFIX = 'ffm-mb-importer:v1:';
const SERVER_PREFERENCE_KEY = 'ffm-mb-importer:server';
const HYDRATION_SETTLE_MS = 1_000;
const MUSICBRAINZ_SERVERS = ['https://musicbrainz.org', 'https://beta.musicbrainz.org'] as const;

type MusicBrainzServer = (typeof MUSICBRAINZ_SERVERS)[number];

interface PageCache {
    links: Record<string, ServiceLink>;
}

interface ServiceAnchor {
    cacheKey: string;
    element: HTMLAnchorElement;
    service: string;
    label: string;
    action: string;
    sourceUrl: string;
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

function pageCacheKey(): string {
    return `${CACHE_PREFIX}${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
}

function readPageCache(): PageCache {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(pageCacheKey()) ?? 'null');
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

function savePageCache(cache: PageCache): void {
    try {
        window.localStorage.setItem(pageCacheKey(), JSON.stringify(cache));
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

function followRedirect(sourceUrl: string): Promise<string> {
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

function collectServiceAnchors(): ServiceAnchor[] {
    const counters = new Map<string, number>();
    const anchors: ServiceAnchor[] = [];
    for (const element of document.querySelectorAll<HTMLAnchorElement>('a[service][href]')) {
        const rawService = element.getAttribute('service') ?? '';
        const service = normalizeServiceName(rawService);
        if (!service || isIgnoredService(service) || !element.href) continue;

        const count = (counters.get(service) ?? 0) + 1;
        counters.set(service, count);
        anchors.push({
            cacheKey: count === 1 ? service : `${service}:${count}`,
            element,
            service,
            label: element.querySelector<HTMLElement>('.service-title')?.textContent.trim() || rawService,
            action: element.querySelector<HTMLElement>('.service-text')?.textContent.trim() || '',
            sourceUrl: element.href,
        });
    }
    return anchors;
}

function waitForServiceAnchors(): Promise<ServiceAnchor[]> {
    return new Promise(resolve => {
        let settleTimer: number | undefined;
        let finished = false;

        const finish = (anchors: ServiceAnchor[]): void => {
            if (finished) return;
            finished = true;
            observer.disconnect();
            if (settleTimer !== undefined) window.clearTimeout(settleTimer);
            window.clearTimeout(maximumWaitTimer);
            resolve(anchors);
        };

        const waitUntilStable = (): void => {
            const anchors = collectServiceAnchors();
            if (anchors.length === 0) return;

            if (settleTimer !== undefined) window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => {
                const stableAnchors = collectServiceAnchors();
                if (stableAnchors.length > 0) finish(stableAnchors);
                else waitUntilStable();
            }, HYDRATION_SETTLE_MS);
        };

        const observer = new MutationObserver(() => {
            waitUntilStable();
        });
        const maximumWaitTimer = window.setTimeout(() => {
            finish(collectServiceAnchors());
        }, 20_000);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        waitUntilStable();
    });
}

async function resolveServiceLinks(anchors: ServiceAnchor[], cache: PageCache): Promise<ServiceLink[]> {
    const resolved = await Promise.all(
        anchors.map(async anchor => {
            const cached = cache.links[anchor.cacheKey];
            if (cached?.sourceUrl === anchor.sourceUrl) return cached;

            try {
                const decoded = decodeFfmDestination(anchor.sourceUrl);
                if (cached && (!decoded || normalizeServiceUrl(decoded, anchor.service) === cached.url)) {
                    const refreshed = {
                        ...cached,
                        label: anchor.label,
                        action: anchor.action,
                        sourceUrl: anchor.sourceUrl,
                    };
                    cache.links[anchor.cacheKey] = refreshed;
                    return refreshed;
                }
                const destination = decoded ?? (await followRedirect(anchor.sourceUrl));
                const link: ServiceLink = {
                    service: anchor.service,
                    label: anchor.label,
                    action: anchor.action,
                    sourceUrl: anchor.sourceUrl,
                    url: normalizeServiceUrl(destination, anchor.service),
                };
                cache.links[anchor.cacheKey] = link;
                return link;
            } catch (error) {
                console.warn(`FFM importer: could not resolve ${anchor.label}`, error);
                return undefined;
            }
        }),
    );
    savePageCache(cache);
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
        resources = await resolveLegacyBoomplayResources(resources, followRedirect);
    }
    return { releaseId: match.releaseId, matchedUrls: findCanonicallyMatchedLinkUrls(links, resources) };
}

function addStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${PANEL_ID} {
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
            #${PANEL_ID} {
                top: auto;
                right: 8px;
                bottom: 8px;
                width: min(340px, calc(100vw - 16px));
                max-height: 50vh;
            }
        }
        #${PANEL_ID} .ffm-mb-heading,
        #${PANEL_ID} .ffm-mb-controls,
        #${PANEL_ID} .ffm-mb-buttons {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        #${PANEL_ID} .ffm-mb-heading { font-weight: bold; margin-bottom: 8px; }
        #${PANEL_ID} [hidden] { display: none !important; }
        #${PANEL_ID} .ffm-mb-controls { margin: 8px 0; }
        #${PANEL_ID} .ffm-mb-status { color: #555; }
        #${PANEL_ID} .ffm-mb-release { color: #0875bd; font-weight: bold; }
        #${PANEL_ID} .ffm-mb-button {
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
        #${PANEL_ID} .ffm-mb-button:hover:not(:disabled) { background: #fff; }
        #${PANEL_ID} .ffm-mb-button:disabled { cursor: default; opacity: 0.55; }
        #${PANEL_ID} .ffm-mb-button img { flex: none; }
        a.ffm-mb-present { position: relative; outline: 3px solid #32a852 !important; }
        a.ffm-mb-present::after {
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

function createPanel(server: MusicBrainzServer): ImportPanel {
    addStyles();
    document.getElementById(PANEL_ID)?.remove();

    const root = document.createElement('section');
    root.id = PANEL_ID;
    root.innerHTML = `
        <div class="ffm-mb-heading">
            <img src="https://musicbrainz.org/static/images/entity/release.svg" width="18" height="18" alt="" />
            MusicBrainz release importer
        </div>
        <div class="ffm-mb-status">Resolving provider links…</div>
        <div class="ffm-mb-controls">
            <label>MusicBrainz server <select class="ffm-mb-server"></select></label>
            <a class="ffm-mb-release" target="_blank" hidden></a>
        </div>
        <div class="ffm-mb-buttons">
            <a class="ffm-mb-button ffm-mb-harmony" target="_blank" hidden>
                <img src="https://harmony.pulsewidth.org.uk/favicon.svg" width="16" height="16" alt="" />
                Import with Harmony
            </a>
            <button class="ffm-mb-button ffm-mb-missing" type="button" hidden>
                <img src="https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg" width="16" height="16" alt="" />
                <span class="ffm-mb-missing-label">Add Missing Links</span>
            </button>
        </div>
    `;

    mountPanel(root);

    const serverSelect = root.querySelector<HTMLSelectElement>('.ffm-mb-server')!;
    for (const value of MUSICBRAINZ_SERVERS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === MUSICBRAINZ_SERVERS[0] ? 'musicbrainz.org' : 'beta.musicbrainz.org';
        option.selected = value === server;
        serverSelect.appendChild(option);
    }

    return {
        root,
        status: root.querySelector<HTMLElement>('.ffm-mb-status')!,
        release: root.querySelector<HTMLAnchorElement>('.ffm-mb-release')!,
        server: serverSelect,
        harmonyButton: root.querySelector<HTMLAnchorElement>('.ffm-mb-harmony')!,
        missingLinksButton: root.querySelector<HTMLButtonElement>('.ffm-mb-missing')!,
        missingLinksLabel: root.querySelector<HTMLElement>('.ffm-mb-missing-label')!,
    };
}

function mountPanel(root: HTMLElement): void {
    const musicServices = document.querySelector('.music-services-section');
    if (musicServices?.parentElement) musicServices.parentElement.insertBefore(root, musicServices);
    else document.body.appendChild(root);
}

function keepPanelMounted(panel: ImportPanel, onRemount: () => void): void {
    let remountScheduled = false;
    const ensureMounted = (): void => {
        if (panel.root.isConnected || remountScheduled) return;
        remountScheduled = true;
        window.setTimeout(() => {
            remountScheduled = false;
            if (panel.root.isConnected) return;
            mountPanel(panel.root);
            onRemount();
        }, 250);
    };
    const observer = new MutationObserver(ensureMounted);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ensureMounted();
}

function markExistingLinks(anchors: ServiceAnchor[], links: ServiceLink[], matchedUrls: ReadonlySet<string>): void {
    for (const anchor of anchors) {
        const serviceMatches = links.filter(candidate => candidate.service === anchor.service);
        const link = serviceMatches.find(candidate => candidate.sourceUrl === anchor.sourceUrl) ?? serviceMatches[0];
        const present = link ? matchedUrls.has(link.url) : false;
        anchor.element.classList.toggle('ffm-mb-present', present);
        if (present) anchor.element.title = 'This URL is already linked to the MusicBrainz release';
    }
}

function submitMissingLinks(server: MusicBrainzServer, releaseId: string, links: ServiceLink[]): void {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = `${server}/release/${releaseId}/edit`;
    form.target = '_blank';
    form.acceptCharset = 'UTF-8';
    form.hidden = true;

    const parameters: Array<[string, string]> = [
        [
            'edit_note',
            `Added URL relationships from ${window.location.href.replace(/[?#].*$/, '')}\n\nUsing '''${GM_info.script.name}''' ${GM_info.script.version} from https://github.com/murdos/musicbrainz-userscripts`,
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

async function initialize(): Promise<void> {
    if (document.getElementById(PANEL_ID)) return;
    const server = readServerPreference();
    const cache = readPageCache();
    const anchors = await waitForServiceAnchors();
    if (document.getElementById(PANEL_ID)) return;
    const panel = createPanel(server);
    if (anchors.length === 0) {
        panel.status.textContent = 'No FFM provider links were found on this page.';
        return;
    }

    const links = await resolveServiceLinks(anchors, cache);
    panel.status.textContent = `Resolved ${links.length} of ${anchors.length} provider links. Checking MusicBrainz…`;
    configureHarmonyButton(panel, links);

    let lookupGeneration = 0;
    const checkMusicBrainz = async (selectedServer: MusicBrainzServer): Promise<void> => {
        const generation = ++lookupGeneration;
        panel.status.textContent = `Resolved ${links.length} provider links. Checking MusicBrainz…`;
        panel.release.hidden = true;
        panel.missingLinksButton.hidden = true;
        configureHarmonyButton(panel, links);
        markExistingLinks(collectServiceAnchors(), links, new Set());

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
            markExistingLinks(collectServiceAnchors(), links, matchedUrls);
            panel.release.href = `${selectedServer}/release/${match.releaseId}`;
            panel.release.textContent = 'View matched release';
            panel.release.hidden = false;

            const missing = findMissingLinks(links, matchedUrls);
            panel.status.textContent = `${matchedUrls.size} provider link${matchedUrls.size === 1 ? '' : 's'} already present; ${missing.length} additional link${missing.length === 1 ? '' : 's'} available.`;
            panel.missingLinksButton.hidden = false;
            panel.missingLinksButton.disabled = missing.length === 0;
            panel.missingLinksLabel.textContent = missing.length === 0 ? 'All Links Present' : 'Add Missing Links';
            panel.missingLinksButton.onclick = () => {
                submitMissingLinks(selectedServer, match.releaseId, missing);
            };
        } catch (error) {
            if (generation !== lookupGeneration) return;
            console.error('FFM importer: MusicBrainz lookup failed', error);
            panel.status.textContent = 'MusicBrainz lookup failed. Reload the page to try again.';
        }
    };

    panel.server.addEventListener('change', () => {
        const selectedServer = panel.server.value as MusicBrainzServer;
        saveServerPreference(selectedServer);
        void checkMusicBrainz(selectedServer);
    });
    keepPanelMounted(panel, () => {
        void checkMusicBrainz(panel.server.value as MusicBrainzServer);
    });
    await checkMusicBrainz(server);
}

void initialize();
