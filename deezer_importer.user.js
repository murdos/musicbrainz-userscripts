// ==UserScript==
// @name           Import Deezer releases into MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from deezer.com into MusicBrainz. Also allows to submit their ISRCs to MusicBrainz releases.
// @version        2024.9.9.2
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

$(document).ready(function () {
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
    window.setTimeout(function () {
        MBImportStyle();
        let releaseUrl = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
        let releaseId = releaseUrl.replace(/^https?:\/\/www\.deezer\.com\/[^/]+\/album\//i, '');
        let deezerApiUrl = `https://api.deezer.com/album/${releaseId}?limit=1`; // limit track result to 1, we will request tracks in a separate API call (that returns more complete data)
        let deezerTrackUrl = `https://api.deezer.com/album/${releaseId}/tracks?limit=100`;

        gmXHR({
            method: 'GET',
            url: deezerApiUrl,
            onload: function (resp) {
                try {
                    let releaseRaw = JSON.parse(resp.responseText);
                    releaseRaw.tracks.data = [];
                    // request album tracks from separate endpoint (includes track ISRCs and disk numbers)
                    let loadTracks = function (next) {
                        gmXHR({
                            method: 'GET',
                            url: next,
                            onload: function (res) {
                                let tracksRaw = JSON.parse(res.responseText);
                                releaseRaw.tracks.data.push(...tracksRaw.data);
                                if (tracksRaw.next) loadTracks(tracksRaw.next);
                                else {
                                    let [release, isrcs] = parseDeezerRelease(releaseUrl, releaseRaw);
                                    insertLink(release, releaseUrl, isrcs);
                                }
                            },
                            onerror: function (res) {
                                LOGGER.error('AJAX status:', res.status);
                                LOGGER.error('AJAX response:', res.responseText);
                            },
                        });
                    };
                    loadTracks(deezerTrackUrl);
                } catch (e) {
                    LOGGER.error('Failed to parse release: ', e);
                }
            },
            onerror: function (resp) {
                LOGGER.error('AJAX status:', resp.status);
                LOGGER.error('AJAX response:', resp.responseText);
            },
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
        discs: [],
    };

    let isrcs = [];

    $.each(data.contributors, function (index, artist) {
        if (artist.role != 'Main') return true;

        let ac = {
            artist_name: artist.name,
            joinphrase: index == data.contributors.length - 1 ? '' : ', ',
        };

        if (artist.name == 'Various Artists') {
            ac = MBImport.specialArtist('various_artists', ac);
        }

        release.artist_credit.push(ac);
    });

    for (const track of data.tracks.data) {
        let t = {
            number: track.track_position,
            title: track.title_short,
            duration: track.duration * 1000,
            artist_credit: [],
        };

        if (track.isrc) isrcs.push(track.isrc);
        else isrcs.push(null);

        // ignore pointless "(Original Mix)" in title version
        if (track.title_version && !track.title_version.match(/^\s*\(Original Mix\)\s*$/i)) {
            t.title += ` ${track.title_version}`;
        }

        t.artist_credit.push({ artist_name: track.artist.name });

        // add new disk object(s) if not added yet
        while (release.discs.length < track.disk_number)
            release.discs.push({
                format: 'Digital Media',
                title: '',
                tracks: [],
            });

        release.discs[track.disk_number - 1].tracks.push(t);
    }

    release.urls.push({
        link_type: MBImport.URL_TYPES.stream_for_free,
        url: releaseUrl,
    });
    release.labels.push({ name: data.label });
    release.type = data.record_type;
    release.barcode = data.upc;

    return [release, isrcs];
}

function waitForEl(selector, callback) {
    if (jQuery(selector).length) {
        callback();
    } else {
        setTimeout(function () {
            waitForEl(selector, callback);
        }, 100);
    }
}

function insertLink(release, release_url, isrcs) {
    let editNote = MBImport.makeEditNote(release_url, 'Deezer');
    let parameters = MBImport.buildFormParameters(release, editNote);

    let mbUI = $(
        `<div class="toolbar-item">
            ${MBImport.buildFormHTML(parameters)}
            </div><div class="toolbar-item">
            ${MBImport.buildSearchButton(release)}
            </div><div class="toolbar-item"></div>`
    ).hide();
    $(
        `<form class="musicbrainz_import"><button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC"><span>Submit ISRCs</span></button></form>`
    )
        .on('click', event => {
            const query = isrcs.map((isrc, index) => (isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`)).join('&');
            event.preventDefault();
            window.open(`https://magicisrc.kepstin.ca?${query}`);
        })
        .appendTo(mbUI.last());
    waitForEl('[data-testid="toolbar"]', function () {
        $('[data-testid="toolbar"]').append(mbUI);
        mbUI.show();
    });
}
