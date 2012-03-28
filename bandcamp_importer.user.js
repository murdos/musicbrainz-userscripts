// ==UserScript==
// @name           Import Bandcamp releases into MB
// @version        2011-11-09_01
// @namespace      http://userscripts.org/users/22504
// @include        http://*.bandcamp.com/album/*
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        https://raw.github.com/phstc/jquery-dateFormat/master/jquery.dateFormat-1.0.js
// @require        http://userscripts.org/scripts/source/110844.user.js
// ==/UserScript==

$(document).ready(function(){

    var release = retrieveReleaseInfo();
    insertLink(release);

});

// Analyze Bandcamp data and return a release object
function retrieveReleaseInfo() {
    var release = new Object();
	release.discs = [];

    var bandcampAlbumData = unsafeWindow.TralbumData;

    // Release artist credit
    release.artist_credit = [ { artist_name: bandcampAlbumData.artist } ];

	// Grab release title
	release.title = bandcampAlbumData.current.title;

    // Grab release event information
    var releasedate = bandcampAlbumData.current.release_date;

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

	// Tracks
    var disc = new Object();
    disc.tracks = new Array();
    disc.format = release.format;
    release.discs.push(disc);
    $.each(bandcampAlbumData.trackinfo, function(index, bctrack) {
        var track = {
            'title': bctrack.title,
            'duration': bctrack.durationstr,
            'artist_credit': []
        }
        disc.tracks.push(track);
    });

    mylog(release);
	return release;

}

// Insert links in page
function insertLink(release) {

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

