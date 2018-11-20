/* global $ MBImport */
'use strict';
var meta = function() {
    // ==UserScript==
    // @name         Import DG/Decca releases to MusicBrainz
    // @namespace    https://github.com/murdos/musicbrainz-userscripts
    // @author       loujine
    // @version      2018.2.18.1
    // @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/dgdecca_importer.user.js
    // @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/dgdecca_importer.user.js
    // @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
    // @description  Add a button to import DG/Decca releases to MusicBrainz
    // @compatible   firefox+greasemonkey
    // @licence      CC BY-NC-SA 3.0 (https://creativecommons.org/licenses/by-nc-sa/3.0/)
    // @include      http*://*deutschegrammophon.com/*/cat/*
    // @include      http*://*deccaclassics.com/*/cat/*
    // @require      lib/mbimport.js
    // @require      lib/mbimportstyle.js
    // @grant        none
    // @run-at       document-end
    // ==/UserScript==
};
if (meta && meta.toString && (meta = meta.toString())) {
    var meta = { name: meta.match(/@name\s+(.+)/)[1], version: meta.match(/@version\s+(.+)/)[1] };
}

var siteURL = document.URL.split('/')[2].replace('www.', '');

var months = {
    'Jan.': 1,
    'Feb.': 2,
    'Mar.': 3,
    'Apr.': 4,
    May: 5,
    'Jun.': 6,
    'Jul.': 7,
    'Aug.': 8,
    'Sep.': 9,
    'Oct.': 10,
    'Nov.': 11,
    'Dec.': 12
};
var labels = {
    'deutschegrammophon.com': {
        name: 'Deutsche Grammophon',
        mbid: '5a584032-dcef-41bb-9f8b-19540116fb1c',
        catno: document.URL.split('/')[5]
    },
    'deccaclassics.com': {
        name: 'Decca Classics',
        mbid: '89a9993d-1dad-4445-a3d7-1d8df04f7e7b',
        catno: document.URL.split('/')[5]
    }
};

var editNote = `Imported from ${document.URL}\n —\nGM script: "${meta.name}" (${meta.version})\n\n`;

function _clean(s) {
    return s
        .replace(' In ', ' in ')
        .replace('Minor', 'minor')
        .replace('Major', 'major')
        .replace('Op.', 'op. ')
        .replace('No.', 'no. ')
        .replace(' Flat', '-flat')
        .replace(' flat', '-flat')
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
        .replace('K.', 'K. ') // Mozart
        .replace('S.', 'S. '); // Liszt
}

function extract_release_data() {
    console.log('extract_release_data');

    function _setTitle() {
        let title = $('h4')[0].textContent;
        if ($('div.works').length) {
            title += ` ${$('div.works')[0]
                .innerHTML.replace(/<br><br>/g, ' / ')
                .replace(/<br>/g, ' ')}`;
        }
        return title;
    }
    function _setReleasePerformers() {
        let list = $('div.artists')[0]
            .innerHTML.split('<br>')
            .map(function(artist) {
                return {
                    credited_name: artist,
                    artist_name: artist,
                    artist_mbid: '',
                    joinphrase: ', '
                };
            });
        list[list.length - 1]['joinphrase'] = '';
        return list;
    }

    function _setReleaseArtists() {
        let composer = document.getElementsByTagName('h4')[0].textContent;
        let list = [
            {
                credited_name: composer,
                artist_name: composer,
                artist_mbid: '',
                joinphrase: '; '
            }
        ];
        return list.concat(_setReleasePerformers());
    }

    function _indices(array, element) {
        let indices = [];
        let idx = array.indexOf(element);
        while (idx != -1) {
            indices.push(idx);
            idx = array.indexOf(element, idx + 1);
        }
        return indices;
    }

    let date = document.getElementsByClassName('date')[0].textContent;
    date = date.replace('Int. Release ', '').split(' ');
    let nodes = [];
    let tracklist_node = document.getElementById('tracklist');

    $('.item,.hier0,.hier1,.hier2,.hier3').each(function(idx, node) {
        var idx;
        let d = {};
        if (node.classList.contains('hier0')) {
            d['level'] = 0;
        } else if (node.classList.contains('hier1')) {
            d['level'] = 1;
        } else if (node.classList.contains('hier2')) {
            d['level'] = 2;
        } else if (node.classList.contains('hier3')) {
            d['level'] = 3;
        }
        if (node.parentElement.classList.contains('track-container')) {
            d['type'] = 'track';
        } else if (node.parentElement.classList.contains('work-container')) {
            d['type'] = 'work';
        } else if (node.parentElement.classList.contains('artists-container')) {
            d['type'] = 'artist';
        } else {
            d['type'] = 'medium';
        }
        d['title'] = node.textContent;
        d['node'] = node.parentElement;
        nodes.push(d);
    });
    console.log(nodes, tracklist_node);

    // complete track titles
    let header0, header1, header2, idx;
    nodes.forEach(function(node, idx) {
        let level = node['level'],
            type = node['type'],
            content = node['title'];
        if (type === 'work') {
            if (level === 0) {
                header0 = content;
            } else if (level === 1) {
                header1 = content;
            } else if (level === 2) {
                header2 = content;
            }
        } else if (type === 'track') {
            if (level === 0) {
                nodes[idx]['title'] = content;
            } else if (level === 1) {
                nodes[idx]['title'] = `${header0}: ${content}`;
            } else if (level === 2) {
                nodes[idx]['title'] = `${header0}, ${header1}: ${content}`;
            } else if (level === 3) {
                nodes[idx]['title'] = `${header0}, ${header1}, ${header2}: ${content}`;
            }
        }
    });

    let discs = [],
        tracks = [],
        medium_title = '';
    nodes.forEach(function(item, idx) {
        if (item.type === 'track') {
            let track = extract_track_data(item.node);
            track.title = _clean(item.title);
            tracks.push(track);
        }
        if (item.type === 'medium') {
            if (idx > 0) {
                discs.push({
                    title: '', // medium_title,
                    format: 'CD',
                    tracks: tracks
                });
            }
            medium_title = item.title;
            tracks = [];
        }
    });
    // push last medium
    discs.push({
        title: '', // nodes[0].title,
        format: 'CD',
        tracks: tracks
    });

    return {
        title: _setTitle(),
        artist_credit: _setReleaseArtists(),
        type: 'Album',
        status: 'Official',
        language: 'eng', // 'English',
        script: 'Latn', // 'Latin',
        packaging: '',
        country: '',
        year: date[2],
        month: months[date[1]],
        day: date[0],
        labels: [labels[siteURL]],
        barcode: document.getElementById('upc').value.replace('00', ''), // too many 0s
        urls: [
            {
                link_type: 288, // 'discography'
                url: document.URL
            }
        ],
        discs: discs
    };
}

