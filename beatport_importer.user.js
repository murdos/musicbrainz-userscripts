// ==UserScript==
// @name           Import Beatport releases to MusicBrainz
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2015.06.17.0
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @include        http*://classic.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

    var release = retrieveReleaseInfo();
    insertLink(release);

});

function retrieveReleaseInfo() {
  function contains_or(selector, list) {
    selectors = [];
    $.each(list, function(ind, value) {
      selectors.push(selector + ':contains("' + value.replace('"', '\\"') + '")');
    });
    return selectors.join(',');
  }
  var release_date_strings = [
    'Release Date', 'Fecha de lanzamiento', 'Date de sortie', 'Erscheinungsdatum', 'Data de lançamento', 'Releasedatum', "Data di uscita", "リリース予定日"
  ];
  var release_strings = [
    'Release', 'Lanzamiento', 'Sortie', 'Album', 'Lançamento'
  ];
  var labels_strings = [
    'Labels', 'Sello', 'Gravadoras', "Label", "Etichetta", "Editora", "レーベル"
  ];
  var catalog_strings = [
    'Catalog', 'Catálogo', 'Catalogue', 'Katalog', 'Catalogus', "Catalogo", "カタログ"
  ];
  var release = {};

  // Release information global to all Beatport releases
  release.packaging = 'None';
  release.country = "XW";
  release.status = 'official';
  release.urls = [];
  release.urls.push( { 'url': window.location.href } );

  var releaseDate = $(contains_or("td.meta-data-label", release_date_strings)).next().text().split("-");
  release.year = releaseDate[0];
  release.month = releaseDate[1];
  release.day = releaseDate[2];

  release.labels = [];
  release.labels.push(
    {
      name: $(contains_or("td.meta-data-label", labels_strings)).next().text(),
      catno: $(contains_or("td.meta-data-label", catalog_strings)).next().text()
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
  LOGGER.debug("tracks: ", tracks);
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
    var parameters = MBImport.buildFormParameters(release, edit_note);

    var innerHTML = MBImport.buildFormHTML(parameters);
    var tr = $("<tr><td span='2' /></tr>");
    tr.find('td').append(innerHTML);
    $("table.meta-data tbody").append(tr);
}
