// ==UserScript==
// @name           MusicBrainz: Import from Beatport
// @version        2014.09.21.0
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @include        http*://www.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @require        https://raw.githubusercontent.com/phstc/jquery-dateFormat/master/src/dateFormat.js
// @require        https://raw.githubusercontent.com/phstc/jquery-dateFormat/master/src/jquery.dateFormat.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// ==/UserScript==

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

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

  var releaseDate = $( "td.meta-data-label:contains('Release Date')" ).next().text().split("-");
  release.year = releaseDate[0];
  release.month = releaseDate[1];
  release.day = releaseDate[2];

  release.labels = [];
  release.labels.push(
    {
      name: $( "td.meta-data-label:contains('Labels')" ).next().text(),
      catno: $( "td.meta-data-label:contains('Catalog #')" ).next().text()
    }
  );

  // Tracks
  var tracks = [];
  unsafeWindow.$( "span[data-json]" ).each(
    function ( index, tagSoup ) {
      var t = $.parseJSON($(tagSoup).attr('data-json'));
      release.title = t.release.name;

      var artist = [];
      t.artists.forEach(
        function ( artistObject, index, arr ) {
          artist.push({
            'artist_name': artistObject.name
          });
        }
      );
      release.artist_credit = artist;
      tracks.push({
        'artist_credit': artist,
        'title': t.title,
        'duration': t.length
      });
    }
  );
  mylog(tracks);
  release.discs = [];
  release.discs.push( {
    'tracks': tracks,
    'format': "Digital Media"
  } );

  mylog(release);
  return release;
}

// Insert button into page under label information
function insertLink(release) {
    var edit_note = 'Imported from ' + window.location.href;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);

    $("table.meta-data tbody").append(innerHTML);
}

function mylog(obj) {
    var DEBUG = true;
    if (DEBUG && unsafeWindow.console) {
        unsafeWindow.console.log(obj);
    }
}
