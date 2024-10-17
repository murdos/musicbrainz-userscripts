// ==UserScript==
// @name           Import Beatport releases to MusicBrainz
// @author         VxJasonxV
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2024.10.17.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @include        http://www.beatport.com/release/*
// @include        https://www.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(() => {
    MBImportStyle();

    const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');

    const data = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
    const release_data = data.props.pageProps.release;

    // Reversing is less reliable, but the API does not provide track numbers.
    const tracks_table = release_data.tracks.reverse();

    const tracks_release = $.grep(data.props.pageProps.dehydratedState.queries, element => /tracks/g.test(element.queryKey))[0];
    const tracks_data = $.map(tracks_table, url => $.grep(tracks_release.state.data.results, element => element.url === url));
    const isrcs = tracks_data.map(track => track.isrc);

    const mbrelease = retrieveReleaseInfo(release_url, release_data, tracks_data);

    setTimeout(() => insertLink(mbrelease, release_url, isrcs), 1000);
});

function retrieveReleaseInfo(release_url, release_data, tracks_data) {
    const release_date = release_data.new_release_date.split('-');

    // Release information global to all Beatport releases
    const mbrelease = {
        artist_credit: [],
        title: release_data.name,
        year: release_date[0],
        month: release_date[1],
        day: release_date[2],
        format: 'Digital Media',
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        barcode: release_data.upc,
        discs: [],
    };

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
    const mbtracks = [];

    const seen_tracks = {}; // to shoot duplicates ...
    const release_artists = [];
    $.each(tracks_data, (index, track) => {
        if (track.release.id != release_data.id) {
            return;
        }
        if (seen_tracks[track.id]) {
            return;
        }
        seen_tracks[track.id] = true;

        let artists = [];
        $.each(track.artists, (index2, artist) => {
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

    const unique_artists = [];
    $.each(release_artists, (index, el) => {
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
function insertLink(mbrelease, release_url, isrcs) {
    const edit_note = MBImport.makeEditNote(release_url, 'Beatport');
    const parameters = MBImport.buildFormParameters(mbrelease, edit_note);

    const mbUI = $(
        `<div class="interior-release-chart-content-item musicbrainz-import">${MBImport.buildFormHTML(
            parameters
        )}${MBImport.buildSearchButton(mbrelease)}</div>`
    ).hide();

    $(
        '<form class="musicbrainz_import"><button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC"><span>Submit ISRCs</span></button></form>'
    )
        .on('click', event => {
            const query = isrcs.map((isrc, index) => (isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`)).join('&');
            event.preventDefault();
            window.open(`https://magicisrc.kepstin.ca?${query}`);
        })
        .appendTo(mbUI);

    $('div[title="Collection controls"]').append(mbUI);
    $('form.musicbrainz_import').css({ display: 'inline-block', 'margin-left': '5px' });
    $('form.musicbrainz_import button').css({ width: '120px' });
    $('form.musicbrainz_import button img').css({ display: 'inline-block' });

    const lastReleaseInfo = $('div[class^="ReleaseDetailCard-style__Info"]').last();
    const spanHTML = mbrelease.barcode
        ? `<a href="https://atisket.pulsewidth.org.uk/?upc=${encodeURIComponent(mbrelease.barcode)}">
            ${mbrelease.barcode}
        </a>`
        : '[none]';
    const releaseInfoBarcode = $(
        `<div class="${lastReleaseInfo.attr('class')}">
            <p>Barcode</p>
            <span>${spanHTML}</span>
        </div>`
    ).hide();
    lastReleaseInfo.after(releaseInfoBarcode);

    mbUI.slideDown();
    releaseInfoBarcode.slideDown();
}
