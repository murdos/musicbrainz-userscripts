import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';
import { subscribeToSPANavigation } from '~/lib/shared/spa-navigation';
import { type ArtistCredit, type Disc, type Label, type Release, type Track, type URL } from '~/types/importers';

import type { ElasticStageRelease } from './types';
import { waitForReleases } from './utils/getElasticStageData';

const LOGGER = new Logger('elasticstage_importer', LogLevel.INFO);

const MB_IMPORT_CONTAINER_ID = 'mb_elasticstage_import';
const MB_STYLE_ID = 'mb_elasticstage_style';
const MB_MINIMIZED_CLASS = 'mb-es-minimized';
const MB_PRODUCT_BADGE_CLASS = 'mb-es-product-badge';
const MB_MINIMIZED_STORAGE_KEY = 'mb_elasticstage_minimized';
const MB_LOOKUP_CACHE_PREFIX = 'mb_elasticstage_lookup:v1:';
// Match the default positive-result lifetime used by lib/mblinks.js (and the Bandcamp importer).
const MB_LOOKUP_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MB_EMPTY_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const MB_LOGO_URL =
    'https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg';

let productButtonObserver: MutationObserver | undefined;

// Keep ElasticStage's keyboard handlers from cancelling browser-level actions.
window.addEventListener(
    'keydown',
    event => {
        if (event.key === 'F5' || event.key === 'F12' || event.code === 'F5' || event.code === 'F12') {
            event.stopImmediatePropagation();
        }
    },
    { capture: true },
);

type MusicBrainzReleaseMatch = {
    id: string;
    title: string;
    disambiguation: string;
    barcode: string | null;
};

type MusicBrainzLookupCache = {
    fetchedAt: number;
    releases: MusicBrainzReleaseMatch[];
};

type ReleaseBlock = {
    element: HTMLElement;
    esRelease: ElasticStageRelease;
    status: HTMLElement;
};

function isMinimizedPreferred(): boolean {
    try {
        return window.localStorage.getItem(MB_MINIMIZED_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function saveMinimizedPreference(minimized: boolean): void {
    try {
        window.localStorage.setItem(MB_MINIMIZED_STORAGE_KEY, minimized ? '1' : '0');
    } catch {
        // localStorage unavailable; preference simply won't persist
    }
}

function lookupCacheKey(releaseUrl: string): string {
    return `${MB_LOOKUP_CACHE_PREFIX}${releaseUrl}`;
}

function isMusicBrainzReleaseMatch(value: unknown): value is MusicBrainzReleaseMatch {
    if (!value || typeof value !== 'object') return false;
    const release = value as Record<string, unknown>;
    return (
        typeof release['id'] === 'string' &&
        typeof release['title'] === 'string' &&
        typeof release['disambiguation'] === 'string' &&
        (typeof release['barcode'] === 'string' || release['barcode'] === null)
    );
}

function readLookupCache(releaseUrl: string): MusicBrainzReleaseMatch[] | undefined {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(lookupCacheKey(releaseUrl)) ?? 'null');
        if (!parsed || typeof parsed !== 'object') return undefined;

        const cache = parsed as Record<string, unknown>;
        if (typeof cache['fetchedAt'] !== 'number' || !Array.isArray(cache['releases'])) return undefined;
        if (!cache['releases'].every(isMusicBrainzReleaseMatch)) return undefined;

        const ttl = cache['releases'].length > 0 ? MB_LOOKUP_CACHE_TTL_MS : MB_EMPTY_LOOKUP_CACHE_TTL_MS;
        if (Date.now() - cache['fetchedAt'] > ttl) return undefined;
        return cache['releases'];
    } catch {
        return undefined;
    }
}

function saveLookupCache(releaseUrl: string, releases: MusicBrainzReleaseMatch[]): void {
    try {
        const cache: MusicBrainzLookupCache = { fetchedAt: Date.now(), releases };
        window.localStorage.setItem(lookupCacheKey(releaseUrl), JSON.stringify(cache));
    } catch {
        // A live lookup still works when localStorage is unavailable.
    }
}

function parseMusicBrainzReleaseMatches(data: unknown): MusicBrainzReleaseMatch[] {
    if (!data || typeof data !== 'object') return [];
    const relations = (data as Record<string, unknown>)['relations'];
    if (!Array.isArray(relations)) return [];

    const matches = new Map<string, MusicBrainzReleaseMatch>();
    for (const relationValue of relations) {
        if (!relationValue || typeof relationValue !== 'object') continue;
        const releaseValue = (relationValue as Record<string, unknown>)['release'];
        if (!releaseValue || typeof releaseValue !== 'object') continue;
        const release = releaseValue as Record<string, unknown>;
        if (typeof release['id'] !== 'string' || typeof release['title'] !== 'string') continue;

        matches.set(release['id'], {
            id: release['id'],
            title: release['title'],
            disambiguation: typeof release['disambiguation'] === 'string' ? release['disambiguation'] : '',
            barcode: typeof release['barcode'] === 'string' ? release['barcode'] : null,
        });
    }
    return [...matches.values()];
}

async function lookupMusicBrainzReleases(releaseUrl: string, forceRefresh = false): Promise<MusicBrainzReleaseMatch[]> {
    if (!forceRefresh) {
        const cached = readLookupCache(releaseUrl);
        if (cached) return cached;
    }

    const endpoint = new URL('https://musicbrainz.org/ws/2/url');
    endpoint.searchParams.set('resource', releaseUrl);
    endpoint.searchParams.set('inc', 'release-rels');
    endpoint.searchParams.set('fmt', 'json');

    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`MusicBrainz URL lookup failed with HTTP ${response.status}`);

    const matches = parseMusicBrainzReleaseMatches(await response.json());
    saveLookupCache(releaseUrl, matches);
    return matches;
}

