// ==UserScript==
// @name           Display shortcut for relationships on MusicBrainz
// @description    Display icon shortcut for relationships of release-group, release, recording and work: e.g. Amazon, Discogs, Wikipedia, ... links. This allows to access some relationships without opening the entity page.
// @version        2013.01.30.1
// @author         Aurelien Mino <aurelien.mino@gmail.com>
// @licence        GPL (http://www.gnu.org/copyleft/gpl.html)
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/mb_relationship_shortcuts.user.js
// @include        http*://*musicbrainz.org/artist/*
// @include        http*://*musicbrainz.org/release-group/*
// @include        http*://*musicbrainz.org/label/*
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// ==/UserScript==

DISCOGS_ICON = "data:image/x-icon;base64,AAABAAIAEBAAAAAAAABoAwAAJgAAACAgAAAAAAAAqAwAAI4DAAAoAAAAEAAAACAAAAABABgAAAAAAEADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa3N7a3N7a3N7a3N7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa3N7QkJCQkJCKTk5EBAQEBAQAAAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAQkJCvcbGa3N7QkJCISkpEBAQEBAQAAAAAAAAEBAQAAAAAAAAAAAAAAAAAAAAISkpQkJCa3N7vcbGa3N7ISkpEBAQEBAQAAAAAAAAAAAAEBAQAAAAAAAAAAAAISkpKTk5QkJCQkJCa3N7a3N7KTk5ISkpEBAQAAAAAAAAAAAAAAAAISkpAAAAAAAAEBAQISkpISkpKTk5KTk5EBAQGGNrGGNrCAgICAgIAAAAAAAAAAAAAAAAAAAAa3N7AAAAEBAQEBAQEBAQEBAQAMbWAMbWAMbWAMbWCAgIAAAAAAAAAAAAAAAAa3N7a3N7AAAAAAAAAAAAAAgIGGNrAMbWAMbWAMbWAMbWGGNrAAAAAAAAAAAAAAAAa3N7a3N7AAAAAAAAAAAAAAAAGGNrAMbWAMbWAMbWAMbWGGNrEBAQEBAQEBAQEBAQa3N7a3N7AAAAAAAAAAAAAAAAEBAQAMbWAMbWAMbWAMbWEBAQISkpISkpEBAQEBAQa3N7AAAAEBAQAAAAAAAAAAAAAAAAEBAQGGNrGGNrEBAQQkJCQkJCISkpISkpISkpAAAAAAAAQkJCAAAAAAAAAAAAEBAQEBAQISkpQkJCa3N7a62tQkJCQkJCISkpQkJCAAAAAAAAAAAAISkpAAAAAAAAEBAQEBAQISkpKTk5a3N7vcbGa3N7KTk5QkJCAAAAAAAAAAAAAAAAAAAAQkJCAAAAEBAQEBAQISkpKTk5QkJCa3N7a3N7a3N7AAAAAAAAAAAAAAAAAAAAAAAAAAAAKTk5KTk5EBAQEBAQEBAQISkpQkJCQkJCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa3N7a3N7a3N7a3N7AAAAAAAAAAAAAAAAAAAAAAAA/D////AP///gB///wAP//4AB//+AAf//AAD//wAA//8AAP//AAD//4AB//+AAf//wAP//+AH///wD////D///ygAAAAgAAAAQAAAAAEAGAAAAAAAgAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgxMTExMTExMTExMTExMTExMTEYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTGcjIycjIxaY2NaY2NaY2NaY2NKSkoxMTExMTEYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBiEc3OctbXOxsa9ra2Ec3NKSkpKSkoxMTExMTEYGBgYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTEAAABKSkpaY2POxsb///+9ra1aY2MxMTExMTExMTEYGBgYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTFKSkqEc3OcjIy9ra2cjIyEc3NaY2NKSkpKSkoxMTExMTEYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTExMTFaY2NaY2NKSkpaY2Pn5+fn5+eEc3MxMTExMTEYGBgYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgxMTFKSkpKSkoxMTExMTGcjIze1tbOxsZaY2NKSkoxMTEYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgxMTFKSkoxMTExMTFaY2NaY2NaY2OctbXOxsZjOTkYGBgYGBgYGBgpAAApAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgxMTExMTEYGBhKSkpKSkoxMTFKSkqcjIx7WloYGBgIY2sIY2sIY2sIY2sxMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgxMTFKSkoxMTExMTFKSkoYGBgxMTEApbUAvcYAvcYAvcYAvcYAvcYIY2sYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgxMTExMTEYGBgxMTEYGBgIY2sA5/cAvcYAvcYAvcYAvcYApbUAvcYA5/cApbUYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTEAAAAAAAAYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgA5/cApbUAvcYA5/cA5/cA5/cA5/cA5/cApbUA5/cIY2sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgYGBgIY2sAvcYAvcYA5/cA5/cA5/cA5/cA5/cA5/cA5/cAvcYApbUYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgApbUAvcYA5/cA5/cA5/cAvcYAvcYA5/cA5/cA5/cAvcYAvcYxMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgAvcYAvcYA5/cA5/cA5/eEc3OEc3MAvcYA5/cA5/cAvcYAvcYxMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgApbUAvcYA5/cA5/cA5/cAvcYAvcYA5/cA5/cA5/cAvcYAvcYxMTEpAAAYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIY2sAvcYAvcYA5/cA5/cA5/cA5/cA5/cA5/cAvcYAvcYApbUYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgAAAAAAAAxMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTEA5/cApbUAvcYA5/cA5/cA5/cA5/cA5/cApbUA5/cIY2spAAAYGBgYGBgYGBgYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIY2sA5/cAvcYAvcYAvcYAvcYAvcYAvcYA5/cIY2spAAAxMTEYGBgYGBgxMTEYGBgYGBgYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIY2sApbUAvcYAvcYAvcYAvcYApbUxMTEAAABKSkoxMTExMTFKSkoxMTEYGBgYGBgYGBgYGBgAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgIY2sIY2sIY2sxMTExMTF7WlqcjIxKSkoxMTFKSkpKSkoYGBgxMTExMTEYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApAAApAAAYGBgYGBhCGBiEc3Pe1tacjIxKSkpKSkpKSkoxMTExMTExMTExMTEYGBgYGBgAAAAAAAAAAAAAAAAYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgxMTExMTFaY2OcjIzOxsbOxsaEc3MxMTExMTFKSkpKSkoxMTExMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgYGBgxMTExMTFKSkqcjIz////n5+daY2MxMTFKSkpKSkoxMTExMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgxMTExMTFKSkpKSkqEc3OcjIyctbWcjIyEc3NaY2MxMTExMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABKSkoAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgYGBgYGBgxMTExMTExMTFaY2Pe1tb///+9ra1KSkoxMTEpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABKSkoAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgYGBgYGBgxMTExMTExMTFKSkqEc3POxsbn5+ecjIxaY2MYGBgYGBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYGBgYGBgYGBgYGBgYGBgxMTExMTExMTExMTExMTFKSkpaY2O9ra29ra0xMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTEAAAAAAAAAAAAYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgxMTExMTExMTExMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxMTEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABaY2NKSkpKSkpKSkpKSkpaY2MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8A///4AB//4AAH/8AAA/8AAAD/AAAA/gAAAHwAAAA8AAAAOAAAABgAAAAYAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAYAAAAGAAAABwAAAA8AAAAPgAAAH8AAAD/AAAA/4AAAf/gAAf/8AAP//wAP///gf/w%3D%3D";

