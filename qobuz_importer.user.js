// ==UserScript==
// @name           Import Qobuz releases to MusicBrainz
// @description    Add a button on Qobuz's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2016.05.29.0
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/qobuz_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/qobuz_importer.user.js
// @include        /^https?://www\.qobuz\.com/[^/]+/album/[^/]+/[^/]+$/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

var DEBUG = false;
//DEBUG = true;
if (DEBUG) {
  LOGGER.setLevel('debug');
}

// list of qobuz artist id which should be mapped to Various Artists
var various_artists_ids = [ 26887, 145383, 353325, 183869, 997899 ];

function parseRelease(data) {
  var release = {};

  release.script = 'Latn';
  release.url = 'http://www.qobuz.com' + data.relative_url; // no lang

  release.title = data.title;
  release.artist_credit = MBImport.makeArtistCredits([data.artist.name]); // FIXME: various artists
  if ($.inArray(data.artist.id, various_artists_ids) != -1) {
    release.artist_credit = [ MBImport.specialArtist('various_artists') ];
  }

  // Release information global to all Beatport releases
  release.packaging = 'None';
  release.country = "";
  if (i18n_global && i18n_global.zone) {
    if (i18n_global.zone == 'GB') release.country = 'UK';
    else release.country = i18n_global.zone;
  }
  release.status = 'official';
  release.urls = [];
  release.urls.push({
    'url': release.url,
    'link_type': MBImport.URL_TYPES.purchase_for_download
  });

  // release timestamps are using France time + daylight saving (GMT+1 or GMT+2),
  // add 3 hours to get the day of release (matching the one displayed)
  var releaseDate = new Date((parseInt(data.released_at, 10) + 3*3600) * 1000);
  release.year = releaseDate.getUTCFullYear();
  release.month = releaseDate.getUTCMonth() + 1;
  release.day = releaseDate.getUTCDate();

  release.labels = [];
  $.each(data.label.name.split(' - '), function(index, label) {
    release.labels.push({
      name: label,
      catno: "" // no catno on qobuz ?
    });
  });

  var tracks = [];
  $.each(data.tracks.items, function(index, trackobj) {
    var track = {};
    track.title = trackobj.title;
    track.duration = trackobj.duration * 1000;
    var performers = trackobj.performers.split('\r - ').map(function(v) {
      var list = v.split(', ');
      var name = list.shift();
      return [name, list];
    });
    var artists = [];
    var featured_artists = [];
    $.each(performers, function(index, performer) {
      if ($.inArray('Featured Artist', performer[1]) != -1) {
       featured_artists.push(performer[0]);
      }
      else if ($.inArray('Main Performer', performer[1]) != -1
	  || $.inArray('Primary', performer[1]) != -1
	  || $.inArray('interprète', performer[1]) != -1
	  || $.inArray('Performer', performer[1]) != -1
	  || $.inArray('Main Artist', performer[1]) != -1
      ) {
        artists.push(performer[0]);
      }
    });
    track.artist_credit = MBImport.makeArtistCredits(artists);
    if (featured_artists.length) {
      if (track.artist_credit.length) {
        track.artist_credit[track.artist_credit.length-1].joinphrase = ' feat. ';
      }
      $.merge(track.artist_credit, MBImport.makeArtistCredits(featured_artists));
    }
    tracks.push(track);
  });
  release.discs = [];
  release.discs.push({
    'tracks': tracks,
    'format': "Digital Media"
  });

  LOGGER.info("Parsed release: ", release);
  return release;
}

// Insert button into page under label information
function insertLink(release) {
  var edit_note = MBImport.makeEditNote(release.url, 'Qobuz');
  var parameters = MBImport.buildFormParameters(release, edit_note);

  var mbUI = $('<p class="musicbrainz-import">' + MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release) + '</p>').hide();

  $("#info div.meta").append(mbUI);
  $('form.musicbrainz_import').css({
    'display': 'inline-block',
    'margin': '1px'
  });
  $('form.musicbrainz_import img').css({
    'display': 'inline-block',
    'width': '16px',
    'height': '16px'
  });
  mbUI.slideDown();
}

$(document).ready(function() {

  MBImportStyle();

  album_id = $('ol.tracks').attr('data-qbplayer-id');
  app_id = '667867760';

  wsUrl = 'http://www.qobuz.com/api.json/0.2/album/get?album_id=' + album_id + '&app_id=' + app_id;

  $.ajax({
    url: wsUrl,
    dataType: 'json',
    crossDomain: true,
    success: function(data, textStatus, jqXHR) {
      LOGGER.debug("Qobuz JSON Data from API:", data);
      var release = parseRelease(data);
      insertLink(release);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      LOGGER.error("AJAX Status: ", textStatus);
      LOGGER.error("AJAX error thrown: ", errorThrown);
    }
  });

  // replace image zoom link by the maximum size image link
  var maximgurl = $("#product-cover-link").attr("href").replace('_600', '_max');
  var maximg = new Image();
  maximg.onerror = function (evt) {
    LOGGER.debug("No max image");
  }
  maximg.onload = function (evt) {
    $("#product-cover-link").attr("href", maximgurl);
    $("#product-cover-link").attr("title", $("#product-cover-link").attr("title") + ' (Qobuz importer: ' + maximg.width + 'x' + maximg.height + ' image)');
  }
  maximg.src = maximgurl;

});
