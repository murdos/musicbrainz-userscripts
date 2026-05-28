// ==UserScript==
// @name         Display shortcut for relationships on MusicBrainz
// @description  Display icon shortcut for relationships of release-group, release, recording and work: e.g. Amazon, Discogs, Wikipedia, ... links. This allows to access some relationships without opening the entity page.
// @version      2026.5.28.2
// @author       Aurelien Mino <aurelien.mino@gmail.com>
// @licence      GPL (http://www.gnu.org/copyleft/gpl.html)
// @downloadURL  https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @updateURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @match        *://*.musicbrainz.org/artist/*
// @match        *://*.musicbrainz.org/release-group/*
// @match        *://*.musicbrainz.org/label/*
// @exclude      */artist/*/recordings*
// @exclude      */edit
// ==/UserScript==

// Definitions: relations-type and corresponding icons we are going to treat
const relationsIconsURLs = {
    'release-group': {
        // http://www.amaesingtools.com/images/left_arrow_icon.gif
        'single from': `data:image/gif;base64,R0lGODlhDwALAJEAAP2ZAZmZmf///wAAACH5BAAAAAAALAAAAAAPAAsAAAIflI+pq2ABY0DAiYmwqOyaCoaHxjHaZp0e9UhQB8dCAQA7`,
    },
    release: {
        remaster: 'http://web.archive.org/web/20060708200714/http://wiki.musicbrainz.org/-/musicbrainz/img/moin-www.png',
    },
};

const urlRelationsIconClasses = {
    allmusic: 'allmusic',
    'amazon asin': 'amazon',
    'creative commons licensed download': 'creativecommons',
    discogs: 'discogs',
    imdb: 'imdb',
    lyrics: 'lyrics',
    secondhandsongs: 'secondhandsongs',
    vgmdb: 'vgmdb',
    wikidata: 'wikidata',
    'discography entry': 'home',
};

const otherDatabasesIconClasses = {
    'genius.com': 'genius',
    'd-nb.info': 'dnb',
    'www.musik-sammler.de': 'musiksammler',
    'rateyourmusic.com': 'rateyourmusic',
    'www.worldcat.org': 'worldcat',
    'nocs.acum.org.il': 'acum',
    'stereo-ve-mono.com': 'stereo-ve-mono',
};

const streamingIconClasses = {
    '7digital.com': 'sevendigital',
    'audiomack.com': 'audiomack',
    'music.amazon.': 'amazonmusic',
    'music.apple.com': 'applemusic',
    'bandcamp.com': 'bandcamp',
    'www.deezer.com': 'deezer',
    'www.hdtracks.com': 'hdtracks',
    'itunes.apple.com': 'itunes',
    'qobuz.com': 'qobuz',
    'soundcloud.com': 'soundcloud',
    'open.spotify.com': 'spotify',
    'tidal.com': 'tidal',
    'beatport.com': 'beatport',
    'music.youtube.com': 'youtubemusic',
    'youtube.com': 'youtube',
    'archive.org': 'archive',
    'mediafire.com': 'mediafire',
    'store.steampowered.com': 'steam',
};

function relationshipsCell(mbid) {
    return document.getElementById(mbid)?.querySelector('td.relationships');
}

/**
 * @param {string} mbid
 * @param {string} targetUrl
 * @param {string} iconClass
 */
function injectShortcutIcon(mbid, targetUrl, iconClass) {
    if (!iconClass) return;
    const cell = relationshipsCell(mbid);
    if (!cell) return;
    cell.insertAdjacentHTML(
        'beforeend',
        `<a href='${targetUrl.replace(/'/g, '&apos;')}'><span class='favicon ${iconClass}-favicon' /></a>`,
    );
}

/**
 * @param {string} url
 * @param {Object} iconClassMap
 */
