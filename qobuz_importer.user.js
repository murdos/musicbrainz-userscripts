// ==UserScript==
// @name         Import Qobuz releases to MusicBrainz
// @description  Add a button on Qobuz's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2025.05.11.0
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @downloadURL  https://raw.github.com/murdos/musicbrainz-userscripts/master/qobuz_importer.user.js
// @updateURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/qobuz_importer.user.js
// @include      /^https?://www\.qobuz\.com/[^/]+/album/[^/]+/[^/]+$/
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require      lib/mbimport.js
// @require      lib/logger.js
// @require      lib/mblinks.js
// @require      lib/mbimportstyle.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @run-at       document-idle
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

const DEBUG = false;

if (DEBUG) {
    LOGGER.setLevel('debug');
}

// list of qobuz artist id which should be mapped to Various Artists
const various_artists_ids = [26887, 145383, 353325, 183869, 997899, 2225160],
    various_composers_ids = [573076];
let is_classical = false, // release detected as classical
    album_artist_data = {}; // for switching album artists on classical

function isVariousArtists(artist) {
    // Check hard-coded various artist ids
    if ($.inArray(artist.id, various_artists_ids) != -1 || $.inArray(artist.id, various_composers_ids) != -1) {
        return true;
    } else if ($.inArray(artist.slug, ['various-artist', 'various-composers']) != -1) {
        // Let's assume various based on the slug
        return true;
    }
    return false;
}

function getPerformers(trackobj) {
    return (
        (typeof trackobj.performers !== 'undefined' &&
            trackobj.performers
                .replace('\r', '')
                .split(' - ')
                .map(function (v) {
                    let list = v.split(', ');
                    let name = list.shift();
                    return [name, list];
                })) || [[trackobj.performer.name, ['Primary']]]
    );
}

/**
 * @typedef {Object} AlbumData
 * @property {string} [title] - The album title
 * @property {string} [artist] - The album artist
 * @property {string} [releaseDate] - The release date in YYYY-MM-DD format
 * @property {string} [datePublished] - The publication date in YYYY-MM-DD format
 * @property {string} [sku] - The Qobuz SKU (not a barcode)
 * @property {string} [qobuzUrl] - The Qobuz URL for the album
 * @property {string} [coverArt] - The URL for the album cover art (max size)
 */

/**
 * Extract album data from JSON-LD elements from the page
 * @returns {AlbumData}
 */
function extractAlbumData() {
    /**
     * @type {AlbumData}
     */
    let album_data = {};

    console.debug('Qobuz Importer: Attempting to extract embedded JSON-LD data.');
    const script_elements = document.querySelectorAll('script[type="application/ld+json"]');

    let found_product_schema = false;
    let found_music_album_schema = false;

    script_elements.forEach(script => {
        const json_data = JSON.parse(script.textContent);
        console.debug('Qobuz Importer: Parsing JSON-LD content:', json_data);

        if (json_data['@type'] === 'Product') {
            console.debug('Qobuz Importer: Found Product schema in JSON-LD content');
            /**
             * @see https://schema.org/Product
             * @typedef {Object} ProductSchema
             * @property {string} name - The album name.
             * @property {string} sku - NOT a barcode, but Qobuz's own SKU.
             * @property {BrandSchema} brand - Qobuz appears to put the album artist here.
             * @property {string} releaseDate - In YYYY-MM-DD format.
             * @property {string[]} image - Cover image URLs for sizes: 50x50, 200x200, 600x600.
             *
             * @see https://schema.org/Brand
             * @typedef {Object} BrandSchema
             * @property {string} name - The album artist.
             */

            /**
             * @type {ProductSchema}
             */
            let product = json_data;

            album_data.artist = product.brand && product.brand.name;
            album_data.releaseDate = product.releaseDate; // TODO: this is the original release date, not the Qobuz release date
            album_data.sku = product.sku; // This is NOT a barcode

            if (product.image && Array.isArray(product.image) && product.image.length > 0) {
                // Find the _600.jpg image or take the last one as potentially the highest resolution available
                let coverImg = product.image.find(img => img.includes('_600.jpg')) || product.image[product.image.length - 1];
                if (coverImg) {
                    album_data.coverArt = coverImg.replace('_600', '_max');
                }
            }
            found_product_schema = true;
        }

        if (json_data['@type'] === 'MusicAlbum') {
            console.debug('Qobuz Importer: Found MusicAlbum schema:', json_data);
            /**
             * @see https://schema.org/MusicAlbum
             * @typedef {Object} MusicAlbumSchema
             * @property {string} name - The album name.
             * @property {string} datePublished - The release date in YYYY-MM-DD format.
             * @property {string} url - The Qobuz URL for the album.
             */

            /**
             * @type {MusicAlbumSchema}
             */
            let music_album = json_data;

            album_data.title = music_album.name;
            album_data.datePublished = music_album.datePublished;

            album_data.qobuzUrl = music_album.url;
            // Example:  https://www.qobuz.com/us-en/album/album-name/album-id
            let url_segments = album_data.qobuzUrl.split('/');
            if (url_segments.length > 4) {
                const country_and_language_segment = url_segments.splice(3, 1)[0]; // Remove the "country-language" segment
                if (/^[a-z]{2}-[a-z]{2}$/.test(country_and_language_segment)) {
                    // Give MusicBrainz the URL without the country-language segment.
                    // Qobuz redirects to the user's country and language.
                    album_data.qobuzUrl = url_segments.join('/');
                }
            }

            found_music_album_schema = true;
        }
    });

    if (!found_product_schema && !found_music_album_schema) {
        console.warn('Qobuz Importer WARNING: No suitable JSON-LD Product or MusicAlbum schema found.');
    } else {
        console.debug('Qobuz Importer: Extracted album data from JSON-LD:', album_data);
    }
    return album_data;
}

