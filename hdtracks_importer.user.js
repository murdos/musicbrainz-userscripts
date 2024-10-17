// ==UserScript==
// @name           Import HDtracks releases into MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from hdtracks.com into MusicBrainz. Also allows to submit their ISRCs to MusicBrainz releases.
// @version        2024.10.17.1
// @author         kellnerd
// @license        MIT
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/hdtracks_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/hdtracks_importer.user.js
// @match          *://www.hdtracks.com/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          GM_xmlhttpRequest
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

$(document).ready(function () {
    MBImportStyle();
    window.addEventListener('hashchange', parsePage); // HDtracks is a single page app (SPA)
});

async function parsePage() {
    const releaseMatch = window.location.hash.match(/#\/album\/(.+)/);
    if (!releaseMatch) return; // SPA currently shows a different type of page
    const releaseId = releaseMatch[1];

    // our buttons might already be there since the SPA caches the previous page for "also available in"
    if (document.getElementById(`mb-import-ui-${releaseId}`)) return;

    const url = window.location.href;
    const apiUrl = `https://hdtracks.azurewebsites.net/api/v1/album/${releaseId}`;
    const response = await fetch(apiUrl);
    const release = parseHDtracksRelease(await response.json(), url);
    insertButtons(release, url);
}

function parseHDtracksRelease(data, releaseUrl) {
    const releaseDate = new Date(data.release);
    const audioQuality = data.quality.replace(' · ', '/');
    const release = {
        id: data.productId, // not used as release editor seed
        title: data.name,
        artist_credit: data.artists.map(name => ({ artist_name: name })),
        barcode: data.upc,
        labels: [{ name: data.label }],
        year: releaseDate.getUTCFullYear(),
        month: releaseDate.getUTCMonth() + 1,
        day: releaseDate.getUTCDate(),
        comment: audioQuality != '44.1kHz/16bit' ? audioQuality : '',
        annotation: [`${audioQuality} available on HDtracks`, data.cLine, data.pLine].join('\n'),
        // `data.credits` is currently not included as it is unclear for which tracks the individual credits apply
        discs: [],
        urls: [],
        packaging: 'None',
        status: 'official',
        script: 'Latn',
    };
    release.discs.push({
        // disc numbers of the tracks are not available for releases with multiple discs!
        format: 'Digital Media',
        tracks: data.tracks.map(track => ({
            number: track.index,
            title: track.name,
            artist_credit: [{ artist_name: track.mainArtist }], // TODO: try to split strings into multiple artists?
            duration: track.duration * 1000,
            isrc: track.isrc, // not used as release editor seed
        })),
    });
    release.urls.push({
        link_type: MBImport.URL_TYPES.purchase_for_download,
        url: releaseUrl,
    });
    return release;
}

function insertButtons(release, releaseUrl) {
    const editNote = MBImport.makeEditNote(releaseUrl, 'HDtracks');
    const formParameters = MBImport.buildFormParameters(release, editNote);
    const importerUI = $(`<div id="mb-import-ui-${release.id}" class="musicbrainz_import" style="line-height: 2.5em">
        ${MBImport.buildFormHTML(formParameters)}
        ${MBImport.buildSearchButton(release)}
        </div>`).hide();

    $('<button type="button" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC">Submit ISRCs</button>')
        .on('click', () => {
            const allTracks = release.discs.map(disc => disc.tracks).flat();
            const query = allTracks.map(track => `isrc${track.number}=${track.isrc}`).join('&');
            window.open(`https://magicisrc.kepstin.ca?${query}`);
        })
        .appendTo(importerUI);

    $('div.page-current div.album-buttons-group').prepend(importerUI);
    importerUI.slideDown();
}
