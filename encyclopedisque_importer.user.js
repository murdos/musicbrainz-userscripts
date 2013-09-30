// ==UserScript==
// @name           Import Encyclopedisque releases to MusicBrainz
// @version        2012.12.13.1
// @namespace      http://userscripts.org/users/22504
// @description    Easily import Encyclopedisque releases into MusicBrainz
// @include        http://www.encyclopedisque.fr/disque/*.html
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// ==/UserScript==

$(document).ready(function() {

    var release = parseEncyclopedisquePage();
    setupUI(release);

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

    // Release country
    release.country = 'FR'; // France - correct in most case, but not all

    // Other hard-coded info
    release.status = 'official';
    release.language = 'fra';
    release.script = 'Latn';

    var disc = {'position': 1, 'tracks': [] };
    disc.format = '7" Vinyl'; // Disque vinyl 7"
    release.discs = [ disc ];

    // Parse other infos
    var releaseInfos = document.body.querySelectorAll("div.pochetteprincipale ~ div tr");
    for (var i = 0; i < releaseInfos.length; i++) {
        var infoType = releaseInfos[i].querySelector("td:nth-of-type(1)").textContent.trim();

        // Release date
        if (infoType == "Sortie :") {
            var infoValue = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim();
            var re = /\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*([\d\?]{4})?\s*(?:chez)?\s*((?:\S+\s?)*)\s*\(?([^\)]*)?\)?/;
            console.log(infoValue);
            console.log(infoValue.match(re));
            //if (m = infoValue.match(re) != null) {
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
            release.labels = [ ];
            var labels = m[3];
            if (labels != undefined) {
                $.each(labels.split("/"), function(index, label) {
                    release.labels.push({ 'name': label.trim(), 'catno': m[4] });
                });
            } else {
                release.labels.push({ 'catno': m[4] });
            }
            //}
        }
        // Tracks
        else if (infoType.match(/^Face [AB]/)) {
            var title = releaseInfos[i].querySelector("td:nth-of-type(2) strong").textContent.trim();
            var track = new Object();
            track.title = title; //.replace("(avec ", "(feat. ");
            disc.tracks.push(track);
        }

    }

    // Guessing release type (EP, single) from number of tracks
    release.type = (disc.tracks.length > 3) ? 'ep' : 'single';

    return release;
}

