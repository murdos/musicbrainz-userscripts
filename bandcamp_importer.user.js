// ==UserScript==
// @name           Import Bandcamp releases to MusicBrainz
// @description    Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2015.06.15.0
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include        http*://*.bandcamp.com/album/*
// @include        http*://*.bandcamp.com/track/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/import_functions.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// ==/UserScript==


// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

var BandcampImport = {

  // Analyze Bandcamp data and return a release object
  retrieveReleaseInfo: function () {

    var bandcampAlbumData = unsafeWindow.TralbumData;
    var bandcampEmbedData = unsafeWindow.EmbedData;

    var release = {
      discs: [],
      artist_credit: [],
      title: '',
      year: 0,
      month: 0,
      day: 0,
      parent_album_url: '',
      labels: [],
      format: 'Digital Media',
      country: 'XW',
      type: '',
      status: 'official',
      packaging: 'None',
      language: 'eng',
      script: 'Latn',
      urls: [],
      url: bandcampAlbumData.url
    };

    // Release artist credit
    release.artist_credit = [{
      artist_name: bandcampAlbumData.artist
    }];

    // Grab release title
    release.title = bandcampAlbumData.current.title;

    // Grab release event information
    var date = this.convdate(bandcampAlbumData.current.release_date);
    if (date) {
      if (!(date.year > 2008 || (date.year == 2008 && date.month >= 9))) {
        // use publish date if release date is before Bandcamp launch (2008-09)
        var pdate = this.convdate(bandcampAlbumData.current.publish_date);
        if (pdate) {
          date = pdate;
        }
      }
      release.year = date.year;
      release.month = date.month;
      release.day = date.day;
    }

    // FIXME: implement a mapping between bandcamp release types and MB ones
    if (bandcampAlbumData.current.type == "track") {
      // map Bandcamp single tracks to singles
      release.type = "single";
      // if track belongs to an album, get its url.
      if (bandcampEmbedData.album_embed_data) {
        release.parent_album_url = bandcampEmbedData.album_embed_data.linkback;
        release.type = 'track'; // <-- no import
      }
    }

    // Tracks
    var disc = {
      tracks: [],
      format: release.format
    };
    release.discs.push(disc);
    $.each(bandcampAlbumData.trackinfo, function (index, bctrack) {
      var track = {
        'title': bctrack.title,
        'duration': Math.round(bctrack.duration * 1000),
        'artist_credit': []
      };
      disc.tracks.push(track);
    });

    // Check for hidden tracks (more tracks in the download than shown for streaming ie.)
    var showntracks = bandcampAlbumData.trackinfo.length;
    var numtracks = -1;
    var nostream = false;
    // album description indicates number of tracks in the download
    var match = /^\d+ track album$/.exec($("meta[property='og:description']").attr("content"));
    if (match) {
      numtracks = parseInt(match, 10);
    }
    if (numtracks > 0 && numtracks > showntracks) {
      // display a warning if tracks in download differs from tracks shown
      $('h2.trackTitle').append(
        '<p style="font-size:70%; font-style: italic; margin: 0.1em 0;">' +
          'Warning: ' + numtracks + ' vs ' + showntracks + ' tracks' +
        '</p>'
      );

      // append unknown tracks to the release
      for (var i = 0; i < numtracks - showntracks; i++) {
        var track = {
          'title': '[unknown]',
          'duration': null,
          'artist_credit': []
        };
        disc.tracks.push(track);
      }
      // disable stream link as only part of the album can be streamed
      nostream = true;
    }

    // URLs
    var link_type = MBReleaseImportHelper.URL_TYPES;
    // Download for free vs. for purchase
    if (bandcampAlbumData.current.download_pref !== null) {
      if (bandcampAlbumData.freeDownloadPage !== null || bandcampAlbumData.current.download_pref === 1 || (
          bandcampAlbumData.current.download_pref === 2 && bandcampAlbumData.current.minimum_price === 0)) {
        release.urls.push({
          'url': release.url,
          'link_type': link_type.download_for_free
        });
      }
      if (bandcampAlbumData.current.download_pref === 2) {
        release.urls.push({
          'url': release.url,
          'link_type': link_type.purchase_for_download
        });
      }
    }
    // Check if the release is streamable
    if (bandcampAlbumData.hasAudio && !nostream) {
      release.urls.push({
        'url': release.url,
        'link_type': link_type.stream_for_free
      });
    }
    // Check if release is Creative Commons licensed
    if ($("div#license a.cc-icons").length > 0) {
      release.urls.push({
        'url': $("div#license a.cc-icons").attr("href"),
        'link_type': link_type.license
      });
    }
    // Check if album has a back link to a label
    var label = $("a.back-to-label-link span.back-to-label-name").text();
    if (label) {
      release.labels.push({
        'name': label,
        'mbid': '',
        'catno': 'none'
      });
    }

    return release;
  },

  // Insert links in page
  insertLink: function (release) {
    if (release.type == "track") {
      // only import album or single, tracks belong to an album
      return false;
    }
    // Form parameters
    var edit_note = 'Imported from ' + release.url;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);
    // Build form
    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);
    // Append MB import link
    $('h2.trackTitle').append(innerHTML);
  },

  // helper to convert bandcamp date to MB date
  convdate: function (date) {
    if (typeof date != "undefined" && date !== "") {
      var d = new Date(date);
      return {
        "year": d.getUTCFullYear(),
        "month": d.getUTCMonth() + 1,
        "day": d.getUTCDate()
      };
    }
    return false;
  }
};

$(document).ready(function () {
  MBImportStyle();

  var mblinks = new MBLinks('BCI_MBLINKS_CACHE');

  var release = BandcampImport.retrieveReleaseInfo();
  LOGGER.info("Parsed release: ", release);
  BandcampImport.insertLink(release);

  // add MB artist link
  var artist_link = release.url.match(/^(http:\/\/[^\/]+)/)[1];
  mblinks.searchAndDisplayMbLink(artist_link, 'artist', function (link) { $('div#name-section span[itemprop="byArtist"]').before(link); } );

  if (release.type == 'track') {
    // add MB links to parent album
    mblinks.searchAndDisplayMbLink(release.parent_album_url, 'release', function (link) { $('div#name-section span[itemprop="inAlbum"] a:first').before(link); } );
  } else {
    // add MB release links to album or single
    mblinks.searchAndDisplayMbLink(release.url, 'release', function (link) { $('div#name-section span[itemprop="byArtist"]').after(link); } );
  }

  // append a comma after each tag to ease cut'n'paste to MB
  $("div.tralbum-tags a:not(:last-child)").after(",");

  // append a link to the full size image
  var fullsizeimageurl = $("div#tralbumArt a").attr("href").replace('_10', '_0');
  $("div#tralbumArt").after("<div id='bci_link'><a class='custom-color' href='" + fullsizeimageurl +
    "' title='Open original image in a new tab (Bandcamp importer)' target='_blank'>Original image</a></div>");

  $("div#bci_link").css({ 'padding-top': '0.5em', 'text-align': 'right' });
  $("div#bci_link a").css({ 'font-weight': 'bold' });

});
