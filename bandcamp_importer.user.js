// ==UserScript==
// @name           Import Bandcamp releases to MusicBrainz
// @description    Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version        2015.09.07.0
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include        /^https?://[^/]+/(?:album|track)/[^/]+$/
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

    // attempt to detect multiple artists tracks
    // bandcamp formats them as 'artist - tracktitle'
    // only set to true if ALL tracks are formatted like this
    // and if string doesn't start with a number (ie. 02 - title)
    var various_artists = true;
    for (var i=0; i < bandcampAlbumData.trackinfo.length; i++) {
      if (!bandcampAlbumData.trackinfo[i].title.match(/ - /)
          || bandcampAlbumData.trackinfo[i].title.match(/^\d+ - /)) {
        various_artists = false;
        break;
      }
    }

    // Release artist credit
    if (bandcampAlbumData.artist.match(/^various(?: artists)?$/i)
        && various_artists) {
        release.artist_credit = [ MBImport.specialArtist('various_artists') ];
    } else {
        release.artist_credit = MBImport.makeArtistCredits([bandcampAlbumData.artist]);
    };

    $.each(bandcampAlbumData.trackinfo, function (index, bctrack) {
      var title = bctrack.title;
      var artist = [];
      if (various_artists) {
        var m = bctrack.title.match(/^(.+) - (.+)$/);
        if (m) {
          title = m[2];
          artist = [m[1]];
        }
      }
      var track = {
        'title': title,
        'duration': Math.round(bctrack.duration * 1000),
        'artist_credit': MBImport.makeArtistCredits(artist)
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
    var link_type = MBImport.URL_TYPES;
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
    var edit_note = MBImport.makeEditNote(release.url, 'Bandcamp');
    var parameters = MBImport.buildFormParameters(release, edit_note);
    // Build form
    var mbUI = $('<div id="mb_buttons">'
        + MBImport.buildFormHTML(parameters)
        + MBImport.buildSearchButton(release)
        + '</div>').hide();

    // Append MB import link
    $('#name-section').append(mbUI);
    $('#mb_buttons').css({'margin-top': '6px'});
    $('form.musicbrainz_import').css({display: 'inline-block'});
    mbUI.slideDown();
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
  /* keep the following line as first, it is required to skip
   * pages which aren't actually a bandcamp page, since we support
   * bandcamp pages under third-party domains.
   * see @include
   */
  if (!unsafeWindow.TralbumData) return;
  /***/

  MBImportStyle();

  var mblinks = new MBLinks('BCI_MBLINKS_CACHE');

  var release = BandcampImport.retrieveReleaseInfo();

  // add MB artist link
  var root_url = release.url.match(/^(http:\/\/[^\/]+)/)[1];
  mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) { $('div#name-section span[itemprop="byArtist"]').before(link); } );
  mblinks.searchAndDisplayMbLink(root_url, 'label', function (link) { $('p#band-name-location span.title').append(link); }, 'label:' + root_url );

  if (release.artist_credit.length == 1) {
    // try to get artist's mbid from cache
    var artist_mbid = mblinks.resolveMBID(root_url);
    if (artist_mbid) {
      release.artist_credit[0].mbid = artist_mbid;
    }
  }

  // try to get label mbid from cache
  var label_mbid = mblinks.resolveMBID('label:' + root_url);
  if (label_mbid) {
    if (release.labels.length == 0) {
      release.labels.push({
        'name': '',
        'mbid': '',
        'catno': 'none'
      });
    }
    release.labels[0].name = $('p#band-name-location span.title').text().trim();
    release.labels[0].mbid = label_mbid;
  }

  BandcampImport.insertLink(release);
  LOGGER.info("Parsed release: ", release);

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
