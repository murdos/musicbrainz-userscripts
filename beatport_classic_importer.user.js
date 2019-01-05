// ==UserScript==
// @name           Import Beatport Classic releases to MusicBrainz
// @description    One-click importing of releases from classic.beatport.com/release pages into MusicBrainz
// @version        2018.2.18.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_classic_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_classic_importer.user.js
// @include        http*://classic.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function() {
    MBImportStyle();

    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
});

function retrieveReleaseInfo(release_url) {
    function contains_or(selector, list) {
        selectors = [];
        $.each(list, function(ind, value) {
            selectors.push(`${selector}:contains("${value.replace('"', '\\"')}")`);
        });
        return selectors.join(',');
    }
    let release_date_strings = [
        'Release Date',
        'Fecha de lanzamiento',
        'Date de sortie',
        'Erscheinungsdatum',
        'Data de lançamento',
        'Releasedatum',
        'Data di uscita',
        'リリース予定日'
    ];
    let labels_strings = ['Labels', 'Sello', 'Gravadoras', 'Label', 'Etichetta', 'Editora', 'レーベル'];
    let catalog_strings = ['Catalog', 'Catálogo', 'Catalogue', 'Katalog', 'Catalogus', 'Catalogo', 'カタログ'];
    let release = {};

    // Release information global to all Beatport releases
    release.packaging = 'None';
    release.country = 'XW';
    release.status = 'official';
    release.urls = [];
    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download
    });

    let releaseDate = $(contains_or('td.meta-data-label', release_date_strings))
        .next()
        .text()
        .split('-');
    release.year = releaseDate[0];
    release.month = releaseDate[1];
    release.day = releaseDate[2];

    release.labels = [];
    release.labels.push({
        name: $(contains_or('td.meta-data-label', labels_strings))
            .next()
            .text(),
        catno: $(contains_or('td.meta-data-label', catalog_strings))
            .next()
            .text()
    });

    let release_artists = [];

    // Tracks
    let tracks = [];
    unsafeWindow.$('span[data-json]').each(function(index, tagSoup) {
        let t = $.parseJSON($(tagSoup).attr('data-json'));
        release.title = t.release.name;

        let artists = [];
        t.artists.forEach(function(artist) {
            artists.push(artist.name);
            release_artists.push(artist.name);
        });
        let title = t.name;
        if (t.mixName && t.mixName !== 'Original Mix' && t.mixName !== 'Original') {
            title += ` (${t.mixName})`;
        }
        tracks.push({
            artist_credit: MBImport.makeArtistCredits(artists),
            title: title,
            duration: t.lengthMs
        });
    });

    let unique_artists = [];
    $.each(release_artists, function(i, el) {
        if ($.inArray(el, unique_artists) === -1) {
            unique_artists.push(el);
        }
    });

    if (unique_artists.length > 4) {
        release.artist_credit = [MBImport.specialArtist('various_artists')];
    } else {
        release.artist_credit = MBImport.makeArtistCredits(unique_artists);
    }
    release.discs = [];
    release.discs.push({
        tracks: tracks,
        format: 'Digital Media'
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'Beatport Classic');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(
        `<div class="musicbrainz-import">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`
    ).hide();

    $('.release-detail-metadata').append(mbUI);
    $('form.musicbrainz_import').css({ display: 'inline-block', margin: '1px' });
    $('form.musicbrainz_import img').css({ display: 'inline-block' });
    mbUI.slideDown();
}
