// ==UserScript==







// @name           Import Discogs releases to MusicBrainz







// @namespace      http://userscripts.org/users/22504







// @include        http://*.discogs.com/*release/*







// @exclude        http://*.discogs.com/*release/*?f=xml*







// @exclude        http://www.discogs.com/release/add







// ==/UserScript==















// Script Update Checker







// -- http://userscripts.org/scripts/show/20145







var version_scriptNum = 36376; // Change this to the number given to the script by userscripts.org (check the address bar)







var version_timestamp = 1283290855251; // Used to differentiate one version of the script from an older one. Use the Date.getTime() function to get a value for this.







try {







function updateCheck(forced) {if((forced)||(parseInt(GM_getValue("lastUpdate", "0")) + 86400000 <= (new Date().getTime()))) {try {GM_xmlhttpRequest({method: "GET",url: "http://userscripts.org/scripts/review/" + version_scriptNum + "?" + new Date().getTime(),headers: {'Cache-Control': 'no-cache'},onload: function(xhrResponse) {GM_setValue("lastUpdate", new Date().getTime() + ""); var rt = xhrResponse.responseText.replace(/&nbsp;?/gm, " ").replace(/<li>/gm, "\n").replace(/<[^>]*>/gm, ""); var scriptName = (/@name\s*(.*?)\s*$/m.exec(rt))[1]; GM_setValue("targetScriptName", scriptName); if (parseInt(/version_timestamp\s*=\s*([0-9]+)/.exec(rt)[1]) > version_timestamp) {if (confirm("There is an update available for the Greasemonkey script \"" + scriptName + ".\"\nWould you like to go to the install page now?")) {GM_openInTab("http://userscripts.org/scripts/show/" + version_scriptNum);}} else if (forced) {alert("No update is available for \"" + scriptName + ".\"");}}});} catch (err) {if (forced) {alert("An error occurred while checking for updates:\n" + err);}}}} GM_registerMenuCommand(GM_getValue("targetScriptName", "???") + " - Manual Update Check", function() {updateCheck(true);}); updateCheck(false);







} catch(e) {}















// Discogs API KEY (you may need to replace with yours if you encounter limit issues)







var discogsApiKey = "84b3bec008";















// Discogs Webservice URL







