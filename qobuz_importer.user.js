// ==UserScript==
// @name           Import Qobuz releases to MusicBrainz
// @description    Add a button on Qobuz's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2019.03.26.0
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/qobuz_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/qobuz_importer.user.js
// @include        /^https?://www\.qobuz\.com/[^/]+/album/[^/]+/[^/]+$/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @run-at         document-start
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

var DEBUG = false;
//DEBUG = true;
if (DEBUG) {
    LOGGER.setLevel('debug');
}

// list of qobuz artist id which should be mapped to Various Artists
var various_artists_ids = [26887, 145383, 353325, 183869, 997899, 2225160],
    various_composers_ids = [573076],
    is_classical = false, // release detected as classical
    album_artist_data = {}, // for switching album artists on classical
    raw_release_data;

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
                .map(function(v) {
                    let list = v.split(', ');
                    let name = list.shift();
                    return [name, list];
                })) || [[trackobj.performer.name, ['Primary']]]
    );
}

function parseRelease(data) {
    let release = {};

    release.script = 'Latn';
    release.url = `https://www.qobuz.com${data.relative_url}`; // no lang

    release.title = data.title;
    if ($.inArray('Classique', data.genres_list) != -1) {
        is_classical = true;
        release.classical = {};
        release.classical.discs = [];
        album_artist_data.classical_is_various = false;
        album_artist_data.normal_is_various = false;
        // Use composer on classical
        if (typeof data.composer !== 'undefined') {
            if (isVariousArtists(data.composer)) {
                release.classical.artist_credit = [MBImport.specialArtist('various_artists')];
                album_artist_data.classical_is_various = true;
            } else {
                release.classical.artist_credit = MBImport.makeArtistCredits([data.composer.name]);
            }
        } else {
            release.classical.artist_credit = MBImport.makeArtistCredits([data.artist.name]);
        }
    }

    if (isVariousArtists(data.artist)) {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
        album_artist_data.normal_is_various = true;
    } else {
        release.artist_credit = MBImport.makeArtistCredits([data.artist.name]);
    }

    release.packaging = 'None';
    release.barcode = data.upc;
    release.country = 'XW';
    if (i18n_global && i18n_global.zone) {
        release.country = i18n_global.zone;
    }
    release.status = 'official';
    release.urls = [];
    release.urls.push({
        url: release.url,
        link_type: MBImport.URL_TYPES.purchase_for_download
    });

    // release timestamps are using France time + daylight saving (GMT+1 or GMT+2),
    // add 3 hours to get the day of release (matching the one displayed)
    let releaseDate = new Date((parseInt(data.released_at, 10) + 3 * 3600) * 1000);
    release.year = releaseDate.getUTCFullYear();
    release.month = releaseDate.getUTCMonth() + 1;
    release.day = releaseDate.getUTCDate();

    release.labels = [];
    $.each(data.label.name.split(' - '), function(index, label) {
        release.labels.push({
            name: label,
            catno: '[none]' // no catno on qobuz ?
        });
    });
    release.isrcs = [];
    release.comment = 'Digital download';
    release.discs = [];
    let tracks = [],
        classical_tracks = [],
        old_media_num = 1;
    $.each(data.tracks.items, function(index, trackobj) {
        release.isrcs.push(trackobj.isrc);
        if (trackobj.media_number != old_media_num) {
            release.discs.push({
                tracks: tracks,
                format: 'Digital Media'
            });
            if (is_classical) {
                release.classical.discs.push({
                    tracks: classical_tracks,
                    format: 'Digital Media'
                });
                classical_tracks = [];
            }
            old_media_num = trackobj.media_number;
            tracks = [];
        }
        let track = {};
        track.title = trackobj.title.replace('"', '"');
        track.duration = trackobj.duration * 1000;
        let performers = getPerformers(trackobj);
        if (is_classical) {
            let classical_artists = [];
            if (typeof trackobj.composer !== 'undefined') {
                classical_artists.push(trackobj.composer.name);
            } else {
                $.each(performers, function(index, performer) {
                    if ($.inArray('Composer', performer[1]) != -1) {
                        classical_artists.push(performer[0]);
                    }
                });
            }
            let classical_track = $.extend({}, track);
            classical_track.artist_credit = MBImport.makeArtistCredits(classical_artists);
            classical_tracks.push(classical_track);
        }

        let artists = [];
        let featured_artists = [];
        $.each(performers, function(index, performer) {
            if ($.inArray('Featured Artist', performer[1]) != -1) {
                featured_artists.push(performer[0]);
            } else if (
                // (is_classical && $.inArray('Composer', performer[1]) != -1) ||
                $.inArray('MainArtist', performer[1]) != -1 ||
                $.inArray('Main Performer', performer[1]) != -1 ||
                $.inArray('Primary', performer[1]) != -1 ||
                $.inArray('interprète', performer[1]) != -1 ||
                $.inArray('Performer', performer[1]) != -1 ||
                $.inArray('Main Artist', performer[1]) != -1
            ) {
                artists.push(performer[0]);
            }
        });
        track.artist_credit = MBImport.makeArtistCredits(artists);
        if (featured_artists.length) {
            if (track.artist_credit.length) {
                track.artist_credit[track.artist_credit.length - 1].joinphrase = ' feat. ';
            }
            $.merge(track.artist_credit, MBImport.makeArtistCredits(featured_artists));
        }
        tracks.push(track);
    });
    release.discs.push({
        tracks: tracks,
        format: 'Digital Media'
    });
    if (is_classical) {
        release.classical.discs.push({
            tracks: classical_tracks,
            format: 'Digital Media'
        });
    }

    LOGGER.info('Parsed release: ', release);
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

// Insert button into page under label information
function insertLink(release) {
    let edit_note = MBImport.makeEditNote(release.url, 'Qobuz'),
        parameters = MBImport.buildFormParameters(release, edit_note),
        $album_form = $(MBImport.buildFormHTML(parameters)),
        search_form = MBImport.buildSearchButton(release);
    let mbUI = $('<p class="musicbrainz_import">')
        .append($album_form, search_form)
        .hide();

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
                `<label for="force_album_artist" class="musicbrainz_import" title="${title}"><input id="force_album_artist" type="checkbox" title="${title}">Force album artist</label>`
            )
        );
    }

    mbUI.append(
        $('<button id="isrcs" type="submit" title="Show list of ISRCs">Show ISRCs</button>'),
        $(`<p><textarea id="isrclist" style="display:none">${release.isrcs.join('\n')}</textarea></p>`)
    );

    $('#info div.meta').append(mbUI);
    $('form.musicbrainz_import').css({
        display: 'inline-block',
        margin: '1px'
    });
    $('form.musicbrainz_import img').css({
        display: 'inline-block',
        width: '16px',
        height: '16px'
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
        'box-sizing': 'border-box'
    });
    $('label.musicbrainz_import input').css({
        margin: '0 4px 0 0'
    });
    mbUI.slideDown();
}

