// ==UserScript==
// @name           Import Loot releases to MusicBrainz
// @description    Add a button to import Loot.co.za releases to MusicBrainz
// @version        2016.04.05.1
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/loot_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/loot_importer.user.js
// @include        http*://www.loot.co.za/product/*
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

////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Test cases:
 * - http://www.loot.co.za/product/jakkie-en-daai-band-louw-klein-karoo-cowboy/mgyv-565-g540
 * - http://www.loot.co.za/product/various-artists-30-30-goue-sokkie-treffers-volume-17/hbhf-3088-g440
 * - http://www.loot.co.za/product/jacques-de-coning-veels-geluk/lzmg-572-g610
 * - http://www.loot.co.za/product/various-artists-vat-5-volume-5/dfnc-3405-g1a0
 * - http://www.loot.co.za/product/bette-midler-a-gift-of-love/mhgm-3483-g060  *** NOT WORKING *** extra tab
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

// Insert links to high res image in Loot page
function insertIMGlinks() {
  var imghref = $('#imagePreview0 a.fancybox').attr('href');
  imghref = 'http://static.loot.co.za/' + imghref;
  LOGGER.debug("insertIMGlink Firing", imghref);
  $('#imagePreview0').append('<p><a href="' + imghref + '">MB High Res Image</a></p>');
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
    var warning_buggy = $('<p><small><b>Warning</b>: this release has perhaps a buggy title, please check twice the data you import.</small><p').css({
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
  insertIMGlinks();

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

function parseReleaseDate(rdate) {
  var months = {
    "January": 1,
    "February": 2,
    "March": 3,
    "April": 4,
    "May": 5,
    "June": 6,
    "July": 7,
    "August": 8,
    "September": 9,
    "October": 10,
    "November": 11,
    "December": 12
  };

  var m = rdate.match(/([a-zA-Z]+) (\d{4})/i);
  if (m) {
    return {
      year: m[2],
      month: months[m[1]]
    }
  }
  return false;
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
  var release_maybe_buggy = false;

  // div#productContent table tbody tr.productOverview td.productInfo h1
  var AlbumName = document.querySelectorAll("div#productContent > table > tbody > tr.productOverview > td.productInfo > *");

  releaseartist = AlbumName[1].innerText;
  if (releaseartist == "Various Artists") {
    // Everything is: title(format)
    releaseartisttitle_regex = /(.*?)\((.*)\)/; //match external parenthesis
    if (AlbumName[0].innerText.match(releaseartisttitle_regex)) {
      releaseartisttitle = AlbumName[0].innerText.match(releaseartisttitle_regex);
      releasetitle = releaseartisttitle[1].trim();
      release_format = releaseartisttitle[2];
    } else {
      LOGGER.debug("Release Title for Various Artist album does not match the name convention. Hint: Change releaseartisttitle regex for Compilations");
      release_maybe_buggy = true;
      releasetitle = "";
      release_format = "";
    }
  } else {
    // artist - title(format)
    releaseartisttitle_regex = /(.*) (-|–) (.*?)\((.*)\)/;

    if (AlbumName[0].innerText.match(releaseartisttitle_regex)) {

      releaseartisttitle = AlbumName[0].innerText.match(releaseartisttitle_regex);

      releasetitle = releaseartisttitle[3].trim();
      releaseartist = releaseartisttitle[1];
      release_format = releaseartisttitle[4];

    } else {
      LOGGER.debug("Release Title for Various Artist album does not match the name convention. Hint: Change releaseartisttitle regex for non Compilations");
      release_maybe_buggy = true;
      releasetitle = "";
      releaseartist = "";
      release_format = "";
    }
  }
  LOGGER.debug("Release Title:", releasetitle, "  Release Artist:", releaseartist, "  Release Format:", release_format);


  // extract all tr from table with class productDetails
  $("table.productDetails tr").each(function() {
    // get text from first td, trim and convert it to lowercase
    var prodinfolabellowcase = $(this).children('td').eq(0).text().trim().toLowerCase();
    prodinfolabellowcase = prodinfolabellowcase.replace(/\s+/g, ''); //removing white spaces as switch isnt matching spaces for some reason
    // get test from second td, which is the corresponding value
    var value = $(this).children('td').eq(1).text().trim();
    // now compare and process
    switch (prodinfolabellowcase) {
      case "label:": // use these cases to select the spesific text values
        prodlabels.push({
          name: value
        });
        break;
      case "releasedate:":
        releasedaterel = value;
        LOGGER.debug(" ** release date: **", releasedaterel)
        break;
      case "countryoforigin:":
        releasecountry = value;
        LOGGER.debug(" ** country of origin: **", releasecountry);
        break;
      case "performers:":
        LOGGER.debug(" ** performers: **", value);
        release_artist_array.push({
          name: value
        });
        break;
      case "format:":
        LOGGER.debug(" ** format: **");
        break;
      case "categories:":
        //LOGGER.debug(" ** categories: **", value);

        if ($('table.productDetails tr td a:contains("Afrikaans")').length) {
          LOGGER.debug("Language Afrikaans exists");
          releaselanguage = "Afrikaans";
        }

        if ($('table.productDetails tr td a:contains("South Africa")').length) {
          LOGGER.debug("Country South Africa exists in catagories");
          releasecountry = "South Africa";
        }

        break;
    }

  });
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
      //   var artisttitle_regex = /(.*) - (.*)/; // regex: artist - title
      var artisttitle_regex = /(.*) (-|–) (.*)/; // regex: artist - title char 45 or 8211

      // need to check if this can be replaced with single regex for now check artist-title if
      // not matching check just title
      if (currenttrack[1].innerText.match(artisttitle_regex)) {
        var artisttitle = currenttrack[1].innerText.match(artisttitle_regex);
        descriptiontrack.title = artisttitle[3];
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

  // Check if anything is untoward and highlight to importer
  release.maybe_buggy = release_maybe_buggy;

  // Release artist credit
  release.artist_credit = new Array();

  var artist_name = releaseartist;

  var various_artists = (releaseartist == 'Various Artists');
  if (various_artists) {
    release.artist_credit = [MBImport.specialArtist('various_artists')];
  } else {
    release.artist_credit = MBImport.makeArtistCredits([artist_name]);
  }



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

  // TODO check format then change purchase medium

  // Release date
  var parsed_releaseDate = parseReleaseDate(releasedaterel);
  if (parsed_releaseDate) {
    release.year = parsed_releaseDate.year;
    release.month = parsed_releaseDate.month;
    release.day = parsed_releaseDate.day;
  }



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
