// ==UserScript==
// @name           MusicBrainz: 1200px CAA
// @name:da        MusicBrainz: 1200px CAA
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @version        2021.4.16
// @author         Frederik “Freso” S. Olesen
// @license        GPL-3.0-or-later
// @description    Use the 1200px images for the pop‐up/previews on Release cover art pages.
// @description:da Brug 1200px billeder for pop‐op/forhåndsvisninger af udgivelses omslagskunstsider.
// @homepageURL    https://github.com/murdos/musicbrainz-userscripts/
// @icon           https://coverartarchive.org/img/big_logo.svg
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_1200px_caa.user.js
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_1200px_caa.user.js
// @supportURL     https://github.com/murdos/musicbrainz-userscripts/issues
// @match          *://*.musicbrainz.org/release/*/cover-art
// @grant          none
// ==/UserScript==

var ca_page = document.querySelector('div#content');

var ca_items = ca_page.querySelectorAll('div.artwork-cont');

ca_items.forEach(function (ca_item) {
    /* Use 1200px “thumbnails” for the pop‐ups/previews */
    let popup_link = ca_item.querySelector('a.artwork-image');
    popup_link.href = popup_link.href.replace(/\.[a-z]+$/, '-1200.jpg');
});
