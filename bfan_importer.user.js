// ==UserScript==
// @name         Import bfan.link releases to MusicBrainz
// @description  Import bfan.link smart links with Harmony and add their remaining URL relationships to MusicBrainz. Bfan is Believe Digital's link aggregator service.
// @version      2026.08.15.1
// @author       Raman Sinclair
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/bfan_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/bfan_importer.user.js
// @match        https://bfan.link/*
// @match        https://*.bfan.link/*
// @run-at       document-idle
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

(function () {
    'use strict';

    const HARMONY_SERVICE_PREFERENCE = ['spotify', 'tidal', 'deezer', 'bandcamp', 'apple', 'itunes'];
    const TRACKING_PARAMETER_NAMES = new Set(['at', 'ct', 'ffm', 'lid', 'ref', 'ref_', 'src', 'tag']);
    const FREE_STREAMING_SERVICES = new Set(['boomplay', 'deezer', 'spotify', 'youtube']);
    const STREAMING_SERVICES = new Set(['amazon', 'apple', 'itunes', 'kkbox', 'pandora', 'qobuz', 'soundcloud', 'tidal', 'youtubemusic']);
    const URL_RELATIONSHIP_TYPES = {
      asin: 77,
      purchaseForDownload: 74,
      downloadForFree: 75,
      otherDatabases: 82,
      streamForFree: 85,
      streaming: 980
    };
    function normalizeServiceName(service) {
      const normalized = service.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, '');
      if (normalized === 'applemusic') return 'apple';
      if (normalized === 'amazonmusic') return 'amazon';
      if (normalized === 'ytmusic') return 'youtubemusic';
      return normalized;
    }
    function removeTrackingParameters(url) {
      for (const name of [...url.searchParams.keys()]) {
        if (name.toLowerCase().startsWith('utm_') || TRACKING_PARAMETER_NAMES.has(name.toLowerCase())) {
          url.searchParams.delete(name);
        }
      }
    }

    /** Produce stable provider URLs suitable for Harmony and exact MusicBrainz URL lookup. */
    function normalizeServiceUrl(rawUrl, rawService) {
      const service = normalizeServiceName(rawService);
      const url = new URL(rawUrl);
      const nestedPandoraUrl = url.searchParams.get('$desktop_url');
      if (nestedPandoraUrl) return normalizeServiceUrl(nestedPandoraUrl, 'pandora');
      url.protocol = 'https:';
      url.hash = '';
      if (service === 'apple' || service === 'itunes') {
        url.hostname = 'music.apple.com';
        url.pathname = url.pathname.replace(/\/id(\d+)\/?$/, '/$1');
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
      } else if (service === 'boomplay') {
        url.hostname = 'www.boomplay.com';
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
    function pathValueAfter(url, segment) {
      const parts = url.pathname.split('/').filter(Boolean);
      const segmentIndex = parts.indexOf(segment);
      if (segmentIndex < 0) return undefined;
      return parts.at(-1);
    }
    function hostnameMatches(url, domain) {
      return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    }
    function amazonAsinFromUrl(rawUrl) {
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
    function canonicalServiceUrlKey(rawUrl, rawService) {
      const service = normalizeServiceName(rawService);
      try {
        const url = new URL(rawUrl);
        let providerId;
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
          case 'amazonstore':
            {
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
    function extractReleaseUrlResources(response) {
      if (!response || typeof response !== 'object') return [];
      const relations = response['relations'];
      if (!Array.isArray(relations)) return [];
      const resources = [];
      for (const relation of relations) {
        const resource = relation.url?.resource;
        if (resource) resources.push(resource);
      }
      return resources;
    }
    function findCanonicallyMatchedLinkUrls(links, releaseResources) {
      return links.filter(link => {
        const linkKey = canonicalServiceUrlKey(link.url, link.service);
        return releaseResources.some(resource => canonicalServiceUrlKey(resource, link.service) === linkKey);
      }).map(link => link.url);
    }
    function isLegacyBoomplayAlbumUrl(rawUrl) {
      try {
        const url = new URL(rawUrl);
        return hostnameMatches(url, 'boomplay.com') && /^\/albums\/\d+\/?$/.test(url.pathname);
      } catch {
        return false;
      }
    }

    /** Add the current destinations of legacy numeric Boomplay album URLs as comparison aliases. */
    async function expandLegacyBoomplayResources(resources, resolveUrl) {
      const aliases = await Promise.all(resources.map(async resource => {
        if (!isLegacyBoomplayAlbumUrl(resource)) return resource;
        try {
          return await resolveUrl(resource);
        } catch {
          return resource;
        }
      }));
      return [...new Set([...resources, ...aliases])];
    }

    /** Return every resolved provider link that is not linked to the matched release. */
    function findMissingLinks(links, matchedUrls) {
      return links.filter(link => !matchedUrls.has(link.url));
    }
    function chooseHarmonyLink(links) {
      for (const preferredService of HARMONY_SERVICE_PREFERENCE) {
        const match = links.find(link => normalizeServiceName(link.service) === preferredService);
        if (match) return match;
      }
      return undefined;
    }
    function relationshipTypeFor(link) {
      const action = link.action.toLowerCase();
      const service = normalizeServiceName(link.service);
      if (amazonAsinFromUrl(link.url)) return URL_RELATIONSHIP_TYPES.asin;
      if (action.includes('free') && action.includes('download')) return URL_RELATIONSHIP_TYPES.downloadForFree;
      if (action.includes('buy') || action.includes('download') || ['amazonstore', 'beatport'].includes(service)) {
        return URL_RELATIONSHIP_TYPES.purchaseForDownload;
      }
      if (FREE_STREAMING_SERVICES.has(service)) {
        return URL_RELATIONSHIP_TYPES.streamForFree;
      }
      if (STREAMING_SERVICES.has(service)) {
        return URL_RELATIONSHIP_TYPES.streaming;
      }
      if (action.includes('play') || action.includes('listen') || action.includes('stream')) {
        return URL_RELATIONSHIP_TYPES.streamForFree;
      }
      return URL_RELATIONSHIP_TYPES.otherDatabases;
    }
    function readReleaseIds(relations) {
      if (!Array.isArray(relations)) return [];
      const ids = [];
      for (const relation of relations) {
        if (!relation || typeof relation !== 'object') continue;
        const release = relation['release'];
        if (!release || typeof release !== 'object') continue;
        const id = release['id'];
        if (typeof id === 'string') ids.push(id);
      }
      return ids;
    }

    /** Collect every release matched by any of the queried provider URLs. */
    function findReleaseMatches(response) {
      if (!response || typeof response !== 'object') return [];
      const record = response;
      const urlEntries = Array.isArray(record['urls']) ? record['urls'] : [record];
      const matches = new Map();
      for (const entry of urlEntries) {
        if (!entry || typeof entry !== 'object') continue;
        const urlRecord = entry;
        const resource = urlRecord['resource'];
        if (typeof resource !== 'string') continue;
        for (const releaseId of readReleaseIds(urlRecord['relations'])) {
          const resources = matches.get(releaseId) ?? new Set();
          resources.add(resource);
          matches.set(releaseId, resources);
        }
      }
      return [...matches].map(([releaseId, resources]) => ({
        releaseId,
        matchedUrls: [...resources]
      }));
    }

    const SERVER_PREFERENCE_KEY = 'smartlink-mb-importer:server';
    const HYDRATION_SETTLE_MS = 1_000;
    const MUSICBRAINZ_SERVERS = ['https://musicbrainz.org', 'https://beta.musicbrainz.org'];
    function pageCacheKey(config) {
      return `${config.id}-mb-importer:v1:${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
    }
    function readPageCache(config) {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(pageCacheKey(config)) ?? 'null');
        if (parsed && typeof parsed === 'object') {
          const record = parsed;
          if (record['links'] && typeof record['links'] === 'object') {
            return {
              links: record['links']
            };
          }
        }
      } catch {
        // Ignore unavailable storage and obsolete/corrupt cache entries.
      }
      return {
        links: {}
      };
    }
    function savePageCache(config, cache) {
      try {
        window.localStorage.setItem(pageCacheKey(config), JSON.stringify(cache));
      } catch {
        // The importer still works for this page load when storage is unavailable.
      }
    }
    function readServerPreference() {
      try {
        const stored = window.localStorage.getItem(SERVER_PREFERENCE_KEY);
        if (MUSICBRAINZ_SERVERS.includes(stored)) return stored;
      } catch {
        // Fall through to production.
      }
      return MUSICBRAINZ_SERVERS[0];
    }
    function saveServerPreference(server) {
      try {
        window.localStorage.setItem(SERVER_PREFERENCE_KEY, server);
      } catch {
        // Preference persistence is optional.
      }
    }
    function gmRequest() {
      const userscriptGlobal = globalThis;
      return userscriptGlobal.GM?.xmlHttpRequest ?? userscriptGlobal.GM_xmlhttpRequest;
    }
    function followRedirect(sourceUrl) {
      const request = gmRequest();
      if (!request) return Promise.reject(new Error('No userscript cross-origin request API is available'));
      return new Promise((resolve, reject) => {
        const failed = () => {
          reject(new Error(`Could not resolve ${sourceUrl}`));
        };
        request({
          method: 'GET',
          url: sourceUrl,
          timeout: 20_000,
          onload: response => {
            const destination = response.finalUrl ?? response.responseURL;
            if (response.status >= 200 && response.status < 400 && destination) resolve(destination);else failed();
          },
          onerror: failed,
          ontimeout: failed
        });
      });
    }
    function waitForServiceElements(config) {
      return new Promise(resolve => {
        let settleTimer;
        let finished = false;
        const finish = elements => {
          if (finished) return;
          finished = true;
          observer.disconnect();
          if (settleTimer !== undefined) window.clearTimeout(settleTimer);
          window.clearTimeout(maximumWaitTimer);
          resolve(elements);
        };
        const waitUntilStable = () => {
          const elements = config.collectServiceElements();
          if (elements.length === 0) return;
          if (settleTimer !== undefined) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(() => {
            const stableAnchors = config.collectServiceElements();
            if (stableAnchors.length > 0) finish(stableAnchors);else waitUntilStable();
          }, HYDRATION_SETTLE_MS);
        };
        const observer = new MutationObserver(() => {
          waitUntilStable();
        });
        const maximumWaitTimer = window.setTimeout(() => {
          finish(config.collectServiceElements());
        }, 20_000);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
        waitUntilStable();
      });
    }
    async function resolveServiceLinks(config, elements, cache) {
      const resolved = await Promise.all(elements.map(async element => {
        const cached = cache.links[element.cacheKey];
        if (cached?.sourceUrl === element.sourceUrl) {
          const refreshed = {
            ...cached,
            label: element.label,
            action: element.action
          };
          cache.links[element.cacheKey] = refreshed;
          return refreshed;
        }
        try {
          const destination = await config.resolveDestination(element);
          const link = {
            service: element.service,
            label: element.label,
            action: element.action,
            sourceUrl: element.sourceUrl,
            url: normalizeServiceUrl(destination, element.service)
          };
          cache.links[element.cacheKey] = link;
          return link;
        } catch (error) {
          console.warn(`${config.siteName} importer: could not resolve ${element.label}`, error);
          return undefined;
        }
      }));
      savePageCache(config, cache);
      return resolved.filter(link => link !== undefined);
    }
    function lookupReleases(links, server) {
      const resources = [...new Set(links.map(link => link.url))];
      if (resources.length === 0) return Promise.resolve([]);
      const endpoint = new URL('/ws/2/url', server);
      for (const resource of resources) endpoint.searchParams.append('resource', resource);
      endpoint.searchParams.set('inc', 'release-rels');
      endpoint.searchParams.set('fmt', 'json');
      return fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        }
      }).then(async response => {
        if (!response.ok) throw new Error(`MusicBrainz URL lookup failed with HTTP ${response.status}`);
        return findReleaseMatches(await response.json());
      });
    }
    async function includeReleaseRelationships(links, server, match) {
      const endpoint = new URL(`/ws/2/release/${match.releaseId}`, server);
      endpoint.searchParams.set('inc', 'url-rels');
      endpoint.searchParams.set('fmt', 'json');
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) throw new Error(`MusicBrainz release lookup failed with HTTP ${response.status}`);
      let resources = extractReleaseUrlResources(await response.json());
      if (links.some(link => normalizeServiceName(link.service) === 'boomplay')) {
        resources = await expandLegacyBoomplayResources(resources, followRedirect);
      }
      return {
        releaseId: match.releaseId,
        matchedUrls: findCanonicallyMatchedLinkUrls(links, resources)
      };
    }
    function panelId(config) {
      return `${config.id}-mb-importer`;
    }
    function styleId(config) {
      return `${panelId(config)}-style`;
    }
    function addStyles(config) {
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
    function createPanel(config, server) {
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
      const serverSelect = root.querySelector('.smartlink-mb-server');
      for (const value of MUSICBRAINZ_SERVERS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === MUSICBRAINZ_SERVERS[0] ? 'musicbrainz.org' : 'beta.musicbrainz.org';
        option.selected = value === server;
        serverSelect.appendChild(option);
      }
      return {
        root,
        status: root.querySelector('.smartlink-mb-status'),
        release: root.querySelector('.smartlink-mb-release'),
        server: serverSelect,
        harmonyButton: root.querySelector('.smartlink-mb-harmony'),
        missingLinksButton: root.querySelector('.smartlink-mb-missing'),
        missingLinksLabel: root.querySelector('.smartlink-mb-missing-label')
      };
    }
    function mountPanel(config, root) {
      if (config.mountPanel) config.mountPanel(root);else document.body.appendChild(root);
    }
    function keepPanelMounted(config, panel, onRemount) {
      let remountScheduled = false;
      const ensureMounted = () => {
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
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      ensureMounted();
    }
    function markExistingLinks(elements, links, matchedUrls) {
      for (const element of elements) {
        const serviceMatches = links.filter(candidate => candidate.service === element.service);
        const link = serviceMatches.find(candidate => candidate.sourceUrl === element.sourceUrl) ?? serviceMatches[0];
        const present = link ? matchedUrls.has(link.url) : false;
        element.element.classList.toggle('smartlink-mb-present', present);
        if (present) element.element.title = 'This URL is already linked to the MusicBrainz release';
      }
    }
    function submitMissingLinks(config, server, releaseId, links) {
      const form = document.createElement('form');
      form.method = 'post';
      form.action = `${server}/release/${releaseId}/edit`;
      form.target = '_blank';
      form.acceptCharset = 'UTF-8';
      form.hidden = true;
      const userscriptInfo = globalThis.GM_info?.script;
      const scriptName = userscriptInfo?.name ?? `${config.siteName} MusicBrainz importer`;
      const scriptVersion = userscriptInfo?.version ? ` ${userscriptInfo.version}` : '';
      const parameters = [['edit_note', `Added URL relationships from ${window.location.href.replace(/[?#].*$/, '')}\n\nUsing '''${scriptName}'''${scriptVersion} from https://github.com/murdos/musicbrainz-userscripts`], ['redirect_uri', `${server}/release/${releaseId}`]];
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
    function configureHarmonyButton(panel, links) {
      const harmonyLink = chooseHarmonyLink(links);
      if (!harmonyLink) return;
      const harmonyUrl = new URL('https://harmony.pulsewidth.org.uk/release');
      harmonyUrl.searchParams.set('category', 'preferred');
      harmonyUrl.searchParams.set('url', harmonyLink.url);
      panel.harmonyButton.href = harmonyUrl.toString();
      panel.harmonyButton.title = `Import using ${harmonyLink.label}`;
      panel.harmonyButton.hidden = false;
    }
    async function runSmartLinkImporter(config) {
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
      const checkMusicBrainz = async selectedServer => {
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
        const selectedServer = panel.server.value;
        saveServerPreference(selectedServer);
        void checkMusicBrainz(selectedServer);
      });
      keepPanelMounted(config, panel, () => {
        void checkMusicBrainz(panel.server.value);
      });
      await checkMusicBrainz(server);
    }

    function record(value) {
      return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    }

    /** Read release-provider destinations from bfan.link's Next.js hydration payload. */
    function extractBfanServiceData(payload) {
      const root = record(payload);
      const props = record(root?.['props']);
      const pageProps = record(props?.['pageProps']);
      const backlink = record(pageProps?.['backlinkStaticData']);
      const stores = record(backlink?.['stores']);
      if (!backlink || !stores) return [];
      const mode = backlink['mode'] === 'prerelease' ? 'prereleaseLandingCTAs' : 'postreleaseLandingCTAs';
      const ctas = record(backlink[mode]);
      const options = record(ctas?.['options']);
      const displayOrder = Array.isArray(ctas?.['displayOrder']) ? ctas['displayOrder'].filter(value => typeof value === 'string') : Object.keys(stores);
      const links = [];
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
          sourceUrl
        });
      }
      return links;
    }

    function readServiceData() {
      const nextData = document.querySelector('script#__NEXT_DATA__')?.textContent;
      if (!nextData) return [];
      try {
        return extractBfanServiceData(JSON.parse(nextData));
      } catch {
        return [];
      }
    }
    function collectServiceElements() {
      const dataByService = new Map(readServiceData().map(data => [data.service, data]));
      const elements = [];
      for (const element of document.querySelectorAll('[data-testid="call-to-actions"] > [data-testid]')) {
        const rawService = element.dataset['testid'] ?? '';
        const service = normalizeServiceName(rawService);
        const data = dataByService.get(service);
        if (!data) continue;
        elements.push({
          cacheKey: service,
          element,
          service,
          label: element.querySelector('img[alt]')?.alt || data.label,
          action: element.querySelector('button')?.textContent.trim() || data.action,
          sourceUrl: data.sourceUrl
        });
      }
      return elements;
    }
    void runSmartLinkImporter({
      id: 'bfan',
      siteName: 'bfan.link',
      collectServiceElements,
      resolveDestination: element => element.sourceUrl
    });

})();
