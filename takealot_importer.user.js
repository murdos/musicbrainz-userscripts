// ==UserScript==
// @name           Import Takealot releases to MusicBrainz
// @description    Add a button to import Takealot releases to MusicBrainz
// @version        2016.05.29.0
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @include        http*://www.takealot.com/*
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/takealot_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/takealot_importer.user.js
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          none
// ==/UserScript==


// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

var DEBUG = false;
//DEBUG = true;
if (DEBUG) {
	LOGGER.setLevel('debug');
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Test cases:
 * - http://www.takealot.com/theuns-jordaan-roeper-cd/PLID17284867 - working (Single artist release)
 * - http://www.takealot.com/various-artists-still-the-one-3cd/PLID40723650 - a dirty example
 * - http://www.takealot.com/now-71-various-artists-cd/PLID40688034 - working (Various Artists and Multi Disc)
 * - http://www.takealot.com/various-clubtraxxx-15-cd/PLID41391268 - working - do check if tracklist not in product info then look if tracklist in description
 * - http://www.takealot.com/afrikaans-is-groot-vol-8-cd/PLID40736577
 * - http://www.takealot.com/erens-in-die-middel-van-nerens-elvis-blue-cd/PLID38531203
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


// Insert links to high res image in Takealot page
function insertIMGlinks() {
	var imghref = $('#slideshow a.jqzoom').attr('href');
	LOGGER.debug("insertIMGlink Firing", imghref);
	$('#slideshow').append('<p><img src="//musicbrainz.org/favicon.ico" /><a href="' + imghref + '">MB High Res Image</a></p>');
}


// Artist in product information is without diacritics
// Remove Diacritics from Artist in header to comapre with product information
function removeDiacritics(str) {

	var defaultDiacriticsRemovalMap = [{
		'base': 'A',
		'letters': /[\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F]/g
	}, {
		'base': 'AA',
		'letters': /[\uA732]/g
	}, {
		'base': 'AE',
		'letters': /[\u00C6\u01FC\u01E2]/g
	}, {
		'base': 'AO',
		'letters': /[\uA734]/g
	}, {
		'base': 'AU',
		'letters': /[\uA736]/g
	}, {
		'base': 'AV',
		'letters': /[\uA738\uA73A]/g
	}, {
		'base': 'AY',
		'letters': /[\uA73C]/g
	}, {
		'base': 'B',
		'letters': /[\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181]/g
	}, {
		'base': 'C',
		'letters': /[\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E]/g
	}, {
		'base': 'D',
		'letters': /[\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779]/g
	}, {
		'base': 'DZ',
		'letters': /[\u01F1\u01C4]/g
	}, {
		'base': 'Dz',
		'letters': /[\u01F2\u01C5]/g
	}, {
		'base': 'E',
		'letters': /[\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E]/g
	}, {
		'base': 'F',
		'letters': /[\u0046\u24BB\uFF26\u1E1E\u0191\uA77B]/g
	}, {
		'base': 'G',
		'letters': /[\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E]/g
	}, {
		'base': 'H',
		'letters': /[\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D]/g
	}, {
		'base': 'I',
		'letters': /[\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197]/g
	}, {
		'base': 'J',
		'letters': /[\u004A\u24BF\uFF2A\u0134\u0248]/g
	}, {
		'base': 'K',
		'letters': /[\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2]/g
	}, {
		'base': 'L',
		'letters': /[\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780]/g
	}, {
		'base': 'LJ',
		'letters': /[\u01C7]/g
	}, {
		'base': 'Lj',
		'letters': /[\u01C8]/g
	}, {
		'base': 'M',
		'letters': /[\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C]/g
	}, {
		'base': 'N',
		'letters': /[\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4]/g
	}, {
		'base': 'NJ',
		'letters': /[\u01CA]/g
	}, {
		'base': 'Nj',
		'letters': /[\u01CB]/g
	}, {
		'base': 'O',
		'letters': /[\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C]/g
	}, {
		'base': 'OI',
		'letters': /[\u01A2]/g
	}, {
		'base': 'OO',
		'letters': /[\uA74E]/g
	}, {
		'base': 'OU',
		'letters': /[\u0222]/g
	}, {
		'base': 'P',
		'letters': /[\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754]/g
	}, {
		'base': 'Q',
		'letters': /[\u0051\u24C6\uFF31\uA756\uA758\u024A]/g
	}, {
		'base': 'R',
		'letters': /[\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782]/g
	}, {
		'base': 'S',
		'letters': /[\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784]/g
	}, {
		'base': 'T',
		'letters': /[\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786]/g
	}, {
		'base': 'TZ',
		'letters': /[\uA728]/g
	}, {
		'base': 'U',
		'letters': /[\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244]/g
	}, {
		'base': 'V',
		'letters': /[\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245]/g
	}, {
		'base': 'VY',
		'letters': /[\uA760]/g
	}, {
		'base': 'W',
		'letters': /[\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72]/g
	}, {
		'base': 'X',
		'letters': /[\u0058\u24CD\uFF38\u1E8A\u1E8C]/g
	}, {
		'base': 'Y',
		'letters': /[\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE]/g
	}, {
		'base': 'Z',
		'letters': /[\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762]/g
	}, {
		'base': 'a',
		'letters': /[\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250]/g
	}, {
		'base': 'aa',
		'letters': /[\uA733]/g
	}, {
		'base': 'ae',
		'letters': /[\u00E6\u01FD\u01E3]/g
	}, {
		'base': 'ao',
		'letters': /[\uA735]/g
	}, {
		'base': 'au',
		'letters': /[\uA737]/g
	}, {
		'base': 'av',
		'letters': /[\uA739\uA73B]/g
	}, {
		'base': 'ay',
		'letters': /[\uA73D]/g
	}, {
		'base': 'b',
		'letters': /[\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253]/g
	}, {
		'base': 'c',
		'letters': /[\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184]/g
	}, {
		'base': 'd',
		'letters': /[\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A]/g
	}, {
		'base': 'dz',
		'letters': /[\u01F3\u01C6]/g
	}, {
		'base': 'e',
		'letters': /[\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD]/g
	}, {
		'base': 'f',
		'letters': /[\u0066\u24D5\uFF46\u1E1F\u0192\uA77C]/g
	}, {
		'base': 'g',
		'letters': /[\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F]/g
	}, {
		'base': 'h',
		'letters': /[\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265]/g
	}, {
		'base': 'hv',
		'letters': /[\u0195]/g
	}, {
		'base': 'i',
		'letters': /[\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131]/g
	}, {
		'base': 'j',
		'letters': /[\u006A\u24D9\uFF4A\u0135\u01F0\u0249]/g
	}, {
		'base': 'k',
		'letters': /[\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3]/g
	}, {
		'base': 'l',
		'letters': /[\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747]/g
	}, {
		'base': 'lj',
		'letters': /[\u01C9]/g
	}, {
		'base': 'm',
		'letters': /[\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F]/g
	}, {
		'base': 'n',
		'letters': /[\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5]/g
	}, {
		'base': 'nj',
		'letters': /[\u01CC]/g
	}, {
		'base': 'o',
		'letters': /[\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275]/g
	}, {
		'base': 'oi',
		'letters': /[\u01A3]/g
	}, {
		'base': 'ou',
		'letters': /[\u0223]/g
	}, {
		'base': 'oo',
		'letters': /[\uA74F]/g
	}, {
		'base': 'p',
		'letters': /[\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755]/g
	}, {
		'base': 'q',
		'letters': /[\u0071\u24E0\uFF51\u024B\uA757\uA759]/g
	}, {
		'base': 'r',
		'letters': /[\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783]/g
	}, {
		'base': 's',
		'letters': /[\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B]/g
	}, {
		'base': 't',
		'letters': /[\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787]/g
	}, {
		'base': 'tz',
		'letters': /[\uA729]/g
	}, {
		'base': 'u',
		'letters': /[\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289]/g
	}, {
		'base': 'v',
		'letters': /[\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C]/g
	}, {
		'base': 'vy',
		'letters': /[\uA761]/g
	}, {
		'base': 'w',
		'letters': /[\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73]/g
	}, {
		'base': 'x',
		'letters': /[\u0078\u24E7\uFF58\u1E8B\u1E8D]/g
	}, {
		'base': 'y',
		'letters': /[\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF]/g
	}, {
		'base': 'z',
		'letters': /[\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763]/g
	}];

	for (var i = 0; i < defaultDiacriticsRemovalMap.length; i++) {
		str = str.replace(defaultDiacriticsRemovalMap[i].letters, defaultDiacriticsRemovalMap[i].base);
	}

	return str;

}

// Insert links in Takealot page
function insertMBSection(release) {
	//LOGGER.debug("insertMBsection Firing");

	var mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>').hide();

	if (DEBUG) mbUI.css({
		'border': '3px dotted red'
	});

	var mbContentBlock = $('<div class="section_content"></div>');
	mbUI.append(mbContentBlock);

	if (release.maybe_buggy) {
		var warning_buggy = $('<p><small><b>Warning</b>: this release is buggy, please check twice the data you import.</small><p').css({
			'color': 'red',
			'margin-top': '4px',
			'margin-bottom': '4px'
		});
		mbContentBlock.prepend(warning_buggy);
	}

	// Form parameters
	var edit_note = MBImport.makeEditNote(window.location.href, 'Takealot');
	LOGGER.debug("Edit Note: ", edit_note);
	var parameters = MBImport.buildFormParameters(release, edit_note);
	// LOGGER.debug("*** Form parameters: ", parameters);
	// Build form + search button
	var innerHTML = '<div id="mb_buttons">' + MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release) + '</div>';
	mbContentBlock.append(innerHTML);

	insertMbUI(mbUI);
	insertIMGlinks();
	insertMBLinks();

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
	});
	$('form.musicbrainz_import > button').css({
		width: '100%',
		'box-sizing': 'border-box'
	});

	mbUI.slideDown();
}