function extract_track_data(node) {
    function _setTrackArtists(artistString) {
        console.log('artistString', artistString);
        let artists;
        if (artistString.includes(' | ')) {
            artists = artistString.split(' | ').map(function(artist) {
                return {
                    credited_name: artist.split(',')[0],
                    artist_name: artist.split(',')[0],
                    artist_mbid: '',
                    joinphrase: ', '
                };
            });
        } else {
            artists = artistString.split(', ').map(function(artist, idx) {
                let mbid = '';
                let url = `/ws/js/artist/?q=${artist}&fmt=json&limit=1`;
                return {
                    credited_name: artist,
                    artist_name: artist,
                    artist_mbid: mbid,
                    joinphrase: ', '
                };
            });
        }
        artists[artists.length - 1]['joinphrase'] = '';
        return artists;
    }

    let schema = {};
    if (node.querySelectorAll('meta').length) {
        // https://schema.org/MusicRecording info available
        for (let item of node.querySelectorAll('meta')) {
            let attrs = item.attributes;
            schema[attrs.itemprop.value] = attrs.content.value;
        }
    } else {
        console.log('no meta data on ', node);
        schema.name = node.querySelectorAll('div.track-text > a.fancy')[0].textContent;
        schema.byArtist = $(node)
            .parent()
            .nextAll('div.container-container')
            .children('.artists-container')[0].textContent;
        let previousComposers = $(node)
            .parent()
            .prevAll('div.container-container')
            .children('.first-composer-container');
        schema.creator = previousComposers[previousComposers.length - 1].textContent;
    }
    console.info('schema', schema);
    return {
        number: parseInt(node.querySelectorAll('div.track-no')[0].textContent),
        title: _clean(schema.name),
        duration: node.querySelectorAll('div.track-time')[0].textContent,
        artist_credit: _setTrackArtists(schema.byArtist), // CSG
        performer: schema.byArtist,
        composer: schema.creator,
        url: node.querySelectorAll('div.track-text > a.fancy')[0].href
    };
}

// Insert links in page
function insertMBSection(release) {
    let mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>');
    let mbContentBlock = $('<div class="section_content"></div>');
    mbUI.append(mbContentBlock);

    // Form parameters
    let parameters = MBImport.buildFormParameters(release, editNote);

    // Build form + search button
    let innerHTML = `<div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`;
    mbContentBlock.append(innerHTML);

    $('div#product-text').append(mbUI[0]);

    $('#mb_buttons').css({
        display: 'inline-block',
        width: '100%'
    });
    $('form.musicbrainz_import').css({ width: '49%', display: 'inline-block' });
    $('form.musicbrainz_import_search').css({ float: 'right' });
    $('form.musicbrainz_import > button').css({ width: '100%', 'box-sizing': 'border-box' });

    mbUI.slideDown();
}

try {
    var release = extract_release_data();
    insertMBSection(release);
} catch (e) {
    console.log(e);
    throw e;
}