/** Detect a release page, e.g. /{artist}/releases/{release}. */
function isReleasePage(): boolean {
    return /^\/[^/]+\/releases\/[^/]+/.test(window.location.pathname);
}

/** Remove any previously inserted import UI to avoid duplicates on SPA navigation. */
function cleanup(): void {
    clearProductButtonMarks();
    document.getElementById(MB_IMPORT_CONTAINER_ID)?.remove();
}

function clearProductButtonMarks(): void {
    productButtonObserver?.disconnect();
    productButtonObserver = undefined;
    document.querySelectorAll(`.${MB_PRODUCT_BADGE_CLASS}`).forEach(badge => {
        badge.remove();
    });
}

/** Map an elasticstage medium string to a MusicBrainz medium format. */
function mapMediumFormat(medium: string): string {
    switch (medium.trim().toLowerCase()) {
        case 'cd':
            return 'CD';
        case 'vinyl':
            return 'Vinyl';
        case 'cassette':
            return 'Cassette';
        default:
            return medium;
    }
}

/** Map an elasticstage format string to a MusicBrainz primary release type. */
function mapPrimaryType(format: string): string {
    switch (format.trim().toLowerCase()) {
        case 'album':
            return 'album';
        case 'single':
            return 'single';
        case 'ep':
            return 'EP';
        default:
            return '';
    }
}

/** Normalise the elasticstage artist fields into a flat list of artist names. */
function normalizeArtists(primary: string, additional: unknown[]): string[] {
    const names: string[] = [];
    if (primary) {
        names.push(primary);
    }
    for (const entry of additional) {
        if (typeof entry === 'string') {
            if (entry) names.push(entry);
        } else if (entry && typeof entry === 'object') {
            const record = entry as Record<string, unknown>;
            const name = record['name'] ?? record['primary_artist'] ?? record['artist'];
            if (typeof name === 'string' && name) {
                names.push(name);
            }
        }
    }
    return names;
}

function buildTrackTitle(title: string, subtitle: string | null): string {
    const trimmedSubtitle = subtitle?.trim();
    if (trimmedSubtitle) {
        return `${title} (${trimmedSubtitle})`;
    }
    return title;
}