var discogsWsUrl = window.location.href.replace(/http:\/\/(www\.|)discogs\.com\/(.*\/|)release\//, 'http://discogs.com/release/') + "?f=xml&api_key=" + discogsApiKey;







//unsafeWindow.console.log(discogsWsUrl);







// Grabs information from Discogs















/*







var xmlhttp = new XMLHttpRequest();







xmlhttp.onreadystatechange = function() { var releases = parseRelease(xmlhttp.responseXML); insertLinks(releases);};







xmlhttp.open("GET", url, true);







xmlhttp.send(null);







*/















// Analyze Discogs data and return a release object







function parseRelease(xmldoc) {







    var release = new Object();







	release.discs = [];















	// Compute artist(s) name(s)







	release.artist = cookArtistName(getXPathVal(xmldoc, "//release/artists/artist/*[name()='name' or name()='join']", false));
    release.artist = release.artist.replace(/ \(\d+\)$/, "");















	// Grab release title







	release.title = getXPathVal(xmldoc, "//release/title", true);















    // Grab release event information







    var releasedate = getXPathVal(xmldoc, "//release/released", true);

    if (typeof releasedate != "undefined" && releasedate != "") {

        var tmp = releasedate.split('-');





        if (tmp[0] != "undefined" && tmp[0] != "") {



            release.year = parseInt(tmp[0], 10);



    

            if (tmp[1] != "undefined" && tmp[1] != "") {



                release.month = parseInt(tmp[1], 10);





                if (tmp[2] != "undefined" && tmp[2] != "") {



                    release.day = parseInt(tmp[2], 10);

                }

            }

        }



    } 





    release.label = getXPathVal(xmldoc, "//release/labels/label/@name", true);







    release.catno = getXPathVal(xmldoc, "//release/labels/label/@catno", true);







    release.format = MediaTypes[getXPathVal(xmldoc, "//release/formats/format/@name", true)];







    release.country = Countries[ getXPathVal(xmldoc, "//release/country", true) ];















	// Grab tracks







	var tracks = [];







	var trackNodes = getXPathVal(xmldoc, "//tracklist/track", false);







	







	for (var i = 0; i < trackNodes.snapshotLength; i++) {







		var track = new Object();







		var trackNode = trackNodes.snapshotItem(i);















		track.title = trackNode.getElementsByTagName("title").item(0).textContent;







		track.duration = trackNode.getElementsByTagName("duration").item(0).textContent;







		







		// Track artist

		var trackArtist = cookArtistName(getXPathVal(xmldoc, ".//artists//*[name()='name' or name()='join']", false, trackNode));
        trackArtist = trackArtist.replace(/ \(\d+\)$/, "");


		if (trackArtist != "")

			track.artist = trackArtist;



		// Track position and release number







		var trackPosition = trackNode.getElementsByTagName("position").item(0).textContent;







		var releaseNumber = 1;















        // Skip special tracks







        if (trackPosition.toLowerCase().match("^(video|mp3)")) { 







            trackPosition = "";







        }















	    // Remove "CD" prefix







    	trackPosition = trackPosition.replace(/^CD/i, "");







        // Multi discs e.g. 1.1 or 1-1







		var tmp = trackPosition.match(/^(\d)(?=(-|\.)\d*)/);







		if (tmp && tmp[0]) {







			releaseNumber = tmp[0];







		} else {







        // Vinyls disc numbering: A1, B3, ...







            tmp = trackPosition.match(/^([A-Za-z])\d*/);







            if (tmp && tmp[0] && tmp[0] != "V") { 







                var code = tmp[0].charCodeAt(0)-65;







                releaseNumber = (code-code%2)/2+1; 







            }







        }







		







		// Create release if needed







		if( !release.discs[releaseNumber-1] ) {







			release.discs.push(new Object());







			release.discs[releaseNumber-1].tracks = [];







		}







		







		// Trackposition is empty e.g. for release title







		if (trackPosition != "" && trackPosition != null)







			release.discs[releaseNumber-1].tracks.push(track);







	}















    mylog(release);







	return release;







}















// Insert links in Discogs page







function insertLinks(release) {















	var mbUI = document.createElement('div');







    mbUI.innerHTML = "<h3>MusicBrainz</h3>";




    mbUI.className = "section";







    







	var mbContentBlock = document.createElement('div');







    mbContentBlock.className = "section_content";







    mbUI.appendChild(mbContentBlock);







    







	var innerHTML = '';







	if (release.discs.length == 1) {







		innerHTML += '<div><a target="_blank" href="' + cookImportUrl(release) + '">Import release</a>';

        innerHTML += ' <small>(<a href="http://musicbrainz.org/search/textsearch.html?query=artist%3A(' + luceneEscape(release.artist) + ')%20release%3A(' + luceneEscape(release.title) + ')%20tracks%3A(' + release.discs[0].tracks.length + ')%20&type=release&handlearguments=1&adv=on">';
        innerHTML += "Search this disc in MusicBrainz</a>)</small>";
        innerHTML += "</div>";






	} else {







		for (var i=0; i < release.discs.length; i++) {







			innerHTML += '<div><a target="_blank" href="' + cookImportUrl(release, i) + '">Import disc ' + (i+1) + '</a>';

            innerHTML += " <small>(<a href='http://musicbrainz.org/search/textsearch.html?query=artist%3A(" + luceneEscape(release.artist) + ")%20release%3A(" + luceneEscape(release.title) + " disc "+ (i+1) + ")%20tracks%3A(" + release.discs[i].tracks.length + ")%20&type=release&handlearguments=1&adv=on'>";
            innerHTML += "Search this disc in MusicBrainz</a>)</small>";
            innerHTML += "</div>";






		}







	}















	mbContentBlock.innerHTML = innerHTML;







	







	var prevNode = document.body.querySelector("div.section.ratings");







	prevNode.parentNode.insertBefore(mbUI, prevNode);















}







function luceneEscape(string) {

    return encodeURIComponent(string.replace(/\-|\/|\(\)/, ""));

}







// Helper function: compute url for a release object







function cookImportUrl(release, discno) {











    var disc;







    if (arguments.length == 1) {



        disc = release.discs[0];



    } else {



        disc = release.discs[discno];



    }















	var importURL = "http://musicbrainz.org/cdi/enter.html?";















	// Multiple artists on tracks?







	var artists = [];







	for (var i=0; i < disc.tracks.length; i++) {







		if (typeof disc.tracks[i].artist != 'undefined' && disc.tracks[i].artist != release.artist)







			artists.push(disc.tracks[i].artist);







	}







	







    mylog("Tracks artists: " + artists.length);







	if (artists.length > 1)







		importURL += "hasmultipletrackartists=1&artistid=1";







	else 







		importURL += "hasmultipletrackartists=0";







        //importURL += "hasmultipletrackartists=0&artistid=2";















    importURL += "&artistname=" + encodeURIComponent(release.artist);



    if (release.discs.length > 1) {







        importURL += "&releasename=" + encodeURIComponent(release.title + " (disc " + (discno + 1) + ")");



    } else {



        importURL += "&releasename=" + encodeURIComponent(release.title);



    }







    importURL += '&tracks=' + disc.tracks.length;







		







	// Add tracks







	for (var i=0; i < disc.tracks.length; i++) {







	







		importURL += "&track" + i + 		"=" + encodeURIComponent(disc.tracks[i].title);



        var tracklength = (typeof disc.tracks[i].duration != 'undefined' && disc.tracks[i].duration != '') ? disc.tracks[i].duration : "?:??";







		importURL += "&tracklength" + i + 	"=" + encodeURIComponent(tracklength);







        // TODO: ??







        importURL += '&trackseq' + i + "=" + (i + 1);







        importURL += '&tr' + i + '_mp=0';







	







		if (artists.length > 1 && disc.tracks[i].artist) {







			importURL += "&tr" + i + "_artistedit=1";







			importURL += "&tr" + i + "_artistname=" + encodeURIComponent(disc.tracks[i].artist);







		}







	}















    importURL += '&submitvalue=Keep+editing'; // Needed to allow RE imports







    if (typeof release.catno != 'undefined' && release.catno != "none") {







        importURL += '&rev_catno-0=' + release.catno;







    }







    importURL += '&rev_labelname-0=' + encodeURIComponent(release.label);







    importURL += '&rev_format-0=' + release.format;







    if (!isNaN(release.year)) { importURL += '&rev_year-0=' + release.year; }







    if (!isNaN(release.month)) { importURL += '&rev_month-0=' + release.month; }







    if (!isNaN(release.day)) { importURL += '&rev_day-0=' + release.day; }







    importURL += '&rev_country-0=' + release.country;















	return importURL;







}















// Helper function: get data from a given XPATH







getXPathVal = function (xmldoc, xpathExpression, wantSingleNode, rootNode) {







    if (arguments.length == 3) rootNode = null;






    if (wantSingleNode) {





        var nodeval = xmldoc.evaluate(xpathExpression, xmldoc, rootNode, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

        return (nodeval != null) ? nodeval.textContent : "";







    } else {







        return xmldoc.evaluate(xpathExpression, xmldoc, rootNode, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);







    }







}















// Helper function: compute artist name from a XPATH resultNodes







function cookArtistName(nodes) {







	var artistName = "";







	for (var i = 0; i < nodes.snapshotLength; i++) {







		artistName += (i == 0 ? "" : " ") + nodes.snapshotItem(i).textContent;







	}







	return artistName;







}















function mylog(obj) {







    var DEBUG = false;







    if (DEBUG) {







        unsafeWindow.console.log(obj);







    }







}















// Reference Discogs <-> MusicBrainz map







var MediaTypes = new Array();







MediaTypes["8-Track Cartridge"] = 9;







MediaTypes["Acetate"] = 7;







MediaTypes["Betamax"] = 13;







MediaTypes["Blu-ray"] = 13;







MediaTypes["Blu-ray-R"] = 13;







MediaTypes["Cassette"] = 8;







MediaTypes["CD"] = 1;







MediaTypes["CDr"] = 1;







MediaTypes["CDV"] = 1;







MediaTypes["Cylinder"] = 14;







MediaTypes["DAT"] = 11;







MediaTypes["Datassette"] = 13;







MediaTypes["DCC"] = 16;







MediaTypes["DVD"] = 2;







MediaTypes["DVDr"] = 2;







MediaTypes["Edison Disc"] = 7;







MediaTypes["File"] = 12;







MediaTypes["Flexi-disc"] = 7;







MediaTypes["Floppy Disk"] = 12;







MediaTypes["HD DVD"] = 13;







MediaTypes["HD DVD-R"] = 13;







MediaTypes["Hybrid"] = 13;







MediaTypes["Laserdisc"] = 5;







MediaTypes["Memory Stick"] = 13;







MediaTypes["Microcassette"] = 13;







MediaTypes["Minidisc"] = 6;







MediaTypes["MVD"] = 13;







MediaTypes["Reel-To-Reel"] = 10;







MediaTypes["SelectaVision"] = 13;







MediaTypes["Shellac"] = 7;







MediaTypes["UMD"] = 13;







MediaTypes["VHS"] = 13;







MediaTypes["Video 2000"] = 13;







MediaTypes["Vinyl"] = 7;















var Countries = new Array();







Countries["France"] = 73;







Countries["Germany"] = 81;







Countries["US"] = 222;







Countries["UK"] = 221;







Countries["Afghanistan"] = 1;







Countries["Albania"] = 2;







Countries["Algeria"] = 3;







Countries["American Samoa"] = 4;







Countries["Andorra"] = 5;







Countries["Angola"] = 6;







Countries["Anguilla"] = 7;







Countries["Antarctica"] = 8;







Countries["Antigua & Barbuda"] = 9;







Countries["Argentina"] = 10;







Countries["Armenia"] = 11;







Countries["Aruba"] = 12;







Countries["Australia"] = 13;







Countries["Austria"] = 14;







Countries["Azerbaijan"] = 15;







Countries["Bahamas, The"] = 16;







Countries["Bahrain"] = 17;







Countries["Bangladesh"] = 18;







Countries["Barbados"] = 19;







Countries["Belarus"] = 20;







Countries["Belgium"] = 21;







Countries["Belize"] = 22;







Countries["Benin"] = 23;







Countries["Bermuda"] = 24;







Countries["Bhutan"] = 25;







Countries["Bolivia"] = 26;







Countries["Bosnia & Herzegovina"] = 27;







Countries["Botswana"] = 28;







Countries["Bouvet Island"] = 29;







Countries["Brazil"] = 30;







Countries["British Indian Ocean Territory"] = 31;







Countries["Brunei"] = 32;







Countries["Bulgaria"] = 33;







Countries["Burkina Faso"] = 34;







Countries["Burma"] = 146;







Countries["Burundi"] = 35;







Countries["Cambodia"] = 36;







Countries["Cameroon"] = 37;







Countries["Canada"] = 38;







Countries["Cape Verde"] = 39;







Countries["Cayman Islands"] = 40;







Countries["Central African Republic"] = 41;







Countries["Chad"] = 42;







Countries["Chile"] = 43;







Countries["China"] = 44;







Countries["Christmas Island"] = 45;







Countries["Cocos (Keeling) Islands"] = 46;







Countries["Colombia"] = 47;







Countries["Comoros"] = 48;







Countries["Congo, Democratic Republic of the"] = 236;







Countries["Congo, Republic of the"] = 49;







Countries["Cook Islands"] = 50;







Countries["Costa Rica"] = 51;







Countries["Croatia"] = 53;







Countries["Cuba"] = 54;







Countries["Cyprus"] = 55;







Countries["Czechoslovakia"] = 245;







Countries["Czech Republic"] = 56;







Countries["Denmark"] = 57;







Countries["Djibouti"] = 58;







Countries["Dominican Republic"] = 60;







Countries["East Timor"] = 61;







Countries["Ecuador"] = 62;







Countries["Egypt"] = 63;







Countries["El Salvador"] = 64;







Countries["Equatorial Guinea"] = 65;







Countries["Eritrea"] = 66;







Countries["Estonia"] = 67;







Countries["Ethiopia"] = 68;







Countries["Europe"] = 241;







Countries["Falkland Islands"] = 69;







Countries["Faroe Islands"] = 70;







Countries["Fiji"] = 71;







Countries["Finland"] = 72;







Countries["French Guiana"] = 75;







Countries["French Polynesia"] = 76;







Countries["French Southern & Antarctic Lands"] = 77;







Countries["Gabon"] = 78;







Countries["Gambia, The"] = 79;







Countries["Gaza Strip"] = 249;







Countries["Georgia"] = 80;







Countries["German Democratic Republic (GDR)"] = 244;







Countries["Ghana"] = 82;







Countries["Gibraltar"] = 83;







Countries["Greece"] = 84;







Countries["Greenland"] = 85;







Countries["Grenada"] = 86;







Countries["Guadeloupe"] = 87;







Countries["Guam"] = 88;







Countries["Guatemala"] = 89;







Countries["Guernsey"] = 251;







Countries["Guinea-Bissau"] = 91;







Countries["Guinea"] = 90;







Countries["Guyana"] = 92;







Countries["Haiti"] = 93;







Countries["Heard Island and McDonald Islands"] = 94;







Countries["Holy See (Vatican City)"] = 227;







Countries["Honduras"] = 95;







Countries["Hong Kong"] = 96;







Countries["Hungary"] = 97;







Countries["Iceland"] = 98;







Countries["India"] = 99;







Countries["Indonesia"] = 100;







Countries["Iran"] = 101;







Countries["Iraq"] = 102;







Countries["Ireland"] = 103;







Countries["Israel"] = 104;







Countries["Italy"] = 105;







Countries["Ivory Coast"] = 52;







Countries["Jamaica"] = 106;







Countries["Japan"] = 107;







Countries["Jersey"] = 253;







Countries["Jordan"] = 108;







Countries["Kazakhstan"] = 109;







Countries["Kenya"] = 110;







Countries["Kiribati"] = 111;







Countries["Kuwait"] = 114;







Countries["Kyrgyzstan"] = 115;







Countries["Laos"] = 116;







Countries["Latvia"] = 117;







Countries["Lebanon"] = 118;







Countries["Lesotho"] = 119;







Countries["Liberia"] = 120;







Countries["Libya"] = 121;







Countries["Liechtenstein"] = 122;







Countries["Lithuania"] = 123;







Countries["Luxembourg"] = 124;







Countries["Macau"] = 125;







Countries["Macedonia"] = 126;







Countries["Madagascar"] = 127;







Countries["Malawi"] = 128;







Countries["Malaysia"] = 129;







Countries["Maldives"] = 130;







Countries["Mali"] = 131;







Countries["Malta"] = 132;







Countries["Man, Isle of"] = 252;







Countries["Marshall Islands"] = 133;







Countries["Martinique"] = 134;







Countries["Mauritania"] = 135;







Countries["Mauritius"] = 136;







Countries["Mayotte"] = 137;







Countries["Mexico"] = 138;







Countries["Micronesia, Federated States of"] = 139;







Countries["Moldova"] = 140;







Countries["Monaco"] = 141;







Countries["Mongolia"] = 142;







Countries["Montenegro"] = 247;







Countries["Montserrat"] = 143;







Countries["Morocco"] = 144;







Countries["Mozambique"] = 145;







Countries["Namibia"] = 147;







Countries["Nauru"] = 148;







Countries["Nepal"] = 149;







Countries["Netherlands Antilles"] = 151;







Countries["Netherlands"] = 150;







Countries["New Caledonia"] = 152;







Countries["New Zealand"] = 153;







Countries["Nicaragua"] = 154;







Countries["Niger"] = 155;







Countries["Nigeria"] = 156;







Countries["Niue"] = 147;







Countries["Norfolk Island"] = 158;







Countries["Northern Mariana Islands"] = 159;







Countries["North Korea"] = 112;







Countries["Norway"] = 160;







Countries["Oman"] = 161;







Countries["Pakistan"] = 162;







Countries["Palau"] = 163;







Countries["Panama"] = 164;







Countries["Papua New Guinea"] = 165;







Countries["Paraguay"] = 166;







Countries["Peru"] = 167;







Countries["Philippines"] = 168;







Countries["Pitcairn Islands"] = 169;







Countries["Poland"] = 170;







Countries["Portugal"] = 171;







Countries["Puerto Rico"] = 172;







Countries["Qatar"] = 173;







Countries["Reunion"] = 174;







Countries["Romania"] = 175;







Countries["Russia"] = 176;







Countries["Rwanda"] = 177;







Countries["Saint Helena"] = 196;







Countries["Saint Kitts and Nevis"] = 178;







Countries["Saint Lucia"] = 179;







Countries["Saint Pierre and Miquelon"] = 197;







Countries["Saint Vincent and the Grenadines"] = 180;







Countries["Samoa"] = 181;







Countries["San Marino"] = 182;







Countries["Sao Tome and Principe"] = 183;







Countries["Saudi Arabia"] = 184;







Countries["Senegal"] = 185;







Countries["Serbia and Montenegro"] = 242;







Countries["Serbia"] = 254;







Countries["Seychelles"] = 186;







Countries["Sierra Leone"] = 187;







Countries["Singapore"] = 188;







Countries["Slovakia"] = 189;







Countries["Slovenia"] = 190;







Countries["Solomon Islands"] = 191;







Countries["Somalia"] = 192;







Countries["South Africa"] = 193;







Countries["South Georgia and the South Sandwich Islands"] = 248;







Countries["South Korea"] = 113;







Countries["Spain"] = 194;







Countries["Sri Lanka"] = 195;







Countries["Sudan"] = 198;







Countries["Suriname"] = 199;







Countries["Svalbard"] = 200;







Countries["Swaziland"] = 201;







Countries["Sweden"] = 202;







Countries["Switzerland"] = 203;







Countries["Syria"] = 204;







Countries["Taiwan"] = 205;







Countries["Tajikistan"] = 206;







Countries["Tanzania"] = 207;







Countries["Thailand"] = 208;







Countries["Togo"] = 209;







Countries["Tokelau"] = 210;







Countries["Tonga"] = 211;







Countries["Trinidad & Tobago"] = 212;







Countries["Tunisia"] = 213;







Countries["Turkey"] = 214;







Countries["Turkmenistan"] = 215;







Countries["Turks and Caicos Islands"] = 216;







Countries["Tuvalu"] = 217;







Countries["Uganda"] = 218;







Countries["Ukraine"] = 219;







Countries["United Arab Emirates"] = 220;







Countries["Uruguay"] = 224;







Countries["USSR"] = 243;







Countries["Uzbekistan"] = 225;







Countries["Vanuatu"] = 226;







Countries["Vatican City"] = 227;







Countries["Venezuela"] = 228;







Countries["Vietnam"] = 229;







Countries["Wallis and Futuna"] = 232;







Countries["West Bank"] = 249;







Countries["Western Sahara"] = 233;







Countries["Yemen"] = 234;







Countries["Yugoslavia"] = 235;







Countries["Zambia"] = 237;







Countries["Zimbabwe"] = 238;















/* Main function */















GM_xmlhttpRequest({







  method:"GET",







  url:discogsWsUrl,







  headers:{







    "User-Agent":"monkeyagent",







    "Accept":"text/monkey,text/xml",







    },







  onload:function(response) {







  	var xmldoc = new DOMParser().parseFromString(response.responseText,"text/xml");







	var release = parseRelease(xmldoc);







	insertLinks(release);







  }







});