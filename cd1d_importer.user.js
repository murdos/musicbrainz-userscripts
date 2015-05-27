// ==UserScript==
// @name        Import CD1D releases into MB
// @namespace   http://userscripts.org/users/517952
// @include     http://cd1d.com/*/album/*
// @version     2015.05.26.1
// @downloadURL https://raw.github.com/murdos/musicbrainz-userscripts/master/cd1d_importer.user.js
// @updateURL   https://raw.github.com/murdos/musicbrainz-userscripts/master/cd1d_importer.user.js
// @require     http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require     https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// @require     https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// @grant       none
// ==/UserScript==

/* Import releases from http://cd1d.com to MusicBrainz */


if (!unsafeWindow) unsafeWindow = window;

var CD1DImporter = {
  _releaseobj: null,

  getActiveTab: function () {
    return $('#container-1 li.ui-state-active a');
  },

  getActiveTabId: function () {
    return this.getActiveTab().attr('href').split('#')[1];
  },

  getActiveTabLabel: function () {
    return this.getActiveTab().text();
  },

  getTracks: function () {
    // extract tracks from active tab
    var selector = 'div#' + this.getActiveTabId() + ' table.tracklist-content tbody tr';
    return $(selector).map(function () {
      // $(this) is used more than once; cache it for performance.
      var row = $(this);

      // For each row that's "mapped", return an object that
      //  describes the first and second <td> in the row.
      var duration = row.find('td.tracklist-content-length').text().replace('"', '').replace('\' ', ':').split(
        ':');
      duration = 60 * parseInt(duration[0]) + parseInt(duration[1]); // convert MM:SS to seconds

      // drop track number prefix (A A2 C3 01 05 etc...)
      var title = row.find('td.tracklist-content-title').text().replace(/^[0-9A-F][0-9]* /, '')
      return {
        title: title,
        duration: duration * 1000 // milliseconds in MB
      };
    }).get();
  },

  getArtists: function () {
    // get artists
    var artists = $('div.infos-releasegrp div.list-artist a').map(function () {
      return $(this).text()
    }).get();
    artists = artists.map(function (item) {
      return {
        artist_name: item
      };
    });
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
    return artists;
  },

  getAlbum: function () {
    // get release title
    return $('h1').text();
  },

  fromCurrentTime: function (offset_in_seconds) {
    var millis = Date.now();
    if (!isNaN(offset_in_seconds)) {
      millis += offset_in_seconds * 1000;
    }
    var date = new Date(millis);
    var dd = date.getDate();
    var mm = date.getMonth() + 1; //January is 0!
    var yyyy = date.getFullYear();
    return {
      'year': yyyy,
      'month': mm,
      'day': dd
    };
  },

  getReleaseDate: function () {
    // get release date and convert it to object
    var text = $('div.infos-releasegrp div.row-date').text()
    if (text == 'yesterday') {
      return this.fromCurrentTime(-24 * 60 * 60);
    }
    if (text == 'today') {
      return this.fromCurrentTime(0);
    }
    var date = text
      .replace('janvier', '01')
      .replace('février', '02')
      .replace('mars', '03')
      .replace('avril', '04')
      .replace('mai', '05')
      .replace('juin', '06')
      .replace('juillet', '07')
      .replace('août', '08')
      .replace('septembre', '09')
      .replace('octobre', '10')
      .replace('novembre', '11')
      .replace('décembre', '12')
      .replace('January', '01')
      .replace('February', '02')
      .replace('March', '03')
      .replace('April', '04')
      .replace('May', '05')
      .replace('June', '06')
      .replace('July', '07')
      .replace('August', '08')
      .replace('September', '09')
      .replace('October', '10')
      .replace('November', '11')
      .replace('December', '12')
      .split(' ');
    return {
      'year': parseInt(date[2]),
      'month': parseInt(date[1]),
      'day': parseInt(date[0])
    };
  },

  retrieveReleaseInfo: function () {
    // Analyze CD1D data and return a release object
    var release = {
      artist_credit: this.getArtists(),
      title: this.getAlbum(),
      country: "XW", // Worldwide
      type: 'album',
      status: 'official',
      language: 'eng',
      script: 'latn',
      barcode: '',
      urls: [],
      discs: [],
    };

    // Grab release event information
    var releasedate = this.getReleaseDate();
    release.year = releasedate.year;
    release.month = releasedate.month;
    release.day = releasedate.day;

    var link_type = {
      purchase_for_download: 74,
      download_for_free: 75,
      stream_for_free: 85,
      license: 301,
      purchase_for_mail_order: 79
    };

    current_url = window.location.href.replace(/\/[a-z]{2}\/album\//i, '/album/');

    activetab = this.getActiveTabLabel();
    if (activetab.indexOf('digital') != -1) {
      release.packaging = 'None';
      release.format = "Digital Media";
      release.urls.push({
        'url': current_url,
        'link_type': link_type.purchase_for_download
      });
    } else if (activetab.indexOf('vinyl') != -1) {
      release.country = 'FR';
      release.format = "Vinyl";
      release.urls.push({
        'url': current_url,
        'link_type': link_type.purchase_for_mail_order
      });

    } else {
      release.country = 'FR';
      release.format = 'CD';
      release.urls.push({
        'url': current_url,
        'link_type': link_type.purchase_for_mail_order
      });
    }

    release.labels = $('div.infos-details div.row-structure').map(function () {
        return {
          name: $(this).text(),
          mbid: '',
          catno: 'none'
        };
      })
      .get();

    // Tracks
    var disc = {
      tracks: [],
      format: release.format
    };
    release.discs.push(disc);
    $.each(this.getTracks(), function (index, track) {
      var track = {
        'title': track.title,
        'duration': track.duration,
        'artist_credit': []
      }
      disc.tracks.push(track);
    });

    LOGGER.info("Parsed release: ", release);
    this._releaseobj = release;
    return release;
  },

  insertLink: function (release) {
    // Insert links in page
    if (typeof release === 'undefined') {
      if (this._releaseobj) {
        release = this._releaseobj;
      } else {
        release = this.retrieveReleaseInfo();
      }
    }

    // Form parameters
    var edit_note = 'Imported from ' + window.location.href;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    // Build form
    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);
    $('div.pane-service-links-service-links h2.pane-title').append(innerHTML);

  }
};

$(document).ready(function () {
  CD1DImporter.insertLink();
});
