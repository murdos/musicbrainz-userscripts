'use strict';
// ==UserScript==
// @name         Import Naxos Music Library 3 releases to MusicBrainz
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @author       loujine
// @version      2020.9.12
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/naxos_library3_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/naxos_library3_importer.user.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @description  Add a button to import Naxos Music Library 3 releases to MusicBrainz
// @compatible   firefox+tampermonkey
// @license      MIT
// @include      http*://*nml3.naxosmusiclibrary.com/catalogue/*
// @exclude      http*://*nml3.naxosmusiclibrary.com/catalogue/search
// @require      lib/mbimport.js
// @require      lib/mbimportstyle.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

const url = document.URL.replace(/\/[^/].*nml3/, '/www.nml3');

const editNote = `
Imported from ${url}
Warning: Track durations from Naxos Music Library can seldom be incorrect
—
GM script: "${GM_info.script.name}" (${GM_info.script.version})
`;

const months = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
};

function _clean(s) {
    return s
        .replace(' In ', ' in ')
        .replace('Minor', 'minor')
        .replace('Major', 'major')
        .replace('Op.', 'op. ')
        .replace(/No\. /g, 'no. ')
        .replace(/No\./g, 'no. ')
        .replace('-Flat', '-flat')
        .replace(' Flat', '-flat')
        .replace(' flat', '-flat')
        .replace('-Sharp', '-sharp')
        .replace(' Sharp', '-sharp')
        .replace(' sharp', '-sharp')
        .replace('1. ', 'I. ')
        .replace('2. ', 'II. ')
        .replace('3. ', 'III. ')
        .replace('4. ', 'IV. ')
        .replace('5. ', 'V. ')
        .replace('6. ', 'VI. ')
        .replace('7. ', 'VII. ')
        .replace('8. ', 'VIII. ')
        .replace('9. ', 'IX. ')
        .replace('10. ', 'X. ')
        .replace(' - ', ': ')
        .replace(' | ', ': ')
        .replace('K.', 'K. ')
        .replace('S.', 'S. ');
}

function extract_release_data() {
    function _setTitle() {
        return document.querySelector('div.song-tit').textContent;
    }

    function _setReleasePerformers() {
        const artists = $('ul.album-type li:contains("Artist(s):") span a').toArray();
        const list = artists.map(artist => ({
            artist_name: artist.textContent,
            joinphrase: ', ',
        }));
        list[list.length - 1].joinphrase = '';
        return list;
    }

    function _setReleaseArtists() {
        const composers = $('ul.album-type li:contains("Composer(s):") span a').toArray();
        const list = composers.map(composer => ({
            artist_name: composer.textContent,
            joinphrase: ', ',
        }));
        list[list.length - 1].joinphrase = '; ';
        return list.concat(_setReleasePerformers());
    }

    let date = $('ul.album-type li:contains("Release Date:") span').text().trim().split(' ');
    if (date.length == 1) {
        date = ['', '', date[0]];
    }
    const label = $('ul.album-type li:contains("Label:") span').text().trim();
    const catno = $('ul.album-type li:contains("Catalogue No.:") span').text().trim();

    function _extract_track_data(node, parentWork) {
        const numberField = node.querySelector('div.number').textContent.trim();
        let title = node.querySelector('div.trackTitle').textContent.trim();
        if (parentWork && title.trim().startsWith('»')) {
            title = `${parentWork}: ${title.replace('»', '')}`;
        }
        let artists = Array.prototype.map.call(node.querySelectorAll('div.list-artist a'), aNode => ({
            artist_name: aNode.textContent,
            joinphrase: ', ',
        }));
        if (!artists.length) {
            artists = _setReleaseArtists();
        } else {
            artists[artists.length - 1].joinphrase = '';
        }

        return {
            number: parseInt(numberField),
            title: _clean(title),
            duration: node.querySelector('div.time').textContent.trim(),
            artist_credit: artists,
        };
    }

    const discs = [];
    const discNodes = document.querySelectorAll('div.playlist-list');

    let parentWork;
    discNodes.forEach(discNode => {
        let tracks = [];
        discNode.querySelectorAll('div.list-con').forEach(trackNode => {
            if (trackNode.classList.contains('cata-work-title')) {
                parentWork = trackNode.querySelector('div.production').textContent.trim();
            } else {
                tracks.push(_extract_track_data(trackNode, parentWork));
            }
        });

        discs.push({
            format: 'Digital Media',
            tracks: tracks,
        });
    });

    return {
        title: _setTitle(),
        artist_credit: _setReleaseArtists(),
        type: 'Album',
        status: 'Official',
        year: date[2],
        month: months[date[1]],
        day: date[0],
        labels: [
            {
                name: label,
                catno: catno,
            },
        ],
        urls: [],
        discs: discs,
    };
}

// Insert links in page
function insertMBSection(release) {
    const mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>');
    const mbContentBlock = $('<div class="section_content"></div>');
    mbUI.append(mbContentBlock);

    // Form parameters
    const parameters = MBImport.buildFormParameters(release, editNote);

    // Build form + search button
    const innerHTML = `
        <div id="mb_buttons">
        ${MBImport.buildFormHTML(parameters)}
        ${MBImport.buildSearchButton(release)}
        </div>`;
    mbContentBlock.append(innerHTML);

    document.querySelector('div.song-con').prepend(mbUI[0]);

    $('#mb_buttons').css({
        display: 'inline-block',
        width: '100%',
    });
    $('form.musicbrainz_import').css({ width: '49%', display: 'inline-block' });
    $('form.musicbrainz_import_search').css({ float: 'right' });
    $('form.musicbrainz_import > button').css({ width: '100%', 'box-sizing': 'border-box' });

    mbUI.slideDown();
}

try {
    const release = extract_release_data();
    insertMBSection(release);
} catch (e) {
    console.log(e);
    throw e;
}
