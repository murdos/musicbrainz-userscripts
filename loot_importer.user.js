// ==UserScript==
// @name           Import Loot releases to MusicBrainz
// @description    Add a button to import Loot releases to MusicBrainz
// @version        2016.03.27.1
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @include        http*://www.loot.co.za/product/*
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

var DEBUG = true;
//DEBUG = true;
if (DEBUG) {
  LOGGER.setLevel('debug');
}

////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Test cases:
 * - http://www.loot.co.za/product/jakkie-en-daai-band-louw-klein-karoo-cowboy/mgyv-565-g540
 * - http://www.loot.co.za/product/various-artists-30-30-goue-sokkie-treffers-volume-17/hbhf-3088-g440
 */


$(document).ready(function() {
  LOGGER.info("Document Ready & Loot Userscript executing");
  var LootRelease = ParseLootPage();
  insertMBSection(LootRelease);
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                             Insert MusicBrainz section into Loot page                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function insertMbUI(mbUI) {
  LOGGER.debug("insertMbUI Firing");
  var e;
  if ((e = $("#thumbs")) && e.length) {
    e.after(mbUI);
  } else if ((e = $('#productContent')) && e.length) {
    e.before(mbUI);
  } else if ((e = $("div.buyNow")) && e.length) {
    e.before(mbUI);
  }
}


// Insert links in Loot page
function insertMBSection(release) {
  LOGGER.debug("insertMBsection Firing");
  var mbUI = $('<div class="section musicbrainz"><h1>MusicBrainz</h1></div>').hide();

  if (DEBUG) mbUI.css({
    'border': '1px dotted red'
  });

  var mbContentBlock = $('<div class="section_content"></div>');
  mbUI.append(mbContentBlock);

  if (release.maybe_buggy) {
    var warning_buggy = $('<p><small><b>Warning</b>: this release has perhaps a buggy tracklist, please check twice the data you import.</small><p').css({
      'color': 'red',
      'margin-top': '4px',
      'margin-bottom': '4px'
    });
    mbContentBlock.prepend(warning_buggy);
  }

  // Form parameters
  var edit_note = MBImport.makeEditNote(window.location.href, 'Loot');
  LOGGER.debug("*** Edit Note: ", edit_note);
  var parameters = MBImport.buildFormParameters(release, edit_note);
  LOGGER.debug("***Form parameters");
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


// Analyze Loot data and return a release object
function ParseLootPage() {
  LOGGER.debug("ParseLootPage function firing");

  var releasebarcode = "";
  var releasecountry = "";
  var releasedaterel = "";
  var releaselanguage = "";
  var releasetitle = "";
  var releaseartist = "";
  var prodlabels = [];
  var release_artist_array = [];
  var release_format = "";

  // div#productContent table tbody tr.productOverview td.productInfo h1
  var AlbumName = document.querySelectorAll("div#productContent > table > tbody > tr.productOverview > td.productInfo > *");
  LOGGER.debug("Album Name: ", AlbumName[0].innerText); // textContent give the space formatting and we just need the text so we use innerText
  releasetitle = AlbumName[0].innerText;
  LOGGER.debug("Artist Name: ", AlbumName[1].innerText);
  releaseartist = AlbumName[1].innerText;

  // select the product info
  var ReleaseInfo = document.querySelectorAll("div#tab-1 > table > tbody > tr > *");
  LOGGER.debug("Product Info: ", ReleaseInfo);

  for (var prodinfoloop = 0; prodinfoloop < ReleaseInfo.length; prodinfoloop++) {
    var prodinfolabel = ReleaseInfo[prodinfoloop];
    //LOGGER.debug("** ProdInfo LABEL: ",prodinfolabel);
    if (prodinfolabel.tagName == "TD") {
      var prodinfolabellowcase = prodinfolabel.innerText.toLowerCase().trim(); //replaced textContent with innerText

      LOGGER.debug("<TD>", prodinfolabellowcase);

      switch (prodinfolabellowcase) {
        case "label:": // use these cases to select the spesific text values
          LOGGER.debug("* label: selected *");
          var release_label = new Object();
          release_label.name = prodinfolabel.nextElementSibling.innerText.trim();
          prodlabels.push(release_label);
          break;
        case "release date:": // "release date:" TODO: NOT WORKING
          LOGGER.debug("* release date: *");
          var date_regex = /([A-Z][a-z]+)\s(\d{4})/; // October 2014 [1] [2]
          // need to add month and year code
          break;
        case "performers:": // use these cases to select the spesific text values
          LOGGER.debug("* performers: selected *");
          var release_artist_credit_object = new Object();
          release_artist_credit_object.artist_name = prodinfolabel.nextElementSibling.innerText.trim();
          release_artist_array.push(release_artist_credit_object);
          break;
        case "format:":
          LOGGER.debug("* format: selected *");
          release_format = prodinfolabel.nextElementSibling.childNodes[0].alt;
          LOGGER.debug("** format: value **", release_format);
          break;
      }
    }
  }

  // Select all  data in the "Tracks" div id = tab-2 
  var allinfolist = document.querySelectorAll("div#tab-2 > table.productDetails > tbody");
  LOGGER.debug("Track Info: (allinfolist)", allinfolist);

  // Select the Disc names
  var disccount = document.querySelectorAll("div#tab-2 > h3");
  LOGGER.debug("Amount of discs: ", disccount.length);

  var descriptionarray = [];

  for (var disciterate = 0; disciterate < disccount.length; disciterate++) {
    LOGGER.debug(disciterate);
    var tracklisting = allinfolist[disciterate].getElementsByTagName('tr');
    LOGGER.debug(" The Table: (tracklisting)", tracklisting);

    for (var trackiterate = 0; trackiterate < tracklisting.length; trackiterate++) {

      descriptiontrack = new Object();

      var currenttrack = tracklisting[trackiterate].querySelectorAll("td");
      var artisttitle_regex = /(.*) - (.*)/; // regex: artist - title 

      // need to check if this can be replaced with single regex for now check artist-title if 
      // not matching check just title
      if (currenttrack[1].innerText.match(artisttitle_regex)) {
        var artisttitle = currenttrack[1].innerText.match(artisttitle_regex);
        descriptiontrack.title = artisttitle[2];
        descriptiontrack.artist = artisttitle[1];
      } else {
        var artisttitle_regex = /(.*)/; // regex: title
        var artisttitle = currenttrack[1].innerText.match(artisttitle_regex);
        descriptiontrack.title = artisttitle[1];
        descriptiontrack.artist = releaseartist;
      }

      descriptiontrack.disc = disciterate + 1;
      descriptiontrack.track = parseInt(currenttrack[0].innerText);

      descriptionarray.push(descriptiontrack);
    }
  }


  // Discs
  var disclistarray = new Array(); // create the tracklist array to use later

  for (var desc_discs = 0; desc_discs < disccount.length; desc_discs++) {
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

        track.artist_credit = track_artist_credit;
        tracklistarray.push(track);
      }
    }
    disclistarray.push(tracklistarray);
  }

  //LOGGER.debug(disclistarray);
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
  for (var l = 0; l < disccount.length; l++) {
    var disc = {
      'position': l + 1,
      'format': release_format,
      'tracks': disclistarray[l]
    };
    release.discs.push(disc);
  }

  release.labels = prodlabels;

  // Release URL
  release.urls = new Array();
  release.urls.push({
    'url': window.location.href,
    'link_type': MBImport.URL_TYPES.purchase_for_mail_order
  });
  // TODO check if CD then add purchase medium

  // Release date
  var releasedate = releasedaterel;
  // need to fix release date swith before we add the date parser
  /*  if (typeof releasedate != "undefined" && releasedate != "") {
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
    }*/

  LOGGER.info("Release:", release);

  return release;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Loot -> MusicBrainz mapping                                                  //
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