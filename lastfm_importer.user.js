// ==UserScript==
// @name           Import Last.fm releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from last.fm into MusicBrainz. PLEASE import releases from more reliable sources if possible.
// @version        2018.2.18.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lastfm_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lastfm_importer.user.js
// @include        /^https?:\/\/(?:www\.)?(?:last\.fm|lastfm\.(?:com\.br|com\.tr|at|com|de|es|fr|it|jp|pl|pt|ru|se))\/music\/[^\/]+/[^+][^\/]+/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function() {
    MBImportStyle();
    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    release_url = release_url.replace(
        /^(?:https?:\/\/)?(?:www\.)?(?:last\.fm|lastfm\.(?:com\.br|com\.tr|at|com|de|es|fr|it|jp|pl|pt|ru|se))\//,
        'http://www.last.fm/'
    );

    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
});

function retrieveReleaseInfo(release_url) {
    // Release defaults
    let release = {
        artist_credit: '',
        title: $("h1[itemprop='name']")
            .text()
            .trim(),
        year: 0,
        month: 0,
        day: 0,
        format: '',
        packaging: '',
        country: '',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        discs: []
    };

    // Release artist
    let artist = $("article span[itemprop='byArtist'] meta[itemprop='name']")
        .attr('content')
        .trim();
    let various_artists = artist == 'Various Artists';
    if (various_artists) {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        release.artist_credit = MBImport.makeArtistCredits([artist]);
    }

    // Tracks
    let tracks = [];
    $("#albumTracklist tr[itemprop='tracks']").each(function() {
        let artists = [];
        let trackno = parseInt(
            $(this)
                .find('td.positionCell')
                .text(),
            10
        );
        if (trackno == 1 && tracks.length) {
            // multiple "discs"
            release.discs.push({
                tracks: tracks,
                format: release.format
            });
            tracks = [];
        }
        let trackname = $(this)
            .find("td.subjectCell span[itemprop='name']")
            .text()
            .trim();
        let tracklength = $(this)
            .find('td.durationCell')
            .text()
            .trim();

        // VA releases have an additional link to the lastfm artist page
        let track_artists = [];
        $(this)
            .find('td.subjectCell > a:not(:last)')
            .each(function() {
                track_artists.push(
                    $(this)
                        .text()
                        .trim()
                );
            });
        let ac = {
            artist_credit: '',
            title: trackname,
            duration: tracklength
        };
        if (!track_artists.length && various_artists) {
            ac.artist_credit = [MBImport.specialArtist('unknown')];
        } else {
            ac.artist_credit = MBImport.makeArtistCredits(track_artists);
        }
        tracks.push(ac);
    });

    release.discs.push({
        tracks: tracks,
        format: release.format
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'Last.fm');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    $('div.g4').prepend($(`<div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`).hide());
    $('#mb_buttons').css({
        'margin-bottom': '5px',
        padding: '2%',
        'background-color': '#444'
    });
    $('form.musicbrainz_import').css({ width: '48%', display: 'inline-block' });
    $('form.musicbrainz_import_search').css({ float: 'right' });
    $('form.musicbrainz_import > button').css({ width: '100%', 'box-sizing': 'border-box' });

    $('#mb_buttons').slideDown();
}
