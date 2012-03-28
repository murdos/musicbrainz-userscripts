// ==UserScript==
// @name           Import Discogs releases to MusicBrainz
// @namespace      http://userscripts.org/users/22504
// @include        http://*.discogs.com/release/*
// ==/UserScript==

// Script Update Checker
// -- http://userscripts.org/scripts/show/20145
var version_scriptNum = 36376; // Change this to the number given to the script by userscripts.org (check the address bar)
var version_timestamp = 1225754772016; // Used to differentiate one version of the script from an older one. Use the Date.getTime() function to get a value for this.
try {
function updateCheck(forced) {if((forced)||(parseInt(GM_getValue("lastUpdate", "0")) + 86400000 <= (new Date().getTime()))) {try {GM_xmlhttpRequest({method: "GET",url: "http://userscripts.org/scripts/review/" + version_scriptNum + "?" + new Date().getTime(),headers: {'Cache-Control': 'no-cache'},onload: function(xhrResponse) {GM_setValue("lastUpdate", new Date().getTime() + ""); var rt = xhrResponse.responseText.replace(/&nbsp;?/gm, " ").replace(/<li>/gm, "\n").replace(/<[^>]*>/gm, ""); var scriptName = (/@name\s*(.*?)\s*$/m.exec(rt))[1]; GM_setValue("targetScriptName", scriptName); if (parseInt(/version_timestamp\s*=\s*([0-9]+)/.exec(rt)[1]) > version_timestamp) {if (confirm("There is an update available for the Greasemonkey script \"" + scriptName + ".\"\nWould you like to go to the install page now?")) {GM_openInTab("http://userscripts.org/scripts/show/" + version_scriptNum);}} else if (forced) {alert("No update is available for \"" + scriptName + ".\"");}}});} catch (err) {if (forced) {alert("An error occurred while checking for updates:\n" + err);}}}} GM_registerMenuCommand(GM_getValue("targetScriptName", "???") + " - Manual Update Check", function() {updateCheck(true);}); updateCheck(false);
} catch(e) {}

// Discogs API KEY (you may need to add yours if you encounter limit issues)
var discogsApiKey = "84b3bec008";

// Discogs Webservice URL
var discogsWsUrl = window.location.href + "?f=xml&api_key=" + discogsApiKey;

// Grabs information from Discogs

GM_xmlhttpRequest({
  method:"GET",
  url:discogsWsUrl,
  headers:{
    "User-Agent":"monkeyagent",
    "Accept":"text/monkey,text/xml",
    },
  onload:function(response) {
  	var xmldoc = new DOMParser().parseFromString(response.responseText,"text/xml");
	var releases = parseReleases(xmldoc);
	insertLinks(releases);
  }
});
/*
var xmlhttp = new XMLHttpRequest();
xmlhttp.onreadystatechange = function() { var releases = parseReleases(xmlhttp.responseXML); insertLinks(releases);};
xmlhttp.open("GET", url, true);
xmlhttp.send(null);
*/