SECONDHANDSONGS_ICON="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAMJJREFUeNpi/P//PwMIsOXNY0ACxkDsAsQdDNjBHiB2/TUpiYEFi2QaEM9kwA+UYAwmLBKENOM1IA2L4ntAbALEjGgYqwGCWAyYBcRncTmFCYtt6CAUh8FYDZiFxRBQjJyB0gQNeA+KHixOVoIakkbIAJg3XKFxjQ5AMVROyABkl3RiketANoSJQHxXQDE6INoABhyuEIQlJmIMKMfhRXBsIecFUObZzUAcmIXNC/eI1LwHOVxYSDBgFlTzamRBgAADAN8FJPSh7DaOAAAAAElFTkSuQmCC";

// Definitions: relations-type and corresponding icons we are going to treat
var relationsIconsURLs = {
    'url': {
       "amazon asin": "http://amazon.fr/favicon.ico",
       "discogs": DISCOGS_ICON,
       /*
       "wikipedia": "http://fr.wikipedia.org/favicon.ico",
       */
       "wikidata": "https://bits.wikimedia.org/favicon/wikidata.ico",
       "imdb": "http://www.imdb.com/favicon.ico",
       "creative commons licensed download": "http://creativecommons.org/favicon.ico",
       "cover art link": "http://cdcovers.to/favicon.ico",
       "secondhandsongs": SECONDHANDSONGS_ICON,
       "lyrics": "http://www.nomy.nu/img/lyrics-icon.gif"
    },
    'release-group': {
       "single from": "http://www.amaesingtools.com/images/left_arrow_icon.gif"
    },
    'release': {
       "part of set": "http://oldwiki.musicbrainz.org/-/musicbrainz/img/moin-inter.png",
       "remaster": "http://oldwiki.musicbrainz.org/-/musicbrainz/img/moin-www.png",
    }
};

var incOptions = {
    'release-group': [ 'release-group-rels', 'url-rels' ],
    'release': [ 'release-rels', 'url-rels', 'discids' ],
    'recording': [ 'work-rels' ],
    'work': [ 'url-rels' ]
};

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
	mylog('wsurl: ' + url);

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
						+ 	"<img src='" + relationsIconsURLs['url'][reltype] + "' />&nbsp;"
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

function mylog(text) {
    if (unsafeWindow.console) {
        unsafeWindow.console.log(text);
    }
}
