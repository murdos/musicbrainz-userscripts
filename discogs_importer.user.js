// ==UserScript==

// @name           Import Discogs releases to MusicBrainz
// @version        2011-06-19_01
// @namespace      http://userscripts.org/users/22504
// @include        http://*musicbrainz.org/release/add
// @include        http://*musicbrainz.org/release/*/add
// @include        http://*musicbrainz.org/release/*/edit
// @include        http://*.discogs.com/*release/*
// @exclude        http://*.discogs.com/*release/*?f=xml*
// @exclude        http://www.discogs.com/release/add
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// ==/UserScript==

// Script Update Checker
// -- http://userscripts.org/scripts/show/20145
var SUC_script_num = 36376;
try{function updateCheck(forced){if ((forced) || (parseInt(GM_getValue('SUC_last_update', '0')) + 86400000 <= (new Date().getTime()))){try{GM_xmlhttpRequest({method: 'GET',url: 'http://userscripts.org/scripts/source/'+SUC_script_num+'.meta.js?'+new Date().getTime(),headers: {'Cache-Control': 'no-cache'},onload: function(resp){var local_version, remote_version, rt, script_name;rt=resp.responseText;GM_setValue('SUC_last_update', new Date().getTime()+'');remote_version=parseInt(/@uso:version\s*(.*?)\s*$/m.exec(rt)[1]);local_version=parseInt(GM_getValue('SUC_current_version', '-1'));if(local_version!=-1){script_name = (/@name\s*(.*?)\s*$/m.exec(rt))[1];GM_setValue('SUC_target_script_name', script_name);if (remote_version > local_version){if(confirm('There is an update available for the Greasemonkey script "'+script_name+'."\nWould you like to go to the install page now?')){GM_openInTab('http://userscripts.org/scripts/show/'+SUC_script_num);GM_setValue('SUC_current_version', remote_version);}}else if (forced)alert('No update is available for "'+script_name+'."');}else GM_setValue('SUC_current_version', remote_version+'');}});}catch (err){if (forced)alert('An error occurred while checking for updates:\n'+err);}}}GM_registerMenuCommand(GM_getValue('SUC_target_script_name', '???') + ' - Manual Update Check', function(){updateCheck(true);});updateCheck(false);}catch(err){}



// Discogs API KEY (you may need to replace with yours if you encounter limit issues)
var discogsApiKey = "84b3bec008";

