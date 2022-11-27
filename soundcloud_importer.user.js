// ==UserScript==
// @name        Import Soundcloud to MusicBrainz
// @description Add a button on Soundcloud track and album pages to open MusicBrainz release editor with pre-filled data
// @match       https://soundcloud.com/*/*
// @match       https://soundcloud.com/*/sets/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mblinks.js
// @require        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// @run-at         document-end
// ==/UserScript==

// eslint-disable-next-line no-global-assign
if (!unsafeWindow) unsafeWindow = window;

const SoundcloudImport = {
  retrieveReleaseInfo: function () {
    let soundcloudAlbumData = unsafeWindow.__sc_hydration[8].data;

    let release = {
      discs: [],
      artist_credit: [],
      barcode: '',
      title: '',
      year: 0,
      month: 0,
      day: 0,
      parent_album_url: soundcloudAlbumData.permalink_url,
      labels: [],
      format: 'Digital Media',
      country: 'XW',
      type: '',
      status: 'official',
      packaging: 'None',
      language: 'eng',
      script: 'Latn',
      urls: [],
      url: soundcloudAlbumData.permalink_url,
      artist_url: soundcloudAlbumData.user.permalink_url,
    };

    // Release title
    release.title = soundcloudAlbumData.title;

    // Date information
    let date = new Date(soundcloudAlbumData.created_at);
    release.year = date.getUTCFullYear();
    release.day = date.getUTCDate();
    release.month = date.getUTCMonth() + 1;

    // Release type
    if (soundcloudAlbumData.kind == "track") {
        // Logic to determine if it is part of a release
        if (document.querySelectorAll(".sidebarModule")[1].getElementsByClassName("soundBadgeList__item").length == 0) {
          release.type = "Single";
        } else {
          release.type = "track";
        }
    } else {
        release.type = this.convertReleaseTypes(soundcloudAlbumData.set_type);
    }

    // Tracks
    release.discs = [{
        tracks: [],
        format: release.format,
    }];

    if (release.type == "Single") {
      release.discs[0].tracks.push({
          title: release.title,
          duration: soundcloudAlbumData.duration,
          artist_credit: release.artist_credit
      });
    } else {
      if (release.type == "track") {
        release.parent_album_url = document.querySelectorAll(".sidebarModule")[1].querySelector(".soundBadgeList__item").querySelector(".soundTitle__title").href;
      } else {
        soundcloudAlbumData.tracks.forEach(function (track) {
          release.discs[0].tracks.push({
            title: track.title,
            duration: track.duration,
            artist_credit: MBImport.makeArtistCredits([track.user.username]),
          });
        });
      }
    }
    // Release artist
    release.artist_credit = MBImport.makeArtistCredits([soundcloudAlbumData.user.username]);
    // Label
    let label = soundcloudAlbumData.label_name;
    if (label) {
      release.labels.push({
        name: label,
        mbid: '',
        catno: 'none',
      });
    }
    // URL
    let link_type = MBImport.URL_TYPES;
    release.urls.push({
                      url: release.url,
                      link_type: link_type.stream_for_free,
                  });
    return release;
  },

  // Inserting links
  insertLink: function (release) {
    if (release.type == 'track') {
        // only import album or single, tracks belong to an album
        return false;
    }
    // Form parameters
    let edit_note = MBImport.makeEditNote(release.url, 'Soundcloud');
    let parameters = MBImport.buildFormParameters(release, edit_note);
    // Build form
    let importButton = `<div>${MBImport.buildFormHTML(parameters)}</div>`;
    let searchButton = `<div>${MBImport.buildSearchButton(release)}</div>`;
    // Append MB import link
    $(".listenEngagement__actions").append(importButton);
    $(".listenEngagement__actions").append(searchButton);
  },

  // Convert between soundcloud and MB release types
  convertReleaseTypes: function (type) {
      switch(type) {
        case 'album':
            return 'Album';
        case 'ep':
            return 'EP';
        case 'single':
            return 'Single';
        default:
            return 'Other';
    }
}

}

$(document).ready(function() {
    // Wait 2 seconds for soundcloud to execute its scripts
    window.setTimeout(function () {
      MBImportStyle();
      let mblinks = new MBLinks('SCI_MBLINKS_CACHE');
      let release = SoundcloudImport.retrieveReleaseInfo();
      mblinks.searchAndDisplayMbLink(release.artist_url, 'artist', function (link) {
        $('.userBadge__actions').append(`<div class="sc-button sc-link" style="top: 4px; max-height:22px">${link}</div>`);
      });
      mblinks.searchAndDisplayMbLink(release.parent_album_url, 'release', function (link) {
          $('.soundActions .sc-button-group .sc-button-like').before(`<div class="sc-button sc-link" style="padding-top: 4px">${link}</div>`);
      });
      //Not sure why this is required
      $(".sc-link a").each(function() {
          $(this).attr("href", "https:" + $(this).attr("href"));
      });


      SoundcloudImport.insertLink(release);
    }, 1000);
});