/**
 * @typedef {Object} PlayerTrack
 * @property {string} number - The track number
 * @property {string} title - The track title
 * @property {string} artist - The track artist
 * @property {string} duration - The track duration in HH:MM:SS format
 *
 * @typedef {Object} PlayerInfo
 * @property {PlayerTrack[]} tracks - The album tracks
 * @property {(string|null)} albumLabel - The album label
 * @property {string[]} copyrights - The album copyrights
 */

/**
 * Extract track data from the track elements in the Qobuz player on the page
 * @returns {PlayerInfo}
 */
function extractPlayerInfo() {
    console.debug('Qobuz Importer: Attempting to extract player track data.');

    const player_tracks_div = document.getElementById('playerTracks');
    if (!player_tracks_div) {
        console.warn('Qobuz Importer WARNING: Could not find playerTracks div.');
        return {};
    }

    /**
     * @type {PlayerTrack[]}
     */
    let tracks = [];

    let potential_labels = new Set();
    let copyright_info = new Set();

    const track_elements = player_tracks_div.querySelectorAll('div.track'); // Gets all track divs
    track_elements.forEach(element => {
        /**
         * @type {PlayerTrack}
         */
        let track = {};

        track.number = element.querySelector('.track__item--number span').textContent.trim();
        track.title = element.querySelector('.track__item--name span').textContent.trim();
        if (element.dataset.trackV2) {
            /**
             * @typedef {Object} TrackV2 - "data-track-v2" in a Qobuz track element
             * @property {string} item_name - The track name
             * @property {string} item_brand - The track artist
             * @property {string} item_category - The album name
             * @property {string} item_category2 - The track label
             */

            /**
             * @type {TrackV2}
             */
            let track_v2 = JSON.parse(element.dataset.trackV2); // Access data-track-v2

            if (!track.title && track_v2.item_name) {
                track.title = track_v2.item_name; // Fallback title
            }
            track.artist = track_v2.item_brand;
            if (track_v2.item_category2 && track_v2.item_category2.toLowerCase() !== 'qobuz') {
                // Avoid "Qobuz" as label
                potential_labels.add(track_v2.item_category2.trim());
            }
        }
        track.duration = element.querySelector('.track__item--duration').textContent.trim(); // HH:MM:SS

        // Copyright info
        const track_info_elements = element.querySelectorAll('.track__infos .track__info');
        track_info_elements.forEach(track_info => {
            const info_text = track_info.textContent.trim();
            if (info_text.startsWith('(C)') || info_text.startsWith('(P)')) {
                copyright_info.add(info_text);
            }
            // Fallback for track artist if not in data-track-v2
            if (!track.artist && info_text.toLowerCase().includes('mainartist')) {
                info_text.split(' - ').forEach(credit => {
                    if (credit.toLowerCase().includes('mainartist')) {
                        track.artist = credit.split(',')[0].trim();
                    }
                });
            }
        });

        if (track.number && track.title && track.duration) {
            tracks.push(track);
        } else {
            console.warn('Qobuz Importer WARNING: Missing essential data for a track:', element, track);
        }
    });

    // Determine a single album label if possible
    let albumLabel = null;
    if (potential_labels.size === 1) {
        albumLabel = potential_labels.values().next().value;
    } else if (potential_labels.size > 1) {
        console.warn('Qobuz Importer WARNING: Multiple potential labels found:', Array.from(potential_labels));
        // TODO: figure out the main label, or leave it for manual user input
    }

    console.debug('Qobuz Importer: Extracted tracks:', tracks);
    console.debug('Qobuz Importer: Extracted album label:', albumLabel);
    console.debug('Qobuz Importer: Extracted copyright info:', Array.from(copyright_info));

    return {
        tracks: tracks,
        albumLabel: albumLabel,
        copyrights: Array.from(copyright_info), // Array of copyright strings
    };
}