// Insert link to MB release (MB Release need a URL entry to match )
function insertMBLinks() {
	var mblinks = new MBLinks('TAKEALOT_CACHE', 7 * 24 * 60); // force refresh of cached links once a week

	// var artist_link = 'http://' + window.location.href.match( /^https?:\/\/(.*)\/album\/.+$/i)[1];
	// mblinks.searchAndDisplayMbLink(artist_link, 'artist', function (link) { $('div#there').before(link); } );

	var album_link = window.location.href;
	mblinks.searchAndDisplayMbLink(album_link, 'release', function(link) {
		$('h1.fn').append(link);
	});

}
// Analyze Takealot data and return a release object
function ParseTakealotPage() {
	LOGGER.debug("ParseTakealotPage function firing");

	var releasebarcode = "";
	var releasecountry = "";
	var releasedaterel = "";
	var releaselanguage = "";
	var releasetitle = "";
	var releaselabel = [];
	var releaseformat = "";
	var release_maybe_buggy = false;

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
				case "label": // use these cases to select the spesific text values
					releaselabel.push({
						name: artistitemlabel.nextSibling.textContent.trim()
					});
					LOGGER.debug('The value is :' + artistitem + ' > ' + releaselabel);
					break;
				case "date released": // use these cases to select the spesific text values
					releasedaterel = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releasedaterel);
					break;
				case "format": // use these cases to select the spesific text values
					releaseformat = artistitemlabel.nextSibling.textContent.trim();
					LOGGER.debug('The value is :' + artistitem + ' > ' + releaseformat);
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
		var MediaHeading = document.querySelectorAll("h1.fn");
		var TitleStr = MediaHeading[0].innerText;
		var TitleRegex = /(.*)-(.*)+\s\(([^)]+)\)/;

		if (TitleStr.match(TitleRegex)) {
			var HeadArray = TitleStr.match(TitleRegex);
			LOGGER.debug("HeadArray", HeadArray);
			if (removeDiacritics(HeadArray[1].trim()) == releaseartist) {
				LOGGER.debug('matched title equal the releaseartist therefore swapped');
				releasetitle = HeadArray[2].trim();
			} else {
				LOGGER.debug('matched title equal the title therefore not swapped');
				releasetitle = HeadArray[1].trim();
				LOGGER.debug("Title:", releasetitle, " Artist:", releaseartist);
				// check if artist assigned else make the remaining value the artist and mark buggy true
				if (releaseartist == null) {
					releaseartist = HeadArray[2].trim();
					release_maybe_buggy = true;
				}
			}
		} else {

			LOGGER.debug("The Heading REGEX not matched!!");
			var TitleRegex = /(.*)+\s\(([^)]+)\)/;
			var HeadArray = TitleStr.match(TitleRegex);
			LOGGER.debug("HeadArray", HeadArray);
			releasetitle = HeadArray[1].trim();
			if (releaseformat == null) {
				releaseformat = HeadArray[2].trim();
			}
		}

		LOGGER.debug("Release Title from heading:", releasetitle);
	}


	var thediscnumber = 0;
	var allprodinfo = "";
	var descriptionarray = [];


	if (lastdiscnumber > 0) {
		LOGGER.debug("** Tracklist present in Product Info tab **");
	} else {
		LOGGER.debug(" ** No tracks in Product Info tab let's have a look in description tab");
		// TODO logic to check VA and below or artist with "Tracklisting:" and no Disc 1...
		if (document.querySelectorAll("div#prod-desc > br").length != 0) { // Known format based on <br>
			LOGGER.debug(" ** Formatting based on <br>");
			allprodinfo = document.querySelectorAll("div#prod-desc > br"); // Select all data in the "Description" div id = prod-desc with <br>
			for (var k = 0; k < allprodinfo.length - 1; k++) {
				descriptionrow = allprodinfo[k].nextSibling.textContent.trim();
				// LOGGER.debug("PROD-INFO > BR > ",descriptionrow);
				// regex to find Disc 1 and add 1 to a group ^Disc+(.\d)
				descriptionrowregex = /^Disc+(.\d)/;
				var founddisc = descriptionrow.match(descriptionrowregex);
				LOGGER.debug(" **** DISC FOUND ****", founddisc);
				if (founddisc != null) {
					var thediscnumber = parseInt(founddisc[1]);
					// LOGGER.debug(" **** DISC FOUND NUMBER ****", thediscnumber);
				}
				LOGGER.debug("PROD-INFO > BR > ", thediscnumber + '-' + descriptionrow);

				if (thediscnumber == 0) {
					thediscnumber = 1;
					LOGGER.debug(" **** DISC NUMBER ****", thediscnumber);
				}

				// regex to split the description row into track, title and artist (^\d).(.*)-(.*)
				var descriptionrowregex = /(^\d+).(.*)-(.*)/;
				//var descriptionrow_tracktitleartist = descriptionrow.match(descriptionrowregex);

				if (descriptionrow.match(descriptionrowregex) != null) {
					LOGGER.debug("Track. title - Artist");
					var descriptionrow_tracktitleartist = descriptionrow.match(descriptionrowregex);
					// do the same as in tracklist and push the disc numbers into an array
					descriptiontrack = new Object();

					if (descriptionrow_tracktitleartist != null) {
						descriptiontrack.disc = thediscnumber;
						descriptiontrack.track = descriptionrow_tracktitleartist[1];
						descriptiontrack.title = descriptionrow_tracktitleartist[2].trim();
						descriptiontrack.artist = descriptionrow_tracktitleartist[3];

						//to get the last disc number via iterate
						var description_lastdisc = parseInt(thediscnumber);
						descriptionarray.push(descriptiontrack);
					}
				} else {
					LOGGER.debug("Assume Track. title");
					// regex to split the description row into track. title (^\d).(.*)
					var descriptionrowregex = /(^\d+).(.*)/;
					descriptionrow_tracktitleartist = descriptionrow.match(descriptionrowregex);
					// do the same as in tracklist and push the disc numbers into an array
					descriptiontrack = new Object();

					if (descriptionrow_tracktitleartist != null) {
						descriptiontrack.disc = thediscnumber;
						descriptiontrack.track = descriptionrow_tracktitleartist[1];
						descriptiontrack.title = descriptionrow_tracktitleartist[2];
						descriptiontrack.artist = releaseartist;

						//to get the last disc number via iterate
						var description_lastdisc = parseInt(thediscnumber);
						descriptionarray.push(descriptiontrack);
					}
				}
			}
		} else if (document.querySelectorAll("div#prod-desc > div").length != 0) { // New format encountered based on <div>			LOGGER.debug(" ** Formatting based on <div>");
			LOGGER.debug(" ** Formatting based on <div>");
			allprodinfo = document.querySelectorAll("div#prod-desc > div"); // Select all data in the "Description" div id = prod-desc with <div>
			for (var div_iterate = 0; div_iterate < allprodinfo.length; div_iterate++) {
				//LOGGER.debug(div_iterate," - ",allprodinfo[div_iterate].textContent.trim());
				descriptionrow = allprodinfo[div_iterate].textContent.trim();

				descriptionrowdiscregex = /^[Disc|CD]+(.\d)/; // need to find more div samples to test variants
				var founddisc = descriptionrow.match(descriptionrowdiscregex);


				if (founddisc != null) {
					var thediscnumber = parseInt(founddisc[1]);
					LOGGER.debug(" **** DISC FOUND NUMBER ****", thediscnumber);
				}

				LOGGER.debug("FOUNDDISC# ", founddisc);
				// else if (founddisc == null) {
				// 	var thediscnumber = 1;
				// 	LOGGER.debug(" **** DISC NUMBER ****", thediscnumber);
				// }

				if (founddisc == null) {
					var thediscnumber = 1;
					LOGGER.debug(" **** DISC NUMBER ****", thediscnumber);
				}

				descriptionrowregex = /(^\d+).(.*)/;
				var descriptionrow_tracknumtitle = descriptionrow.match(descriptionrowregex);

				descriptiontrack = new Object();

				if (descriptionrow_tracknumtitle != null) {
					LOGGER.debug("** Track **", descriptionrow_tracknumtitle);
					descriptiontrack.disc = thediscnumber;
					descriptiontrack.track = descriptionrow_tracknumtitle[1];
					descriptiontrack.title = descriptionrow_tracknumtitle[2].trim();
					descriptiontrack.artist = releaseartist; // need to do logic to check regex with and without artist

					//to get the last disc number via iterate
					var description_lastdisc = parseInt(thediscnumber);
					descriptionarray.push(descriptiontrack);
				}

			}
		} else {
			LOGGER.info(" ***** Unknown formatting ****** ");
			release_maybe_buggy = true;
		}


		// Discs
		var disclistarray = new Array(); // create the tracklist array to use later


		for (var desc_discs = 0; desc_discs < description_lastdisc; desc_discs++) {
			var tracklistarray = new Array();
			for (var desc__track = 0; desc__track < descriptionarray.length; desc__track++) {

				var desc_currentdiscnumber = descriptionarray[desc__track].disc;
				if (desc_currentdiscnumber == desc_discs + 1) {
					var track = new Object();
					var track_artist_credit = new Array();

					track.number = descriptionarray[desc__track].track;
					track.title = descriptionarray[desc__track].title;

					var track_artist_credit_object = new Object();
					track_artist_credit_object.artist_name = descriptionarray[desc__track].artist;
					track_artist_credit.push(track_artist_credit_object);
					//track_artist_credit.artist_name = descriptionarray[desc__track].artist;
					track.artist_credit = track_artist_credit;
					tracklistarray.push(track);
				}
			}
			disclistarray.push(tracklistarray);
		}
		lastdiscnumber = description_lastdisc;
	}

	// do final checks to determine if it may be buggy
	if (releaseartist == null) {
		release_maybe_buggy = true;
	}

	release = new Object();

	release.maybe_buggy = release_maybe_buggy;

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
		// LOGGER.debug("Disc position:", l + 1);
		// LOGGER.debug("Tracklist for the selected disc: ", disclistarray[l]);
		var disc = {
			'position': l + 1,
			'format': DiscFormats[releaseformat],
			'tracks': disclistarray[l]
		};
		release.discs.push(disc);
	}

	release.labels = releaselabel;

	// Release URL
	release.urls = new Array();
	release.urls.push({
		'url': window.location.href,
		'link_type': MBImport.URL_TYPES.purchase_for_mail_order
	}); //type 74 is purchase for download
	// TODO check if CD then add purchase medium

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

var DiscFormats = new Array();
DiscFormats["CD"] = "CD";
DiscFormats["DVD"] = "DVD";
DiscFormats["Audio CD"] = "CD";

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