// Analyze Discogs data and cook  the import URL
function parseReleases(xmldoc) {
	var releases = [];

	var xpathExpr, resultNodes;
	
	// Compute artist(s) name(s)
	var releaseArtist = "";
	xpathExpr = "//release/artists/artist/*[name()='name' or name()='join']";
	resultNodes = xmldoc.evaluate(xpathExpr, xmldoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	releaseArtist = cookArtistName(resultNodes);

	// Grab release title
	var releaseTitle;
	xpathExpr = "//release/title";
	releaseTitle = xmldoc.evaluate(xpathExpr, xmldoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.textContent;

	// Grab tracks
	var tracks = [];
	xpathExpr = "//tracklist/track";
	resultNodes = xmldoc.evaluate(xpathExpr, xmldoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	
	for (var i = 0; i < resultNodes.snapshotLength; i++) {
		var track = new Object();
		var trackNode = resultNodes.snapshotItem(i);

		track.title = trackNode.getElementsByTagName("title").item(0).textContent;
		track.duration = trackNode.getElementsByTagName("duration").item(0).textContent;
		
		// Track artist
		var trackArtist;
		xpathExpr = ".//artists//*[name()='name' or name()='join']";
		trackArtist = cookArtistName(xmldoc.evaluate(xpathExpr, trackNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null));
		if (trackArtist != "")
			track.artist = trackArtist;
		
		// Track position and release number
		var trackPosition = trackNode.getElementsByTagName("position").item(0).textContent;
		var releaseNumber = 1;
		var tmp = trackPosition.match(/^(\d)(?=-\d*)/);
		if (tmp && tmp[0]) {
			releaseNumber = tmp[0];
		}
		
		// Create release if needed
		if( !releases[releaseNumber-1] ) {
			releases.push(new Object());
			releases[releaseNumber-1].tracks = [];
		}
		
		releases[releaseNumber-1].tracks.push(track);
	}

	// Fill releases info
	for (var i=0; i < releases.length; i++) {
		releases[i].artist = releaseArtist;
		releases[i].title = releaseTitle;
		if (releases.length > 1)
			releases[i].title += " (disc "+ (i+1) +")";
	}
	
	return releases;
}

// Insert links in Discogs page
function insertLinks(releases) {

	var tr = document.createElement('tr');
	var trInnerHTML
	trInnerHTML = '<td>';
	trInnerHTML += '<table width="100%" class="cb"><tbody>';
	trInnerHTML += '<tr><td align="center" class="ar"><b>MusicBrainz</b></td></tr>';
	if (releases.length == 1) {
		trInnerHTML += '<tr><td><a target="_blank" href="' + cookImportUrl(releases[0]) + '">Import release</a></td></tr>';
	} else {
		for (var i=0; i < releases.length; i++) {
			trInnerHTML += '<tr><td><a target="_blank" href="' + cookImportUrl(releases[i]) + '">Import disc ' + (i+1) + '</a></td></tr>';
		}
	}
	trInnerHTML += '</tbody></table>';
	trInnerHTML += '</td>';
	tr.innerHTML = trInnerHTML;
	
	var tbody = document.getElementsByTagName("table").item(0).getElementsByTagName("tbody").item(0);
	tbody.insertBefore(tr, tbody.firstChild);

}

// Helper function: compute artist name from a XPATH resultNodes
function cookArtistName(nodes) {
	var artistName = "";
	for (var i = 0; i < nodes.snapshotLength; i++) {
		artistName += (i == 0 ? "" : " ") + nodes.snapshotItem(i).textContent;
	}
	return artistName;
}

// Helper function: compute url for a release object
function cookImportUrl(release) {

	var importURL = "http://musicbrainz.org/cdi/enter.html?&artistname=" + encodeURIComponent(release.artist) + "&releasename=" + encodeURIComponent(release.title);

	// Multiple artists on tracks?
	var artists = [];
	for (var i=0; i < release.tracks.length; i++) {
		if (release.tracks[i].artist)
			artists.push(release.tracks[i].artist);
	}
	
	if (artists.length > 1)
		importURL += "&hasmultipletrackartists=1&artistid=1";
	else 
		importURL += "&hasmultipletrackartists=0&artistid=2";
		
	// Add tracks
	for (var i=0; i < release.tracks.length; i++) {
	
		importURL += "&track" + i + 		"=" + encodeURIComponent(release.tracks[i].title);
		importURL += "&tracklength" + i + 	"=" + encodeURIComponent(release.tracks[i].duration);
	
		if (artists.length > 1 && release.tracks[i].artist) {
			importURL += "&tr" + i + "_artistedit=1";
			importURL += "&tr" + i + "_artistname=" + encodeURIComponent(release.tracks[i].artist);
		}
	}
	importURL += '&tracks=' + release.tracks.length;

	return importURL;
}