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
    const releaseDate = mapDate(apiDict.release_date);

    const release = {
        title: apiDict.name,
        artist_credit: [],
        status: mapStatus(apiDict.publish_format),
        year: releaseDate.year,
        month: releaseDate.month,
        day: releaseDate.day,
        labels: [{ name: mapLabel(apiDict.organizations), catno: apiDict.catalog }],
        barcode: apiDict.barcode,
        urls: mapUrls(apiDict.vgmdb_link, apiDict.stores, apiDict.websites),
        discs: mapDiscs(apiDict.discs, apiDict.media_format),
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

/*
 * Returns year, month and day dict based on ISO 8601 date string.
 */
function mapDate(releaseDate) {
    const d = new Date(releaseDate);

    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDay() };
}

/*
 * Returns a likely label based on a list of VGMdb organizations.
 */
function mapLabel(organizations) {
    const labelOrganization = getLabelOrganization(organizations);
    if (labelOrganization) {
        return labelOrganization['names']['en'];
    } else if (organizations.length == 1) {
        // If only one, assume that's the one
        return organizations[0]['names']['en'];
    } else {
        return null;
    }
}

/*
 * Returns a list of MusicBrainz URLs based on the websites, stores and
 * vgmdb_link values of the VGMdb API.
 */
function mapUrls(vgmdbLink, stores, websites) {
    const urls = [];

    urls.push({ url: vgmdbLink, link_type: 86 });

    if (stores) {
        for (const store of stores) {
            // Filter out links to internal marketplace
            if (store['link'].startsWith('http')) {
                // Assumes mail order
                urls.push({ url: store['link'], link_type: MBImport.URL_TYPES.purchase_for_mail_order });
            }
        }
    }

    if (websites) {
        for (const commercial in websites['Commercial']) {
            // Seems to fill same purpose as stores for albums
            urls.push({ url: commercial['link'], link_type: MBImport.URL_TYPES.purchase_for_mail_order });
        }
    }

    return urls;
}

/*
 * Returns a list of disc objects each featuring title, format and tracklist
 * based on VGMdb disc data and media format.
 */
function mapDiscs(vgmdbDiscs, mediaFormat) {
    const discs = [];

    let multipleMedia;
    let generalMediaFormat;
    if (mediaFormat.includes('+')) {
        multipleMedia = true;
    } else {
        generalMediaFormat = extractVgmdbMedia(mediaFormat);
    }

    for (const vgmdbDisc of vgmdbDiscs) {
        const disc = {};

        if (multipleMedia) {
            const discMediaFormat = extractVgmdbMedia(vgmdbDisc['name']);
            disc['format'] = mapFormat(discMediaFormat);
        } else {
            disc['format'] = mapFormat(generalMediaFormat);
        }

        disc['tracks'] = mapTracks(vgmdbDisc['tracks']);

        discs.push(disc);
    }

    return discs;
}

/*
 * Returns a MusicBrainz format based on a VGMdb media format.
 */
function mapFormat(mediaFormat) {
    switch (mediaFormat) {
        case 'Flexi Disc':
            return 'Vinyl';
        case 'Digital':
        case 'Download Card':
            return 'Digital Media';
        case 'SA-CD':
            return 'SACD';
        case 'CD Video':
            return 'CDV';
        case 'Laser Disc':
            return 'LaserDisc';
        case 'Floppy Disc':
            return 'Other';
        case 'USB':
            return 'USB Flash Drive';
        case 'UHQCD':
        case 'Blu-spec CD':
        case 'Blu-spec CD2':
        case 'HQCD':
        case 'SHM-CD':
            return 'CD';
        default:
            return mediaFormat;
    }
}

/*
 * Returns a MusicBrainz tracklist based on a VGMdb tracklist.
 */
function mapTracks(vgmdbTracks) {
    const tracks = [];

    const language = getTracklistLanguage(vgmdbTracks);
    for (const vgmdbTrack of vgmdbTracks) {
        tracks.push({ title: vgmdbTrack['names'][language], duration: vgmdbTrack['track_length'] });
    }

    return tracks;
}

/*
 * Returns the VGMdb style media format part of a string, or null if none is
 * found. If an album has only one type of media, the disc name won't contain
 * media format.
 *
 * Doesn't actually match every VGMdb media because they can have subformats
 * other than this.
 */
function extractVgmdbMedia(s) {
    const match = s.match(
        /(Cassette|Vinyl|Flexi Disc|DVD|Digital|SA-CD|Other|CD Video|VHS|Blu-ray|Laser Disc|Floppy Disc|USB|Download Card|UHQCD|Blu-spec CD|Blu-spec CD2|HQCD|SHM-CD|PLAYBUTTON|MiniDisc|CD)/g
    );

    return match ? match[0] : null;
}

/*
 * Returns an organization element with the "label" role, or null if none exists.
 */
function getLabelOrganization(organizations) {
    for (const organization of organizations) {
        if (organization['role'] === 'label') {
            return organization;
        }
    }

    return null;
}

/*
 * Return the language used as key for the VGMdb tracklist.
 */
function getTracklistLanguage(vgmdbTracks) {
    let language;

    // VGMdb stores tracklists by album, not by disc. Thus it should be enough
    // to examine the first track to figure out which one to use.
    const track = vgmdbTracks[0];
    const languages = Object.keys(track['names']);

    const foreignLanguages = getForeignLanguages(languages);
    if (foreignLanguages.length) {
        // Should be the one printed tracklist, probably Japanese or in
        // some cases Korean
        language = foreignLanguages[0];
    } else if (languages.includes('English')) {
        // Either printed tracklist or pseudo-release translation
        language = 'English';
    } else if (languages.includes('Romaji')) {
        // Should be pseudo-release transliteration
        language = 'Romaji';
    }

    return language;
}

/*
 * Returns a list of languages other than English and Romaji in the input list.
 * This should be a list with zero or one elements.
 */
function getForeignLanguages(languages) {
    return languages.filter(language => language !== 'English' && language !== 'Romaji');
}
