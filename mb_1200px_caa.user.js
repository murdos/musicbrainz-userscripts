// ==UserScript==
// @name           MusicBrainz: 1200px CAA
// @name:da        MusicBrainz: 1200px CAA
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @version        2019.6.25.2
// @author         Frederik “Freso” S. Olesen
// @license        GPL-3.0-or-later
// @description    Use the 1200px images for the pop‐up/previews on Release cover art pages. (Also adds 1200px “thumbnail” links.)
// @description:da Brug 1200px billeder for pop‐op/forhåndsvisninger af udgivelses omslagskunstsider. (Tilføjer også 1200px "thumbnail" links.)
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

ca_items.forEach(function(ca_item) {
    /* Use 1200px “thumbnails” for the pop‐ups/previews */
    let popup_link = ca_item.querySelector('a.artwork-image');
    popup_link.href = popup_link.href.replace(/\.[a-z]+$/, '-1200.jpg');

    /* Add a “1200px” link to the “All sizes” list */
    // Until https://tickets.metabrainz.org/browse/CAA-88 is resolved.
    let link_list = ca_item.querySelector('p.small');
    let link_list_a = link_list.getElementsByTagName('a');
    for (let i = 0; i < link_list_a.length; i++) {
        if (link_list_a[i].textContent == '500px') {
            var _500px_link = link_list_a[i];
            break;
        }
    }
    let _1200px_link = _500px_link.cloneNode(true);
    _1200px_link.href = _1200px_link.href.replace('-500', '-1200');
    _1200px_link.textContent = _1200px_link.textContent.replace('500', '1200');
    _500px_link.insertAdjacentHTML('afterend', ` |\n${_1200px_link.outerHTML}`);
});
