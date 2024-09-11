// ==UserScript==
// @name        Import Boomkat releases to Musicbrainz
// @description Add a button on Boomkat release pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version     2024.09.10.1
// @license     X11
// @namespace   https://github.com/murdos/musicbrainz-userscripts
// @include     https://boomkat.com/products/*
// @require     lib/mbimport.js
// @require     lib/logger.js
// @require     lib/mbimportstyle.js
// ==/UserScript==

function onLoad() {
    MBImportStyle();

    const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url, true);

    // Update the release info when a different tab/format is
    // selected. We need a timeout here due to a slight delay between
    // clicking the tab and the tab's classes (and the tracklist)
    // being updated.
    document.querySelectorAll('ul.tabs li.tab-title a').forEach(function (elem) {
        elem.addEventListener('click', function () {
            setTimeout(function () {
                release = retrieveReleaseInfo();
                updateLink(release, release, false);
            }, 500);
        });
    });
}

function getFormat() {
    const format = document.querySelector('ul.tabs .tab-title.active a').textContent.trim();

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
    const releaseDateStr = document.querySelector('span.release-date-placeholder').textContent.replace('Release date: ', '');
    const releaseDate = new Date(releaseDateStr);
    const artist = document.querySelector('h1.detail--artists').textContent.trim();

    const release = {
        artist_credit: MBImport.makeArtistCredits([artist]),
        title: document.querySelector('h2.detail_album').textContent.trim(),
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
        name: document.querySelector('span.label-placeholder a').textContent,
        catno: document.querySelector('span.catalogue-number-placeholder').textContent.replace(/Cat No:/, ''),
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
    const tracks = [];
    document.querySelectorAll('div.table-row.track.mp3.clearfix a').forEach(function (link) {
        tracks.push({
            artist_credit: MBImport.makeArtistCredits([link.dataset.artist]),
            title: link.dataset.name,
            duration: link.dataset.duration,
        });
    });
    release.discs.push({
        tracks: tracks,
        format: release.format,
    });
    LOGGER.info('Parsed release: ', release);
    return release;
}

function updateLink(release, release_url) {
    document.querySelectorAll('.musicbrainz-import').forEach(function (elem) {
        elem.remove();
    });
    insertLink(release, release_url, false);
}

// Insert button into page
function insertLink(release, release_url) {
    const edit_note = MBImport.makeEditNote(release_url, 'Boomkat');

    const div = document.createElement('div');
    div.className = 'product-note';

    const formButton = document.createElement('span');
    formButton.className = 'tab-title musicbrainz-import';
    formButton.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, edit_note));
    formButton.style.display = 'inline-block';

    const searchButton = document.createElement('span');
    searchButton.className = 'tab-title musicbrainz-import';
    searchButton.innerHTML = MBImport.buildSearchButton(release);
    searchButton.style.display = 'inline-block';

    div.appendChild(formButton);
    div.appendChild(searchButton);

    const albumHeader = document.querySelector('h2.detail_album');
    albumHeader.after(div);
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
