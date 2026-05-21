// ==UserScript==
// @name         Import Deezer releases into MusicBrainz (API & UI Fix)
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @description  One-click importing of releases from deezer.com into MusicBrainz using the Deezer API
// @version      2026.02.03.2
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/deezer_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/deezer_importer.user.js
// @match        https://www.deezer.com/*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant        GM_xmlhttpRequest
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {
    'use strict';

    // --- Helpers ---
    function getAlbumId() {
        const match = window.location.pathname.match(/\/album\/(\d+)/);
        return match ? match[1] : null;
    }

    function parseDuration(duration) {
        return duration * 1000;
    }

    // --- Main Logic ---
    async function fetchAndImport(albumId) {
        const apiUrl = `https://api.deezer.com/album/${albumId}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            onload: function (response) {
                if (response.status === 200) {
                    const data = JSON.parse(response.responseText);
                    if (data.error) return;
                    renderButton(data);
                }
            }
        });
    }

    function renderButton(data) {
        const release = {
            title: data.title,
            artist_credit: MBImport.makeArtistCredits([data.artist.name]),
            type: data.record_type === 'single' ? 'single' : 'album',
            status: 'official',
            language: 'eng',
            script: 'Latn',
            barcode: data.upc,
            labels: data.label ? [{ name: data.label, catno: '' }] : [],
            urls: [{ url: data.link, link_type: MBImport.URL_TYPES.stream_for_free }],
            discs: []
        };

        if (data.release_date) {
            const dateParts = data.release_date.split('-');
            release.year = dateParts[0];
            release.month = dateParts[1];
            release.day = dateParts[2];
        }

        const tracks = data.tracks.data;
        const discs = {};

        tracks.forEach(track => {
            const discNum = track.disk_number || 1;
            if (!discs[discNum]) {
                discs[discNum] = { tracks: [], format: 'Digital Media' };
            }

            const trackObj = {
                title: track.title,
                duration: parseDuration(track.duration),
                artist_credit: []
            };

            if (track.artist.name !== data.artist.name && data.artist.name === "Various Artists") {
                trackObj.artist_credit = MBImport.makeArtistCredits([track.artist.name]);
            }

            if (trackObj.title.match(/\(Original Mix\)/i)) {
                trackObj.title = trackObj.title.replace(/\s*\(Original Mix\)\s*/i, "");
            }

            discs[discNum].tracks.push(trackObj);
        });

        Object.keys(discs).sort().forEach(k => {
            release.discs.push(discs[k]);
        });

        insertLink(release, data.link);
    }

    function insertLink(release, releaseUrl) {
        $('#mb_import_container').remove();

        const editNote = MBImport.makeEditNote(releaseUrl, 'Deezer');
        const parameters = MBImport.buildFormParameters(release, editNote);

        const mbUI = $(`
            <div id="mb_import_container" style="display:inline-flex; align-items:center; margin-right:8px;">
                ${MBImport.buildFormHTML(parameters)}
                ${MBImport.buildSearchButton(release)}
            </div>
        `);

        // Apply Native Deezer Styling
        // We add the class "tempo-btn" and "tempo-btn-hollow-neutral" which are standard Deezer buttons
        const $btns = mbUI.find('button');
        $btns.addClass('tempo-btn tempo-btn-hollow-neutral tempo-btn-s');
        
        // Custom tweaks to ensure the logo fits nicely inside the rounded Deezer button
        $btns.css({
            'padding': '0 12px',
            'height': '32px',         // Matches Deezer small button height
            'min-height': '32px',
            'display': 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'border-radius': '500px'  // Native pill shape
        });

        // Add a text label or icon adjustment if needed
        $btns.eq(0).html('<span style="font-weight:700; font-size:12px;">Import to MB</span>');
        $btns.eq(1).html('<span style="font-weight:700; font-size:12px;">Search MB</span>');

        // Inject into the action bar
        const target = $('.tempo-topbar-actions').first();

        if (target.length) {
            target.prepend(mbUI);
        } else {
            $('body').prepend(mbUI.css({
                'position': 'fixed', 'top': '80px', 'right': '20px', 'z-index': '9999', 'background': 'white', 'padding': '5px', 'border-radius': '5px'
            }));
        }
    }

    // --- Init ---
    let lastUrl = location.href;
    function checkUrl() {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            init();
        }
    }
    function init() {
        const albumId = getAlbumId();
        if (albumId) setTimeout(() => fetchAndImport(albumId), 1000);
    }
    $(document).ready(function() {
        init();
        setInterval(checkUrl, 1000);
    });

})();
