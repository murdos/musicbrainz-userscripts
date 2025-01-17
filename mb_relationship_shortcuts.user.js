// ==UserScript==
// @name           Display shortcut for relationships on MusicBrainz
// @description    Display icon shortcut for relationships of release-group, release, recording and work: e.g. Amazon, Discogs, Wikipedia, ... links. This allows to access some relationships without opening the entity page.
// @version        2022.4.21.1
// @author         Aurelien Mino <aurelien.mino@gmail.com>
// @licence        GPL (http://www.gnu.org/copyleft/gpl.html)
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @include        http*://*musicbrainz.org/artist/*
// @include        http*://*musicbrainz.org/release-group/*
// @include        http*://*musicbrainz.org/label/*
// @exclude        */artist/*/recordings*
// @require        https://code.jquery.com/jquery-3.6.0.min.js
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
    'discography entry': 'discographyentry',
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
    'www.hdtracks.com': 'hdtracks',
    'itunes.apple.com': 'itunes',
    'qobuz.com': 'qobuz',
    'soundcloud.com': 'soundcloud',
    'open.spotify.com': 'spotify',
    'tidal.com': 'tidal',
    'beatport.com': 'beatport',
    'youtube.com': 'youtube',
    'archive.org': 'archive',
    'mediafire.com': 'mediafire'
};

/**
 * @param {string} mbid
 * @param {string} targetUrl
 * @param {string} iconClass
 */
