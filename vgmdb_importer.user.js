// ==UserScript==
// @name           Import VGMdb releases into MusicBrainz
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from vgmdb.net into MusicBrainz
// @version        2020.9.26.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/vgmdb_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/vgmdb_importer.user.js
// @include        /^https://vgmdb.net/(album|artist|org)/\d+
// @require        https://code.jquery.com/jquery-3.5.1.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          GM.xmlHttpRequest
// ==/UserScript==

$(document).ready(function () {
    MBImportStyle();
    MBSearchItStyle();

    let apiUrl = window.location.href.replace('net', 'info').concat('', '?format=json');

    GM.xmlHttpRequest({
        method: 'GET',
        url: apiUrl,
        onload: function (resp) {
            const release = parseApi(resp.responseText);
            insertButtons(release);
        },
    });
});

function parseApi(apiResponse) {
    const apiDict = JSON.parse(apiResponse);
    const release = {
        title: apiDict.name,
        artist_credit: [],
        labels: [],
        urls: [],
        discs: [],
        status: mapStatus(apiDict.publish_format),
    };

    return release;
}

function insertButtons(release) {
    const editNote = MBImport.makeEditNote(window.location.href, 'VGMdb');
    console.log(editNote);
    const parameters = MBImport.buildFormParameters(release, editNote);
    const formHtml = $(MBImport.buildFormHTML(parameters)).attr('style', 'margin: 5px 0 0 5px; display: inline-block').prop('outerHTML');
    const linkHtml = $(MBImport.buildSearchButton(release)).attr('style', 'margin: 5px 0 0 5px; display: inline-block').prop('outerHTML');

    const vgmdbHtml =
        '<div style="width: 250px; background-color: #1B273D">' +
        '<b class="rtop"><b></b></b>' +
        '<div style="padding: 6px 10px 0px 10px">' +
        '<h3>MusicBrainz</h3>' +
        '</div>' +
        '</div>' +
        `<div style="width: 250px; background-color: #2F364F;">${formHtml}${linkHtml}` +
        '<b class="rbot"><b></b></b> ' +
        '</div>' +
        '<br style="clear: left" />';

    $('#rightcolumn').prepend(vgmdbHtml);
}

/*
 * Returns MusicBrainz status based on VGMdb publish_format.
 *
 * MusicBrainz: official, promotion, bootleg, pseudo
 * VGMdb, comma separated:
 *   * one of Commercial, Doujin/Indie, Bootleg
 *   * one of Limited Edition, Enclosure, First Press Bonus, Preorder Bonus,
 *     Retailer Bonus, Event Only, Promo/Gift/Reward, Rental (General does not appear in API)
 */
function mapStatus(publishFormat) {
    if (publishFormat.includes('Bootleg')) {
        // Overrides promo
        return 'bootleg';
    } else if (publishFormat.includes('Promo/Gift/Reward')) {
        return 'promotion';
    } else {
        return 'official';
    }
}
