// ==UserScript==
// @name        Import Boomkat releases to Musicbrainz
// @description Add a button on Boomkat release pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version     2024.09.10.1
// @license     X11
// @downloadURL https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/boomkat_importer.user.js
// @updateURL   https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/boomkat_importer.user.js
// @namespace   https://github.com/murdos/musicbrainz-userscripts
// @include     https://boomkat.com/products/*
// @require     lib/mbimport.js
// @require     lib/logger.js
// @require     lib/mbimportstyle.js
// ==/UserScript==

async function onLoad() {
    MBImportStyle();

    const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    await fetchTracksAndInsertLink(release_url);

    // Update the release info when a different tab/format is
    // selected. We pass the event target down to fetchTracksAndInsertLink
    // so we can easily fetch the format type from the clicked link.
    // Without this, we'd need to resort to delays which are... inconsistent
    // on Boomkat.
    document.querySelectorAll('ul.tabs li.tab-title a').forEach(function (elem) {
        elem.addEventListener('click', async function (event) {
            await fetchTracksAndInsertLink(release_url, event.target);
        });
    });
}

function getFormat(format) {
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

async function fetchTracksAndInsertLink(release_url, formatElement) {
    const release = await retrieveReleaseInfo(release_url, formatElement);
    insertLink(release, release_url);
}

async function retrieveReleaseInfo(release_url, formatElement) {
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
    let format;
    if (formatElement != null) {
        format = formatElement.textContent.trim();
    } else {
        format = document.querySelector('ul.tabs .tab-title.active a').textContent.trim();
    }
    release.format = getFormat(format);
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
    const releaseID = document.querySelector('a.play-all').dataset.audioPlayerRelease;
    const tracklistURL = `https://boomkat.com/tracklist/${releaseID}`;
    const tracks = [];
    const response = await fetch(tracklistURL);
    const body = await response.text();
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = body;
    doc.querySelectorAll('div.table-row.track.mp3.clearfix a').forEach(function (link) {
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

// Insert button into page
function insertLink(release, release_url) {
    // Remove any existing buttons
    document.querySelectorAll('.musicbrainz-import').forEach(function (elem) {
        elem.remove();
    });

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
