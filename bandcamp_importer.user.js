// ==UserScript==
// @name           Import Bandcamp releases into MB
// @version        2013.03.04.1
// @namespace      http://userscripts.org/users/22504
// @include        http*://*.bandcamp.com/album/*
// @include        http*://*.bandcamp.com/track/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        https://raw.github.com/phstc/jquery-dateFormat/master/src/jquery.dateFormat.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// ==/UserScript==

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

    var release = retrieveReleaseInfo();
    insertLink(release);

});

// Analyze Bandcamp data and return a release object
function retrieveReleaseInfo() {
    var release = new Object();
	release.discs = [];

    var bandcampAlbumData = unsafeWindow.TralbumData;
	 var bandcampEmbedData = unsafeWindow.EmbedData;

    // Release artist credit
    release.artist_credit = [ { artist_name: bandcampAlbumData.artist } ];

	// Grab release title
	release.title = bandcampAlbumData.current.title;

    // Grab release event information
    var releasedate = bandcampAlbumData.current.release_date;

	 if(bandcampEmbedData.album_title) {
		 release.parent_album = bandcampEmbedData.album_title;
    }

    if (typeof releasedate != "undefined" && releasedate != "") {
        release.year = $.format.date(releasedate, "yyyy");
        release.month = $.format.date(releasedate, "MM");
        release.day = $.format.date(releasedate, "dd");
    }

    release.labels = new Array();
    release.format = "Digital Media";
    release.country = "XW"; // Worldwide
    // FIXME: implement a mapping between bandcamp release types and MB ones
    release.type = bandcampAlbumData.current.type;
    release.status = 'official';

	 // map Bandcamp single tracks to singles
	 if(release.type == "track")
	 { release.type = "single"; }

	// Tracks
    var disc = new Object();
    disc.tracks = new Array();
    disc.format = release.format;
    release.discs.push(disc);
    $.each(bandcampAlbumData.trackinfo, function(index, bctrack) {
        var track = {
            'title': bctrack.title,
            'duration': Math.round(bctrack.duration*1000),
            'artist_credit': []
        }
        disc.tracks.push(track);
    });

    mylog(release);
	return release;

}

// Insert links in page
function insertLink(release) {

	if(release.type == "single" && typeof release.parent_album != "undefined") {
		mylog("This is part of an album, not continuing.");
		return false;
	}

    /*
	var mbUI = document.createElement('div');
    mbUI.innerHTML = "<h3>MusicBrainz</h3>";
	mbUI.className = "section";


	var mbContentBlock = document.createElement('div');
    mbContentBlock.className = "section_content";
    mbUI.appendChild(mbContentBlock);
    */

    // Form parameters
    var edit_note = 'Imported from ' + window.location.href;
	var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

	// Build form
	var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);
    // Append search link
	//innerHTML += ' <small>(' + MBReleaseImportHelper.buildSearchLink(release) + ')</small>';

    $('h2.trackTitle').append(innerHTML);

}

function mylog(obj) {
    var DEBUG = true;
    if (DEBUG && unsafeWindow.console) {
        unsafeWindow.console.log(obj);
    }
}

