// ==UserScript==
// @name        Import Metal Archives releases into MusicBrainz
// @namespace   https://github.com/murdos/musicbrainz-userscripts/
// @version     2015.10.04.0
// @description Add a button on Metal Archives release pages allowing to open MusicBrainz release editor with pre-filled data for the selected release
// @downloadURL https://raw.github.com/murdos/musicbrainz-userscripts/master/metalarchives_importer.user.js
// @update      https://raw.github.com/murdos/musicbrainz-userscripts/master/metalarchives_importer.user.js
// @include     http://www.metal-archives.com/albums/*/*/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require     lib/mbimport.js
// @require     lib/mbimportstyle.js
// @require     lib/logger.js
// @icon        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==


// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function() {
  MBImportStyle();

  var release_url = window.location.href.replace('/\?.*$/', '').replace(/#.*$/, '');
  var release = retrieveReleaseInfo(release_url);
  insertLink(release, release_url);
  LOGGER.info("Parsed release: ", release);
});

function setreleasedate(release, datestring) {
  if (/^\d{4}$/.exec(datestring)) {
    release.year = datestring;
  } else if (datestring.indexOf(',') != -1) {
    var commaindex = datestring.indexOf(',');
    var d = new Date(datestring.substring(0, commaindex - 2) + datestring.substring(commaindex));
    release.year = d.getFullYear();
    release.month = d.getMonth() + 1;
    release.day = d.getDate();
  } else {
    var d = new Date("2 " + datestring);
    release.year = d.getFullYear();
    release.month = d.getMonth() + 1;
  }
  return release;
}

function getGenericalData() {
  var rdata = new Array();
  var keydata = $('dl.float_left dt, dl.float_right dt').map(function() {
    var s = $.trim($(this).text());
    return s.substring(0, s.length - 1);
  }).get();
  var valuedata = $('dl.float_left dd,dl.float_right dd').map(function() {
    return $.trim($(this).text());
  }).get();
  for (i = 0; i < keydata.length; i++) {
    rdata[keydata[i]] = valuedata[i];
  }
  return rdata;
}

function getArtistsList() {
  return $.map($('h2.band_name').text().split('/'), $.trim);
}

