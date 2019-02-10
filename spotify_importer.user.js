// ==UserScript==
// @name           Import Spotify releases to MusicBrainz
// @description    Add a button on Spotify's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2019.02.10.0
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/spotify_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/spotify_importer.user.js
// @include        /^https?://open\.spotify\.com/album/[A-Za-z0-9]+$
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @run-at         document-body
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

const DEBUG = false;
//DEBUG = true;
if (DEBUG) {
    LOGGER.setLevel('debug');
}

// list of artist ids which should be mapped to Various Artists
let various_artists_ids = ['0LyfQWJT6nXafLPZqxe9Of'],
    various_composers_ids = [],
    album_artist_data = {}, // for switching album artists on classical
    raw_release_data;

function isVariousArtists(artist) {
    // Check hard-coded various artist ids
    if ($.inArray(artist.id, various_artists_ids) != -1 || $.inArray(artist.id, various_composers_ids) != -1) {
        return true;
    }
    /* else if ($.inArray(artist.name, ['Various Artists']) != -1) {
        // Let's assume various based on name
        return true;
    } */
    return false;
}

function getPerformers(trackobj) {
    return trackobj.artists.map(function(v) {
        return [v.name, [v.type]];
    });
}

function parseRelease(data) {
    let release = {};
    release.country = 'XW';
    release.packaging = 'None';
    release.script = 'Latn';
    release.status = 'official';
    release.comment = 'Spotify release';

    release.url = data.external_urls.spotify;
    release.barcode = data.external_ids.upc;

    if (data.album_type == 'compilation') {
        release.type = 'album';
        release.secondary_types = [];
        release.secondary_types.push(data.album_type);
    } else {
        release.type = data.album_type;
    }

    release.urls = [];
    release.urls.push({
        url: release.url,
        link_type: MBImport.URL_TYPES.stream_for_free
    });

    release.labels = [];
    release.labels.push({
        name: data.label,
        catno: '[none]' // no catno on spotify
    });

    release.discs = [];

    release.title = data.name;
    release.release_date = data.release_date.split('-');
    release.year = parseInt(release.release_date[0]);
    release.month = parseInt(release.release_date[1]);
    release.day = parseInt(release.release_date[2]);

    if (isVariousArtists(data.artists[0])) {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
        album_artist_data.normal_is_various = true;
    } else {
        release.artist_credit = MBImport.makeArtistCredits([data.artists[0].name]);
    }

    let tracks = [],
        old_media_num = 1;
    $.each(data.tracks.items, function(index, trackobj) {
        // check if new media begins
        if (trackobj.disc_number != old_media_num) {
            release.discs.push({
                tracks: tracks,
                format: 'Digital Media'
            });
            old_media_num = trackobj.disc_number;
            tracks = [];
        }
        let track = {};
        track.title = trackobj.name.replace('"', '"');
        track.duration = trackobj.duration_ms;
        let performers = getPerformers(trackobj);

        let artists = [];
        let featured_artists = [];
        $.each(performers, function(index, performer) {
            if ($.inArray('featured', performer[1]) != -1) {
                featured_artists.push(performer[0]);
            } else if ($.inArray('artist', performer[1]) != -1 || $.inArray('Main Artist', performer[1]) != -1) {
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

    return release;
}

function insertErrorMessage(error_data) {
    let mbErrorMsg = $('<p class="musicbrainz_import">')
        .append('<h5>MB import</h5>')
        .append(`<em>Error ${error_data.code}: ${error_data.message}</em>`)
        .append('<p><strong>This probably means that you have to be logged in to Qobuz for the script to work.');
    $('header.TrackListHeader').append(mbErrorMsg);
}

// Insert buttons into the page
function insertLink(release) {
    let edit_note = MBImport.makeEditNote(release.url, 'Spotify'),
        parameters = MBImport.buildFormParameters(release, edit_note),
        $album_form = $(MBImport.buildFormHTML(parameters)),
        search_form = MBImport.buildSearchButton(release);
    let mbUI = $('<p class="musicbrainz_import">')
        .append($album_form, search_form)
        .hide();

    let oldUI = $('p.musicbrainz_import');
    if (oldUI.length) {
        oldUI.replaceWith(mbUI);
    } else {
        $('body').append(mbUI);
    }
    mbUI.slideDown();

    $('form.musicbrainz_import img').css({
        display: 'inline-block',
        width: '16px',
        height: '16px'
    });
    $('p.musicbrainz_import').css({
        'z-index': 1000,
        padding: '5px'
    });
    $('.musicbrainz_import button').css({
        'box-sizing': 'content-box',
        display: 'flex',
        'min-width': '110px',
        'margin-top': '2px'
    });
    $('.musicbrainz_import button span').css({
        width: '100%'
    });
}

const send = XMLHttpRequest.prototype.send;

function sendReplacement(data) {
    /** It seems that the spotify code tweaks the send event,
     *  so hooking to the onreadystatechange event.
     */
    if (this.onreadystatechange) {
        this._onreadystatechange = this.onreadystatechange;
    }
    this.onreadystatechange = onReadyStateChangeReplacement;
    return send.apply(this, arguments);
}

function onReadyStateChangeReplacement() {
    let wsUrl = 'https://api.spotify.com/v1/albums/',
        target = arguments[0].target;
    if (target.responseURL.startsWith(wsUrl) && target.readyState == 4) {
        raw_release_data = JSON.parse(target.responseText);
        if (target.status !== 200) {
            LOGGER.error(raw_release_data);
            insertErrorMessage(raw_release_data);
        } else {
            let release = parseRelease(raw_release_data);
            insertLink(release);
        }
    }

    if (this._onreadystatechange) {
        return this._onreadystatechange.apply(this, arguments);
    }
}

// Hook XMLHttpRequest to use the data fetched from the api by the web-player.
window.XMLHttpRequest.prototype.send = sendReplacement;

$(document).ready(function() {
    MBImportStyle();
});
