// ==UserScript==
// @name           Display shortcut for relationships on MusicBrainz
// @description    Display icon shortcut for relationships of release-group, release, recording and work: e.g. Amazon, Discogs, Wikipedia, ... links. This allows to access some relationships without opening the entity page.
// @version        2016.12.12.0
// @author         Aurelien Mino <aurelien.mino@gmail.com>
// @licence        GPL (http://www.gnu.org/copyleft/gpl.html)
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @include        http*://*musicbrainz.org/artist/*
// @include        http*://*musicbrainz.org/release-group/*
// @include        http*://*musicbrainz.org/label/*
// @require        lib/logger.js
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// ==/UserScript==

// Definitions: relations-type and corresponding icons we are going to treat
var relationsIconsURLs = {
    'url': {
       "amazon asin": "http://amazon.fr/favicon.ico",
       "discogs": "https://www.discogs.com/images/favicon.ico",
       "wikidata": "https://upload.wikimedia.org/wikipedia/commons/e/e8/Wikidata-favicon.png",
       "imdb": "http://www.imdb.com/favicon.ico",
       "creative commons licensed download": "http://creativecommons.org/favicon.ico",
       "cover art link": "http://cdcovers.to/favicon.ico",
       "secondhandsongs": "http://secondhandsongs.com/art/favicon.png",
       "lyrics": "http://www.nomy.nu/img/lyrics-icon.gif"
    },
    'release-group': {
       "single from": "http://www.amaesingtools.com/images/left_arrow_icon.gif"
    },
    'release': {
       "part of set": "http://web.archive.org/web/20060709091901/http://wiki.musicbrainz.org/-/musicbrainz/img/moin-inter.png",
       "remaster": "http://web.archive.org/web/20060708200714/http://wiki.musicbrainz.org/-/musicbrainz/img/moin-www.png",
    }
};

var incOptions = {
    'release-group': [ 'release-group-rels', 'url-rels' ],
    'release': [ 'release-rels', 'url-rels', 'discids' ],
    'recording': [ 'work-rels' ],
    'work': [ 'url-rels' ]
};

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

    // Get pageType (label or artist)
    var parent = new Object();
    var child = new Object();
    if (m = window.location.href.match("\/artist\/(.{36})[^\/]*$")) {
        parent.type = 'artist';
        parent.mbid = m[1];
        child.type = 'release-group';
    } else if (m = window.location.href.match("\/(release-group|label)\/(.{36})$")) {
        parent.type = m[1];
        parent.mbid = m[2];
        child.type = 'release';
    } else if (m = window.location.href.match("\/artist/(.{36})\/(releases|recordings|works)")) {
        parent.type = 'artist';
        parent.mbid = m[1];
        child.type = m[2].replace(/s$/, '');
    } else {
        // Not supported
        return;
    }

    var mbidRE = /(release|release-group|work)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/;

    // Determine target column
    var columnindex = 0;
    $("table.tbl tbody tr[class!='subh']").each(function() {
        $(this).children("td").each(function() {
            if ($(this).find("a").attr("href") !== undefined && $(this).find("a").attr("href").match(mbidRE)) { return false };
            columnindex++;
        });
        return false;
    });

    // Set MBID to row in tables to get easiest fastest access
    $("table.tbl tr[class!='subh']").each(function() {
        var $tr = $(this);

        $tr.children("th:eq("+columnindex+")").after("<th style='width: 150px;'>Relationships</th>");
        $tr.children("td:eq("+columnindex+")").after("<td class='relationships'></td>");

        $(this).find("a").each(function() {
            var href = $(this).attr("href");
            if (m = href.match(mbidRE)) {
                $tr.attr("id", m[2]);
                return false;
            }
        });
    });

    // Call the MB webservice
    var url = '/ws/2/' + child.type + '?' + parent.type + "=" + parent.mbid + '&inc=' + incOptions[child.type].join("+") + '&limit=100';
    LOGGER.debug("MB WS url: " + url);

    $.get(url, function(data, textStatus, jqXHR) {

        // Parse each child
        $(data).find(child.type).each(function() {
            var mbid = $(this).attr("id");

            // URL relationships
            $(this).find("relation-list[target-type='url'] relation").each(function() {
                var reltype = $(this).attr("type");
                var target = $(this).children("target").text();
                if (relationsIconsURLs['url'].hasOwnProperty(reltype)) {
                    $("#" + mbid + " td.relationships").append(
                        "<a href='" + target.replace(/'/g,"&apos;") + "'>"
                        +   "<img style='max-height: 15px;' src='" + relationsIconsURLs['url'][reltype] + "' />&nbsp;"
                        + "</a>"
                    );
                }
            });

            // Other relationships
            $(this).find("relation-list[target-type!='url']").each(function() {
                var targettype = $(this).attr("target-type").replace("release_group", "release-group");
                var relations = {};

                $(this).children("relation").each(function() {
                    var reltype = $(this).attr("type");
                    var target = $(this).children("target").text();
                    var url = (targettype == 'url') ? target : "/" + targettype + "/" + target;

                    if (relationsIconsURLs[targettype].hasOwnProperty(reltype)) {

                        if (!relations.hasOwnProperty(reltype)) relations[reltype] = [url];
                        else relations[reltype].push(url);
                    }
                });

                $.each(relations, function(reltype, urls) {
                    var html = "";
                    if (urls.length < -1) {
                        html += "<img src='" + relationsIconsURLs[targettype][reltype] + "' />(" + urls.length + ")&nbsp;"
                    } else {
                        $.each(urls, function(index, url) {
                            html += "<a href='" + url + "'><img src='" + relationsIconsURLs[targettype][reltype] + "' /></a>&nbsp;";
                        });
                    }
                    $("#" + mbid + " td.relationships").append(html);

                });
            });

        });

    });

});