function retrieveReleaseInfo(release_url) {

  var release = {
    discs: [],
    artist_credit: [],
    title: '',
    year: 0,
    month: 0,
    day: 0,
    parent_album_url: '',
    labels: [],
    format: '',
    country: '',
    type: '',
    status: 'official',
    packaging: '',
    language: '',
    script: '',
    urls: [],
  };

  var rdata = getGenericalData();
  var artists = getArtistsList();
  var joinphrase = "";
  if (artists.length > 1) {
    if (rdata["Type"] == "Split") {
      joinphrase = " / ";
    }
    else {
      joinphrase = " & ";
    }
  }
  for (var i = 0; i < artists.length; i++) {
    release.artist_credit.push({
      artist_name: artists[i],
      credited_name: artists[i],
      joinphrase: i != artists.length - 1 ? joinphrase : ""
    });
  }
  release.title = $('h1.album_name').text();

  release = setreleasedate(release, rdata["Release date"]);
  if ("Label" in rdata) {
    // TODO: add case for multiple labels if such a case exist
    var label = rdata["Label"];
    var label_mbid = "";
    if (label == "Independent") {
      label = "[no label]";
      label_mbid = '157afde4-4bf5-4039-8ad2-5a15acc85176';
    }
    var catno = rdata["Catalog ID"];
    if (catno == undefined || catno == "N/A") {
      catno = "";
    }
    release.labels.push({
      name: label,
      catno: catno,
      mbid: label_mbid
    });
  }

  if (rdata["Type"] in ReleaseTypes) {
    var types = ReleaseTypes[rdata["Type"]];
    release.type = types[0];
    // NOTE: secondary type may not be selected on MB editor, but it still works, a bug on MB side
    release.secondary_types = types.slice(1);
  }

  // FIXME: multiple vinyls ie. http://www.metal-archives.com/albums/Reverend_Bizarre/III%3A_So_Long_Suckers/415313
  if (rdata["Format"] in ReleaseFormat) {
    release.format = ReleaseFormat[rdata["Format"]];
  }

  if ("Version desc." in rdata) {
    if (rdata["Version desc."].indexOf("Digipak") != -1) {
      release.packaging = "Digipak";
    }
    if (release.format == "CD" && rdata["Version desc."] == "CD-R") {
      release.format = "CD-R";
    }
  }

  var identifiers = $("#album_tabs_notes > div:nth-child(2)").find("p:not([class])").contents();
  for (var j = 0; j < identifiers.length; j++) {
    if (identifiers[j].textContent.indexOf("Barcode:") != -1) {
      release.barcode = $.trim(identifiers[j].textContent.substring(8));
      break;
    }
  }

  // URLs
  var link_type = MBImport.URL_TYPES;
  release.urls.push({
    url: release_url,
    link_type: link_type.other_databases
  });

  var releaseNumber = 0;
  var disc = {
    tracks: [],
    format: release.format
  };
  release.discs.push(disc);

  var tracksline = $('table.table_lyrics tr.even,table.table_lyrics tr.odd');

  tracksline.each(function(index, element) {
    var trackNumber = $.trim(element.children[0].textContent).replace('.', "");
    if (trackNumber == "1" && trackNumber != index + 1) {
      releaseNumber++;
      release.discs.push({
        tracks: [],
        format: release.format
      });
    }

    // TODO: handling of split and compilation artists (artist - title)
    var track = {
      'number': trackNumber,
      'title': $.trim(element.children[1].textContent.replace(/\s+/g, ' ')),
      'duration': $.trim(element.children[2].textContent),
      'artist_credit': [release.artist_credit]
    };
    release.discs[releaseNumber].tracks.push(track);
  });
  return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
  var edit_note = MBImport.makeEditNote(release_url, 'Metal Archives');
  var parameters = MBImport.buildFormParameters(release, edit_note);

  var mbUI = $('<div id="musicbrainz-import">' + MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release) + '</div>').hide();

  $('h2.band_name').after(mbUI);
  $('#musicbrainz-import form').css({
    'padding': '0'
  });
  $('form.musicbrainz_import').css({
    'display': 'inline-block',
    'margin': '1px'
  });
  $('form.musicbrainz_import img').css({
    'display': 'inline-block'
  });

  mbUI.slideDown();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Metal Archives -> MusicBrainz mapping                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/*
release.type 	primary type release 	secondary release type
on MA				on MB

Full-length 		Album				Compilation
Live album			Single				Demo
Demo				EP					DJ-mix
Single				Broadcast			Interview
EP					Other				Live
Video									Audiobook
Boxed set								Mixtape/Street
Split									Remix
Video/VHS (legacy)						Soundtrack
Compilation								Spokenword
Split video
*/

//ReleaseTypes[MAtype]=["primary type","secondary type on mb"];
var ReleaseTypes = {
  "Full-length": ["album"],
  "Live album": ["album", "live"],
  "Demo": ["album", "demo"],
  "Single": ["single"],
  "EP": ["ep"],
  "Compilation": ["album", "compilation"],
  "Split": ["album"],
  "Collaboration": [""],
};

//ReleaseFormat[MAformat]="MBformat";
var ReleaseFormat = {
  "CD": "CD",
  "2CD": "CD",
  "Vinyl": "Vinyl",
  "7\" vinyl": "7\" Vinyl",
  "7\" vinyl (33⅓ RPM)": "7\" Vinyl",
  "10\" vinyl (33⅓ RPM)": "10\" Vinyl",
  "10\" vinyl": "10\" Vinyl",
  "12\" vinyl": "12\" Vinyl",
  "2 12\" vinyls": "12\" Vinyl",
  "12\" vinyl (33⅓ RPM)": "12\" Vinyl",
  "Cassette": "Cassette",
  "Digital": "Digital Media",
};
