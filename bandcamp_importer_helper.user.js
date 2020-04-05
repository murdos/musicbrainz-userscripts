// ==UserScript==
// @name        Import Bandcamp releases to MusicBrainz Album Link Helper
// @description Add a link to Bandcamp's album canonical URL on pages without /album/, for one to import the release into MusicBrainz
// @version     2018.2.18.1
// @namespace   http://userscripts.org/users/22504
// @downloadURL https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer_helper.user.js
// @updateURL   https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer_helper.user.js
// @include     http*://*.bandcamp.com/
// @include     http*://*.bandcamp.com/releases
// @exclude     http*://*.bandcamp.com/*/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require     lib/logger.js
// @icon        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant       unsafeWindow
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    // Display a link to the correct album bandcamp url (ie. main page or releases page)
    let bandcampAlbumData = unsafeWindow.TralbumData;
    if (bandcampAlbumData && bandcampAlbumData.url) {
        let innerHTML = `${'<div id="bci_helper" style="padding-top: 5px;">' + '<a href="'}${
            bandcampAlbumData.url
        }" title="Load album page and display Import to MB button">Album page (MB import)</a></div>`;
        $('#name-section').append(innerHTML);
    }
});