function findIconClassOfUrl(url, iconClassMap) {
    for (let partialUrl in iconClassMap) {
        if (url.includes(partialUrl)) {
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
    margin: 2px;
}
td.relationships span.favicon.ended {
    opacity: 25%; /* make ended rels less visible */
}

/* additional custom favicons which are not shipped by MBS */
.hdtracks-favicon {
    background-image: url(https://www.hdtracks.com/favicon.ico);
    background-size: 16px;
}
.creativecommons-favicon {
    background-image: url(https://creativecommons.org/favicon.ico);
}
.lyrics-favicon {
    /* archived version, originally from http://www.nomy.nu/img/lyrics-icon.gif */
    background-image: url(data:image/gif;base64,R0lGODlhEQARALMAAAAAAP////z8/Onp6dzc3KmpqaGhoZGRkYyMjHx8fP///wAAAAAAAAAAAAAAAAAAACH5BAEAAAoALAAAAAARABEAAARNUBCUqr0JEVnI+GA4EJ0WnGiKTskQGEcsy0YwVK6q2/g7/7Vba6cTumA/Gm9ITBl9yViw10Q9kdEps7o8RqU8EzcwIXlEIrOEgsFoBBEAOw==);
}
.mediafire-favicon {
background-image: url(https://www.mediafire.com/favicon.ico);
}
.steam-favicon {
background-image: url(https://store.steampowered.com/favicon.ico);
background-size: 16px;
}`;

if (!unsafeWindow) unsafeWindow = window;

function init() {
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

    document.head.insertAdjacentHTML('beforeend', `<style id='relationship-shortcuts-userscript-css'>${userscriptCSS}</style>`);

    const mbidRE = /(release|release-group|work)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/;

    // Determine target column
    let columnindex = 0;
    for (const row of document.querySelectorAll('table.tbl tbody tr:not(.subh)')) {
        for (const cell of row.querySelectorAll(':scope > td')) {
            const href = cell.querySelector('a')?.getAttribute('href');
            if (href !== undefined && href.match(mbidRE)) {
                break;
            }
            columnindex++;
        }
        break;
    }

    // Set MBID to row in tables to get easiest fastest access
    for (const tr of document.querySelectorAll('table.tbl tr:not(.subh)')) {
        const thAtColumn = tr.querySelectorAll(':scope > th')[columnindex];
        const tdAtColumn = tr.querySelectorAll(':scope > td')[columnindex];

        thAtColumn?.insertAdjacentHTML('afterend', '<th>Relationships</th>');
        tdAtColumn?.insertAdjacentHTML('afterend', "<td class='relationships'></td>");

        for (const link of tr.querySelectorAll('a')) {
            const href = link.getAttribute('href');
            if ((m = href?.match(mbidRE))) {
                tr.id = m[2];
                break;
            }
        }
    }

    // Adapt width of subheader rows by incrementing the colspan of a cell
    for (const tr of document.querySelectorAll('table.tbl tr.subh')) {
        const thWithColspan = tr.querySelector(':scope > th[colspan]');
        if (thWithColspan) {
            thWithColspan.colSpan += 1;
        }
    }

    // Calculate offset for multi-page lists
    let page = 1;
    if ((m = window.location.href.match('[?&]page=([0-9]*)'))) {
        page = m[1];
    }
    let offset = (page - 1) * 100;

    // Call the MB webservice
    const url = `/ws/2/${child.type}?${parent.type}=${parent.mbid}&inc=${incOptions[child.type].join('+')}&limit=100&offset=${offset}`;

    fetch(url)
        .then(response => response.text())
        .then(data => {
            const doc = new DOMParser().parseFromString(data, 'application/xml');
            if (doc.querySelector('parsererror')) {
                console.error('Failed to parse MusicBrainz API response');
                return;
            }

            for (const entity of doc.querySelectorAll(child.type)) {
                const mbid = entity.getAttribute('id');

                // URL relationships
                const alreadyInjectedUrls = [];
                for (const relation of entity.querySelectorAll("relation-list[target-type='url'] relation")) {
                    const relType = relation.getAttribute('type');
                    const targetUrl = relation.querySelector(':scope > target')?.textContent ?? '';
                    const ended = relation.querySelector(':scope > ended')?.textContent === 'true';

                    // Dedupe rels by URL (e.g. for Bandcamp, which has purchase and stream rels)
                    if (alreadyInjectedUrls.includes(targetUrl)) continue;
                    alreadyInjectedUrls.push(targetUrl);

                    let iconClass;
                    if (['free streaming', 'streaming', 'download for free', 'purchase for download'].includes(relType)) {
                        iconClass = findIconClassOfUrl(targetUrl, streamingIconClasses);
                    }
                    if (!iconClass) {
                        iconClass = findIconClassOfUrl(targetUrl, otherDatabasesIconClasses);
                    }
                    if (!iconClass && relType in urlRelationsIconClasses) {
                        iconClass = urlRelationsIconClasses[relType];
                    }

                    if (iconClass) {
                        if (ended) {
                            iconClass = ['ended', iconClass].join(' ');
                        }
                        injectShortcutIcon(mbid, targetUrl, iconClass);
                    }
                }

                // Other relationships
                for (const relationList of entity.querySelectorAll('relation-list')) {
                    const targetTypeAttr = relationList.getAttribute('target-type');
                    if (!targetTypeAttr || targetTypeAttr === 'url') continue;

                    const targettype = targetTypeAttr.replace('release_group', 'release-group');
                    const relations = {};

                    if (relationsIconsURLs[targettype] === undefined) {
                        continue;
                    }

                    for (const relation of relationList.querySelectorAll(':scope > relation')) {
                        const reltype = relation.getAttribute('type');
                        const target = relation.querySelector(':scope > target')?.textContent ?? '';
                        const relUrl = targettype == 'url' ? target : `/${targettype}/${target}`;

                        if (Object.prototype.hasOwnProperty.call(relationsIconsURLs[targettype], reltype)) {
                            if (!Object.prototype.hasOwnProperty.call(relations, reltype)) relations[reltype] = [relUrl];
                            else relations[reltype].push(relUrl);
                        }
                    }

                    const cell = relationshipsCell(mbid);
                    if (!cell) continue;

                    for (const [reltype, urls] of Object.entries(relations)) {
                        let html = '';
                        if (urls.length < -1) {
                            html += `<img src='${relationsIconsURLs[targettype][reltype]}' />(${urls.length})&nbsp;`;
                        } else {
                            for (const relUrl of urls) {
                                html += `<a href='${relUrl}'><img src='${relationsIconsURLs[targettype][reltype]}' /></a>&nbsp;`;
                            }
                        }
                        cell.insertAdjacentHTML('beforeend', html);
                    }
                }
            }
        })
        .catch(err => console.error('MusicBrainz API request failed', err));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