$(document).ready(function(){

	// On Musicbrainz website
	if (window.location.href.match(/(musicbrainz\.org)/)) {
	
		$add_disc_dialog = $('div.add-disc-dialog');
		//$add_disc_dialog.find('div.tabs ul.tabs').append('<li><a class="discogs" href="#discogs">Discogs import</a></li>');

		var innerHTML = '<div class="add-disc-tab discogs" style="display: none">';
		innerHTML += '<p>Use the following fields to search for a Discogs release.</p>';
	    innerHTML += '<div class="pager" style="width: 100%; text-align: right; display: none;"><a href="#prev">&lt;&lt;</a><span class="pager"></span><a href="#next">&gt;&gt;</a></div>';
		innerHTML += '<div style="display: none;" class="tracklist-searching import-message"><p><img src="/static/images/icons/loading.gif" />&nbsp;Searching...</p></div>';
		innerHTML += '<div style="display: none;" class="tracklist-no-results import-message"><p>No results</p></div>';
		innerHTML += '<div style="display: none;" class="tracklist-error import-message"><p>An error occured: <span class="message"> </span></p></div></div>';
		//$add_disc_dialog.find('div.add-disc-tab:last').after(innerHTML);

	// On Discogs website
	} else {

		// Discogs Webservice URL
		var discogsWsUrl = window.location.href.replace(/http:\/\/(www\.|)discogs\.com\/(.*\/|)release\//, 'http://discogs.com/release/') + "?f=xml&api_key=" + discogsApiKey;

		mylog(discogsWsUrl);

		/* Main function */
		GM_xmlhttpRequest({
		  method: "GET",
		  url: discogsWsUrl,
		  headers: {
			"User-Agent":"monkeyagent",
			"Accept":"text/monkey,text/xml",
			},
		  onload: function(response) {
			var xmldoc = new DOMParser().parseFromString(response.responseText,"text/xml");
			var release = parseDiscogsRelease(xmldoc);
			insertLink(release);
		  }
		});
	}
});

// Analyze Discogs data and return a release object
function parseDiscogsRelease(xmldoc) {
    var release = new Object();
	release.discs = [];

	// Release artist credit
    release.artist_credits = new Array();
    $(xmldoc).find("release > artists artist").each(function() {
        var $artist = $(this);
        var ac = { name: $artist.find("name").text(), anv: $artist.find("anv").text(), join: $artist.find("join").text()};
        //ac.name = ac.name.replace(/ \(\d+\)$/, "");
        release.artist_credits.push(ac);
    });

	// Grab release title
	release.title = getXPathVal(xmldoc, "//release/title", true);

    // Grab release event information
    var releasedate = getXPathVal(xmldoc, "//release/released", true);
    if (typeof releasedate != "undefined" && releasedate != "") {
        var tmp = releasedate.split('-');        if (tmp[0] != "undefined" && tmp[0] != "") {
            release.year = parseInt(tmp[0], 10);
            if (tmp[1] != "undefined" && tmp[1] != "") {
                release.month = parseInt(tmp[1], 10);                
				if (tmp[2] != "undefined" && tmp[2] != "") {
                    release.day = parseInt(tmp[2], 10);
                }
            }
        }
    }  
   
    release.labels = new Array();
    $(xmldoc).find("release labels label").each(function() {
        release.labels.push( { name: $(this).attr('name'), catno: $(this).attr('catno') } );
    });   

    release.format = MediaTypes[getXPathVal(xmldoc, "//release/formats/format/@name", true)];
    // Special handle of vinyl 7", 10" and 12"
    $(xmldoc).find("release formats descriptions description").each(function() {
        var desc = $(this).text();
        if (desc.match(/7"|10"|12"/)) release.format = MediaTypes[desc];
    });

    release.country = Countries[ getXPathVal(xmldoc, "//release/country", true) ];

	// Grab tracks
	var tracks = [];
	var trackNodes = getXPathVal(xmldoc, "//tracklist/track", false);

	$(xmldoc).find("tracklist track").each(function() {
		var track = new Object();
		var $trackNode = $(this);
		
		track.title = $trackNode.find("title").text();
		track.duration = $trackNode.find("duration").text();
		
		// Track artist credit
		track.artist_credits = new Array();
		$trackNode.find("artists artist").each(function() {
			var $artist = $(this);
			var ac = { name: $artist.find("name").text(), anv: $artist.find("anv").text(), join: $artist.find("join").text()};
			ac.name = ac.name.replace(/ \(\d+\)$/, "");
			track.artist_credits.push(ac);
		});		
		
		// Track position and release number
		var trackPosition = $trackNode.find("position").text();
		var releaseNumber = 1;

        // Skip special tracks
        if (trackPosition.toLowerCase().match("^(video|mp3)")) { 
            trackPosition = "";
        }

	    // Remove "CD" prefix
    	trackPosition = trackPosition.replace(/^CD/i, "");

        // Multi discs e.g. 1.1 or 1-1
		var tmp = trackPosition.match(/^(\d+)(?=(-|\.)\d*)/);

		if (tmp && tmp[0]) {
			releaseNumber = tmp[0];
		} else {
        // Vinyls disc numbering: A1, B3, ...
            tmp = trackPosition.match(/^([A-Za-z])\d*/);
            if (tmp && tmp[0] && tmp[0] != "V") { 
                var code = tmp[0].charCodeAt(0);
                // A-Z 
                if (65 <= code && code <= 90) {
                    code = code - 65;
                } else if (97 <= code && code <= 122) {
                // a-z
                    code = code - (65 + 32);
                }
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
		
	});

    mylog(release);
	return release;
}

// Insert links in Discogs page
function insertLink(release) {

	var mbUI = document.createElement('div');
    mbUI.innerHTML = "<h3>MusicBrainz</h3>";    
	mbUI.className = "section";

	var mbContentBlock = document.createElement('div');
    mbContentBlock.className = "section_content";
    mbUI.appendChild(mbContentBlock);

	// Form parameters
	var parameters = buildFormParameters(release);

	// Build form
	var innerHTML = '<form action="http://musicbrainz.org/release/add" method="post" target="_blank">';
	parameters.forEach(function(parameter) {
        var value = parameter.value + "";
		innerHTML += "<input type='hidden' value='" + value.replace(/'/g,"&apos;") + "' name='" + parameter.name + "'/>";
	});

	innerHTML += '<input type="submit" value="Import into MB">';
	innerHTML += '</form>';

	var totaltracks = 0;
	for (var i=0; i < release.discs.length; i++) {
		totaltracks += release.discs[i].tracks.length;
	}
    var releaseartist = "";
    for (var i=0; i < release.artist_credits.length; i++) {
        var ac = release.artist_credits[i];
        releaseartist += ac.name;
        if (typeof ac.join != 'undefined' && ac.join != "") {
			if (i != release.artist_credits-1) releaseartist += " ";
            releaseartist += " " + ac.join; + " ";
			if (i != release.artist_credits-1) releaseartist += " ";
        } else {
			if (i != release.artist_credits-1) releaseartist += ", ";
		}
    }

	innerHTML += ' <small>(<a href="http://musicbrainz.org/search?query=artist%3A(' + luceneEscape(releaseartist) + ')%20release%3A(' + luceneEscape(release.title) + ')%20tracks%3A(' + totaltracks + ')%20country:'+release.country+'&type=release&advanced=1">';
	innerHTML += "Search in MusicBrainz</a>)</small>";

	mbContentBlock.innerHTML = innerHTML;
	var prevNode = document.body.querySelector("div.section.ratings");
	prevNode.parentNode.insertBefore(mbUI, prevNode);
}

function appendParameter(parameters, paramName, paramValue) {
	parameters.push( { name: paramName, value: paramValue } );
}

function luceneEscape(text) {
	var newtext = text.replace(/[-[\]{}()*+?~:\\^!"]/g, "\\$&");
	return newtext.replace("&&", "\&&").replace("||", "\||");
}

// Helper function: compute url for a release object
function buildFormParameters(release) {    
	// Form parameters
	var parameters = new Array();
	appendParameter(parameters, 'name', release.title);

	// Date + country
	appendParameter(parameters, 'country', release.country);
	if (!isNaN(release.year) && release.year != 0) { appendParameter(parameters, 'date.year', release.year); };
	if (!isNaN(release.month) && release.month != 0) { appendParameter(parameters, 'date.month', release.month); };
	if (!isNaN(release.day) && release.day != 0) { appendParameter(parameters, 'date.day', release.day); };

	// Label + catnos
    for (var i=0; i < release.labels.length; i++) {
        var label = release.labels[i];
        appendParameter(parameters, 'labels.'+i+'.name', label.name);
	    if (typeof label.catno != 'undefined' && label.catno != "none") {
            appendParameter(parameters, 'labels.'+i+'.catalog_number', label.catno);
        }
    }

	// Release Artist credits
	mapDiscogsArtistCreditsToMBParams(parameters, "", release.artist_credits);
	
	// Mediums
	for (var i=0; i < release.discs.length; i++) {
		var disc = release.discs[i];
		appendParameter(parameters, 'mediums.'+i+'.format', release.format);
		appendParameter(parameters, 'mediums.'+i+'.position', i);

		// TODO: Disc title
		// appendParameter(parameters, 'mediums.'+i+'.name', release.format);

		// Tracks
		for (var j=0; j < disc.tracks.length; j++) {
			var track = disc.tracks[j];
			appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.name', track.title);
			var tracklength = (typeof track.duration != 'undefined' && track.duration != '') ? track.duration : "?:??";
			appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.length', tracklength);

			mapDiscogsArtistCreditsToMBParams(parameters, 'mediums.'+i+'.track.'+j+'.', track.artist_credits);
		}
	}

	// Edit note 
	appendParameter(parameters, 'edit_note', 'Imported from ' + window.location.href.replace(/http:\/\/(www\.|)discogs\.com\/(.*\/|)release\//, 'http://discogs.com/release/'));

	return parameters;
}

function mapDiscogsArtistCreditsToMBParams(parameters, paramPrefix, artist_credits) {

    for (var i=0; i < artist_credits.length; i++) {
        var ac = artist_credits[i];
		// FIXME: use ac.anv one MB Release Editor accept artist_credit.names.N.artist.name
    	appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.name', ac.name);
        appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.artist.name', ac.name);
		var joinphrase = "";
		if (typeof ac.join != 'undefined' && ac.join != "") {
			if (i != artist_credits-1) joinphrase += " ";
            joinphrase += " " + ac.join; + " ";
			if (i != artist_credits-1) joinphrase += " ";
			appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.join_phrase', joinphrase);
        }
    }

}

// Helper function: get data from a given XPATH
getXPathVal = function (xmldoc, xpathExpression, wantSingleNode, rootNode) {
    if (arguments.length == 3) rootNode = xmldoc;   
    if (wantSingleNode) {       
        var nodeval = xmldoc.evaluate(xpathExpression, rootNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return (nodeval != null) ? nodeval.textContent : "";
    } else {
        return xmldoc.evaluate(xpathExpression, rootNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    }
}

function mylog(obj) {
    var DEBUG = true;
    if (DEBUG && unsafeWindow.console) {
        unsafeWindow.console.log(obj);
    }
}

// Reference Discogs <-> MusicBrainz map

var MediaTypes = new Array();MediaTypes["8-Track Cartridge"] = "Cartridge";MediaTypes["Acetate"] = "Vinyl";MediaTypes["Betamax"] = "Betamax";
MediaTypes["Blu-ray"] = "Blu-ray";
MediaTypes["Blu-ray-R"] = "Blu-ray";
MediaTypes["Cassette"] = "Cassette";
MediaTypes["CD"] = "CD";
MediaTypes["CDr"] = "CD";
MediaTypes["CDV"] = "CD";
MediaTypes["Cylinder"] = "Wax Cylinder";
MediaTypes["DAT"] = "DAT";
MediaTypes["Datassette"] = "Other";
MediaTypes["DCC"] = "DCC";
MediaTypes["DVD"] = "DVD";
MediaTypes["DVDr"] = "DVD";
MediaTypes["Edison Disc"] = "Vinyl";
MediaTypes["File"] = "Digital Media";
MediaTypes["Flexi-disc"] = "Vinyl";
MediaTypes["Floppy Disk"] = 12;
MediaTypes["HD DVD"] = "HD-DVD";
MediaTypes["HD DVD-R"] = "HD-DVD";
MediaTypes["Hybrid"] = "Other";
MediaTypes["Laserdisc"] = "LaserDisc";
MediaTypes["Memory Stick"] = "Digital Media";
MediaTypes["Microcassette"] = "Other";
MediaTypes["Minidisc"] = "MiniDisc";
MediaTypes["MVD"] = "Other";
MediaTypes["Reel-To-Reel"] = "Reel-to-reel";
MediaTypes["SelectaVision"] = "Other";
MediaTypes["Shellac"] = "Vinyl";
MediaTypes["UMD"] = "UMD";
MediaTypes["VHS"] = "VHS";
MediaTypes["Video 2000"] = "Other";
MediaTypes["Vinyl"] = "Vinyl";MediaTypes['7"'] = '7" Vinyl';MediaTypes['10"'] = '10" Vinyl';MediaTypes['12"'] = '12" Vinyl';

var Countries = new Array();
Countries["Afghanistan"] = "AF";
Countries["Albania"] = "AL";
Countries["Algeria"] = "DZ";
Countries["American Samoa"] = "AS";
Countries["Andorra"] = "AD";
Countries["Angola"] = "AO";
Countries["Anguilla"] = "AI";
Countries["Antarctica"] = "AQ";
Countries["Antigua and Barbuda"] = "AG";
Countries["Argentina"] = "AR";
Countries["Armenia"] = "AM";
Countries["Aruba"] = "AW";
Countries["Australia"] = "AU";
Countries["Austria"] = "AT";
Countries["Azerbaijan"] = "AZ";
Countries["Bahamas"] = "BS";
Countries["Bahrain"] = "BH";
Countries["Bangladesh"] = "BD";
Countries["Barbados"] = "BB";
Countries["Belarus"] = "BY";
Countries["Belgium"] = "BE";
Countries["Belize"] = "BZ";
Countries["Benin"] = "BJ";
Countries["Bermuda"] = "BM";
Countries["Bhutan"] = "BT";
Countries["Bolivia"] = "BO";
Countries["Croatia"] = "HR";
Countries["Botswana"] = "BW";
Countries["Bouvet Island"] = "BV";
Countries["Brazil"] = "BR";
Countries["British Indian Ocean Territory"] = "IO";
Countries["Brunei Darussalam"] = "BN";
Countries["Bulgaria"] = "BG";
Countries["Burkina Faso"] = "BF";
Countries["Burundi"] = "BI";
Countries["Cambodia"] = "KH";
Countries["Cameroon"] = "CM";
Countries["Canada"] = "CA";
Countries["Cape Verde"] = "CV";
Countries["Cayman Islands"] = "KY";
Countries["Central African Republic"] = "CF";
Countries["Chad"] = "TD";
Countries["Chile"] = "CL";
Countries["China"] = "CN";
Countries["Christmas Island"] = "CX";
Countries["Cocos (Keeling) Islands"] = "CC";
Countries["Colombia"] = "CO";
Countries["Comoros"] = "KM";
Countries["Congo"] = "CG";
Countries["Cook Islands"] = "CK";
Countries["Costa Rica"] = "CR";
Countries["Virgin Islands, British"] = "VG";
Countries["Cuba"] = "CU";
Countries["Cyprus"] = "CY";
Countries["Czech Republic"] = "CZ";
Countries["Denmark"] = "DK";
Countries["Djibouti"] = "DJ";
Countries["Dominica"] = "DM";
Countries["Dominican Republic"] = "DO";
Countries["Ecuador"] = "EC";
Countries["Egypt"] = "EG";
Countries["El Salvador"] = "SV";
Countries["Equatorial Guinea"] = "GQ";
Countries["Eritrea"] = "ER";
Countries["Estonia"] = "EE";
Countries["Ethiopia"] = "ET";
Countries["Falkland Islands (Malvinas)"] = "FK";
Countries["Faroe Islands"] = "FO";
Countries["Fiji"] = "FJ";
Countries["Finland"] = "FI";
Countries["France"] = "FR";
Countries["French Guiana"] = "GF";
Countries["French Polynesia"] = "PF";
Countries["French Southern Territories"] = "TF";
Countries["Gabon"] = "GA";
Countries["Gambia"] = "GM";
Countries["Georgia"] = "GE";
Countries["Germany"] = "DE";
Countries["Ghana"] = "GH";
Countries["Gibraltar"] = "GI";
Countries["Greece"] = "GR";
Countries["Greenland"] = "GL";
Countries["Grenada"] = "GD";
Countries["Guadeloupe"] = "GP";
Countries["Guam"] = "GU";
Countries["Guatemala"] = "GT";
Countries["Guinea"] = "GN";
Countries["Guinea-Bissau"] = "GW";
Countries["Guyana"] = "GY";
Countries["Haiti"] = "HT";
Countries["Virgin Islands, U.S."] = "VI";
Countries["Honduras"] = "HN";
Countries["Hong Kong"] = "HK";
Countries["Hungary"] = "HU";
Countries["Iceland"] = "IS";
Countries["India"] = "IN";
Countries["Indonesia"] = "ID";
Countries["Wallis and Futuna"] = "WF";
Countries["Iraq"] = "IQ";
Countries["Ireland"] = "IE";
Countries["Israel"] = "IL";
Countries["Italy"] = "IT";
Countries["Jamaica"] = "JM";
Countries["Japan"] = "JP";
Countries["Jordan"] = "JO";
Countries["Kazakhstan"] = "KZ";
Countries["Kenya"] = "KE";
Countries["Kiribati"] = "KI";
Countries["Kuwait"] = "KW";
Countries["Kyrgyzstan"] = "KG";
Countries["Lao People's Democratic Republic"] = "LA";
Countries["Latvia"] = "LV";
Countries["Lebanon"] = "LB";
Countries["Lesotho"] = "LS";
Countries["Liberia"] = "LR";
Countries["Libyan Arab Jamahiriya"] = "LY";
Countries["Liechtenstein"] = "LI";
Countries["Lithuania"] = "LT";
Countries["Luxembourg"] = "LU";
Countries["Montserrat"] = "MS";
Countries["Macedonia, The Former Yugoslav Republic of"] = "MK";
Countries["Madagascar"] = "MG";
Countries["Malawi"] = "MW";
Countries["Malaysia"] = "MY";
Countries["Maldives"] = "MV";
Countries["Mali"] = "ML";
Countries["Malta"] = "MT";
Countries["Marshall Islands"] = "MH";
Countries["Martinique"] = "MQ";
Countries["Mauritania"] = "MR";
Countries["Mauritius"] = "MU";
Countries["Mayotte"] = "YT";
Countries["Mexico"] = "MX";
Countries["Micronesia, Federated States of"] = "FM";
Countries["Morocco"] = "MA";
Countries["Monaco"] = "MC";
Countries["Mongolia"] = "MN";
Countries["Mozambique"] = "MZ";
Countries["Myanmar"] = "MM";
Countries["Namibia"] = "NA";
Countries["Nauru"] = "NR";
Countries["Nepal"] = "NP";
Countries["Netherlands"] = "NL";
Countries["Netherlands Antilles"] = "AN";
Countries["New Caledonia"] = "NC";
Countries["New Zealand"] = "NZ";
Countries["Nicaragua"] = "NI";
Countries["Niger"] = "NE";
Countries["Nigeria"] = "NG";
Countries["Niue"] = "NU";
Countries["Norfolk Island"] = "NF";
Countries["Northern Mariana Islands"] = "MP";
Countries["Norway"] = "NO";
Countries["Oman"] = "OM";
Countries["Pakistan"] = "PK";
Countries["Palau"] = "PW";
Countries["Panama"] = "PA";
Countries["Papua New Guinea"] = "PG";
Countries["Paraguay"] = "PY";
Countries["Peru"] = "PE";
Countries["Philippines"] = "PH";
Countries["Pitcairn"] = "PN";
Countries["Poland"] = "PL";
Countries["Portugal"] = "PT";
Countries["Puerto Rico"] = "PR";
Countries["Qatar"] = "QA";
Countries["Reunion"] = "RE";
Countries["Romania"] = "RO";
Countries["Russian Federation"] = "RU";
Countries["Rwanda"] = "RW";
Countries["Saint Kitts and Nevis"] = "KN";
Countries["Saint Lucia"] = "LC";
Countries["Saint Vincent and The Grenadines"] = "VC";
Countries["Samoa"] = "WS";
Countries["San Marino"] = "SM";
Countries["Sao Tome and Principe"] = "ST";
Countries["Saudi Arabia"] = "SA";
Countries["Senegal"] = "SN";
Countries["Seychelles"] = "SC";
Countries["Sierra Leone"] = "SL";
Countries["Singapore"] = "SG";
Countries["Slovenia"] = "SI";
Countries["Solomon Islands"] = "SB";
Countries["Somalia"] = "SO";
Countries["South Africa"] = "ZA";
Countries["Spain"] = "ES";
Countries["Sri Lanka"] = "LK";
Countries["Sudan"] = "SD";
Countries["Suriname"] = "SR";
Countries["Swaziland"] = "SZ";
Countries["Sweden"] = "SE";
Countries["Switzerland"] = "CH";
Countries["Syrian Arab Republic"] = "SY";
Countries["Tajikistan"] = "TJ";
Countries["Tanzania, United Republic of"] = "TZ";
Countries["Thailand"] = "TH";
Countries["Togo"] = "TG";
Countries["Tokelau"] = "TK";
Countries["Tonga"] = "TO";
Countries["Trinidad and Tobago"] = "TT";
Countries["Tunisia"] = "TN";
Countries["Turkey"] = "TR";
Countries["Turkmenistan"] = "TM";
Countries["Turks and Caicos Islands"] = "TC";
Countries["Tuvalu"] = "TV";
Countries["Uganda"] = "UG";
Countries["Ukraine"] = "UA";
Countries["United Arab Emirates"] = "AE";
Countries["UK"] = "GB";
Countries["US"] = "US";
Countries["United States Minor Outlying Islands"] = "UM";
Countries["Uruguay"] = "UY";
Countries["Uzbekistan"] = "UZ";
Countries["Vanuatu"] = "VU";
Countries["Vatican City State (Holy See)"] = "VA";
Countries["Venezuela"] = "VE";
Countries["Viet Nam"] = "VN";
Countries["Western Sahara"] = "EH";
Countries["Yemen"] = "YE";
Countries["Zambia"] = "ZM";
Countries["Zimbabwe"] = "ZW";
Countries["Taiwan"] = "TW";
Countries["[Worldwide]"] = "XW";
Countries["Europe"] = "XE";
Countries["Soviet Union (historical, 1922-1991)"] = "SU";
Countries["East Germany (historical, 1949-1990)"] = "XG";
Countries["Czechoslovakia (historical, 1918-1992)"] = "XC";
Countries["Congo, The Democratic Republic of the"] = "CD";
Countries["Slovakia"] = "SK";
Countries["Bosnia and Herzegovina"] = "BA";
Countries["Korea (North), Democratic People's Republic of"] = "KP";
Countries["Korea (South), Republic of"] = "KR";
Countries["Montenegro"] = "ME";
Countries["South Georgia and the South Sandwich Islands"] = "GS";
Countries["Palestinian Territory"] = "PS";
Countries["Macao"] = "MO";
Countries["Timor-Leste"] = "TL";
Countries["<85>land Islands"] = "AX";
Countries["Guernsey"] = "GG";
Countries["Isle of Man"] = "IM";
Countries["Jersey"] = "JE";
Countries["Serbia"] = "RS";
Countries["Saint Barthélemy"] = "BL";
Countries["Saint Martin"] = "MF";
Countries["Moldova"] = "MD";
Countries["Yugoslavia (historical, 1918-2003)"] = "YU";
Countries["Serbia and Montenegro (historical, 2003-2006)"] = "CS";
Countries["Côte d'Ivoire"] = "CI";
Countries["Heard Island and McDonald Islands"] = "HM";
Countries["Iran, Islamic Republic of"] = "IR";
Countries["Saint Pierre and Miquelon"] = "PM";
Countries["Saint Helena"] = "SH";
Countries["Svalbard and Jan Mayen"] = "SJ";
