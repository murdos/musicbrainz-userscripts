// ==UserScript==
// @name           Import Bandcamp releases into MB
// @description    Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2015.05.29.1
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include        http*://*.bandcamp.com/album/*
// @include        http*://*.bandcamp.com/track/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// ==/UserScript==


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
      parent_album: '',
      labels: [],
      format: 'Digital Media',
      country: 'XW',
      type: '',
      status: 'official',
      packaging: 'None',
      language: 'eng',
      script: 'Latn',
      urls: []
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

    if (bandcampEmbedData.album_title) {
      release.parent_album = bandcampEmbedData.album_title;
    }

    // FIXME: implement a mapping between bandcamp release types and MB ones
    release.type = bandcampAlbumData.current.type;
    // map Bandcamp single tracks to singles
    if (release.type == "track") {
      release.type = "single";
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
      numtracks = parseInt(match);
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
    var link_type = {
      purchase_for_download: 74,
      download_for_free: 75,
      stream_for_free: 85,
      license: 301
    };
    // Download for free vs. for purchase
    if (bandcampAlbumData.current.download_pref !== null) {
      if (bandcampAlbumData.freeDownloadPage !== null || bandcampAlbumData.current.download_pref === 1 || (
          bandcampAlbumData.current.download_pref === 2 && bandcampAlbumData.current.minimum_price === 0)) {
        release.urls.push({
          'url': window.location.href,
          'link_type': link_type.download_for_free
        });
      }
      if (bandcampAlbumData.current.download_pref === 2) {
        release.urls.push({
          'url': window.location.href,
          'link_type': link_type.purchase_for_download
        });
      }
    }
    // Check if the release is streamable
    if (bandcampAlbumData.hasAudio && !nostream) {
      release.urls.push({
        'url': window.location.href,
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
    if (release.type == "single" && typeof release.parent_album != "undefined") {
      return false;
    }
    // Form parameters
    var edit_note = 'Imported from ' + window.location.href;
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

  var release = BandcampImport.retrieveReleaseInfo();
  LOGGER.info("Parsed release: ", release);
  BandcampImport.insertLink(release);

  // append a comma after each tag to ease cut'n'paste to MB
  $("div.tralbum-tags a:not(:last-child)").after(",");

  // append a link to the full size image
  var fullsizeimageurl = $("div#tralbumArt a").attr("href").replace('_10', '_0');
  $("div#tralbumArt a").after("<div id='bci_link'><a class='custom-color' href='" + fullsizeimageurl +
    "' title='Link to the original image (Bandcamp importer)'>Original image</a></div>");

});
