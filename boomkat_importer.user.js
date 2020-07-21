// ==UserScript==
// @name        Import Boomkat releases to Musicbrainz
// @description Add a button on Boomkat release pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version     2020.07.21.1
// @license     X11
// @namespace   https://github.com/murdos/musicbrainz-userscripts
// @include     https://boomkat.com/products/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require     lib/mbimport.js
// @require     lib/logger.js
// @require     lib/mbimportstyle.js

// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    MBImportStyle();

    const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url, true);

    // Update the release info when a different tab/format is
    // selected. We need a timeout here due to a slight delay between
    // clicking the tab and the tab's classes (and the tracklist)
    // being updated.
    $('ul.tabs li.tab-title a').click(function () {
        setTimeout(function () {
            release = retrieveReleaseInfo(release_url);
            updateLink(release, release_url, false);
        }, 150);
    });
});

function getFormat() {
    const format = $('ul.tabs .tab-title.active a').text().trim();

    if (format.match(/MP3|WAV|FLAC/i)) {
        return 'Digital Media';
    }

    if (format.match(/CD/i)) {
        return 'CD';
    }

    if (format.match(/LP|12"/i)) {
        return 'Vinyl';
    }

    if (format.match(/CASSETTE/i)) {
        return 'Cassette';
    }

    return '';
}

function getLinkType(media) {
    if (media == 'Digital Media') {
        return MBImport.URL_TYPES.purchase_for_download;
    }
    return MBImport.URL_TYPES.purchase_for_mail_order;
}

function retrieveReleaseInfo(release_url) {
    const releaseDateStr = $('span.release-date-placeholder').first().text().replace('Release date: ', '');
    const releaseDate = new Date(releaseDateStr);
    const artist = $('h1.detail--artists').text().trim();

    const release = {
        artist_credit: MBImport.makeArtistCredits([artist]),
        title: $('h2.detail_album').text().trim(),
        year: releaseDate.getUTCFullYear(),
        month: releaseDate.getUTCMonth() + 1,
        day: releaseDate.getUTCDate(),
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        discs: [],
    };

    // Labels
    release.labels.push({
        name: $('span.label-placeholder a').first().text(),
        catno: $('span.catalogue-number-placeholder')
            .text()
            .replace(/Cat No:/, ''),
    });

    // Format/packaging
    release.format = getFormat();
    release.packaging = release.format == 'Digital Media' ? 'None' : '';

    // URLs
    release.urls.push({
        url: release_url,
        link_type: getLinkType(release.format),
    });

    // Tracks
    // Boomkat loads the tracklist dynamically. Using setTimeout()
    // here is not consistent for reasons I have not yet figured out.
    // For now, just fetch the tracks the same way Boomkat does.
    const releaseID = $('a.play-all').first().data('audio-player-release');
    const tracklistURL = `https://boomkat.com/tracklist/${releaseID}`;
    const tracks = [];
    $.ajax({
        url: tracklistURL,
        async: false,
        success: function (data) {
            $($.parseHTML(data))
                .find('div.table-row.track.mp3.clearfix a')
                .each(function (index, link) {
                    tracks.push({
                        artist_credit: MBImport.makeArtistCredits([$(link).data('artist')]),
                        title: $(link).data('name'),
                        duration: $(link).siblings('.time').first().text(),
                    });
                });

            release.discs.push({
                tracks: tracks,
                format: release.format,
            });
        },
    });
    LOGGER.info('Parsed release: ', release);
    return release;
}

function updateLink(release, release_url) {
    $('.musicbrainz-import').remove();
    $('.musicbrainz_import_add').remove();
    insertLink(release, release_url, false);
}

// Insert button into page under label information
function insertLink(release, release_url, animate) {
    const edit_note = MBImport.makeEditNote(release_url, 'Boomkat');
    const parameters = MBImport.buildFormParameters(release, edit_note);

    const mbUI = $(
        `<li class="tab-title musicbrainz-import">${MBImport.buildFormHTML(parameters)}</li>
         <li class="tab-title musicbrainz-import">${MBImport.buildSearchButton(release)}</li>`
    );

    if (animate) {
        mbUI.hide();
    }

    $('ul.tabs.product-page-tabs').append(mbUI);

    if (animate) {
        mbUI.slideDown();
    }
}
