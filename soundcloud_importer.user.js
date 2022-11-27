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
// @run-at         document-start
// ==/UserScript==

function convertReleaseTypes(type) {
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
      url: soundcloudAlbumData.permalink_url,
    };

    // Release title
    release.title = soundcloudAlbumData.title;

    // Date information
    let date = new Date(soundcloudAlbumData.created_at);
    release.year = date.getUTCFullYear();
    release.day = date.getUTCDate();
    release.month = date.getUTCMonth() + 1;

    // Release type
    // FIXME: Find a way to distinguish between a track and single.
    // Currently, an individual track is imported as a single.
    if (soundcloudAlbumData.kind == "track") {
        release.type = "Single";
    } else {
        release.type = convertReleaseTypes(soundcloudAlbumData.set_type);
    }

    // Tracks
    release.discs = [{
        tracks: [],
        format: release.format,
    }];

    if (soundcloudAlbumData.kind == "track") {
      release.discs[0].tracks.push({
          title: release.title,
          duration: soundcloudAlbumData.duration,
          artist_credit: release.artist_credit
      });
    } else {
      soundcloudAlbumData.tracks.forEach(function (track) {
        release.discs[0].tracks.push({
          title: track.title,
          duration: track.duration,
          artist_credit: MBImport.makeArtistCredits([soundcloudAlbumData.user.username]),
        });
      });
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
}

$(window).on( "load", function () {
    MBImportStyle();
    let mblinks = new MBLinks('BCI_MBLINKS_CACHE');
    let release = SoundcloudImport.retrieveReleaseInfo();

    SoundcloudImport.insertLink(release);
});
