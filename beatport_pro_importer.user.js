// ==UserScript==
// @name           Import Beatport Pro releases to MusicBrainz
// @author         VxJasonxV
// @description    One-click importing of releases from pro.beatport.com/release pages into MusicBrainz
// @sourceURL      https://github.com/VxJasonxV/musicbrainz-userscripts/blob/master/beatport_pro_importer.user.js
// @version        2015.06.10.0
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_pro_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_pro_importer.user.js
// @include        http://pro.beatport.com/release/*
// @include        https://pro.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// ==/UserScript==

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

  eval( $( "#data-objects" )[0].textContent );
  var release = retrieveReleaseInfo();
  insertLink(release);

});

function retrieveReleaseInfo() {
  var release = {};

  // Release information global to all Beatport releases
  release.packaging = 'None';
  release.country = "XW";
  release.status = 'official';
  release.urls = [];
  release.urls.push( { 'url': window.location.href } );
  release.id = $( "a[data-release]" ).attr('data-release');

  release.title = $( "h3.interior-type:contains('Release')" ).next().text().trim();

  var releaseDate = $( ".category:contains('Release Date')" ).next().text().split("-");
  release.year = releaseDate[0];
  release.month = releaseDate[1];
  release.day = releaseDate[2];

  release.labels = [];
  release.labels.push(
    {
      name: $( ".category:contains('Labels')" ).next().text().trim(),
      catno: $( ".category:contains('Catalog')" ).next().text()
    }
  );

  // Tracks
  var tracks = [];

  window.Playables.tracks.forEach(
    function ( j, index, arr ) {
      if(j.release.id != release.id) {
        return;
      }

      var artist = [];
      j.artists.forEach(
        function ( a, index, arr ) {
          artist.push({
            'artist_name': a.name
          });
        }
      );
      release.artist_credit = artist;

      tracks.push({
        'artist_credit': artist,
        'title': j.title,
        'duration': j.duration.minutes
      });
    }
  );
  release.discs = [];
  release.discs.push( {
    'tracks': tracks,
    'format': "Digital Media"
  } );

  LOGGER.info("Parsed release: ", release);
  return release;
}

// Insert button into page under label information
function insertLink(release) {
    var edit_note = 'Imported from ' + window.location.href;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);

    $(".interior-release-chart-content-list").append(innerHTML);
}