function buildReleaseInfo(release_url: string, esRelease: ElasticStageRelease): Release {
    const releaseDate = esRelease.release_date.split('T')[0]?.split('-') ?? [];

    const medium = esRelease.release_type.product_type.medium;
    const mediumFormat = mapMediumFormat(medium);
    const isVinyl = medium.trim().toLowerCase() === 'vinyl';

    const mbrelease = {
        artist_credit: [] as ArtistCredit[],
        title: esRelease.title,
        year: parseInt(releaseDate[0] || '0'),
        month: parseInt(releaseDate[1] || '0'),
        day: parseInt(releaseDate[2] || '0'),
        format: mediumFormat,
        country: 'XW',
        status: 'official',
        type: mapPrimaryType(esRelease.release_type.format || ''),
        urls: [] as URL[],
        labels: [] as Label[],
        barcode: esRelease.ean,
        discs: [] as Disc[],
    } satisfies Release;

    mbrelease.artist_credit = MBImport.makeArtistCredits(normalizeArtists(esRelease.primary_artist, esRelease.additional_artists));

    mbrelease.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_mail_order,
    });

    if (esRelease.label) {
        const label: Label = { name: esRelease.label };
        // elasticstage often reuses the EAN as the catalog number; only keep a
        // genuine catalog number to avoid polluting MB with the barcode.
        if (esRelease.catalog_no && esRelease.catalog_no !== esRelease.ean) {
            label.catno = esRelease.catalog_no;
        }
        mbrelease.labels.push(label);
    }

    const mbtracks: Track[] = [];
    const sideCounters: Record<number, number> = {};
    for (const sideGroup of esRelease.tracks) {
        for (const esTrack of sideGroup) {
            const artists = normalizeArtists(esTrack.primary_artist, esTrack.additional_artists);
            const track: Track = {
                artist_credit: MBImport.makeArtistCredits(artists),
                title: buildTrackTitle(esTrack.title, esTrack.subtitle),
                duration: Math.round(esTrack.duration * 1000),
            };
            if (isVinyl) {
                const side = esTrack.side || 1;
                sideCounters[side] = (sideCounters[side] ?? 0) + 1;
                track.number = `${String.fromCharCode(64 + side)}${sideCounters[side]}`;
            }
            mbtracks.push(track);
        }
    }

    mbrelease.discs.push({
        tracks: mbtracks,
        format: mediumFormat,
    });

    return mbrelease;
}

