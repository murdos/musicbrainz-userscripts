// ==UserScript==
// @name         Import Subvert.fm releases to Musicbrainz
// @description  Add a button on Subvert.fm release pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.6.20
// @license      X11
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/subvert_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/subvert_importer.user.js
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @match        https://subvert.fm/*/*
// @match        https://www.subvert.fm/*/*
// @require      lib/mbimport.js
// @require      lib/logger.js
// @require      lib/mbimportstyle.js
// ==/UserScript==

function onLoad() {
    MBImportStyle();
    const release = retrieveReleaseInfo();
    insertLink(release, window.location);
}

function getArtistCredit(data) {
    let artists = [];
    data['release']['artists'].forEach(function (artist) {
        artists.push(artist['name']);
    });
    return MBImport.makeArtistCredits(artists);
}

function getFormat() {
    // We only support digital downloads right now.
    return 'Digital Media';
}

function getPackaging() {
    // We only support digital downloads right now.
    return 'None';
}

function getReleaseType(data) {
    return data['release']['releaseType'];
}

function getTitle(data) {
    return data['release']['name'];
}

function getLabels(data) {
    let labels = [];
    data['release']['labelsOnReleases'].forEach(function (label) {
        labels.push({
            label: label['label']['name'],
            catno: label['catalogNumber'],
        });
    });
    return labels;
}

function getDiscs(data) {
    let tracks = [];
    data['release']['tracks'].forEach(function (track) {
        let artists = [];
        track['track']['artists'].forEach(function (artist) {
            artists.push(artist['name']);
        });
        tracks.push({
            artist_credit: MBImport.makeArtistCredits(artists),
            title: track['track']['name'],
            duration: track['track']['duration'] * 1000,
        });
    });
    return [
        {
            tracks: tracks,
            format: getFormat(data),
        },
    ];
}

function getURLs(data) {
    let urls = [];
    if (data['release']['isDownloadAllowed']) {
        urls.push({
            url: window.location,
            link_type: MBImport.URL_TYPES.purchase_for_download,
        });
    }
    if (data['release']['isStreamingAllowed']) {
        urls.push({
            url: window.location,
            link_type: MBImport.URL_TYPES.stream_for_free,
        });
    }
    if (data['release']['priceCents'] > 0) {
        urls.push({
            url: window.location,
            link_type: MBImport.URL_TYPES.download_for_free,
        });
    }
    return urls;
}

function retrieveReleaseInfo() {
    let json = JSON.parse(document.querySelector('script#__NEXT_DATA__').textContent);

    // Skip non-release pages
    if (json['page'] !== '/[artistSlug]/[releaseSlug]') {
        return;
    }

    const data = json['props']['pageProps'];
    const releaseDate = new Date(data['release']['releaseDate']);
    const release = {
        artist_credit: getArtistCredit(data),
        title: getTitle(data),
        year: releaseDate.getUTCFullYear(),
        month: releaseDate.getUTCMonth() + 1,
        day: releaseDate.getUTCDate(),
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: getReleaseType(data),
        urls: getURLs(data),
        labels: getLabels(data),
        discs: getDiscs(data),
        packaging: getPackaging(data),
        format: getFormat(data),
    };
    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page
function insertLink(release, url) {
    const edit_note = MBImport.makeEditNote(url, 'Subvert');
    const container = document.querySelector('div.releaseRailMetaWrapper.leftRail.hideMobile');
    const sourceNode = container.children[container.children.length - 3];
    const importContainer = sourceNode.cloneNode(true);
    importContainer.children[0].innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, edit_note));
    importContainer.children[1].innerHTML = MBImport.buildSearchButton(release);
    sourceNode.after(importContainer);
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
