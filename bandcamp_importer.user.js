// ==UserScript==
// @name           Import Bandcamp releases into MB
// @version        2014.10.18.1
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include        http*://*.bandcamp.com/album/*
// @include        http*://*.bandcamp.com/track/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// ==/UserScript==

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

    var release = retrieveReleaseInfo();
    insertLink(release);

});

// Analyze Bandcamp data and return a release object
function retrieveReleaseInfo() {
    var release = new Object();
    release.discs = [];

    var bandcampAlbumData = unsafeWindow.TralbumData;
    var bandcampEmbedData = unsafeWindow.EmbedData;

    // Release artist credit
    release.artist_credit = [ { artist_name: bandcampAlbumData.artist } ];

    // Grab release title
    release.title = bandcampAlbumData.current.title;

    // Grab release event information
    var date = convdate(bandcampAlbumData.current.release_date);
    if (date) {
      if (!(date.year > 2008 || (date.year == 2008 && date.month >= 9))) {
        // use publish date if release date is before Bandcamp launch (2008-09)
        var pdate = convdate(bandcampAlbumData.current.publish_date);
        if (pdate) date = pdate;
      }
      release.year = date.year
      release.month = date.month
      release.day = date.day
    }

    function convdate(date) {
      if (typeof date != "undefined" && date != "") {
        var d = new Date(date);

        return {
          "year": d.getUTCFullYear(),
          "month": d.getUTCMonth() + 1,
          "day": d.getUTCDate()
        }
      }
      return false;
    }

    if(bandcampEmbedData.album_title) {
        release.parent_album = bandcampEmbedData.album_title;
    }

    release.labels = new Array();
    release.format = "Digital Media";
    release.country = "XW"; // Worldwide
    // FIXME: implement a mapping between bandcamp release types and MB ones
    release.type = bandcampAlbumData.current.type;
    release.status = 'official';
    release.packaging = 'none';
    release.language = 'eng';
    release.script = 'Latn';

    // map Bandcamp single tracks to singles
    if(release.type == "track")
    { release.type = "single"; }

    // Tracks
    var disc = new Object();
    disc.tracks = new Array();
    disc.format = release.format;
    release.discs.push(disc);
    $.each(bandcampAlbumData.trackinfo, function(index, bctrack) {
        var track = {
            'title': bctrack.title,
            'duration': Math.round(bctrack.duration*1000),
            'artist_credit': []
        }
        disc.tracks.push(track);
    });

    // URLs
    // link_type mapping:
    // - 74: purchase for download
    // - 75: download for free
    // - 85: stream {video} for free
    // - 301: license
    LINK_PURCHASE_FOR_DOWNLOAD = 74
    LINK_DOWNLOAD_FOR_FREE = 75
    LINK_STREAM_FOR_FREE = 85
    LINK_LICENSE = 301
    release.urls = new Array();
    // Download for free vs. for purchase
    if (bandcampAlbumData.current.download_pref !== null) {
        if (bandcampAlbumData.freeDownloadPage !== null || bandcampAlbumData.current.download_pref === 1 || (
            bandcampAlbumData.current.download_pref === 2 && bandcampAlbumData.current.minimum_price === 0)) {
            release.urls.push({
                'url': window.location.href,
                'link_type': LINK_DOWNLOAD_FOR_FREE
            });
        }
        if (bandcampAlbumData.current.download_pref === 2) {
            // - 74: purchase for download
            release.urls.push({
                'url': window.location.href,
                'link_type': LINK_PURCHASE_FOR_DOWNLOAD
            });
        }
    }
    // Check if the release is streamable
    if (bandcampAlbumData.hasAudio) {
        release.urls.push({
            'url': window.location.href,
            'link_type': LINK_STREAM_FOR_FREE
        });
    }
    // Check if release is Creative Commons licensed
    if ($("div#license a.cc-icons").length > 0) {
        release.urls.push({
            'url': $("div#license a.cc-icons").attr("href"),
            'link_type': LINK_LICENSE
        });
    }

    mylog(release);
    return release;

}

// Insert links in page
function insertLink(release) {

    if(release.type == "single" && typeof release.parent_album != "undefined") {
        mylog("This is part of an album, not continuing.");
        return false;
    }

    /*
    var mbUI = document.createElement('div');
    mbUI.innerHTML = "<h3>MusicBrainz</h3>";
    mbUI.className = "section";


    var mbContentBlock = document.createElement('div');
    mbContentBlock.className = "section_content";
    mbUI.appendChild(mbContentBlock);
    */

    // Form parameters
    var edit_note = 'Imported from ' + window.location.href;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    // Build form
    var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);
    // Append search link
    //innerHTML += ' <small>(' + MBReleaseImportHelper.buildSearchLink(release) + ')</small>';

    $('h2.trackTitle').append(innerHTML);

}

function mylog(obj) {
    var DEBUG = true;
    if (DEBUG && unsafeWindow.console) {
        unsafeWindow.console.log(obj);
    }
}

