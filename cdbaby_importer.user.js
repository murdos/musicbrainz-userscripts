// ==UserScript==
// @name           Import CD Baby releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from cdbaby.com into MusicBrainz.
// @version        2018.2.18.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/cdbaby_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/cdbaby_importer.user.js
// @include        /^https?:\/\/(?:store\.)?(?:cdbaby\.com)\/cd\/[^\/]+/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

$(document).ready(function () {
    MBImportStyle();
    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    release_url = release_url.replace(/^(?:https?:\/\/)?(?:store\.)?(?:cdbaby\.com)\//, 'http://store.cdbaby.com/');

    let release;
    let buttons = '';
    $('div.album-page-buy-button-container a').each(function () {
        let format = $(this).attr('title').trim();
        release = retrieveReleaseInfo(release_url, format);
        buttons += getImportButton(release, release_url, format);
    });

    if (release) {
        insertImportLinks(release, buttons);
    }
});

function retrieveReleaseInfo(release_url, format) {
    // Release defaults
    let release = {
        artist_credit: '',
        title: $("h1 span[itemprop='name']").text().trim(),
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
        discs: [],
    };

    let link_type = MBImport.URL_TYPES;

    release.urls = [];
    if (format.match(/^vinyl/i)) {
        release.country = 'US';
        release.format = 'Vinyl';
        release.urls.push({
            url: release_url,
            link_type: link_type.purchase_for_mail_order,
        });
    } else if (format.match(/^cd/i)) {
        release.country = 'US';
        release.format = 'CD';
        release.urls.push({
            url: release_url,
            link_type: link_type.purchase_for_mail_order,
        });
    } else if (format.match(/^download/i)) {
        release.country = 'XW';
        release.packaging = 'None';
        release.format = 'Digital Media';
        release.urls.push({
            url: release_url,
            link_type: link_type.purchase_for_download,
        });
    }

    // Release artist
    let artist = $("h2 span[itemprop='byArtist'] a").text().trim();
    let various_artists = artist == 'Various';
    if (various_artists) {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        release.artist_credit = MBImport.makeArtistCredits([artist]);
    }

    release.year = $("span[itemprop='datePublished']").text().trim();

    // Tracks
    let tracks = [];
    let trackcount = 0;
    $("table.track-table tr[itemprop='track']").each(function () {
        let artists = [];
        let trackno = tracks.length + 1;
        if (trackno == 1 && tracks.length) {
            // multiple "discs"
            release.discs.push({
                tracks: tracks,
                format: release.format,
            });
            tracks = [];
        }
        let trackname = $(this).find("meta[itemprop='name']").attr('content').trim();
        let tracklength = $(this).find("meta[itemprop='duration']").attr('content').trim();

        let track_artists = [];
        // FIXME various artists releases ...
        $(this)
            .find('div.track-artist')
            .each(function () {
                let artistname = $(this).text().trim();
                if (artistname) {
                    track_artists.push(artistname);
                }
            });

        let ac = {
            artist_credit: '',
            title: trackname,
            duration: MBImport.ISO8601toMilliSeconds(tracklength),
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
        format: release.format,
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

function getImportButton(release, release_url, format) {
    let edit_note = MBImport.makeEditNote(release_url, 'CD Baby', format);
    let parameters = MBImport.buildFormParameters(release, edit_note);
    return MBImport.buildFormHTML(parameters).replace('<span>Import into MB</span>', `<span>Import ${format}</span>`);
}

function insertImportLinks(release, buttons) {
    $('div.right-container-top-right').prepend($(`<div id="mb_buttons">${buttons}${MBImport.buildSearchButton(release)}</div>`).hide());
    $('#mb_buttons').css({
        'margin-bottom': '5px',
        padding: '2%',
        'background-color': '#fff',
    });

    $('form.musicbrainz_import').css({
        'margin-bottom': '5px',
    });

    $('#mb_buttons').slideDown();
}
