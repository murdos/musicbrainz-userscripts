// ==UserScript==
// @name          MusicBrainz: Expand/collapse release groups
// @description	  See what's inside a release group without having to follow its URL. Also adds convenient edit links for it.
// @namespace     http://userscripts.org/users/266906
// @author        Michael Wiencek <mwtuea@gmail.com>
// @version       6.1
// @license       GPL
// @include       *://musicbrainz.org/artist/*
// @include       *://musicbrainz.org/label/*
// @include       *://musicbrainz.org/release-group/*
// @include       *://beta.musicbrainz.org/artist/*
// @include       *://beta.musicbrainz.org/label/*
// @include       *://beta.musicbrainz.org/release-group/*
// @include       *://test.musicbrainz.org/artist/*
// @include       *://test.musicbrainz.org/label/*
// @include       *://test.musicbrainz.org/release-group/*
// @match         *://musicbrainz.org/artist/*
// @match         *://musicbrainz.org/label/*
// @match         *://musicbrainz.org/release-group/*
// @match         *://beta.musicbrainz.org/artist/*
// @match         *://beta.musicbrainz.org/label/*
// @match         *://beta.musicbrainz.org/release-group/*
// @match         *://test.musicbrainz.org/artist/*
// @match         *://test.musicbrainz.org/label/*
// @match         *://test.musicbrainz.org/release-group/*
// ==/UserScript==

var MBID_REGEX = /[0-9a-z]{8}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{12}/,
    entity = window.location.pathname.match(/\/(artist|label|release-group)\/.+/)[1],
    theads = document.getElementsByTagName("thead");

if (theads.length > 0) {

    var ths = theads[0].getElementsByTagName("th"),
        trs = document.getElementsByTagName("tr"),
        col = 0;

    if (entity == "artist") {
        var current_tab = document.getElementsByClassName("tabs")[0]
                                  .getElementsByClassName("sel")[0]
                                  .getElementsByTagName("a")[0]
                                  .textContent;
    }

    if (entity == "artist" && current_tab == "Overview") {
        for (; col < ths.length; col++)
            if (ths[col].textContent == "Title")
                break;

        for (var i = 0; i < trs.length; i++) {
            if (/\/release-group\/[a-z\d\-]+/.test(trs[i].innerHTML)) {
                inject_release_group_button(trs[i].getElementsByTagName("td")[col]);
            }
        }
    } else if (entity != "artist" || entity == "artist" && current_tab == "Releases") {
        for (; col < ths.length; col++)
            if (ths[col].textContent == "Release")
                break;

        var table = theads[0].parentNode,
            cols = theads[0].getElementsByTagName("th").length;

        for (var i = 0; i < trs.length; i += 1) {
            if (/\/release\/[a-z\d\-]+/.test(trs[i].innerHTML)) {
                var row = table.insertRow(i + 1),
                    table_parent = document.createElement("td"),
                    release_table = document.createElement("table"),
                    mbid = trs[i].getElementsByTagName("a")[0].href.match(MBID_REGEX)[0];
                table_parent.colSpan = cols;
                row.appendChild(table_parent);
                row.className = trs[i].className;
                release_table.style.marginBottom = "0.5em";
                release_table.style.marginLeft = "3em";
                inject_release_button(trs[i].getElementsByTagName("td")[col], table_parent, release_table, mbid);
                i += 1;
            }
        }
    }
}

function inject_release_group_button(parent) {
    var mbid = parent.getElementsByTagName("a")[0].href.match(MBID_REGEX),
        table = document.createElement("table");

    table.style.marginTop = "1em";
    table.style.marginLeft = "1em";
    table.style.paddingLeft = "1em";

    var button = create_button(
        "/ws/2/release?release-group=" + mbid + "&limit=100&inc=media&fmt=json",
        function(toggled) {
            if (toggled) parent.appendChild(table); else parent.removeChild(table);
        },
        function(json) {
            parse_release_group(json, mbid, parent, table);
        },
        function(status) {
            table.innerHTML = '<tr><td style="color: #f00;">Error loading release group (HTTP status ' + status + ')</td></tr>';
        }
    );

    parent.insertBefore(button, parent.firstChild);
}

function inject_release_button(parent, table_parent, table, mbid) {
    var row = table_parent.parentNode;
    row.style.display = "none";
    table_parent.appendChild(table);

    var button = create_button(
        "/ws/2/release/" + mbid + "?inc=media+recordings+artist-credits&fmt=json",
        function(toggled) {
            row.style.display = toggled ? "table-row" : "none";
        },
        function(json) {
            parse_release(json, table);
        },
        function(status) {
            table.innerHTML = '<tr><td style="color: #f00;">Error loading release (HTTP status ' + status + ')</td></tr>';
        }
    );

    parent.insertBefore(button, parent.childNodes[0]);
}

function create_button(url, dom_callback, success_callback, error_callback) {
    var button = document.createElement("span"), toggled = false;

    button.innerHTML = "&#9654;";
    button.style.cursor = "pointer";
    button.style.marginRight = "4px";
    button.style.color = "#777";

    button.addEventListener("mousedown", function() {
        toggled = !toggled;
        if (toggled)
            button.innerHTML = "&#9660;";
        else button.innerHTML = "&#9654;";
        dom_callback(toggled);
    }, false);

    button.addEventListener("mousedown", function() {
        var this_event = arguments.callee;
        button.removeEventListener("mousedown", this_event, false);
        var req = new XMLHttpRequest();

        req.onreadystatechange = function() {
            if (req.readyState != 4) return;

            if (req.status == 200 && req.responseText) {
                success_callback(JSON.parse(req.responseText));
            } else {
                button.addEventListener("mousedown", function() {
                    button.removeEventListener("mousedown", arguments.callee, false);
                    button.addEventListener("mousedown", this_event, false);
                }, false);
                error_callback(req.status);
            }
        };

        req.open("GET", url, true);
        req.send(null);

    }, false);

    return button;
}

