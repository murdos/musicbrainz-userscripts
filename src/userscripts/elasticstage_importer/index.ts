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
const MB_MINIMIZED_STORAGE_KEY = 'mb_elasticstage_minimized';
const MB_LOGO_URL =
    'https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg';

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

/** Detect a release page, e.g. /{artist}/releases/{release}. */
function isReleasePage(): boolean {
    return /^\/[^/]+\/releases\/[^/]+/.test(window.location.pathname);
}

/** Remove any previously inserted import UI to avoid duplicates on SPA navigation. */
function cleanup(): void {
    document.getElementById(MB_IMPORT_CONTAINER_ID)?.remove();
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
        #${MB_IMPORT_CONTAINER_ID} .mb-es-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            align-items: center;
        }
    `;
    document.head.appendChild(style);
}

function buildReleaseBlock(esRelease: ElasticStageRelease, mbrelease: Release, release_url: string): HTMLElement {
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

    const editNote = MBImport.makeEditNote(release_url, 'ElasticStage', esRelease.release_type.description);
    const parameters = MBImport.buildFormParameters(mbrelease, editNote);

    const buttons = document.createElement('div');
    buttons.className = 'mb-es-buttons';
    buttons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(mbrelease);
    block.appendChild(buttons);

    return block;
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
        <button type="button" class="mb-es-minimize" title="Minimise" aria-label="Minimise">&minus;</button>
    `;
    container.appendChild(header);

    const setMinimized = (minimized: boolean): void => {
        container.classList.toggle(MB_MINIMIZED_CLASS, minimized);
        container.title = minimized ? 'Expand MusicBrainz import' : '';
        saveMinimizedPreference(minimized);
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

    for (const esRelease of esReleases) {
        const mbrelease = buildReleaseInfo(release_url, esRelease);
        container.appendChild(buildReleaseBlock(esRelease, mbrelease, release_url));
    }

    if (isMinimizedPreferred()) {
        container.classList.add(MB_MINIMIZED_CLASS);
        container.title = 'Expand MusicBrainz import';
    }

    document.body.appendChild(container);
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
