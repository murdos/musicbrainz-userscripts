// ==UserScript==
// @name           Import Beatport Pro releases to MusicBrainz
// @author         VxJasonxV
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from pro.beatport.com/release pages into MusicBrainz
// @version        2015.06.10.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_pro_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_pro_importer.user.js
// @include        http://pro.beatport.com/release/*
// @include        https://pro.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/import_functions.js
// @require        lib/logger.js
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){
  var release_url = window.location.href.replace('/\?.*$/', '').replace(/#.*$/, '');
  var release = retrieveReleaseInfo(release_url);
  insertLink(release, release_url);
});

function retrieveReleaseInfo(release_url) {
  var release = {};

  // Release information global to all Beatport releases
  release.packaging = 'None';
  release.country = "XW";
  release.status = 'official';
  release.id = $( "span.playable-play-all[data-release]" ).attr('data-release');

  release.title = $( "h3.interior-type:contains('Release')" ).next().text().trim();

  var releaseDate = $( ".category:contains('Release Date')" ).next().text().split("-");
  release.year = releaseDate[0];
  release.month = releaseDate[1];
  release.day = releaseDate[2];

  // URLs
  release.urls = [];

  release.urls.push({
    'url': release_url,
    'link_type': MBReleaseImportHelper.URL_TYPES.purchase_for_download
  });

  release.labels = [];
  release.labels.push(
    {
      name: $( ".category:contains('Labels')" ).next().text().trim(),
      catno: $( ".category:contains('Catalog')" ).next().text()
    }
  );

  // Tracks
  var tracks = [];
  var the_tracks = unsafeWindow.Playables.tracks;
  var seen_tracks = {}; // to shoot duplicates ...
  var release_artists = [];
  $.each(the_tracks,
    function (idx, track) {
      if (track.release.id != release.id) {
        return;
      }
      if (seen_tracks[track.id]) {
        return;
      }
      seen_tracks[track.id] = true;

      var artists = [];
      $.each(track.artists,
        function (idx2,  artist) {
          artists.push({
            'artist_name': artist.name
          });
          release_artists.push(artist.name);
        }
      );

      var title = track.name;
      if (track.mix && track.mix != 'Original Mix') {
        title += ' (' + track.mix + ')';
      }
      tracks.push({
        'artist_credit': artists,
        'title': title,
        'duration': track.duration.minutes
      });
    }
  );
  var unique_artists = [];
  $.each(release_artists, function(i, el){
    if ($.inArray(el, unique_artists) === -1) {
      unique_artists.push(el);
    }
  });

  var artists = unique_artists.map(function(item) { return {artist_name: item}; });
  if (artists.length > 2) {
    var last = artists.pop();
    last.joinphrase = '';
    var prev = artists.pop();
    prev.joinphrase = ' & ';
    for (var i = 0; i < artists.length; i++) {
      artists[i].joinphrase = ', ';
    }
    artists.push(prev);
    artists.push(last);
  } else if (artists.length == 2) {
    artists[0].joinphrase = ' & ';
  }

  release.artist_credit = artists;
  release.discs = [];
  release.discs.push( {
    'tracks': tracks,
    'format': "Digital Media"
  } );

  LOGGER.info("Parsed release: ", release);
  return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    var edit_note = 'Imported from ' + release_url;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);

    $(".interior-release-chart-content-list").append('<li class="interior-release-chart-content-item musicbrainz-import">' + innerHTML + '</li>');
    $('.musicbrainz-import input[type="submit"]').css('background', '#eee');
}