// Hook all XMLHttpRequest to use the data fetched by the official web-player.
(function() {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            let wsUrl = 'https://www.qobuz.com/api.json/0.2/album/get?album_id=';
            let repUrl = arguments[0].currentTarget.responseURL;
            if (repUrl.startsWith(wsUrl)) {
                raw_release_data = JSON.parse(this.responseText);
                if (raw_release_data.status === 'error') {
                    LOGGER.error(raw_release_data);
                    insertErrorMessage(raw_release_data);
                } else {
                    let release = parseRelease(raw_release_data);
                    insertLink(release);
                }
            }
        });
        return send.apply(this, arguments);
    };
})();

$(document).ready(function() {
    MBImportStyle();

    // replace image zoom link by the maximum size image link
    let maximgurl = $('#product-cover-link')
        .attr('href')
        .replace('_600', '_max');
    let maximg = new Image();
    maximg.onerror = function(evt) {
        LOGGER.debug('No max image');
    };
    maximg.onload = function(evt) {
        $('#product-cover-link').attr('href', maximgurl);
        $('#product-cover-link').attr(
            'title',
            `${$('#product-cover-link').attr('title')} (Qobuz importer: ${maximg.width}x${maximg.height} image)`
        );
    };
    maximg.src = maximgurl;
});

$(document).on('click', '#isrcs', function() {
    $('#isrclist').toggle();
    if ($('#isrclist').is(':visible')) {
        $('#isrclist').select();
        $(this).text('Hide ISRCs');
    } else $(this).text('Show ISRCs');
    return false;
});

$(document).on('click', '#force_album_artist', function() {
    changeAlbumArtist();
});
