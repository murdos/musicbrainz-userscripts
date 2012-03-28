// ==UserScript==
// @name           Import Discogs releases to MusicBrainz.org 
// @namespace      http://userscripts.org/users/22504
// @include        http://*.discogs.com/release/*
// ==/UserScript==

// Script Update Checker
// -- http://userscripts.org/scripts/show/20145
var version_scriptNum = 7947; // Change this to the number given to the script by userscripts.org (check the address bar)
var version_timestamp = 1225563457593; // Used to differentiate one version of the script from an older one. Use the Date.getTime() function to get a value for this.
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
	var url = cookImportLink(xmldoc);
	insertLink(url);
  }

});

// Analyze Discogs data and cook  the import URL
function cookImportLink(xmldoc) {

	var xpathExpr, resultNodes;
	
	// Compute artist(s) name(s)
	var artistName = "";
	xpathExpr = "//artists/artist/*[name()='name' or name()='join']";
	resultNodes = xmldoc.evaluate(xpathExpr, xmldoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	for (var i = 0; i < resultNodes.snapshotLength; i++) {
		artistName += (i == 0 ? "" : " ") + resultNodes.snapshotItem(i).textContent;
	}

	// Grabs release title
	var releaseTitle;
	xpathExpr = "//release/title";
	releaseTitle = xmldoc.evaluate(xpathExpr, xmldoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.textContent;
	
	// Sart the Import URL
	var bigAssURL = 'http://musicbrainz.org/cdi/enter.html?hasmultipletrackartists=0&artistid=2&artistedit=1&artistname=' + encodeURI(artistName) + '&releasename=' + encodeURI(releaseTitle);
	
	// Grabs tracks
	var tracks;
	xpathExpr = "//tracklist/track";
	resultNodes = xmldoc.evaluate(xpathExpr, xmldoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	bigAssURL += '&tracks=' + resultNodes.snapshotLength;
	
	for (var i = 0; i < resultNodes.snapshotLength; i++) {
		bigAssURL += '&track' + i + '=' + encodeURI( resultNodes.snapshotItem(i).getElementsByTagName("title").item(0).textContent );
		bigAssURL += '&tracklength' + i + '=' + encodeURI( resultNodes.snapshotItem(i).getElementsByTagName("duration").item(0).textContent );
	}

	return bigAssURL;
}

// Insert link in Discogs page
function insertLink(url) {

	var tr = document.createElement('tr');
	var trInnerHTML
	trInnerHTML = '<td>';
	trInnerHTML += '<table width="100%" class="cb"><tbody>';
	trInnerHTML += '<tr><td align="center" class="ar"><b>MusicBrainz</b></td></tr>';
	trInnerHTML += '<tr><td><a target="_blank" href="' + url + '">Import into MusicBrainz</a></td></tr>';
	trInnerHTML += '</tbody></table>';
	trInnerHTML += '</td>';
	tr.innerHTML = trInnerHTML;
	
	var tbody = document.getElementsByTagName("table").item(0).getElementsByTagName("tbody").item(0);
	tbody.insertBefore(tr, tbody.firstChild);

}
