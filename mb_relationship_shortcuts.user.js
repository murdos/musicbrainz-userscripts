// ==UserScript==
// @name           Display shortcut for relationships on MusicBrainz
// @description    Display icon shortcut for relationships of release-group, release, recording and work: e.g. Amazon, Discogs, Wikipedia, ... links. This allows to access some relationships without opening the entity page.
// @version        2021.8.5.1
// @author         Aurelien Mino <aurelien.mino@gmail.com>
// @licence        GPL (http://www.gnu.org/copyleft/gpl.html)
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @include        http*://*musicbrainz.org/artist/*
// @include        http*://*musicbrainz.org/release-group/*
// @include        http*://*musicbrainz.org/label/*
// @require        https://code.jquery.com/jquery-3.2.1.min.js
// ==/UserScript==

// Definitions: relations-type and corresponding icons we are going to treat
const relationsIconsURLs = {
    'release-group': {
        // http://www.amaesingtools.com/images/left_arrow_icon.gif
        'single from': `data:image/gif;base64,R0lGODlhDwALAJEAAP2ZAZmZmf///wAAACH5BAAAAAAALAAAAAAPAAsAAAIflI+pq2ABY0DAiYmwqOyaCoaHxjHaZp0e9UhQB8dCAQA7`,
    },
    release: {
        // deprecated, see also https://musicbrainz.org/report/PartOfSetRelationships
        'part of set': 'http://web.archive.org/web/20060709091901/http://wiki.musicbrainz.org/-/musicbrainz/img/moin-inter.png',
        remaster: 'http://web.archive.org/web/20060708200714/http://wiki.musicbrainz.org/-/musicbrainz/img/moin-www.png',
    },
};

const urlRelationsIconClasses = {
    allmusic: 'allmusic',
    'amazon asin': 'amazon',
    'cover art link': 'coverart', // deprecated, see https://tickets.metabrainz.org/browse/MBS-11856
    'creative commons licensed download': 'creativecommons',
    discogs: 'discogs',
    imdb: 'imdb',
    lyrics: 'lyrics',
    secondhandsongs: 'secondhandsongs',
    vgmdb: 'vgmdb',
    wikidata: 'wikidata',
};

const otherDatabasesIconClasses = {
    'd-nb.info': 'dnb',
    'www.musik-sammler.de': 'musiksammler',
    'rateyourmusic.com': 'rateyourmusic',
    'www.worldcat.org': 'worldcat',
};

const streamingIconClasses = {
    'music.amazon.': 'amazonmusic',
    'music.apple.com': 'applemusic',
    'bandcamp.com': 'bandcamp',
    'www.deezer.com': 'deezer',
    'itunes.apple.com': 'itunes',
    'qobuz.com': 'qobuz',
    'soundcloud.com': 'soundcloud',
    'open.spotify.com': 'spotify',
    'tidal.com': 'tidal',
};

function injectShortcutIcon(mbid, targetUrl, iconClass) {
    if (!iconClass) return;
    $(`#${mbid} td.relationships`).append(
        `<a href='${targetUrl.replace(/'/g, '&apos;')}'><span class='favicon ${iconClass}-favicon' /></a>`
    );
}

function findIconClassOfUrl(url, iconClassMap) {
    for (let partialUrl in iconClassMap) {
        if (url.indexOf(partialUrl) != -1) {
            return iconClassMap[partialUrl];
        }
    }
}

const incOptions = {
    'release-group': ['release-group-rels', 'url-rels'],
    release: ['release-rels', 'url-rels', 'discids'],
    recording: ['work-rels'],
    work: ['url-rels'],
};

