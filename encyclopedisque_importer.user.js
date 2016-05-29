// ==UserScript==
// @name           Import Encyclopedisque releases to MusicBrainz
// @version        2016.05.29.0
// @namespace      http://userscripts.org/users/22504
// @description    Easily import Encyclopedisque releases into MusicBrainz
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/encyclopedisque_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/encyclopedisque_importer.user.js
// @include        http://www.encyclopedisque.fr/disque/*.html
// @include        http://www.encyclopedisque.fr/artiste/*.html
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/mblinks.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

var mblinks = new MBLinks('ENCYLOPEDISQUE_MBLINKS_CACHE');

$(document).ready(function() {
    MBImportStyle();

    if (window.location.href.match(/encyclopedisque\.fr\/disque\/(\d+)/)) {
        var release = parseEncyclopedisquePage();
        setupImportUI(release);
    }

    insertMBLinks();
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                             Encyclopedisque functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function setupImportUI(release) {

    // Form parameters
    var edit_note = MBImport.makeEditNote(window.location.href, 'Encyclopedisque');
    var parameters = MBImport.buildFormParameters(release, edit_note);

    // Build form
    var mbUI = $(MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release)).hide();
    $('#recherchebox').append(mbUI);
    $('form.musicbrainz_import button').css({width: '100%'});
    mbUI.slideDown();
}

function insertMBLinks() {

    var current_url = window.location.href;
    if (current_url.match(/\/disque\//)) {
        mblinks.searchAndDisplayMbLink(current_url, 'release', function (link) { $('h2 span').before(link); } );
    } else if (current_url.match(/\/artiste\//)) {
        mblinks.searchAndDisplayMbLink(current_url, 'artist', function (link) { $('h2').prepend(link); } );
    }

    $('div.v7P, div.v12P').find('a[href*="/disque/"]').each(function() {
        var $link = $(this);
        var external_url = window.location.origin + $link.attr('href');
        mblinks.searchAndDisplayMbLink(external_url, 'release', function (link) { $link.after(link).after('<br />') } );
    });

    $('h2, div.main').find('a[href*="/artiste/"]').each(function() {
        var $link = $(this);
        var external_url = window.location.origin + $link.attr('href');
        mblinks.searchAndDisplayMbLink(external_url, 'artist', function (link) { $link.before(link); } );
    });

}

// Analyze Encyclopedisque data and prepare to release object
function parseEncyclopedisquePage() {

    release = new Object();

    var infoHeader =  document.body.querySelector("#contenu > h2:nth-of-type(1)");

    // Release artist credit
    release.artist_credit = new Array();
    var artist_name = infoHeader.querySelector("div.floatright:nth-of-type(1)").textContent.trim();
    release.artist_credit.push( { 'artist_name': artist_name } );

    // Release title
    release.title = infoHeader.querySelector("span:nth-of-type(1)").textContent.trim();

    // Default status is official, will change if "tirage promo" is found (see below)
    release.status = 'official';

    // Other hard-coded info
    release.language = 'fra';
    release.script = 'Latn';

    var disc = {'position': 1, 'tracks': [] };
    release.discs = [ disc ];

    // Release URL
    release.urls = new Array();
    release.urls.push( { 'url': window.location.href, 'link_type': MBImport.URL_TYPES.other_databases } );

    // Parse other infos
    var releaseInfos = document.body.querySelectorAll("div.main tr");
    var lastVinylFace = '';
    var lastInfoType;
    for (var i = 0; i < releaseInfos.length; i++) {
        var infoType = releaseInfos[i].querySelector("td:nth-of-type(1)").textContent.trim();

        // Release date
        if (infoType == "Sortie :") {
            var infoValue = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim();
            var re = /\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*([\d\?]{4})?\s*(?:chez)?\s*((?:\S+\s?)*)\s*\(?([^\)]*)?\)?/;
            m = infoValue.match(re);
            month = m[1];
            if (month != undefined) {
                switch (month)
                {
                    case "janvier":     release.month = 1; break;
                    case "février":     release.month = 2; break;
                    case "mars":        release.month = 3; break;
                    case "avril":       release.month = 4; break;
                    case "mai":         release.month = 5; break;
                    case "juin":        release.month = 6; break;
                    case "juillet":     release.month = 7; break;
                    case "août":        release.month = 8; break;
                    case "septembre":   release.month = 9; break;
                    case "octobre":     release.month = 10; break;
                    case "novembre":    release.month = 11; break;
                    case "décembre":    release.month = 12; break;
                }
            }
            release.year = m[2];
            release.labels = [];
            var labels = m[3];
            if (labels != undefined) {
                $.each(labels.split("/"), function(index, label) {
                    release.labels.push({ 'name': label.trim(), 'catno': m[4] });
                });
            } else {
                release.labels.push({ 'catno': m[4] });
            }
        } else if (infoType.match(/^Face [A-Z]/) || (infoType == '' && lastInfoType.match(/^Face [A-Z]/))) {
            // Tracks
            var track = new Object();

            // First part of tracknumber (A, B, ...)
            var tnum_part1 = '';
            if (m = infoType.match(/^Face ([A-Z])/)) {
                lastVinylFace = m[1];
                tnum_part1 = m[1];
            } else {
                tnum_part1 = lastVinylFace;
            }

            // Track title
            if (releaseInfos[i].querySelector("td:nth-of-type(2) em") == null) {
                continue;
            }
            var title = releaseInfos[i].querySelector("td:nth-of-type(2) em").textContent.trim();

            // 2nd part of tracknumber (1, 2, ...)
            var tnum_part2 = '';
            if (m = infoType.match(/^Face [A-Z](\d+)/)) {
                tnum_part2 = m[1];
            } else if (m = title.match(/^(\d+)\.\s+(.*)$/)) {
                tnum_part2 = m[1];
                title = m[2];
            }

            // Track length
            if (m = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim().match(/- (\d+)’(\d+)$/)) {
                track.duration = m[1] + ':' + m[2];
            }

            track.number = tnum_part1 + tnum_part2;
            track.title = title;
            disc.tracks.push(track);
        } else if (infoType == "Format :") {
            // Format => medium format, release-group type, release status
            var infoValue = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim();
            var values = infoValue.split(" / ");
            values.forEach(function(value) {
                if (value.indexOf('45 tours') > -1) { disc.format = '7" Vinyl'; }
                if (value.indexOf('33 tours') > -1) { disc.format = '12" Vinyl'; }
                if (value.indexOf('LP') > -1) { release.type = 'album'; }
                if (value.indexOf('EP') > -1) { release.type = 'ep'; }
                if (value.indexOf('SP') > -1) { release.type = 'single'; }
                if (value.indexOf('tirage promo') > -1) { release.status = 'promotion'; }
            });
        } else if (infoType == "Pays :") {
            // Country
            var infoValue = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim();
            if (infoValue == 'France') {
                release.country = 'FR';
            } else if (infoValue == 'Royaume-uni') {
                release.country = 'UK';
            } else if (infoValue == 'Allemagne') {
                release.country = 'DE';
            } else if (infoValue == 'Belgique') {
                release.country = 'BE';
            }
        }

        if (infoType != '') {
            lastInfoType = infoType;
        }
    }

    // Barcode ?
    if (parseInt(release.year, 10) <= 1982) {
        // FIXME: not working
        release.no_barcode = '1';
    }

    LOGGER.info("Parsed release: ", release);

    return release;
}