function buildStyles(): void {
    if (document.getElementById(MB_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = MB_STYLE_ID;
    style.textContent = `
        #${MB_IMPORT_CONTAINER_ID} {
            position: fixed;
            left: 16px;
            bottom: 16px;
            z-index: 2147483646;
            max-width: 360px;
            max-height: 70vh;
            overflow-y: auto;
            background: rgba(255, 255, 255, 0.97);
            color: #222;
            border: 1px solid rgba(120, 120, 120, 0.6);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            padding: 10px 12px;
            font-family: Arial, sans-serif;
            font-size: 12px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-logo {
            flex: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-minimize {
            margin-left: auto;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #555;
            font-size: 16px;
            line-height: 1;
            padding: 0 4px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-minimize:hover {
            color: #000;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-refresh {
            cursor: pointer;
            border: none;
            background: transparent;
            color: #555;
            font-size: 16px;
            line-height: 1;
            padding: 0 2px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-refresh:hover {
            color: #000;
        }
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized {
            max-width: none;
            width: 44px;
            height: 44px;
            padding: 0;
            overflow: hidden;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-header {
            margin-bottom: 0;
        }
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-title,
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-refresh,
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-minimize,
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-release {
            display: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release {
            border-top: 1px solid rgba(120, 120, 120, 0.25);
            padding-top: 8px;
            margin-top: 8px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release:first-of-type {
            border-top: none;
            padding-top: 0;
            margin-top: 0;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release-title {
            font-weight: bold;
            margin-bottom: 2px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release-meta {
            color: #555;
            margin-bottom: 6px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status {
            margin-bottom: 6px;
            color: #666;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status.mb-es-found {
            color: #287c2d;
            font-weight: bold;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status.mb-es-error {
            color: #a33;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status a {
            color: inherit;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release.mb-es-imported .musicbrainz_import_add {
            display: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release.mb-es-imported .mb-es-buttons {
            display: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            align-items: center;
        }
        .${MB_PRODUCT_BADGE_CLASS} {
            display: inline-flex;
            align-items: center;
            margin-left: 8px;
            padding: 3px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.95);
            vertical-align: middle;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
        }
        .${MB_PRODUCT_BADGE_CLASS}:hover {
            background: #fff;
            transform: scale(1.08);
        }
        .${MB_PRODUCT_BADGE_CLASS} img {
            display: block;
            width: 20px;
            height: 20px;
        }
    `;
    document.head.appendChild(style);
}

function buildReleaseBlock(esRelease: ElasticStageRelease, mbrelease: Release, release_url: string): ReleaseBlock {
    const block = document.createElement('div');
    block.className = 'mb-es-release';

    const title = document.createElement('div');
    title.className = 'mb-es-release-title';
    title.textContent = esRelease.release_type.description || esRelease.release_type.product_type.medium;
    block.appendChild(title);

    const metaLine = document.createElement('div');
    metaLine.className = 'mb-es-release-meta';
    const metaParts = [`${mbrelease.discs[0]?.tracks.length ?? 0} tracks`];
    if (esRelease.ean) metaParts.push(`Barcode: ${esRelease.ean}`);
    if (esRelease.is_limited_edition) metaParts.push('Limited edition');
    metaLine.textContent = metaParts.join(' · ');
    block.appendChild(metaLine);

    const status = document.createElement('div');
    status.className = 'mb-es-mb-status';
    status.textContent = 'Checking MusicBrainz…';
    block.appendChild(status);

    const editNote = MBImport.makeEditNote(release_url, 'ElasticStage', esRelease.release_type.description);
    const parameters = MBImport.buildFormParameters(mbrelease, editNote);

    const buttons = document.createElement('div');
    buttons.className = 'mb-es-buttons';
    buttons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(mbrelease);
    block.appendChild(buttons);

    return { element: block, esRelease, status };
}

function normalizeBarcode(barcode: string | null | undefined): string {
    return barcode?.replace(/[^0-9A-Z]/gi, '').toUpperCase() ?? '';
}

function matchesForReleaseBlock(
    block: ReleaseBlock,
    blocks: ReleaseBlock[],
    matches: MusicBrainzReleaseMatch[],
): MusicBrainzReleaseMatch[] {
    const barcode = normalizeBarcode(block.esRelease.ean);
    const barcodeMatches = barcode ? matches.filter(match => normalizeBarcode(match.barcode) === barcode) : [];

    // A lone relationship is unambiguous even when the source or MB release has no barcode.
    if (barcodeMatches.length === 0 && blocks.length === 1 && matches.length === 1) return matches;
    return barcodeMatches;
}

function normalizeProductDescription(description: string): string {
    return description
        .toLowerCase()
        .replace(/\s*\|.*$/, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function mediumCategory(description: string): string {
    const normalized = normalizeProductDescription(description);
    if (/\bcd\b/.test(normalized)) return 'cd';
    if (/\bvinyl\b/.test(normalized)) return 'vinyl';
    if (/\bcassette\b/.test(normalized)) return 'cassette';
    return normalized;
}

function blockProductDescriptions(block: ReleaseBlock): string[] {
    const releaseType = block.esRelease.release_type;
    return [releaseType.product_type.description, releaseType.description, releaseType.product_type.medium]
        .map(normalizeProductDescription)
        .filter(Boolean);
}

function markProductButtons(blocks: ReleaseBlock[], matches: MusicBrainzReleaseMatch[]): void {
    const imported = blocks
        .map(block => ({ block, matches: matchesForReleaseBlock(block, blocks, matches) }))
        .filter(entry => entry.matches.length > 0);

    const buttons = [...document.querySelectorAll<HTMLElement>('[data-test="retail.releaseGroup.chooseReleaseButton.container"]')];
    const buttonCategories = buttons.map(button => {
        const description = button.querySelector<HTMLElement>(
            '[data-test="retail.releaseGroup.chooseReleaseButton.productDescription"]',
        )?.textContent;
        return description ? mediumCategory(description) : '';
    });

    for (const button of buttons) {
        if (button.querySelector(`.${MB_PRODUCT_BADGE_CLASS}`)) continue;
        const descriptionElement = button.querySelector<HTMLElement>(
            '[data-test="retail.releaseGroup.chooseReleaseButton.productDescription"]',
        );
        if (!descriptionElement) continue;

        const description = normalizeProductDescription(descriptionElement.textContent);
        let candidates = imported.filter(entry => blockProductDescriptions(entry.block).includes(description));
        if (candidates.length === 0) {
            const category = mediumCategory(description);
            candidates = imported.filter(entry => mediumCategory(entry.block.esRelease.release_type.product_type.medium) === category);
            if (candidates.length !== 1 || buttonCategories.filter(buttonCategory => buttonCategory === category).length !== 1) continue;
        }
        if (candidates.length !== 1) continue;

        const releaseMatches = candidates[0]?.matches ?? [];
        for (const match of releaseMatches) {
            const link = document.createElement('a');
            link.className = MB_PRODUCT_BADGE_CLASS;
            link.href = `https://musicbrainz.org/release/${match.id}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = `View ${match.title} on MusicBrainz`;
            link.setAttribute('aria-label', `View ${match.title} on MusicBrainz`);
            link.innerHTML = `<img src="${MB_LOGO_URL}" alt="" />`;
            link.addEventListener('click', event => {
                event.stopPropagation();
            });
            descriptionElement.insertAdjacentElement('afterend', link);
        }
    }
}

function watchProductButtons(blocks: ReleaseBlock[], matches: MusicBrainzReleaseMatch[]): void {
    clearProductButtonMarks();
    markProductButtons(blocks, matches);

    productButtonObserver = new MutationObserver(() => {
        markProductButtons(blocks, matches);
    });
    productButtonObserver.observe(document.body, { childList: true, subtree: true });
}

function setReleaseMatches(blocks: ReleaseBlock[], matches: MusicBrainzReleaseMatch[]): boolean {
    let importedCount = 0;
    for (const block of blocks) {
        const releaseMatches = matchesForReleaseBlock(block, blocks, matches);

        block.status.replaceChildren();
        block.status.classList.remove('mb-es-found', 'mb-es-error');
        if (releaseMatches.length === 0) {
            block.element.classList.remove('mb-es-imported');
            block.status.textContent = matches.length > 0 ? 'No barcode-matched MusicBrainz release found.' : 'Not found in MusicBrainz.';
            continue;
        }

        block.element.classList.add('mb-es-imported');
        importedCount++;
        block.status.classList.add('mb-es-found');
        block.status.append('Already in MusicBrainz: ');
        releaseMatches.forEach((match, index) => {
            if (index > 0) block.status.append(', ');
            const link = document.createElement('a');
            link.href = `https://musicbrainz.org/release/${match.id}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = match.disambiguation ? `${match.title} (${match.disambiguation})` : match.title;
            block.status.appendChild(link);
        });
    }
    return importedCount === blocks.length;
}

function setLookupError(blocks: ReleaseBlock[]): void {
    for (const block of blocks) {
        block.element.classList.remove('mb-es-imported');
        block.status.classList.remove('mb-es-found');
        block.status.classList.add('mb-es-error');
        block.status.textContent = 'Could not check MusicBrainz. You can still import or search.';
    }
}

function insertMBButtons(esReleases: ElasticStageRelease[], release_url: string): void {
    if (esReleases.length === 0) {
        LOGGER.error('No releases found to import');
        return;
    }

    buildStyles();

    const container = document.createElement('div');
    container.id = MB_IMPORT_CONTAINER_ID;

    const header = document.createElement('div');
    header.className = 'mb-es-header';
    header.innerHTML = `
        <img class="mb-es-logo" src="${MB_LOGO_URL}" width="18" height="18" />
        <span class="mb-es-title">Import to MusicBrainz</span>
        <button type="button" class="mb-es-refresh" title="Refresh MusicBrainz lookup" aria-label="Refresh MusicBrainz lookup">↻</button>
        <button type="button" class="mb-es-minimize" title="Minimise" aria-label="Minimise">&minus;</button>
    `;
    container.appendChild(header);

    const setMinimized = (minimized: boolean, savePreference = true): void => {
        container.classList.toggle(MB_MINIMIZED_CLASS, minimized);
        container.title = minimized ? 'Expand MusicBrainz import' : '';
        if (savePreference) saveMinimizedPreference(minimized);
    };

    header.querySelector('.mb-es-minimize')?.addEventListener('click', event => {
        event.stopPropagation();
        setMinimized(true);
    });

    // When collapsed to an icon, a click anywhere on it expands it again.
    container.addEventListener('click', () => {
        if (container.classList.contains(MB_MINIMIZED_CLASS)) {
            setMinimized(false);
        }
    });

    const blocks: ReleaseBlock[] = [];
    for (const esRelease of esReleases) {
        const mbrelease = buildReleaseInfo(release_url, esRelease);
        const block = buildReleaseBlock(esRelease, mbrelease, release_url);
        blocks.push(block);
        container.appendChild(block.element);
    }

    if (isMinimizedPreferred()) {
        container.classList.add(MB_MINIMIZED_CLASS);
        container.title = 'Expand MusicBrainz import';
    }

    document.body.appendChild(container);

    const refreshButton = header.querySelector<HTMLButtonElement>('.mb-es-refresh');
    const checkMusicBrainz = async (forceRefresh = false): Promise<void> => {
        if (refreshButton) refreshButton.disabled = true;
        clearProductButtonMarks();
        for (const block of blocks) {
            block.status.classList.remove('mb-es-found', 'mb-es-error');
            block.status.textContent = 'Checking MusicBrainz…';
        }
        try {
            const matches = await lookupMusicBrainzReleases(release_url, forceRefresh);
            if (!container.isConnected || window.location.href.replace(/[?#].*$/, '') !== release_url) return;
            const allImported = setReleaseMatches(blocks, matches);
            watchProductButtons(blocks, matches);
            if (allImported && !forceRefresh) setMinimized(true, false);
        } catch (error) {
            LOGGER.error('MusicBrainz lookup failed:', error);
            if (container.isConnected) setLookupError(blocks);
        } finally {
            if (refreshButton && container.isConnected) refreshButton.disabled = false;
        }
    };

    refreshButton?.addEventListener('click', event => {
        event.stopPropagation();
        void checkMusicBrainz(true);
    });
    void checkMusicBrainz();
}

async function processReleasePage(): Promise<void> {
    cleanup();

    if (!isReleasePage()) {
        return;
    }

    try {
        const releases = await waitForReleases();

        // The page may have re-rendered while we waited; bail out if we navigated away.
        if (!isReleasePage()) {
            return;
        }

        if (releases.length === 0) {
            LOGGER.error('Could not find release data in the page state');
            return;
        }

        const release_url = window.location.href.replace(/[?#].*$/, '');
        insertMBButtons(releases, release_url);
    } catch (error) {
        LOGGER.error('Error processing release page:', error);
    }
}

function init(): void {
    MBImportStyle();
    setTimeout(() => {
        void processReleasePage();
    }, 1000);
}

subscribeToSPANavigation({
    onNavigate: () => processReleasePage(),
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
