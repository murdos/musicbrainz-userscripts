// ==UserScript==
// @name           Import Deezer releases into MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from deezer.com into MusicBrainz
// @version        2019.1.30.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/deezer_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/deezer_importer.user.js
// @include        http*://www.deezer.com/*/album/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          GM_xmlhttpRequest
// @grant          GM.xmlHttpRequest
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

$(document).ready(function() {
    let gmXHR;

    if (typeof GM_xmlhttpRequest != 'undefined') {
        gmXHR = GM_xmlhttpRequest;
    } else if (GM.xmlHttpRequest != 'undefined') {
        gmXHR = GM.xmlHttpRequest;
    } else {
        LOGGER.error('Userscript requires GM_xmlHttpRequest or GM.xmlHttpRequest');
        return;
    }

    // allow 1 second for Deezer SPA to initialize
    window.setTimeout(function() {
        MBImportStyle();
        let releaseUrl = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
        let releaseId = releaseUrl.replace(/^https?:\/\/www\.deezer\.com\/[^/]+\/album\//i, '');
        let deezerApiUrl = `https://api.deezer.com/album/${releaseId}`;

        gmXHR({
            method: 'GET',
            url: deezerApiUrl,
            onload: function(resp) {
                try {
                    let release = parseDeezerRelease(releaseUrl, JSON.parse(resp.responseText));
                    insertLink(release, releaseUrl);
                } catch (e) {
                    LOGGER.error('Failed to parse release: ', e);
                }
            },
            onerror: function(resp) {
                LOGGER.error('AJAX status:', resp.status);
                LOGGER.error('AJAX response:', resp.responseText);
            }
        });
    }, 1000);
});

function parseDeezerRelease(releaseUrl, data) {
    let releaseDate = data.release_date.split('-');

    let release = {
        artist_credit: [],
        title: data.title,
        year: releaseDate[0],
        month: releaseDate[1],
        day: releaseDate[2],
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        discs: []
    };

    $.each(data.contributors, function(index, artist) {
        if (artist.role != 'Main') return true;

        let ac = {
            artist_name: artist.name,
            joinphrase: index == data.contributors.length - 1 ? '' : ', '
        };

        if (artist.name == 'Various Artists') {
            ac = MBImport.specialArtist('various_artists', ac);
        }

        release.artist_credit.push(ac);
    });

    let disc = {
        format: 'Digital Media',
        title: '',
        tracks: []
    };

    $.each(data.tracks.data, function(index, track) {
        let t = {
            number: index + 1,
            title: track.title_short,
            duration: track.duration * 1000,
            artist_credit: []
        };

        // ignore pointless "(Original Mix)" in title version
        if (track.title_version && !track.title_version.match(/^\s*\(Original Mix\)\s*$/i)) {
            t.title += ` ${track.title_version}`;
        }

        t.artist_credit.push({ artist_name: track.artist.name });

        disc.tracks.push(t);
    });

    release.discs.push(disc);

    release.urls.push({
        link_type: MBImport.URL_TYPES.stream_for_free,
        url: releaseUrl
    });
    release.labels.push({ name: data.label });
    release.type = data.record_type;
    release.barcode = data.upc;

    return release;
}

function insertLink(release, release_url) {
    let editNote = MBImport.makeEditNote(release_url, 'Deezer');
    let parameters = MBImport.buildFormParameters(release, editNote);

    let mbUI = $(
        `<div class="toolbar-item">
            ${MBImport.buildFormHTML(parameters)}
            </div><div class="toolbar-item">
            ${MBImport.buildSearchButton(release)}
            </div>`
    ).hide();

    $('div.toolbar-wrapper-full').append(mbUI);
    mbUI.show();
}
