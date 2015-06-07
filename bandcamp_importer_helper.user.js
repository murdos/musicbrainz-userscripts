// ==UserScript==
// @name        Bandcamp Importer Album Link Helper
// @description Add a link to Bandcamp's album canonical URL on pages without /album/, for one to import the release into MusicBrainz
// @version     2015.05.28.0
// @namespace   http://userscripts.org/users/22504
// @downloadURL https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer_helper.user.js
// @updateURL   https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer_helper.user.js
// @include     http*://*.bandcamp.com/
// @include     http*://*.bandcamp.com/releases
// @exclude     http*://*.bandcamp.com/*/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require     https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// ==/UserScript==


$(document).ready(function () {

  // Display a link to the correct album bandcamp url (ie. main page or releases page)
  // search for the rss feed link and use it to build the current album url
  var rssurl = $("#rssFeedAlbum").attr('href');
  if (typeof rssurl !== "undefined" && rssurl.indexOf('/feed/album/') !== -1) {
    var albumurl = rssurl.replace('/feed/', '/');
    var innerHTML = '<div id="bci_helper" style="padding-top: 5px;">' + '<a href="' + albumurl +
      '" title="Load album page and display Import to MB button">Album page (MB import)</a></div>';
    $('#name-section').append(innerHTML);
  }
});
