'use strict';
// ==UserScript==
// @name         Import Naxos Music Library releases to MusicBrainz
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @author       loujine
// @version      2020.9.12
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/naxos_library_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/naxos_library_importer.user.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @description  Add a button to import Naxos Music Library releases to MusicBrainz
// @compatible   firefox+tampermonkey
// @license      MIT
// @include      http*://*naxosmusiclibrary.com/catalogue/item.asp*
// @require      lib/mbimport.js
// @require      lib/mbimportstyle.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

const url = document.URL.replace(/\/[^/].*naxos/, '/www.naxos');

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
        return $('h2').text();
    }

    function _setReleasePerformers() {
        const artists = $('td#left-sidebar a[href*="/artist"]').toArray();
        const list = artists.map(function (artist) {
            return {
                artist_name: artist.textContent,
                joinphrase: ', ',
            };
        });
        list[list.length - 1].joinphrase = '';
        return list;
    }

    function _setReleaseArtists() {
        const composers = $('td#left-sidebar a[href*="/composer/"]').toArray();
        const list = composers.map(function (composer) {
            return {
                artist_name: composer.textContent,
                joinphrase: ', ',
            };
        });
        list[list.length - 1].joinphrase = '; ';
        return list.concat(_setReleasePerformers());
    }

    let date = $('td#left-sidebar b:contains("Release Date")').parent().text().trim();
    if (date) {
        date = date
            .split(': ')[1]
            .split(' ')
            .filter(i => i !== '');
    }
    let label = $('td#left-sidebar b:contains("Label")').parent().text().trim();
    label = label.split(': ')[1];

    const $tracklist_node = $('td#mainbodycontent > table > tbody');

    let discs = [],
        tracks = [];

    function extract_track_data(node, parentWork) {
        const numberfield = node.children[1].textContent;
        if (parseInt(numberfield) == 1) {
            // flush finished medium
            discs.push({
                format: 'Digital Media',
                tracks: tracks,
            });
            tracks = [];
        }
        let title = node.children[3].childNodes[0].textContent.trim();
        if (title === '') {
            title = node.children[3].childNodes[1].textContent.trim();
        }
        if (parentWork && title.trim().startsWith('»')) {
            title = `${parentWork}: ${title.replace('»', '')}`;
        }
        return {
            number: parseInt(numberfield),
            title: _clean(title),
            duration: node.children[5].textContent,
        };
    }

    let parentWork;
    $tracklist_node.find('tbody > tr').each(function (idx, trnode) {
        if (trnode.children.length > 1) {
            if (trnode.children[1].innerHTML.replace('&nbsp;', '').trim() == '') {
                // work header
                parentWork = trnode.children[3].childNodes[1].textContent.trim();
            } else {
                const track = extract_track_data(trnode, parentWork);
                tracks.push(track);
            }
        }
    });

    // last medium
    discs.push({
        title: '',
        format: 'Digital Media',
        tracks: tracks,
    });
    // remove empty medium 0
    discs = discs.splice(1);

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
                catno: document.URL.split('?cid=')[1],
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

    $('td#left-sidebar').append(mbUI[0]);

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
