import { type ArtistCredit, type Disc, type Label, type Release, type Track, type URL } from '~/types/importers';
import { MBImport } from '~/lib/mbimport';
import { Logger, LogLevel } from '~/lib/logger';
import { MBImportStyle } from '~/lib/mbimportstyle';
import { subscribeToSPANavigation } from '~/lib/shared/spa-navigation';
import { getBeatportReleaseData } from './utils/getBeatportReleaseData';
import type { BeatportReleaseData, BeatportTrackData } from './types';

const LOGGER = new Logger('beatport_importer', LogLevel.INFO);

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
window.$ = window.jQuery = jQuery.noConflict(true);

const MB_IMPORT_ELEMENT = 'div.musicbrainz-import';
const MB_IMPORT_BARCODE_ELEMENT = 'mb-import-barcode';

/**
 * Remove existing MusicBrainz import UI to avoid duplicates
 */
const cleanup = () => {
    $(MB_IMPORT_ELEMENT).remove();
    $(`#${MB_IMPORT_BARCODE_ELEMENT}`).remove();
};

async function processReleasePage() {
    const releaseData = await getBeatportReleaseData(LOGGER);

    const isReleasePage = window.location.pathname.includes('/release/');
    if (!releaseData || !isReleasePage) {
        return;
    }

    const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');

    try {
        const release = releaseData.pageProps.release;

        // Reversing is less reliable, but the API does not provide track numbers.
        const tracks_table = release.tracks.reverse();

        const tracks_release = $.grep(releaseData.pageProps.dehydratedState.queries, element =>
            element ? /tracks/g.test(element.queryKey) : false,
        )[0];
        const tracks_data_array = tracks_release?.state?.data.results;
        if (!tracks_data_array) {
            LOGGER.error('Could not find tracks data');
            return;
        }
        const tracks_data = $.map(tracks_table, (url: string) =>
            $.grep(tracks_data_array, element => (element ? element.url === url : false)),
        ) as BeatportTrackData[];
        const isrcs = tracks_data.map(track => track.isrc || null);

        const mbrelease = retrieveReleaseInfo(release_url, release, tracks_data);

        insertMBButtons(mbrelease, release_url, isrcs);
    } catch (error) {
        LOGGER.error('Error processing release page:', error);
    }
}

// Subscribe to SPA navigation events
subscribeToSPANavigation({
    beforeNavigate: cleanup,
    onNavigate: processReleasePage,
});

$(document).ready(() => {
    MBImportStyle();

    // Process initial page load
    setTimeout(() => {
        void processReleasePage();
    }, 1000);
});

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
    $.each(tracks_data, (index: number, track) => {
        if (track.release.id != release_data.id) {
            return;
        }
        if (seen_tracks[track.id]) {
            return;
        }
        seen_tracks[track.id] = true;

        const artists: string[] = [];
        $.each(track.artists, (index2: number, artist: { name: string }) => {
            artists.push(artist.name);
            release_artists.push(artist.name);
        });

        let title = track.name;
        if (track.mix_name && track.mix_name !== 'Original Mix') {
            title += ` (${track.mix_name})`;
        }
        mbtracks.push({
            artist_credit: MBImport.makeArtistCredits(artists),
            title: title,
            duration: track.length_ms,
        });
    });

    const unique_artists: string[] = [];
    $.each(release_artists, (index: number, el: string) => {
        if ($.inArray(el, unique_artists) === -1) {
            unique_artists.push(el);
        }
    });

    if (unique_artists.length > 4) {
        mbrelease.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        mbrelease.artist_credit = MBImport.makeArtistCredits(unique_artists);
    }

    mbrelease.discs.push({
        tracks: mbtracks,
        format: mbrelease.format,
    });

    LOGGER.info('Parsed release: ', mbrelease);
    return mbrelease;
}

// Insert button into page under label information
function insertMBButtons(mbrelease: Release, release_url: string, isrcs: (string | null)[]): void {
    const edit_note = MBImport.makeEditNote(release_url, 'Beatport');
    const parameters = MBImport.buildFormParameters(mbrelease, edit_note);

    const mbUI = $(
        `<div class="interior-release-chart-content-item musicbrainz-import">${MBImport.buildFormHTML(
            parameters,
        )}${MBImport.buildSearchButton(mbrelease)}</div>`,
    );

    $(
        '<form class="musicbrainz_import"><button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC"><span>Submit ISRCs</span></button></form>',
    )
        .on('click', (event: Event) => {
            const query = isrcs.map((isrc, index) => (isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`)).join('&');
            event.preventDefault();
            window.open(`https://magicisrc.kepstin.ca?${query}`);
        })
        .appendTo(mbUI);

    $('div[title="Collection controls"]').append(mbUI);
    $(MB_IMPORT_ELEMENT).css({ display: 'flex', gap: '5px', flexWrap: 'wrap' });
    $('form.musicbrainz_import button').css({ width: '120px' });

    const lastReleaseInfo = $('div[class^="ReleaseDetailCard-style__Info"]').last();
    const spanHTML = mbrelease.barcode
        ? `<a href="https://atisket.pulsewidth.org.uk/?upc=${encodeURIComponent(mbrelease.barcode)}">
            ${mbrelease.barcode}
        </a>`
        : '[none]';
    const releaseInfoBarcode = $(
        `<div class="${lastReleaseInfo.attr('class')}" id="${MB_IMPORT_BARCODE_ELEMENT}">
            <p>Barcode</p>
            <span>${spanHTML}</span>
        </div>`,
    );
    lastReleaseInfo.after(releaseInfoBarcode);
}
