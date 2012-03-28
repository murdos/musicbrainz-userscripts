// ==UserScript==
// @name           Import Encyclopedisque releases to MusicBrainz
// @namespace      http://userscripts.org/users/22504
// @description    Easily import Encyclopedisque releases into MusicBrainz
// @include        http://www.encyclopedisque.fr/disque/*.html
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// ==/UserScript==

// Script Update Checker

var SUC_script_num = 82627; // Change this to the number given to the script by userscripts.org (check the address bar)

try{function updateCheck(forced){if ((forced) || (parseInt(GM_getValue('SUC_last_update', '0')) + 86400000 <= (new Date().getTime()))){try{GM_xmlhttpRequest({method: 'GET',url: 'http://userscripts.org/scripts/source/'+SUC_script_num+'.meta.js?'+new Date().getTime(),headers: {'Cache-Control': 'no-cache'},onload: function(resp){var local_version, remote_version, rt, script_name;rt=resp.responseText;GM_setValue('SUC_last_update', new Date().getTime()+'');remote_version=parseInt(/@uso:version\s*(.*?)\s*$/m.exec(rt)[1]);local_version=parseInt(GM_getValue('SUC_current_version', '-1'));if(local_version!=-1){script_name = (/@name\s*(.*?)\s*$/m.exec(rt))[1];GM_setValue('SUC_target_script_name', script_name);if (remote_version > local_version){if(confirm('There is an update available for the Greasemonkey script "'+script_name+'."\nWould you like to go to the install page now?')){GM_openInTab('http://userscripts.org/scripts/show/'+SUC_script_num);GM_setValue('SUC_current_version', remote_version);}}else if (forced)alert('No update is available for "'+script_name+'."');}else GM_setValue('SUC_current_version', remote_version+'');}});}catch (err){if (forced)alert('An error occurred while checking for updates:\n'+err);}}}GM_registerMenuCommand(GM_getValue('SUC_target_script_name', '???') + ' - Manual Update Check', function(){updateCheck(true);});updateCheck(false);}catch(err){}


$(document).ready(function() {

	var release = parseEncyclopedisquePage();
	var url = cookImportUrl(release);
	
	var importLink = $("<li><a href=\""+ url +"\">Import in Musicbrainz</a></li>");
	importLink.appendTo("#menu ul");

});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                             Encyclopedisque functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// Analyze Encyclopedisque data and prepare to release object
function parseEncyclopedisquePage() {

	release = new Object();
	
	var infoHeader =  document.body.querySelector("#contenu > h2:nth-of-type(1)");
	
	release.artist = infoHeader.querySelector("div.floatright:nth-of-type(1)").textContent.trim().replace("’", "'");
	release.title = infoHeader.querySelector("span:nth-of-type(1)").textContent.trim().replace("’", "'");
	release.format = 7; // Disque vinyl
	release.country = 73; // France - correct in most case, but not all
	release.tracks = [];
	//console.log(release.artist + ": " + release.title);

	// Parse other infos
	var releaseInfos = document.body.querySelectorAll("div.pochetteprincipale ~ div tr");
	for (var i = 0; i < releaseInfos.length; i++) {
		var infoType = releaseInfos[i].querySelector("td:nth-of-type(1)").textContent.trim();
		
		// Release event
		if (infoType == "Sortie :") {
			var infoValue = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim();
			var re = /\s*([\d\?]{4})?\s*(?:chez)?\s*((?:\S+\s?)*)\s*\(?([^\)]*)?\)?/;
			//console.log(infoValue);
			//console.log(infoValue.match(re));
			//if (m = infoValue.match(re) != null) {
			m = infoValue.match(re);	
			release.year = m[1];
			var label = m[2];
			if (label != undefined) release.label = label.trim();
			release.catno = m[3];
			//}
		} 
		// Tracks
		else if (infoType.match(/^Face [AB]/)) {
			var title = releaseInfos[i].querySelector("td:nth-of-type(2) strong").textContent.trim();
			var track = new Object();
			track.title = title.replace("’", "'");
			track.title = title.replace("(avec ", "(feat. ");
			release.tracks.push(track);
			//console.log("Track: " + track.title);
		}
		
	}

	return release;
}

// Helper function: compute url for a release object
function cookImportUrl(release) {

	var importURL = "http://musicbrainz.org/cdi/enter.html?artistname=" + encodeURIComponent(release.artist) + "&releasename=" + encodeURIComponent(release.title);

	// Multiple artists on tracks?
	var artists = [];
	for (var i=0; i < release.tracks.length; i++) {
		if (release.tracks[i].artist)
			artists.push(release.tracks[i].artist);
	}
	
	if (artists.length > 1)
		importURL += "&hasmultipletrackartists=1&artistid=1";
	else 
		importURL += "&hasmultipletrackartists=0";
		
	// Add tracks
	for (var i=0; i < release.tracks.length; i++) {
	
		importURL += "&track" + i + "=" + encodeURIComponent(release.tracks[i].title);

        var tracklength = (typeof release.tracks[i].duration != 'undefined' && release.tracks[i].duration != '') ? release.tracks[i].duration : "?:??";

		importURL += "&tracklength" + i + 	"=" + encodeURIComponent(tracklength);

	
        // TODO: ??

        importURL += '&trackseq' + i + "=" + (i + 1);

        importURL += '&tr' + i + '_mp=0';

		if (artists.length > 1 && release.tracks[i].artist) {
			importURL += "&tr" + i + "_artistedit=1";
			importURL += "&tr" + i + "_artistname=" + encodeURIComponent(release.tracks[i].artist);
		}
	}
	importURL += '&tracks=' + release.tracks.length;
	
    importURL += '&submitvalue=Keep+editing'; // Needed to allow RE imports

    // Release event

    if (typeof release.catno != 'undefined' && release.catno != "none") {

        importURL += '&rev_catno-0=' + release.catno;

    }



    importURL += '&rev_labelname-0=' + encodeURIComponent(release.label);

    importURL += '&rev_format-0=' + release.format;

    if (!isNaN(release.year)) { importURL += '&rev_year-0=' + release.year; }

    if (!isNaN(release.month)) { importURL += '&rev_month-0=' + release.month; }

    if (!isNaN(release.day)) { importURL += '&rev_day-0=' + release.day; }

    importURL += '&rev_country-0=' + release.country;

    importURL += '&attr_type=2';        // Release type = single
    importURL += '&attr_status=100';    // Release status = official
    importURL += '&attr_language=134';  // Release lang = French
    importURL += '&attr_script=28';     // Release script = Latin

    importURL += '&notetext=' + encodeURIComponent(window.location.href);
    
	return importURL;
}
