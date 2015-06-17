// ==UserScript==
// @name           Import Last.fm releases to MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from last.fm into MusicBrainz. PLEASE import releases from more reliable sources if possible.
// @version        2015.06.15.0
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lastfm_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lastfm_importer.user.js
// @include        /^https?:\/\/(?:www\.)?(?:last\.fm|lastfm\.(?:com\.br|com\.tr|at|com|de|es|fr|it|jp|pl|pt|ru|se))\/music\/[^\/]+/[^+][^\/]+/
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/import_functions.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){
  MBImportStyle();
  var release_url = window.location.href.replace('/\?.*$/', '').replace(/#.*$/, '');
  release_url = release_url.replace(/^(?:https?:\/\/)?(?:www\.)?(?:last\.fm|lastfm\.(?:com\.br|com\.tr|at|com|de|es|fr|it|jp|pl|pt|ru|se))\//, "http://www.last.fm/");

  var release = retrieveReleaseInfo(release_url);
  insertLink(release, release_url);
});


function retrieveReleaseInfo(release_url) {

  // Release artist
  var artist = $("article span[itemprop='byArtist'] meta[itemprop='name']").attr('content').trim();
  var various_artists = (artist == 'Various Artists');

  // Release defaults
  var release = {
    artist_credit: MBReleaseImportHelper.makeArtistCredits([artist]),
    title: $("h1[itemprop='name']").text().trim(),
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

  // Tracks
  var tracks = [];
  $("#albumTracklist tr[itemprop='tracks']").each(function() {
    var artists = [];
	  var trackno = parseInt($(this).find("td.positionCell").text(), 10);
    if (trackno == 1 && tracks.length) {
      // multiple "discs"
      release.discs.push( {
        'tracks': tracks,
        'format': release.format
      } );
      tracks = [];
    }
	  var trackname = $(this).find("td.subjectCell span[itemprop='name']").text().trim();
	  var tracklength = $(this).find("td.durationCell").text().trim();

    // VA releases have an additional link to the lastfm artist page
    var track_artists = [];
    $(this).find("td.subjectCell > a:not(:last)").each(
      function () {
        track_artists.push($(this).text().trim());
      }
    );
    if (track_artists) {
      artists = track_artists;
    }
    if (!artists.length && various_artists) {
      artists = ['[unknown]'];
    }
    tracks.push({
        'artist_credit': MBReleaseImportHelper.makeArtistCredits(artists),
        'title': trackname,
        'duration': tracklength
      });
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
    var edit_note = MBReleaseImportHelper.makeEditNote(release_url, 'Last.fm');
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);

    var mbUI = $('<div id="musicbrainz-import">' + innerHTML + '</div>').hide();
    mbUI.css({'margin-bottom': '6px', 'padding': '2px', 'background-color': '#444', 'text-align': 'center'});
    $("div.g4").prepend(mbUI);
    $('#musicbrainz-import').slideDown();
}
