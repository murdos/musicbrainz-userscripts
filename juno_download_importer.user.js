// ==UserScript==
// @name           Import Juno Download releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from junodownload.com/products pages into MusicBrainz
// @version        2020.3.19.1
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

$(document).ready(function () {
    MBImportStyle();
    let releaseUrl = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(releaseUrl);
    insertLink(release, releaseUrl);
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
        December: 12,
    };

    let m = rdate.match(/(\d{1,2}) ([a-z]+), (\d{4})/i);
    if (m) {
        return {
            year: m[3],
            month: months[m[2]],
            day: m[1],
        };
    }

    return false;
}

function retrieveReleaseInfo(release_url) {
    let release = {
        artist_credit: [],
        title: $('meta[itemProp="name"]').attr('content').trim(),
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
        discs: [],
    };

    let releaseDate = parseReleaseDate($('span[itemProp="datePublished"]').text().trim());

    if (releaseDate) {
        release.year = releaseDate.year;
        release.month = releaseDate.month;
        release.day = releaseDate.day;
    }

    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download,
    });

    release.labels.push({
        name: $('meta[itemProp="author"]').attr('content').trim(),
        catno: $('strong:contains("Cat:")').parent().contents().slice(2, 3).text().trim(),
    });

    let tracks = [];
    $('.product-tracklist-track[itemprop="track"]').each(function () {
        // element only present if VA release or track has multiple artists
        let artist = $(this).find('meta[itemprop="byArtist"]').attr('content');
        if (artist !== undefined) {
            artist = artist.trim();
        }
        let trackname = $(this).find('span[itemprop="name"]').text().trim();
        let tracklength = $(this).find('meta[itemprop="duration"]').parent().contents().slice(0, 1).text().trim();
        if (artist !== undefined && trackname.startsWith(`${artist} - `)) {
            trackname = trackname.replace(`${artist} - `, '');
        }
        tracks.push({
            artist_credit: MBImport.makeArtistCredits(artist === undefined ? [] : [artist]),
            title: trackname,
            duration: tracklength,
        });
    });

    let releaseArtists = $('.product-artist')
        .contents()
        .map(function () {
            if (this.nodeType === Node.TEXT_NODE) {
                return this.nodeValue === ' / ' ? null : this.nodeValue;
            } else {
                return $(this).text();
            }
        })
        .get();

    if (releaseArtists.length === 1 && releaseArtists[0] === 'VARIOUS') {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        release.artist_credit = MBImport.makeArtistCredits(releaseArtists);
    }

    release.discs.push({
        tracks: tracks,
        format: release.format,
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

function insertLink(release, releaseUrl) {
    let editNote = MBImport.makeEditNote(releaseUrl, 'Juno Download');
    let parameters = MBImport.buildFormParameters(release, editNote);

    let mbUI = $(
        `<div class="col-12 col-lg-9 mt-3"><div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(
            release
        )}</div></div>`
    ).hide();

    $('.product-share').parent().after(mbUI);
    $('#mb_buttons form').css({ display: 'inline', 'margin-right': '5px' });
    mbUI.slideDown();
}
