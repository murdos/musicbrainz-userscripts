// ==UserScript==
// @name           Import Takealot releases to MusicBrainz
// @description    Add a button to import Takealot releases to MusicBrainz
// @version        2016.03.09.2
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @include        http*://www.takealot.com/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mblinks.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          none
// ==/UserScript==


// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

var DEBUG = false;
//DEBUG = false;
if (DEBUG) {
	LOGGER.setLevel('debug');
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Test cases:
 * - http://www.takealot.com/theuns-jordaan-roeper-cd/PLID17284867 - working (Single artist release)
 * - http://www.takealot.com/various-artists-still-the-one-3cd/PLID40723650 - a dirty example
 * - http://www.takealot.com/now-71-various-artists-cd/PLID40688034 - working (Various Artists and Multi Disc)
 */

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


$(document).ready(function() {
	LOGGER.info("Document Ready & Takealot Userscript executing");
	var TakealotRelease = ParseTakealotPage();
	insertMBSection(TakealotRelease);
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                             Insert MusicBrainz section into Takealot page                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function insertMbUI(mbUI) {
	var e;
	if ((e = $("div.section.box-summary")) && e.length) {
		e.after(mbUI);
	} else if ((e = $('#buybox')) && e.length) {
		e.before(mbUI);
	} else if ((e = $("div.section.more-choices")) && e.length) {
		e.before(mbUI);
	}
}



// Insert links in Takealot page
function insertMBSection(release) {
	LOGGER.debug("insertMBsection Firing");

	var mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>').hide();

	if (DEBUG) mbUI.css({
		'border': '1px dotted red'
	});

	var mbContentBlock = $('<div class="section_content"></div>');
	mbUI.append(mbContentBlock);

	// Form parameters
	var edit_note = MBImport.makeEditNote(window.location.href, 'Takealot');
	LOGGER.debug("Edit Note: ", edit_note);
	var parameters = MBImport.buildFormParameters(release, edit_note);
	// LOGGER.debug("*** Form parameters: ", parameters);
	// Build form + search button
	var innerHTML = '<div id="mb_buttons">' + MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release) + '</div>';
	mbContentBlock.append(innerHTML);

	insertMbUI(mbUI);

	$('#mb_buttons').css({
		display: 'inline-block',
		width: '100%'
	});
	$('form.musicbrainz_import').css({
		width: '49%',
		display: 'inline-block'
	});
	$('form.musicbrainz_import_search').css({
		'float': 'right'
	})
	$('form.musicbrainz_import > button').css({
		width: '100%',
		'box-sizing': 'border-box'
	});

	mbUI.slideDown();
}

// Analyze Takealot data and return a release object
function ParseTakealotPage() {
	LOGGER.debug("ParseTakealotPage function firing");

	var releasebarcode = "";
	var releasecountry = "";
	var releasedaterel = "";
	var releaselanguage = "";
	var releasetitle = "";

	// Select all DL data in the "Product Info" div id = second div class = details 
	var allinfolist = document.querySelectorAll("div#second > div.details > dl > *");
	// Iterate all over the lines
	for (var i = 0; i < allinfolist.length; i++) {
		var artistitemlabel = allinfolist[i];

		if (artistitemlabel.tagName == "DT") {
			var artistitem = artistitemlabel.textContent.toLowerCase();
			switch (artistitem) {
				case "barcode": // use these cases to select the spesific text values
					releasebarcode = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releasebarcode);
					break;
				case "country": // use these cases to select the spesific text values
					releasecountry = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releasecountry);
					break;
				case "artists": // use these cases to select the spesific text values
					releaseartist = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releaseartist);
					break;
				case "date released": // use these cases to select the spesific text values
					releasedaterel = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releasedaterel);
					break;
				case "language": // use these cases to select the spesific text values
					releaselanguage = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releaselanguage);
					break;
				case "title": // use these cases to select the spesific text values
					releasetitle = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releasetitle);
					break;
				case "tracks": // use these cases to select the spesific text values
					LOGGER.debug('The label chosen is :' + artistitem);

					// Iterate over all the tracks - changed * to li to try and only catch tracks
					var alltracklist = document.querySelectorAll("div#second > div.details > dl > dd > ol:last-child > li");
					LOGGER.debug(" *** Dump the tracks nodeList to see what is going on ***");
					LOGGER.debug(alltracklist);
					// Tracks
					var tracklistarray = new Array(); // create the tracklist array to use later

					// var releaseartist = alltracklist[0].textContent.trim();
					// The format on Takealot changed and Artist is not the first element in li anymore but last
					// remember this is a nodeList and not an array
					var releaseartist = alltracklist[alltracklist.length - 1].textContent.trim();
					LOGGER.debug('The album artist:' + releaseartist);

					// Last track to find last disc number
					var lasttrack = alltracklist[alltracklist.length - 2].textContent.trim();
					LOGGER.debug('The last track:' + lasttrack);

					lastdiscnumberregex = /\[ Disc (.*) Track./; // regex to match disc number from last track
					var lastdiscnumbermatch = lasttrack.match(lastdiscnumberregex);
					var lastdiscnumber = parseInt(lastdiscnumbermatch[1]);
					LOGGER.debug("Last Disc Number: ", lastdiscnumber);

					// Discs
					var disclistarray = new Array(); // create the tracklist array to use later

					for (var k = 1; k < lastdiscnumber + 1; k++) { // start at 1 to keep array in sync with disc numbers
						LOGGER.debug("Disc iterate: ", k);

						// Tracks
						var tracklistarray = new Array(); // create the track list array

						for (var j = 0; j < alltracklist.length - 1; j++) { // changed j to 0 and length-1 as Artist is at end
							// do regex here and if current disc listed in track = k then push the track into the array for that disc
							var trackdetails = alltracklist[j].textContent.trim();
							disctracktitleregex = /\[ Disc (\d{2}) Track.(\b\d{2}) \] (.*)/;
							var disctracktitle = trackdetails.match(disctracktitleregex);

							var currentdiscnumber = parseInt(disctracktitle[1]);

							if (currentdiscnumber == k) {

								var track = new Object();
								track.number = parseInt(disctracktitle[2]);
								track.title = disctracktitle[3];
								LOGGER.debug("The track object: ", currentdiscnumber + ' - ' + track.number + " - " + track.title);

								tracklistarray.push(track);
							}
						}
						disclistarray.push(tracklistarray);
					}

					LOGGER.debug("** Disclist Array *** ", disclistarray);
					break;
			}
		}

	}

	// Logic added to derive the release title from the heading if missing from product info
	if (releasetitle == "") {
		// sample header "Huisgenoot Se 20 Country-Treffers - Various Artists (CD)"
		var MediaHeading = document.querySelectorAll("h1.fn");
		// LOGGER.debug(MediaHeading[0].innerText);
		var TitleStr = MediaHeading[0].innerText;
		var TitleRegex = /(.*)-(.*)+\s\(([^)]+)\)/;
		var HeadArray = TitleStr.match(TitleRegex);

		if (HeadArray[1].trim() == releaseartist) {
			LOGGER.debug('matched title equal the releaseartist therefore swapped');
			releasetitle = HeadArray[2].trim();
		} else {
			LOGGER.debug('matched title equal the title therefore not swapped');
			releasetitle = HeadArray[1].trim();
		}
		LOGGER.debug("Release Title from heading:", releasetitle);

	}

	release = new Object();

	// Release artist credit
	release.artist_credit = new Array();

	var artist_name = releaseartist;
	release.artist_credit.push({
		'artist_name': artist_name
	});

	// Release title
	release.title = releasetitle;
	// Release Barcode
	release.barcode = releasebarcode;

	// Default status is official
	release.status = 'official';

	// Other hard-coded info
	release.script = 'Latn';

	release.country = Countries[releasecountry];
	release.language = Languages[releaselanguage];

	release.discs = new Array();
	for (var l = 0; l < lastdiscnumber; l++) {
		LOGGER.debug("Disc position:", l + 1);
		LOGGER.debug("Tracklist for the selected disc: ", disclistarray[l]);
		var disc = {
			'position': l + 1,
			'tracks': disclistarray[l]
		};
		release.discs.push(disc);
	}

	release.labels = [];

	// Release URL
	release.urls = new Array();
	release.urls.push({
		'url': window.location.href,
		'link_type': MBImport.URL_TYPES.purchase_for_download
	}); //type 74 is purchase for download

	// Release date
	var releasedate = releasedaterel;
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

	LOGGER.info("Release:", release);

	return release;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Takealot -> MusicBrainz mapping                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


var Languages = new Array();
Languages["Afrikaans"] = "afr";



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
Countries["Russia"] = "RU";
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
Countries["North Korea"] = "KP";
Countries["Korea (South), Republic of"] = "KR";
Countries["South Korea"] = "KR";
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