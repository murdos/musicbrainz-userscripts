// ==UserScript==
// @name		Import Metal Archives releases into MB
// @namespace	https://github.com/murdos/musicbrainz-userscripts/
// @version		2015.08.25.1
// @description	Add a button on Metal Archives release pages allowing to open MusicBrainz release editor with pre-filled data for the selected release
// @downloadURL	https://raw.github.com/murdos/musicbrainz-userscripts/master/metalarchives_importer.user.js
// @update		https://raw.github.com/murdos/musicbrainz-userscripts/master/metalarchives_importer.user.js
// @include		http://www.metal-archives.com/albums/*/*/*
// @require		https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require		lib/mbimport.js
// @require		lib/logger.js
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
/*this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;
*/
$(document).ready(function() {
    var release = retrieveReleaseInfo();
    insertLink(release);
    LOGGER.info("Parsed release: ", release);
});

function setreleasedate(release, datestring) {
    var patt = new RegExp('^d{4}$');
    if (patt.exec(datestring)) {
        release.year = datestring;
    } else if (datestring.indexOf(',') != -1) {
        var commaindex = datestring.indexOf(',');
        var d = new Date(datestring.substring(0, commaindex - 2) + datestring.substring(commaindex));
        release.year = d.getFullYear();
        release.month = d.getMonth() + 1;
        release.day = d.getDate();
    } else {
        var d = new Date("2 " + datestring);
        release.year = d.getFullYear();
        release.month = d.getMonth() + 1;
    }
    return release;
}

function getGenericalData() {
    var rdata = new Array();
    var keydata = $('dl.float_left dt, dl.float_right dt').map(function() {
        var s = $.trim($(this).text());
        return s.substring(0, s.length - 1);
    }).get();
    var valuedata = $('dl.float_left dd,dl.float_right dd').map(function() {
        return $.trim($(this).text());
    }).get();
    for (i = 0; i < keydata.length; i++) {
        rdata[keydata[i]] = valuedata[i];
    }
    return rdata;
}

function getArtistsList() {
    var artists = $('h2.band_name').text().split('/');
    for (var i = 0; i < artists.length; i++) {
        artists[i] = $.trim(artists[i]);
    }
    return artists;
}

function retrieveReleaseInfo() {
    var release = new Object();
    release.artist_credit = new Array();
	var rdata = getGenericalData();
	var artists=getArtistsList();
    if(rdata["Type"]=="Split"){
		var joinphrasesplit="/";
	}
	for(var i=0;i<artists.length;i++){
		release.artist_credit.push({
			artist_name:  artists[i],
			credited_name:  artists[i],
			joinphrase:(typeof joinphrasesplit != 'undefined' && i !=artists.length - 1)?joinphrasesplit:""
		});
	}
    release.title = $('h1.album_name').text();

   

    release = setreleasedate(release, rdata["Release date"]);
    //todo add case for multiple labels if such a case exist
    release.labels = new Array();
    release.labels.push({
        name: (rdata["Label"] == "Independent" ? "[no label]" : rdata["Label"]),
        catno: (rdata["Catalog ID"] == "N/A" ? "" : rdata["Catalog ID"])
    });

    release.type = ReleaseTypes[rdata["Type"]][0];
    release.secondary_types = new Array(ReleaseTypes[rdata["Type"]][1]);
    release.status = 'official';

    rdata.hasOwnProperty("Version desc.") && rdata["Version desc."].indexOf("Digipak") != -1 ? release.packaging = "Digipak" : release.packaging = "";

    var identifiers = $("#album_tabs_notes > div:nth-child(2)").find("p:not([class])").contents();
    for (var j = 0; j < identifiers.length; j++) {
        if (identifiers[j].textContent.indexOf("Barcode:") != -1) {
            release.barcode = $.trim(identifiers[j].textContent.substring(8));
            break;
        }
    }

    // Release URL
    // URLs
    var link_type = MBImport.URL_TYPES;
    release.urls = new Array();
    release.urls.push({
        url: window.location.href,
        link_type: link_type.other_databases
    });

    var releaseNumber = 1;
    release.discs = new Array();
    release.discs.push(new Object());
    release.discs[releaseNumber - 1].tracks = new Array();
    release.discs[releaseNumber - 1].format = ReleaseFormat[rdata["Format"]];
    var tracksline = $('table.table_lyrics tr.even,table.table_lyrics tr.odd');
    var trackslinelength = tracksline.length;

    tracksline.each(function(index, element) {
        var trackNumber = $.trim(element.children[0].textContent).replace('.', "");
        if (trackNumber == "1" && trackNumber != index + 1) {
            releaseNumber++;
            release.discs.push(new Object());
            release.discs[releaseNumber - 1].tracks = new Array();
            release.discs[releaseNumber - 1].format = ReleaseFormat[rdata["Format"]];
        }

        var track = {
            'number': trackNumber,
            'title': element.children[1].textContent,
            'duration': element.children[2].textContent,
            'artist_credit': [release.artist_credit]
        };
        release.discs[releaseNumber - 1].tracks.push(track);
    });
    return release;
}

// Insert links in page
function insertLink(release) {

    var edit_note = 'Imported from ' + window.location.href;
    var parameters = MBImport.buildFormParameters(release, edit_note);
    var innerHTML = MBImport.buildFormHTML(parameters);

    $('h2.band_name').after(innerHTML);
    $("form[action='//musicbrainz.org/release/add']").css("padding", "initial");

}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Metal Archives -> MusicBrainz mapping                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/* 
release.type 	primary type release 	secondary release type 
on MA				on MB 	

Full-length 		Album				Compilation		                  
Live album			Single				Demo
Demo				EP					DJ-mix
Single				Broadcast			Interview
EP					Other				Live
Video									Audiobook
Boxed set								Mixtape/Street
Split									Remix
Video/VHS (legacy)						Soundtrack
Compilation								Spokenword
Split video
*/
//ReleaseTypes[MAtype]=["primary type","secondary type on mb"];
var ReleaseTypes = new Array();
ReleaseTypes["Full-length"] = ["Album"];
ReleaseTypes["Live album"] = ["Album", "Live"];
ReleaseTypes["Demo"] = ["Album", "Demo"];
ReleaseTypes["Single"] = ["Single"];
ReleaseTypes["EP"] = ["EP"];
ReleaseTypes["Compilation"] = ["Album", "Compilation"];
ReleaseTypes["Split"] = ["Album"];
ReleaseTypes["Collaboration"] = [""];
//ReleaseFormat[MAformat]="MBformat";
var ReleaseFormat = new Array();
ReleaseFormat["CD"] = "CD";
ReleaseFormat["2CD"] = "CD";
ReleaseFormat["Vinyl"] = "Vinyl";
ReleaseFormat["7\" vinyl"] = "7\" Vinyl";
ReleaseFormat["7\" vinyl (33⅓ RPM)"] = "7\" Vinyl";
ReleaseFormat["10\" vinyl (33⅓ RPM)"] = "10\" Vinyl";
ReleaseFormat["10\" vinyl"] = "10\" Vinyl";
ReleaseFormat["12\" vinyl"] = "12\" Vinyl";
ReleaseFormat["2 12\" vinyls"] = "12\" Vinyl";
ReleaseFormat["12\" vinyl (33⅓ RPM)"] = "12\" Vinyl";
ReleaseFormat["Cassette"] = "Cassette";
ReleaseFormat["Digital"] = "Digital Media";