function injectShortcutIcon(mbid, targetUrl, iconClass) {
    if (!iconClass) return;
    $(`#${mbid} td.relationships`).append(
        `<a href='${targetUrl.replace(/'/g, '&apos;')}'><span class='favicon ${iconClass}-favicon' /></a>`
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
.discographyentry-favicon {
background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAKBmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS4wLWMwNjAgNjEuMTM0Nzc3LCAyMDEwLzAyLzEyLTE3OjMyOjAwICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6eG1wUmlnaHRzPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvcmlnaHRzLyIKICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgIHhtbG5zOklwdGM0eG1wQ29yZT0iaHR0cDovL2lwdGMub3JnL3N0ZC9JcHRjNHhtcENvcmUvMS4wL3htbG5zLyIKICAgIHhtbG5zOnBsdXNfMV89Imh0dHA6Ly9ucy51c2VwbHVzLm9yZy9sZGYveG1wLzEuMC8iCiAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiCiAgIHhtcFJpZ2h0czpNYXJrZWQ9IlRydWUiCiAgIHhtcDpNZXRhZGF0YURhdGU9IjIwMTEtMDEtMjVUMTM6NTU6MTErMDE6MDAiCiAgIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6OEFERDk4NTg4MjI4RTAxMTk4OUNDMEExQUQwMkI1QzIiCiAgIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6OEFERDk4NTg4MjI4RTAxMTk4OUNDMEExQUQwMkI1QzIiCiAgIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo4QUREOTg1ODgyMjhFMDExOTg5Q0MwQTFBRDAyQjVDMiI+CiAgIDx4bXBSaWdodHM6VXNhZ2VUZXJtcz4KICAgIDxyZGY6QWx0PgogICAgIDxyZGY6bGkgeG1sOmxhbmc9IngtZGVmYXVsdCI+Q3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsIGxpY2Vuc2U8L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC94bXBSaWdodHM6VXNhZ2VUZXJtcz4KICAgPGRjOmNyZWF0b3I+CiAgICA8cmRmOlNlcT4KICAgICA8cmRmOmxpPkdlbnRsZWZhY2UgY3VzdG9tIHRvb2xiYXIgaWNvbnMgZGVzaWduPC9yZGY6bGk+CiAgICA8L3JkZjpTZXE+CiAgIDwvZGM6Y3JlYXRvcj4KICAgPGRjOmRlc2NyaXB0aW9uPgogICAgPHJkZjpBbHQ+CiAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5XaXJlZnJhbWUgbW9ubyB0b29sYmFyIGljb25zPC9yZGY6bGk+CiAgICA8L3JkZjpBbHQ+CiAgIDwvZGM6ZGVzY3JpcHRpb24+CiAgIDxkYzpzdWJqZWN0PgogICAgPHJkZjpCYWc+CiAgICAgPHJkZjpsaT5jdXN0b20gaWNvbiBkZXNpZ248L3JkZjpsaT4KICAgICA8cmRmOmxpPnRvb2xiYXIgaWNvbnM8L3JkZjpsaT4KICAgICA8cmRmOmxpPmN1c3RvbSBpY29uczwvcmRmOmxpPgogICAgIDxyZGY6bGk+aW50ZXJmYWNlIGRlc2lnbjwvcmRmOmxpPgogICAgIDxyZGY6bGk+dWkgZGVzaWduPC9yZGY6bGk+CiAgICAgPHJkZjpsaT5ndWkgZGVzaWduPC9yZGY6bGk+CiAgICAgPHJkZjpsaT50YXNrYmFyIGljb25zPC9yZGY6bGk+CiAgICA8L3JkZjpCYWc+CiAgIDwvZGM6c3ViamVjdD4KICAgPGRjOnJpZ2h0cz4KICAgIDxyZGY6QWx0PgogICAgIDxyZGY6bGkgeG1sOmxhbmc9IngtZGVmYXVsdCI+Q3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsIGxpY2Vuc2U8L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC9kYzpyaWdodHM+CiAgIDxJcHRjNHhtcENvcmU6Q3JlYXRvckNvbnRhY3RJbmZvCiAgICBJcHRjNHhtcENvcmU6Q2lVcmxXb3JrPSJodHRwOi8vd3d3LmdlbnRsZWZhY2UuY29tIi8+CiAgIDxwbHVzXzFfOkltYWdlQ3JlYXRvcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgcGx1c18xXzpJbWFnZUNyZWF0b3JOYW1lPSJnZW50bGVmYWNlLmNvbSIvPgogICAgPC9yZGY6U2VxPgogICA8L3BsdXNfMV86SW1hZ2VDcmVhdG9yPgogICA8cGx1c18xXzpDb3B5cmlnaHRPd25lcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgcGx1c18xXzpDb3B5cmlnaHRPd25lck5hbWU9ImdlbnRsZWZhY2UuY29tIi8+CiAgICA8L3JkZjpTZXE+CiAgIDwvcGx1c18xXzpDb3B5cmlnaHRPd25lcj4KICAgPHhtcE1NOkhpc3Rvcnk+CiAgICA8cmRmOlNlcT4KICAgICA8cmRmOmxpCiAgICAgIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiCiAgICAgIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6OEFERDk4NTg4MjI4RTAxMTk4OUNDMEExQUQwMkI1QzIiCiAgICAgIHN0RXZ0OndoZW49IjIwMTEtMDEtMjVUMTM6NTU6MTErMDE6MDAiCiAgICAgIHN0RXZ0OmNoYW5nZWQ9Ii9tZXRhZGF0YSIvPgogICAgPC9yZGY6U2VxPgogICA8L3htcE1NOkhpc3Rvcnk+CiAgPC9yZGY6RGVzY3JpcHRpb24+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+ZoFmBQAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAA8dEVYdEFMVFRhZwBUaGlzIGlzIHRoZSBpY29uIGZyb20gR2VudGxlZmFjZS5jb20gZnJlZSBpY29ucyBzZXQuINhr6MQAAABEdEVYdENvcHlyaWdodABDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uIE5vbi1Db21tZXJjaWFsIE5vIERlcml2YXRpdmVze92woAAAAEVpVFh0RGVzY3JpcHRpb24AAAAAAFRoaXMgaXMgdGhlIGljb24gZnJvbSBHZW50bGVmYWNlLmNvbSBmcmVlIGljb25zIHNldC4gvBH4GgAAAEhpVFh0Q29weXJpZ2h0AAAAAABDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uIE5vbi1Db21tZXJjaWFsIE5vIERlcml2YXRpdmVzWILLBQAAAYxJREFUeAHtlEFqwlAQhv+hWXT5QNCVBEVEFDXBC6Q3sDdIjtATGG/QG8SeoEewy65M3evCpYKQXsB0HryFtq9pbF6VQj74sxiYmX8mj0HJv2Y0Go2lUADCL3FdNyIiH0yaptM4jkMVdzge45TpYrEIocHCmQyHQwHgmZt6LCgmHLeXy2XAMcGCjsIG+v2+w8UjAI6miT8YDHA4HJ7AGDfQ6/XkxHJyge/xWY5xA91uVxaO8qzWuIFOpyMb+yyYJ8NAu90WRPT5sRmHoKHVajlEFKl1miDhIe5Wq9XbjwaazaYnJwcgYJaE9bBer2c44gZHNBoNXzW/hXlkzbEQ4j1JktcvG7BtW122v4d/x2yz2QRgqF6vC/W/x7gsL2zk3uLPnOXg8nisucWnU+B6CLmBQDpBfqbIZoL8BASmVquFeRO32y0hA66V5h2Ea4WWKhpWq9VEPYwYBeBfiiyIyAXg7Xa7R+0hqlQqmRPs9/uTnKL5ln6C/BTNtzRHAudQLP/6GygNlG/g+gZKAx/ypNgS6B8cVQAAAABJRU5ErkJggg==);
background-size: 16px;
}
.mediafire-favicon {
background-image: url(https://www.mediafire.com/favicon.ico);
}`;


// prevent JQuery conflicts, see https://wiki.greasespot.net/@grant
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

    document.head.insertAdjacentHTML('beforeend', `<style id='relationship-shortcuts-userscript-css'>${userscriptCSS}</style>`);

    const mbidRE = /(release|release-group|work)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/;

    // Determine target column
    let columnindex = 0;
    $("table.tbl tbody tr[class!='subh']").each(function () {
        $(this)
            .children('td')
            .each(function () {
                const href = $(this).find('a').attr('href');
                if (href !== undefined && href.match(mbidRE)) {
                    return false;
                }
                columnindex++;
            });
        return false;
    });

    // Set MBID to row in tables to get easiest fastest access
    $("table.tbl tr[class!='subh']").each(function () {
        let $tr = $(this);

        $tr.children(`th:eq(${columnindex})`).after('<th>Relationships</th>');
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
    const url = `/ws/2/${child.type}?${parent.type}=${parent.mbid}&inc=${incOptions[child.type].join('+')}&limit=100&offset=${offset}`;

    $.get(url, function (data, textStatus, jqXHR) {
        // Parse each child
        $(data)
            .find(child.type)
            .each(function () {
                let mbid = $(this).attr('id');

                // URL relationships
                let alreadyInjectedUrls = [];
                $(this)
                    .find("relation-list[target-type='url'] relation")
                    .each(function () {
                        let relType = $(this).attr('type');
                        let targetUrl = $(this).children('target').text();
                        let ended = $(this).children('ended').text() === 'true';

                        // Dedupe rels by URL (e.g. for Bandcamp, which has purchase and stream rels)
                        if (alreadyInjectedUrls.includes(targetUrl)) return;
                        alreadyInjectedUrls.push(targetUrl);

                        let iconClass;
                        if (relType in urlRelationsIconClasses) {
                            iconClass = urlRelationsIconClasses[relType];
                        } else if (['free streaming', 'streaming', 'download for free', 'purchase for download'].includes(relType)) {
                            iconClass = findIconClassOfUrl(targetUrl, streamingIconClasses);
                        } else {
                            // Other database?
                            iconClass = findIconClassOfUrl(targetUrl, otherDatabasesIconClasses);
                        }

                        if (iconClass) {
                            if (ended) {
                                iconClass = ['ended', iconClass].join(' ');
                            }
                            injectShortcutIcon(mbid, targetUrl, iconClass);
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
                                const reltype = $(this).attr('type');
                                const target = $(this).children('target').text();
                                const url = targettype == 'url' ? target : `/${targettype}/${target}`;

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