/**
 * Parse the release data from Qobuz
 * @param {AlbumData} album_data
 * @param {PlayerTrack} player_info
 * @returns {Release}
 */
function parseRelease(album_data, player_info) {
    console.debug('Qobuz Importer: Parsing release info from linked data and player info');
    console.debug('Qobuz Importer: albumInfoFromLD:', JSON.stringify(album_data, null, 2));
    console.debug('Qobuz Importer: playerInfo:', JSON.stringify(player_info, null, 2));

    /**
     * @type {Release}
     */
    let release = {};

    release.title = album_data.title;
    release.artist_credit = MBImport.makeArtistCredits([album_data.artist]);
    if (album_data.releaseDate) {
        const [year, month, day] = album_data.releaseDate.split('-');
        release.year = parseInt(year, 10);
        release.month = parseInt(month, 10);
        release.day = parseInt(day, 10);
    }
    release.packaging = 'None'; // Digital media, no packaging

    let link_type = MBImport.URL_TYPES;
    if (album_data.qobuzUrl) {
        release.urls = [
            {
                // TODO: check whether the page allows purchase for download
                url: album_data.qobuzUrl,
                link_type: link_type.purchase_for_download,
            },
            {
                // TODO: check whether the page allows streaming
                url: album_data.qobuzUrl,
                link_type: link_type.streaming,
            },
        ];
    }

    release.labels = [];
    if (player_info.albumLabel) {
        release.labels.push({
            name: player_info.albumLabel,
            // TODO: Where is the catalog number?
            catno: '',
            catalog_number: '',
        });
    }

    /**
     * @type {Disc}
     */
    let disc = {
        format: 'Digital Media',
        tracks: [],
    };
    player_info.tracks.forEach(player_track => {
        /**
         * @type {Track}
         */
        let track = {
            number: player_track.number,
            title: player_track.title,
            duration: player_track.duration,
            artist_credit: MBImport.makeArtistCredits([player_track.artist]),
        };
        disc.tracks.push(track);
    });
    release.discs = [disc];

    release.country = 'XW'; // Default to Worldwide - TODO: Refine to Qobuz markets?
    release.language = 'eng'; // Default - TODO: Refine
    release.script = 'Latn'; // Default - TODO: Refine
    release.status = 'Official';
    release.type = 'Album'; // TODO: add logic to infer Album, EP, Single, etc.

    let commentsArray = [];
    if (player_info.copyrights && player_info.copyrights.length > 0) {
        commentsArray.push(...player_info.copyrights);
    }
    if (album_data.coverArt && album_data.coverArt.endsWith('_max.jpg')) {
        commentsArray.push('Cover art obtained from _max.jpg URL variant.');
    }
    release.comment = commentsArray.join('\n').trim();

    // TODO: Classical genre handling

    console.debug('Qobuz Importer: Processed release object for MBImport:', JSON.stringify(release, null, 2));
    return release;
}

function insertErrorMessage(error_data) {
    let mbErrorMsg = $('<p class="musicbrainz_import">')
        .append('<h5>MB import</h5>')
        .append(`<em>Error ${error_data.code}: ${error_data.message}</em>`)
        .append('<p><strong>This probably means that you have to be logged in to Qobuz for the script to work.');
    $('#info div.meta').append(mbErrorMsg);
}

