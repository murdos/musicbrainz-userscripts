// ==UserScript==
// @name           Import Juno Download releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from junodownload.com/products pages into MusicBrainz
// @version        2019.2.22.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/juno_download_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/juno_download_importer.user.js
// @include        http*://www.junodownload.com/products/*
// @include        http*://secure.junodownload.com/products/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

$(document).ready(function() {
    MBImportStyle();
    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
});

function parseReleaseDate(rdate) {
    let months = {
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
        December: 12
    };

    let m = rdate.match(/(\d{1,2}) ([a-z]+), (\d{4})/i);
    if (m) {
        return {
            year: m[3],
            month: months[m[2]],
            day: m[1]
        };
    }
    return false;
}

function parseCatNum(input_to_parse) {
    let m = input_to_parse.match(/Cat: (.+? \d+)/i);
    if (m) {
        return {
            cat: m[1],
        };
    }
    
    return false;
}



function retrieveReleaseInfo(release_url) {
    // Release defaults
    let release = {
        artist_credit: [],
        title: $('h2.product-title')
            .text()
            .trim(),
        year: 0,
        month: 0,
        day: 0,
        format: 'Digital Media',
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        discs: []
    };

    // Release date
    let parsed_releaseDate = parseReleaseDate(
        $('span[itemprop="datePublished"]')
            .text()
            .trim()
    );
    if (parsed_releaseDate) {
        release.year = parsed_releaseDate.year;
        release.month = parsed_releaseDate.month;
        release.day = parsed_releaseDate.day;
    }

    // URLs
    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download
    });
  
    let parsed_CatNum = parseCatNum(
        $('#juno-main > div.container-fluid.juno-product > div > div.col-12.col-md-8.order-2.order-1.order-md-2.product-info > div:nth-child(2) > div.col-12.col-lg-9 > div > strong:nth-child(1)').parent()
            .text()
            .trim()
    );

    release.labels.push({
        name: $('h3.product-label')
            .text()
            .trim(),
    });
  
    if (parsed_CatNum) {
      release.labels[0].catno=parsed_CatNum.cat;
    }

    // Tracks
    let tracks = [];
    $(".product-tracklist-track").each(function() {
        let artists = [];
        let trackno =
            $(this)
                .find('.track-title')
                .text()
                .trim() - 1;
        let trackname = $(this)
            .find('.track-title')
            .text()
            .trim()
            .substring(2);
        let tracklength = $(this)
            .find('meta[itemprop="duration"]').parent()
            .text()
            .trim();
        let m = trackname.match(/^([^-]+) - (.*)$/);
        if (m) {
            artists = [m[1]];
            trackname = m[2];
        }
        tracks.push({
            artist_credit: MBImport.makeArtistCredits(artists),
            title: trackname,
            duration: tracklength
        });
    });

    let parsed_release_artist = $('h2.product-artist')
        .text()
        .trim();
    if (parsed_release_artist == 'VARIOUS') {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        release.artist_credit = MBImport.makeArtistCredits([parsed_release_artist]);
    }
    release.discs.push({
        tracks: tracks,
        format: release.format
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'Juno Download');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(`<div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`).hide();

    $('div.product-share').before(mbUI);
    $('#mb_buttons').css({ background: '#759d44', border: '2px solid #ddd', 'text-align': 'center' });
    $('form.musicbrainz_import button').css({ width: '80%' });
    mbUI.slideDown();
}

