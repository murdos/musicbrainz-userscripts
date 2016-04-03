// ==UserScript==
// @name           Import CD Baby releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from cdbaby.com into MusicBrainz.
// @version        2016.04.03.0
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/cdbaby_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/cdbaby_importer.user.js
// @include        /^https?:\/\/(?:www\.)?(?:cdbaby\.com)\/cd\/[^\/]+/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){
  MBImportStyle();
  var release_url = window.location.href.replace('/\?.*$/', '').replace(/#.*$/, '');
  release_url = release_url.replace(/^(?:https?:\/\/)?(?:www\.)?(?:cdbaby\.com)\//, "http://www.cdbaby.com/");

  var release;
  var buttons = "";
  $("div.album-page-buy-button-container a").each(function() {
    var format = $(this).attr("title").trim();
    release = retrieveReleaseInfo(release_url, format);
    buttons += getImportButton(release, release_url, format);
  });

  if (release) {
    insertImportLinks(release, buttons);
  }

});


function retrieveReleaseInfo(release_url, format) {

  // Release defaults
  var release = {
    artist_credit: '',
    title: $("h1 span[itemprop='name']").text().trim(),
    year: 0,
    month: 0,
    day: 0,
    format: '',
    packaging: '',
    country: '',
    status: 'official',
    language: 'eng',
    script: 'Latn',
    type: '',
    urls: [],
    labels: [],
    discs: [],
  };

  var link_type = MBImport.URL_TYPES;

  release.urls = [];
  if (format.match(/^vinyl/i)) {
    release.country = 'US';
    release.format = "Vinyl";
    release.urls.push({
      'url': release_url,
      'link_type': link_type.purchase_for_mail_order
    });
  } else if (format.match(/^cd/i)) {
    release.country = 'US';
    release.format = 'CD';
    release.urls.push({
      'url': release_url,
      'link_type': link_type.purchase_for_mail_order
    });
  } else if (format.match(/^download/i)) {
    release.country = 'XW';
    release.packaging = 'None';
    release.format = "Digital Media";
    release.urls.push({
      'url': release_url,
      'link_type': link_type.purchase_for_download
    });
  }

  // Release artist
  var artist = $("h2 span[itemprop='byArtist'] a").text().trim();
  var various_artists = (artist == 'Various');
  if (various_artists) {
    release.artist_credit = [ MBImport.specialArtist('various_artists') ];
  } else {
    release.artist_credit = MBImport.makeArtistCredits([artist]);
  }

  release.year = $("span[itemprop='datePublished']").text().trim()

  // Tracks
  var tracks = [];
  var trackcount = 0
  $("table.track-table tr[itemprop='track']").each(function() {
    var artists = [];
	  var trackno = tracks.length + 1;
    if (trackno == 1 && tracks.length) {
      // multiple "discs"
      release.discs.push( {
        'tracks': tracks,
        'format': release.format
      } );
      tracks = [];
    }
	  var trackname = $(this).find("meta[itemprop='name']").attr('content').trim();
	  var tracklength = $(this).find("meta[itemprop='duration']").attr('content').trim();

    var track_artists = [];
    // FIXME various artists releases ...
    $(this).find("div.track-artist").each(
      function () {
        var artistname = $(this).text().trim();
        if (artistname) {
          track_artists.push(artistname);
        }
      }
    );

    var ac = {
      'artist_credit': '',
      'title': trackname,
      'duration': MBImport.ISO8601toMilliSeconds(tracklength)
    };
    if (!track_artists.length && various_artists) {
      ac.artist_credit = [ MBImport.specialArtist('unknown') ];
    } else {
      ac.artist_credit = MBImport.makeArtistCredits(track_artists);
    }
    tracks.push(ac);
  });

  release.discs.push( {
    'tracks': tracks,
    'format': release.format
  } );

  LOGGER.info("Parsed release: ", release);
  return release;
}

function getImportButton(release, release_url, format) {
  var edit_note = MBImport.makeEditNote(release_url, "CD Baby", format);
  var parameters = MBImport.buildFormParameters(release, edit_note);
  return MBImport.buildFormHTML(parameters).replace('<span>Import into MB</span>', '<span>Import ' + format + '</span>');
}

function insertImportLinks(release, buttons) {
  $("div.right-container-top-right").prepend(
    $('<div id="mb_buttons">'
    + buttons
    + MBImport.buildSearchButton(release)
    + '</div>').hide()
  );
  $('#mb_buttons').css({
    'margin-bottom': '5px',
    'padding': '2%',
    'background-color': '#fff'
  });

  $('form.musicbrainz_import').css({
    'margin-bottom': '5px'
  });

  $('#mb_buttons').slideDown();
}
