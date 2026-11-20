import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle, MBSearchItStyle } from '~/lib/mbimportstyle';
import { MBLinks } from '~/lib/mblinks';
import { subscribeToSPANavigation } from '~/lib/shared/spa-navigation';
import { type ArtistCredit, type Disc, type Label, type Release, type Track, type URL } from '~/types/importers';
import { getBeatportReleaseData, installFetchInterceptor } from '~/userscripts/beatport_importer/utils/getBeatportReleaseData';

import { linkBeatportRelease } from './linking';
import type { BeatportReleaseData, BeatportTrackData } from './types';

const LOGGER = new Logger('beatport_importer', LogLevel.INFO);

// Capture Beatport's release fetches to avoid duplicate requests on SPA navigation
installFetchInterceptor(LOGGER);

const MB_IMPORT_SELECTOR = 'div.musicbrainz-import';
const MB_IMPORT_BARCODE_ELEMENT = 'mb-import-barcode';
const RELEASE_INFO_STYLE = 'display: flex; align-items: center; gap: 5px; flex-wrap: wrap;';
let mblinks: MBLinks;
let stopLinking: (() => void) | undefined;
let processingGeneration = 0;

/**
 * Remove existing MusicBrainz import UI to avoid duplicates
 */
const cleanup = () => {
    stopLinking?.();
    stopLinking = undefined;
    document.querySelectorAll(MB_IMPORT_SELECTOR).forEach(el => {
        el.remove();
    });
    document.getElementById(MB_IMPORT_BARCODE_ELEMENT)?.remove();
};

async function processReleasePage() {
    const generation = ++processingGeneration;
    cleanup();

    const isReleasePage = window.location.pathname.includes('/release/');
    if (!isReleasePage) {
        return;
    }

    const releaseData = await getBeatportReleaseData(LOGGER);
    if (generation !== processingGeneration) return;
    if (!releaseData) {
        return;
    }

    if (!releaseData.pageProps.release) {
        LOGGER.error('Could not find release data on the release page');
        return;
    }

    const releaseMatch = window.location.pathname.match(/release\/[^/]+\/(\d+)/);
    const currentReleaseId = releaseMatch?.[1];
    const loadedReleaseId = String(releaseData.pageProps.release.id);

    if (currentReleaseId !== loadedReleaseId) {
        return;
    }

    const release_url = `${window.location.origin}${window.location.pathname}`;

    try {
        const release = releaseData.pageProps.release;

        // Reversing is less reliable, but the API does not provide track numbers.
        const tracks_table = release.tracks.toReversed();

        const tracks_release = releaseData.pageProps.dehydratedState.queries.find(element => {
            const key = String(element.queryKey);
            const isTracksQuery = /tracks/.test(key);

            return isTracksQuery;
        });
        const tracks_data_array = tracks_release?.state?.data.results;
        if (!tracks_data_array) {
            LOGGER.error('Could not find tracks data');
            return;
        }
        const tracks_data = tracks_table
            .map((url: string) => {
                const match = url.match(/\/tracks\/(\d+)\/?$/);
                const trackId = Number(match?.[1]);
                const track = tracks_data_array.find(element => element.id === trackId && element.release.id === release.id);

                return track;
            })
            .filter((track): track is BeatportTrackData => track !== undefined);

        if (tracks_data.length !== release.track_count) {
            LOGGER.error('Could not find complete tracks data');

            return;
        }

        const isrcs = tracks_data.map(track => track.isrc || null);

        const mbrelease = retrieveReleaseInfo(release_url, release, tracks_data);

        insertMBButtons(mbrelease, release_url, isrcs);
        stopLinking = linkBeatportRelease(mblinks, mbrelease, release, tracks_data);
    } catch (error) {
        LOGGER.error('Error processing release page:', error);
    }
}

function retrieveReleaseInfo(release_url: string, release_data: BeatportReleaseData, tracks_data: BeatportTrackData[]): Release {
    const release_date = release_data.new_release_date.split('-');

    // Release information global to all Beatport releases
    const mbrelease = {
        artist_credit: [] as ArtistCredit[],
        title: release_data.name,
        year: parseInt(release_date[0] || '0'),
        month: parseInt(release_date[1] || '0'),
        day: parseInt(release_date[2] || '0'),
        format: 'Digital Media',
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [] as URL[],
        labels: [] as Label[],
        barcode: release_data.upc,
        discs: [] as Disc[],
    } satisfies Release;

    // URLs
    mbrelease.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download,
    });

    mbrelease.labels.push({
        name: release_data.label.name,
        catno: release_data.catalog_number,
    });

    // Tracks
    const mbtracks: Track[] = [];

    const seen_tracks: { [key: number]: boolean } = {}; // to shoot duplicates ...
    const release_artists: string[] = [];
    for (const track of tracks_data) {
        if (track.release.id != release_data.id) {
            continue;
        }
        if (seen_tracks[track.id]) {
            continue;
        }
        seen_tracks[track.id] = true;

        const artists: string[] = [];
        for (const artist of track.artists) {
            artists.push(artist.name);
            release_artists.push(artist.name);
        }

        let title = track.name;
        if (track.mix_name && track.mix_name !== 'Original Mix') {
            title += ` (${track.mix_name})`;
        }
        mbtracks.push({
            artist_credit: MBImport.makeArtistCredits(artists),
            title: title,
            duration: track.length_ms,
        });
    }

    const unique_artists = [...new Set(release_artists)];

    if (unique_artists.length > 4) {
        mbrelease.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        mbrelease.artist_credit = MBImport.makeArtistCredits(unique_artists);
    }

    mbrelease.discs.push({
        tracks: mbtracks,
        format: mbrelease.format,
    });

    return mbrelease;
}

