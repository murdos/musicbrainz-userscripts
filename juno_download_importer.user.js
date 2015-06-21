// ==UserScript==
// @name           Import Juno Download releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from junodownload.com/products pages into MusicBrainz
// @version        2015.06.17.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/juno_download_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/juno_download_importer.user.js
// @include        http*://www.junodownload.com/products/*
// @include        http*://secure.junodownload.com/products/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){
  MBImportStyle();
  var release_url = window.location.href.replace('/\?.*$/', '').replace(/#.*$/, '');
  var release = retrieveReleaseInfo(release_url);
  insertLink(release, release_url);
});

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

  var m = rdate.match(/(\d{1,2}) ([a-z]+), (\d{4})/i);
  if (m) {
    return {
      year: m[3],
      month: months[m[2]],
      day: m[1]
    }
  }
  return false;
}

function retrieveReleaseInfo(release_url) {

  // Release defaults
  var release = {
    artist_credit: [],
    title: $("#product_heading_title").text().trim(),
    year: 0,
    month: 0,
    day: 0,
    format: 'Digital Media',
    packaging: 'None',
    country: 'XW',
    status: 'official',
    language: 'eng',
    script: 'Latn',
    type: '',
    urls: [],
    labels: [],
    discs: [],
  };

  // Release date
  var parsed_releaseDate = parseReleaseDate($("#product_info_released_on").text().trim());
  if (parsed_releaseDate) {
    release.year = parsed_releaseDate.year;
    release.month = parsed_releaseDate.month;
    release.day = parsed_releaseDate.day;
  }

  // URLs
  release.urls.push({
    'url': release_url,
    'link_type': MBImport.URL_TYPES.purchase_for_download
  });

  release.labels.push(
    {
      name: $("#product_heading_label").text().trim(),
      catno: $("#product_info_cat_no").text().trim()
    }
  );

  // Tracks
  var tracks = [];
  $(".product_tracklist_records[itemprop='tracks']").each(function() {
    var artists = [];
	  var trackno = $(this).find(".product_tracklist_heading_records_sn").text().trim() - 1;
	  var trackname = $(this).find(".product_tracklist_heading_records_title").text().trim();
	  var tracklength = $(this).find(".product_tracklist_heading_records_length").text().trim();
    var m = trackname.match(/^([^-]+) - (.*)$/);
    if (m) {
      artists = [m[1]];
      trackname = m[2];
    }
    tracks.push({
        'artist_credit': MBImport.makeArtistCredits(artists),
        'title': trackname,
        'duration': tracklength
      });
  });

  var parsed_release_artist = $("#product_heading_artist").text().trim();
  if (parsed_release_artist == 'VARIOUS') {
    release.artist_credit = [ MBImport.specialArtist('various_artists') ];
  } else {
    release.artist_credit = MBImport.makeArtistCredits([ parsed_release_artist ]);
  }
  release.discs.push( {
    'tracks': tracks,
    'format': release.format
  } );

  LOGGER.info("Parsed release: ", release);
  return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    var edit_note = MBImport.makeEditNote(release_url, 'Juno Download');
    var parameters = MBImport.buildFormParameters(release, edit_note);

    var mbUI = $('<div id="mb_buttons">'
        + MBImport.buildFormHTML(parameters)
        + MBImport.buildSearchButton(release)
        + '</div>').hide();

    $("div.sociald").before(mbUI);
    $('#mb_buttons').css({'background': '#759d44', 'border': '2px solid #ddd', 'text-align': 'center'});
    $('form.musicbrainz_import button').css({width: '80%'});
    mbUI.slideDown();
}
