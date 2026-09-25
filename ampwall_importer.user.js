// ==UserScript==
// @name         Import Ampwall releases to Musicbrainz
// @description  Add a button on Ampwall release pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.6.20
// @license      X11
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/ampwall_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/ampwall_importer.user.js
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @match        https://ampwall.com/a/*/album/*
// @require      lib/mbimport.js
// @require      lib/logger.js
// @require      lib/mbimportstyle.js
// ==/UserScript==

function onLoad() {
    MBImportStyle();
    const release = retrieveReleaseInfo();
    insertLink(release, window.location);
}

function getArtistCredit(json) {
    return MBImport.makeArtistCredits([json['byArtist']['name']]);
}

function getFormat() {
    // We only support digital downloads right now.
    return 'Digital Media';
}

function getPackaging() {
    // We only support digital downloads right now.
    return 'None';
}

function getReleaseType() {
    // It appears that Ampwall treats all releases as albums so just
    // return nothing for now and let the user decide.
    return '';
}

function getTitle(json) {
    return json['albumRelease'][0]['name'];
}

function getLabels() {
    // TODO this will probably explode on releases with multiple labels.
    const labels = document.querySelector('div[data-testid=labels-links] a');
    if (labels === null) {
        return [];
    }
    return [
        {
            name: labels.textContent,
            catno: '',
        },
    ];
}

function getDiscs(json) {
    let tracks = [];
    json['track']['itemListElement'].forEach(function (track) {
        tracks.push({
            artist_credit: MBImport.makeArtistCredits([json['byArtist']['name']]),
            title: track['name'],
            duration: parseDuration(track['duration']),
        });
    });
    return [
        {
            tracks: tracks,
            format: getFormat(json),
        },
    ];
}

function getURLs(json) {
    return [
        {
            url: json['url'],
            link_type: MBImport.URL_TYPES.purchase_for_download,
        },
    ];
}

function parseDuration(s) {
    // Durations are returned in the format "PT0H0M7S". Strip out the
    // leading/trailing characters and convert the rest to colons.
    return s.replace(/(^PT)|(S$)/g, '').replace(/[HM]/g, ':');
}

function retrieveReleaseInfo() {
    const json = JSON.parse(document.querySelector("script[type='application/ld+json']").textContent);
    const releaseDate = new Date(json['datePublished']);
    const release = {
        artist_credit: getArtistCredit(json),
        title: getTitle(json),
        year: releaseDate.getUTCFullYear(),
        month: releaseDate.getUTCMonth() + 1,
        day: releaseDate.getUTCDate(),
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: getReleaseType(json),
        urls: getURLs(json),
        labels: getLabels(),
        discs: getDiscs(json),
        packaging: getPackaging(),
        format: getFormat(),
    };
    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page
function insertLink(release) {
    const edit_note = MBImport.makeEditNote(window.location, 'Ampwall');
    const div = document.createElement('div');

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

    // Set a slight delay to stop breaking React/Next.
    window.setTimeout(function () {
        const container = document.querySelector('div.d_flex.ai_center.flex-wrap_wrap.gap_space1');
        container.appendChild(formButton);
        container.appendChild(searchButton);
    }, 2000);
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
