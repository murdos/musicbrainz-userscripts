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
  var releaseDate = $( ".category:contains('Release Date')" ).next().text().split("-");

  // Release information global to all Beatport releases
  var release = {
    artist_credit: [],
    title: $( "h3.interior-type:contains('Release')" ).next().text().trim(),
    year: releaseDate[0],
    month: releaseDate[1],
    day: releaseDate[2],
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

  var release_id = $( "span.playable-play-all[data-release]" ).attr('data-release');

  // URLs
  release.urls.push({
    'url': release_url,
    'link_type': MBReleaseImportHelper.URL_TYPES.purchase_for_download
  });

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
  var total_duration = 0;
  $.each(the_tracks,
    function (idx, track) {
      if (track.release.id != release_id) {
        return;
      }
      if (seen_tracks[track.id]) {
        return;
      }
      seen_tracks[track.id] = true;

      var artists = [];
      $.each(track.artists,
        function (idx2,  artist) {
          artists.push(artist.name);
          release_artists.push(artist.name);
        }
      );

      var title = track.name;
      if (track.mix && track.mix != 'Original Mix') {
        title += ' (' + track.mix + ')';
      }
      tracks.push({
        'artist_credit': MBReleaseImportHelper.makeArtistCredits(artists),
        'title': title,
        'duration': track.duration.minutes
      });
      total_duration += track.duration.milliseconds;
    }
  );

  var unique_artists = [];
  $.each(release_artists, function(i, el){
    if ($.inArray(el, unique_artists) === -1) {
      unique_artists.push(el);
    }
  });

  release.artist_credit = MBReleaseImportHelper.makeArtistCredits(unique_artists);
  release.discs.push( {
    'tracks': tracks,
    'format': release.format
  } );

  release.type = MBReleaseImportHelper.guessReleaseType(release.title, tracks.length, total_duration/1000);
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