const userscriptCSS = `
td.relationships span.favicon {
    display: inline-block;
    width: 16px;
    height: 16px;
    vertical-align: middle;
    margin-right: 4px;
}

/* additional custom favicons which are not shipped by MBS */
.coverart-favicon {
    /* archived version from 2015, originally from http://www.cdcovers.cc/favicon.ico */
    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACbklEQVQ4jb2Tz0uTARyH31OXrl47dOuf6FAK3YJAQWVIIRiioDY95JuSbkS4JRQq1QbN9WaiOH82hekk411YL+pBN5fjbcut+U7fvSbN99WDTwcpiX5f+ty/Dx8+PF9B+F/ZzibJ6xp5XeOvDszCHnldQ8tmMAydfWOTfWOTz1qcdCrxa4hh6GxlkqRTCXa0DOFQkCHJw1HhPebWEgfZRQ6yiz+HbGWSqBtRUkmVVFIlq+3Q1FBPQOoBPYKpTmCqE/BhHOXVFFlt5wSiZTMk4qvEYlFisSiKorC+toKtooz48jyH6ihWrB8r1g8JL/ILD4GxqWOAZZkk4qsoioIsR5DlCLFYlPHRIVqb64guy6xFRjhauY21UAOzJQSf3KTzjvsYsKNlkOUIs3NzzM7NoSgKHe2tlFw4z8uZYczCHrnX3Rx6TrPfI4BURLeziYHBYQTLMllfW2FkJIDk9yH5fTidDq7ZStl895Z0KkF6aZSC9wy7boFdt0AuUE5tfSOGoSMYhs746BB2ux273Y7T6cDpdBBfnieva+SmrrN77xQf3QJph8Ch/xytzXV4vN7j+upGFL/PS1NDPaIoIooikt/HGzlMfHme3P0ikp0CyU6BT4/OMvCghctXSrEsk2/ChENBRFGky+Wiy+VCkiREUWTmcQNqm4DaJrD9rJjeuze4WHKJVFL93oGvLXr7+vB4vYRDQWxVV0mMNbLhKWaytxZbRRm2ijK0bOZHgczCHvLCLNPBSWQ5wsjwIB3trYRDQcorK6muqWVifOz3P5DXNYaeP8XzsJea6ioURcEs7B0v/S+ZDk7ScavlZKQ/5AtqYxFgEGjruAAAAABJRU5ErkJggg==);
}
.creativecommons-favicon {
    background-image: url(https://creativecommons.org/favicon.ico);
}
.lyrics-favicon {
    /* archived version, originally from http://www.nomy.nu/img/lyrics-icon.gif */
    background-image: url(data:image/gif;base64,R0lGODlhEQARALMAAAAAAP////z8/Onp6dzc3KmpqaGhoZGRkYyMjHx8fP///wAAAAAAAAAAAAAAAAAAACH5BAEAAAoALAAAAAARABEAAARNUBCUqr0JEVnI+GA4EJ0WnGiKTskQGEcsy0YwVK6q2/g7/7Vba6cTumA/Gm9ITBl9yViw10Q9kdEps7o8RqU8EzcwIXlEIrOEgsFoBBEAOw==);
}`;

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    // Get pageType (label or artist)
    let parent = {};
    let child = {};
    let m;
    if ((m = window.location.href.match('/artist/(.{36})[^/]*$'))) {
        parent.type = 'artist';
        parent.mbid = m[1];
        child.type = 'release-group';
    } else if ((m = window.location.href.match('/(release-group|label)/(.{36})[^/]*$'))) {
        parent.type = m[1];
        parent.mbid = m[2];
        child.type = 'release';
    } else if ((m = window.location.href.match('/artist/(.{36})/(releases|recordings|works)'))) {
        parent.type = 'artist';
        parent.mbid = m[1];
        child.type = m[2].replace(/s$/, '');
    } else {
        // Not supported
        return;
    }

    $(`<style id='relationship-shortcuts-userscript-css'>${userscriptCSS}</style>`).appendTo('head');

    let mbidRE = /(release|release-group|work)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/;

    // Determine target column
    let columnindex = 0;
    $("table.tbl tbody tr[class!='subh']").each(function () {
        $(this)
            .children('td')
            .each(function () {
                if ($(this).find('a').attr('href') !== undefined && $(this).find('a').attr('href').match(mbidRE)) {
                    return false;
                }
                columnindex++;
            });
        return false;
    });

    // Set MBID to row in tables to get easiest fastest access
    $("table.tbl tr[class!='subh']").each(function () {
        let $tr = $(this);

        $tr.children(`th:eq(${columnindex})`).after("<th style='width: 150px;'>Relationships</th>");
        $tr.children(`td:eq(${columnindex})`).after("<td class='relationships'></td>");

        $(this)
            .find('a')
            .each(function () {
                let href = $(this).attr('href');
                if ((m = href.match(mbidRE))) {
                    $tr.attr('id', m[2]);
                    return false;
                }
            });
    });

    // Adapt width of subheader rows by incrementing the colspan of a cell
    $('table.tbl tr.subh').each(function () {
        $(this)
            .children('th[colspan]')
            .attr('colspan', function (index, oldValue) {
                if (index === 0) {
                    return Number(oldValue) + 1;
                } else {
                    return oldValue;
                }
            });
    });

    // Calculate offset for multi-page lists
    let page = 1;
    if ((m = window.location.href.match('[?&]page=([0-9]*)'))) {
        page = m[1];
    }
    let offset = (page - 1) * 100;

    // Call the MB webservice
    let url = `/ws/2/${child.type}?${parent.type}=${parent.mbid}&inc=${incOptions[child.type].join('+')}&limit=100&offset=${offset}`;
    //console.log("MB WS url: " + url);

    $.get(url, function (data, textStatus, jqXHR) {
        // Parse each child
        $(data)
            .find(child.type)
            .each(function () {
                let mbid = $(this).attr('id');

                // URL relationships
                $(this)
                    .find("relation-list[target-type='url'] relation")
                    .each(function () {
                        let relType = $(this).attr('type');
                        let targetUrl = $(this).children('target').text();
                        if (relType in urlRelationsIconClasses) {
                            injectShortcutIcon(mbid, targetUrl, urlRelationsIconClasses[relType]);
                        } else if (['free streaming', 'streaming', 'purchase for download'].includes(relType)) {
                            injectShortcutIcon(mbid, targetUrl, findIconClassOfUrl(targetUrl, streamingIconClasses));
                        } else {
                            // Other database?
                            injectShortcutIcon(mbid, targetUrl, findIconClassOfUrl(targetUrl, otherDatabasesIconClasses));
                            }
                    });

                // Other relationships
                $(this)
                    .find("relation-list[target-type!='url']")
                    .each(function () {
                        let targettype = $(this).attr('target-type').replace('release_group', 'release-group');
                        let relations = {};

                        if (relationsIconsURLs[targettype] === undefined) {
                            return;
                        }

                        $(this)
                            .children('relation')
                            .each(function () {
                                let reltype = $(this).attr('type');
                                let target = $(this).children('target').text();
                                let url = targettype == 'url' ? target : `/${targettype}/${target}`;

                                if (Object.prototype.hasOwnProperty.call(relationsIconsURLs[targettype], reltype)) {
                                    if (!Object.prototype.hasOwnProperty.call(relations, reltype)) relations[reltype] = [url];
                                    else relations[reltype].push(url);
                                }
                            });

                        $.each(relations, function (reltype, urls) {
                            let html = '';
                            if (urls.length < -1) {
                                html += `<img src='${relationsIconsURLs[targettype][reltype]}' />(${urls.length})&nbsp;`;
                            } else {
                                $.each(urls, function (index, url) {
                                    html += `<a href='${url}'><img src='${relationsIconsURLs[targettype][reltype]}' /></a>&nbsp;`;
                                });
                            }
                            $(`#${mbid} td.relationships`).append(html);
                        });
                    });
            });
    });
});