function changeAlbumArtist() {
    let album_artist, classical_artist;
    if (album_artist_data.forced) {
        // restore saved classical artist
        album_artist = album_artist_data.classical;
    } else {
        // use the original artist
        album_artist = $("#mbnormal input[name^='artist_credit.names.0.']");
    }
    classical_artist = $('#mbclassical input[name^="artist_credit.names.0."]').detach();
    if (typeof album_artist_data.classical === 'undefined') {
        album_artist_data.classical = classical_artist;
    }
    $('#mbclassical').prepend(album_artist);

    album_artist_data.forced = !album_artist_data.forced;
}

/**
 * Insert button into page under label information
 * @param {Release} release - The release object containing all the data
 */
function insertLink(release) {
    let edit_note = MBImport.makeEditNote(release.url, 'Qobuz', null),
        parameters = MBImport.buildFormParameters(release, edit_note),
        $album_form = $(MBImport.buildFormHTML(parameters)),
        search_form = MBImport.buildSearchButton(release);
    let mbUI = $('<p class="musicbrainz_import">').append($album_form, search_form).hide();

    if (is_classical) {
        let classical_release = $.extend({}, release);
        classical_release.artist_credit = classical_release.classical.artist_credit;
        classical_release.discs = classical_release.classical.discs;

        let classical_parameters = MBImport.buildFormParameters(classical_release, edit_note),
            $classical_form = $(MBImport.buildFormHTML(classical_parameters));

        $('button', $classical_form).prop('title', 'The release was detected as classical. Import with composers as track artists.');
        $('button span', $classical_form).text('Import as classical');

        if (album_artist_data.classical_is_various && !album_artist_data.normal_is_various) {
            // Create stuff for forcing album artist
            $album_form.prop('id', 'mbnormal');
            $classical_form.prop('id', 'mbclassical');
            album_artist_data.forced = false;
        }
        mbUI.append('<p>');
        mbUI.append($classical_form);
        let title = 'Force album artist on classical import. Album artist will be various artists if there are multiple composers.';
        mbUI.append(
            $(
                `<label for="force_album_artist" class="musicbrainz_import" title="${title}"><input id="force_album_artist" type="checkbox" title="${title}">Force album artist</label>`,
            ),
        );
    }

    $('.album-meta .album-meta__title').prepend(mbUI);
    $('form.musicbrainz_import').css({
        display: 'inline-block',
        margin: '1px',
    });
    $('form.musicbrainz_import img').css({
        display: 'inline-block',
        width: '16px',
        height: '16px',
    });
    $('label.musicbrainz_import').css({
        'white-space': 'nowrap',
        'border-radius': '5px',
        display: 'inline-block',
        cursor: 'pointer',
        'font-family': 'Arial',
        'font-size': '12px',
        padding: '2px 6px',
        margin: '0 2px 0 1px',
        'text-decoration': 'none',
        border: '1px solid rgba(180,180,180,0.8)',
        'background-color': 'rgba(240,240,240,0.8)',
        color: '#334',
        height: '26px',
        'box-sizing': 'border-box',
    });
    $('label.musicbrainz_import input').css({
        margin: '0 4px 0 0',
    });
    mbUI.slideDown();
}

// Extract data from page source
let albumData = extractAlbumData();
let trackData = extractPlayerInfo();

if (albumData && trackData) {
    let releaseData = parseRelease(albumData, trackData);
    console.debug('Qobuz Importer: Release Data for MusicBrainz:', releaseData);
    insertLink(releaseData);
}

$(document).ready(function () {
    MBImportStyle();

    // replace image zoom link by the maximum size image link
    let maximgurl = $('meta[property="og:image"]').attr('content').replace('_600', '_max');
    let maximg = new Image();
    maximg.onerror = function () {
        LOGGER.debug('No max image');
    };
    console.debug('Qobuz Importer: max image URL = ', maximgurl);
    maximg.onload = function () {
        $('div[class=modal-header]').attr('src', maximgurl);
    };
    maximg.src = maximgurl;
});

$(document).on('click', '#isrcs', function () {
    $('#isrclist').toggle();
    if ($('#isrclist').is(':visible')) {
        $('#isrclist').select();
        $(this).text('Hide ISRCs');
    } else $(this).text('Show ISRCs');
    return false;
});

$(document).on('click', '#force_album_artist', function () {
    changeAlbumArtist();
});
