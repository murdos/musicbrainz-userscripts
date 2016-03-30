// ==UserScript==
// @name           Import CD Baby releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from cdbaby.com into MusicBrainz.
// @version        2016.03.30.0
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

  var release = retrieveReleaseInfo(release_url);
  insertLink(release, release_url);
});


function retrieveReleaseInfo(release_url) {


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

    // VA releases have an additional link to the lastfm artist page
    var track_artists = [];
    // FIXME various artists releases ...
    /*
    $(this).find("td.subjectCell > a:not(:last)").each(
      function () {
        track_artists.push($(this).text().trim());
      }
    );
    */
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

// Insert button into page under label information
function insertLink(release, release_url) {
    var edit_note = MBImport.makeEditNote(release_url, 'cdbaby');
    var parameters = MBImport.buildFormParameters(release, edit_note);

    $("div.right-container-top-right").prepend(
        $('<div id="mb_buttons">'
        + MBImport.buildFormHTML(parameters)
        + MBImport.buildSearchButton(release)
        + '</div>').hide()
    );
    $('#mb_buttons').css({
      'margin-bottom': '5px',
      'padding': '2%',
      'background-color': '#fff'
    });

    $('#mb_buttons').slideDown();
}