function format_time(ms) {
    var ts = ms / 1000, s = Math.round(ts % 60);
    return (Math.floor(ts / 60) + ":" + (s >= 10 ? s : "0" + s));
}

function parse_release_group(json, mbid, parent, table) {
    var releases = json.releases;
    table.innerHTML = "";

    for (var i = 0; i < releases.length; i++) {
        var release = releases[i], media = {}, tracks = [], formats = [];

        for (var j = 0; j < release.media.length; j++) {
            var medium = release.media[j], format = medium.format, count = medium["track-count"];
            if (format)
                format in media ? (media[format] += 1) : (media[format] = 1);
            tracks.push(count);
        }

        for (format in media) {
            var count = media[format], txt;
            if (count > 1)
                formats.push(count.toString() + "&#215;" + format);
            else formats.push(format);
        }

        release.tracks = tracks.join(" + ");
        release.formats = formats.join(" + ");
    }

    releases.sort(function(a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0;
    });

    for (var i = 0; i < releases.length; i++) {(function(release) {
        var track_tr = document.createElement("tr"),
            track_td = document.createElement("td"),
            track_table = document.createElement("table"),
            format_td = document.createElement("td"),
            tr = document.createElement("tr"),
            td = document.createElement("td"),
            a = createLink("/release/" + release.id, release.title);

        track_td.colSpan = 6;
        track_table.style.width = "100%";
        track_table.style.marginLeft = "1em";
        track_tr.appendChild(track_td);
        inject_release_button(td, track_td, track_table, release.id);
        td.appendChild(a);
        td.appendChild(document.createTextNode(release.disambiguation || ""));
        tr.appendChild(td);
        format_td.innerHTML = release.formats;
        tr.appendChild(format_td);

        var columns = [
            release.tracks,
            release.date || "",
            release.country || "",
            release.status || ""
        ];

        for (var i = 0; i < columns.length; i++)
            tr.appendChild(createElement("td", columns[i]));

        table.appendChild(tr);
        table.appendChild(track_tr);

    })(releases[i]);}

    var bottom_tr = document.createElement("tr"),
        bottom_td = document.createElement("td");

    bottom_td.colSpan = 6;
    bottom_td.style.padding = "1em";

    bottom_td.appendChild(createLink("/release-group/" + mbid + "/edit", "edit"));
    bottom_td.appendChild(document.createTextNode(" | "));
    bottom_td.appendChild(createLink("/release/add?release-group=" + mbid, "add release"));
    bottom_td.appendChild(document.createTextNode(" | "));
    bottom_td.appendChild(createLink("/release-group/" + mbid + "/relate", "use in a relationship"));
    bottom_td.appendChild(document.createTextNode(" | "));
    bottom_td.appendChild(createLink("/release-group/" + mbid + "/edits", "editing history"));

    bottom_tr.appendChild(bottom_td);
    table.appendChild(bottom_tr);
}

function parse_release(json, table) {
    var media = json.media;
    table.innerHTML = "";

    for (var i = 0; i < media.length; i++) {
        var medium = media[i],
            format = medium.format ? medium.format + " " + (i + 1) : "Medium " + (i + 1);

        table.innerHTML += '<tr class="subh"><td colspan="4">' + format + "</td></tr>";

        for (var j = 0; j < medium.tracks.length; j++) {
            var track = medium.tracks[j], recording = track.recording,
                disambiguation = recording.disambiguation ? " (" + recording.disambiguation + ")" : "",
                length = track.length ? format_time(track.length) : "?:??"
                artist_credit = track["artist-credit"] || track.recording["artist-credit"],
                tr = document.createElement("tr");

            tr.appendChild(createElement("td", j + 1));
            var title_td = createElement("td", disambiguation);
            title_td.insertBefore(createLink("/recording/" + recording.id, recording.title), title_td.firstChild);
            tr.appendChild(title_td);
            tr.appendChild(createElement("td", length));
            var ac_td = document.createElement("td");
            ac_td.appendChild(createAC(artist_credit));
            tr.appendChild(ac_td);

            table.appendChild(tr);
        }
    }

    var bottom_tr = document.createElement("tr"),
        bottom_td = document.createElement("td");

    bottom_td.colSpan = 4;
    bottom_td.style.padding = "1em";

    bottom_td.appendChild(createLink("/release/" + json.id + "/edit", "edit"));
    bottom_td.appendChild(document.createTextNode(" | "));
    bottom_td.appendChild(createLink("/release/" + json.id + "/relate", "use in a relationship"));
    bottom_td.appendChild(document.createTextNode(" | "));
    bottom_td.appendChild(createLink("/release/" + json.id + "/edits", "editing history"));

    bottom_tr.appendChild(bottom_td);
    table.appendChild(bottom_tr);
}

function createAC(obj) {
    var span = document.createElement("span");

    for (var i = 0; i < obj.length; i++) {
        var credit = obj[i], artist = credit.artist,
            link = createLink("/artist/" + artist.id, credit.name || artist.name);

        link.setAttribute("title", artist["sort-name"]);
        span.appendChild(link);

        if (credit.joinphrase)
            span.appendChild(document.createTextNode(credit.joinphrase));
    }
    return span;
}

function createElement(name, text) {
    var element = document.createElement(name);
    element.textContent = text;
    return element;
}

function createLink(href, text) {
    var element = createElement("a", text);
    element.href = href;
    return element;
}