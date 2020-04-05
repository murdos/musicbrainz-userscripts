// ==UserScript==
// @name           Import Beatport releases to MusicBrainz
// @author         VxJasonxV
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2019.12.21.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @include        http://www.beatport.com/release/*
// @include        https://www.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    MBImportStyle();

    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
});

function retrieveReleaseInfo(release_url) {
    let releaseDate = ProductDetail.date.published.split('-');

    // Release information global to all Beatport releases
    let release = {
        artist_credit: [],
        title: ProductDetail.name,
        year: releaseDate[0],
        month: releaseDate[1],
        day: releaseDate[2],
        format: 'Digital Media',
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        discs: [],
    };

    // URLs
    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download,
    });

    release.labels.push({
        name: ProductDetail.label.name,
        catno: ProductDetail.catalog,
    });

    // Reload Playables if empty
    if (!Object.prototype.hasOwnProperty.call(unsafeWindow.Playables, 'tracks')) {
        eval($('#data-objects').text());
        unsafeWindow.Playables = window.Playables;
    }

    // Tracks
    let tracks = [];
    let the_tracks = unsafeWindow.Playables.tracks;
    let seen_tracks = {}; // to shoot duplicates ...
    let release_artists = [];
    $.each(the_tracks, function (idx, track) {
        if (track.release.id !== ProductDetail.id) {
            return;
        }
        if (seen_tracks[track.id]) {
            return;
        }
        seen_tracks[track.id] = true;

        let artists = [];
        $.each(track.artists, function (idx2, artist) {
            artists.push(artist.name);
            release_artists.push(artist.name);
        });

        let title = track.name;
        if (track.mix && track.mix !== 'Original Mix') {
            title += ` (${track.mix})`;
        }
        tracks.push({
            artist_credit: MBImport.makeArtistCredits(artists),
            title: title,
            duration: track.duration.minutes,
        });
    });

    let unique_artists = [];
    $.each(release_artists, function (i, el) {
        if ($.inArray(el, unique_artists) === -1) {
            unique_artists.push(el);
        }
    });

    if (unique_artists.length > 4) {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        release.artist_credit = MBImport.makeArtistCredits(unique_artists);
    }
    release.discs.push({
        tracks: tracks,
        format: release.format,
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'Beatport');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(
        `<li class="interior-release-chart-content-item musicbrainz-import">${MBImport.buildFormHTML(
            parameters
        )}${MBImport.buildSearchButton(release)}</li>`
    ).hide();

    $('.interior-release-chart-content-list').append(mbUI);
    $('form.musicbrainz_import').css({ display: 'inline-block', 'margin-left': '5px' });
    $('form.musicbrainz_import button').css({ width: '120px' });
    mbUI.slideDown();
}
