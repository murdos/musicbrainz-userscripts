// ==UserScript==
// @name           Import Encyclopedisque releases to MusicBrainz
// @version        2014.02.22.1
// @namespace      http://userscripts.org/users/22504
// @description    Easily import Encyclopedisque releases into MusicBrainz
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/encyclopedisque_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/encyclopedisque_importer.user.js
// @include        http://www.encyclopedisque.fr/disque/*.html
// @include        http://www.encyclopedisque.fr/artiste/*.html
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// ==/UserScript==

$(document).ready(function() {

    if (window.location.href.match( /encyclopedisque\.fr\/disque\/(\d+)/) ) {
        var release = parseEncyclopedisquePage();
        setupUI(release);
    }

    insertMBLinks();

});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                             Encyclopedisque functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function setupUI(release) {

    // Form parameters
    var edit_note = 'Imported from ' + window.location.href;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    // Build form
    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);

    // Append search link
    innerHTML += ' <small>(' + MBReleaseImportHelper.buildSearchLink(release) + ')</small>';

    var importLink = $("<li>"+ innerHTML + "</li>");
    importLink.appendTo("#menu ul");

}

function insertMBLinks($root) {

    // Check if we already added links for this content
    var CACHE_STRING = localStorage.getItem('ENCYCLOPEDISQUE_MB_MAPPING_CACHE');
    if(!CACHE_STRING) {
        CACHE_STRING = "{}";
    }
    var CACHE = JSON.parse(CACHE_STRING);

    var ajax_requests = [];

    setInterval(function() {
        if(ajax_requests.length > 0) {
            var request = ajax_requests.shift();
            if(typeof request === "function") {
                request();
            }
        }
    }, 1000);

    function createLink(mb_url) {
        return '<a href="'+mb_url+'"><img src="http://musicbrainz.org/favicon.ico" /></a> ';
    }

    function searchAndDisplayMbLink($div) {
        $div.find('a[href*="/disque/"]').each(function() {
            var $link = $(this);
            var external_url = 'http://www.encyclopedisque.fr' + $link.attr('href');

            if(CACHE[external_url]) {
                $.each(CACHE[external_url], function(index, mb_url) {
                    $link.after(createLink(mb_url)).after('<br />');
                });
            } else {
                ajax_requests.push($.proxy(function() {
                    var context = this;
                    $.getJSON('http://musicbrainz.org/ws/2/url?resource='+context.external_url+'&inc=release-rels', function(data) {
                        if ('relations' in data) {
                            CACHE[context.external_url] = [];
                            $.each(data['relations'], function(idx, relation) {
                                if ('release'.replace('-', '_') in relation) {
                                    var mb_url = 'http://musicbrainz.org/release/' + relation['release']['id'];
                                    CACHE[context.external_url].push(mb_url);
                                    localStorage.setItem('ENCYCLOPEDISQUE_MB_MAPPING_CACHE', JSON.stringify(CACHE));
                                    context.$link.after(createLink(mb_url)).after('<br />');
                                }
                            });
                        }
                    });
                }, {'external_url': external_url, '$link': $link}));
            }
        });
    }

    if (!$root) {
        $root = $('body');
    }

    $root.find('div.v7P').each(function() {
        searchAndDisplayMbLink($(this));
    });

    $root.find('div.v12P').each(function() {
        searchAndDisplayMbLink($(this));
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
    release.urls.push( { 'url': window.location.href, 'link_type': 82 } );

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
                if (value.contains('45 tours')) { disc.format = '7" Vinyl'; }
                if (value.contains('33 tours')) { disc.format = '12" Vinyl'; }
                if (value.contains('LP')) { release.type = 'album'; }
                if (value.contains('EP')) { release.type = 'ep'; }
                if (value.contains('SP')) { release.type = 'single'; }
                if (value.contains('tirage promo')) { release.status = 'promotion'; }
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
    if (parseInt(release.year) <= 1982) {
        // FIXME: not working
        release.no_barcode = '1';
    }

    console.log(release);

    return release;
}