// Insert MusicBrainz import UI into the release details under the controls section
function insertMBButtons(mbrelease: Release, release_url: string, isrcs: (string | null)[]): void {
    const edit_note = MBImport.makeEditNote(release_url, 'Beatport');
    const parameters = MBImport.buildFormParameters(mbrelease, edit_note);

    const releaseInfoElements = document.querySelectorAll('div[class^="ReleaseDetailCard_info"]');
    const lastReleaseInfo = releaseInfoElements[releaseInfoElements.length - 1];
    if (!lastReleaseInfo) {
        LOGGER.error('Could not find release info container');
        return;
    }

    const controlsElements = document.querySelectorAll('div[class^="ReleaseDetailCard_controls"]');
    const controls = controlsElements[0];
    if (!controls) {
        LOGGER.error('Could not find controls container');
        return;
    }

    // Insert barcode information
    const barcodeText = mbrelease.barcode || '[none]';

    const releaseInfoBarcode = document.createElement('div');
    releaseInfoBarcode.className = lastReleaseInfo.className;
    releaseInfoBarcode.id = MB_IMPORT_BARCODE_ELEMENT;
    releaseInfoBarcode.style.cssText = RELEASE_INFO_STYLE;
    releaseInfoBarcode.innerHTML = `
        <p>Barcode</p>
        <span>${barcodeText}</span>
    `;
    lastReleaseInfo.insertAdjacentElement('afterend', releaseInfoBarcode);

    // Insert MusicBrainz import UI

    const isrcForm = document.createElement('form');
    isrcForm.className = 'musicbrainz_import';
    isrcForm.innerHTML = `<button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC">
            <img src="https://magicisrc.kepstin.ca/favicon.svg" alt="MagicISRC icon" width="14" height="14" style="margin-right: 4px;" />
            Submit ISRCs
        </button>`;
    isrcForm.addEventListener('click', (event: Event) => {
        const query = isrcs.map((isrc, index) => (isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`)).join('&');
        event.preventDefault();
        window.open(`https://magicisrc.kepstin.ca?${query}`);
    });

    const importLinkHTML = MBImport.buildHarmonyButton({
        barcode: mbrelease.barcode,
        release_url,
        variant: 'full',
    });

    const releaseInfoButtons = document.createElement('div');
    releaseInfoButtons.className = `${lastReleaseInfo.className} musicbrainz-import`;
    releaseInfoButtons.style.cssText = RELEASE_INFO_STYLE;
    releaseInfoButtons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(mbrelease);
    releaseInfoButtons.appendChild(isrcForm);
    releaseInfoButtons.insertAdjacentHTML('beforeend', importLinkHTML);

    controls.insertAdjacentElement('afterend', releaseInfoButtons);
}

function init() {
    MBImportStyle();
    MBSearchItStyle();
    document.head.insertAdjacentHTML(
        'beforeend',
        `<style>
            .mb-beatport-link {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                vertical-align: middle;
                font-size: 11px;
                line-height: 16px;
            }
            .mb-beatport-link > a {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                line-height: 16px;
            }
            .mb-beatport-link img {
                display: block;
            }
            [class^="ReleaseDetailCard_artistList__"] {
                font-family: var(--font-aeonik);
                font-size: var(--bp-font-size-xl);
                line-height: var(--bp-line-height-xl);
            }
            [class^="ReleaseDetailCard_info"] > span:has(> .mb-beatport-link) {
                display: inline-flex;
                align-items: center;
                min-width: 0;
            }
            [class^="ReleaseDetailCard_info"] > span > .mb-beatport-link {
                flex-shrink: 0;
            }
            [class^="ReleaseDetailCard_info"] > span:has(> .mb-beatport-link) > a {
                min-width: 0;
            }
        </style>`,
    );
    mblinks = new MBLinks('BEATPORT_MBLINKS_CACHE', 1);

    // Process initial page load
    setTimeout(() => {
        void processReleasePage();
    }, 1000);
}

// Subscribe to SPA navigation events
subscribeToSPANavigation({
    onNavigate: () => processReleasePage(),
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
