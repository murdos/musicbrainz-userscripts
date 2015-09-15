// ==UserScript==
// @name           Musicbrainz UI enhancements
// @description    Various UI enhancements for Musicbrainz
// @version        2015.09.15.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @icon           http://wiki.musicbrainz.org/-/images/3/3d/Musicbrainz_logo.png
// @namespace      http://userscripts.org/users/22504
// @include        http*://*musicbrainz.org/*
// @require        http://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.js
// @require        https://raw.github.com/murdos/mbediting.js/master/mbediting.js
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

$(document).ready(function () {
    LASTFM_APIKEY = null;

    // Highlight table rows
    $('table.tbl tbody tr').hover(
        function () {
            $(this).children('td').each(function(){
                var backgroundColor = $(this).css("backgroundColor");
                if (backgroundColor != 'rgb(255, 255, 0)')
                    $(this).css("backgroundColor", "#ffeea8");
            });
        },
        function () {
            $(this).children('td').each(function(){
                var backgroundColor = $(this).css("backgroundColor");
                if (backgroundColor != 'rgb(255, 255, 0)')
                    $(this).css("backgroundColor", "");
            });
        }
    );

    var re;

    // Top tracks from Lastfm
    re = new RegExp("musicbrainz\.org\/artist\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$","i");
    if (LASTFM_APIKEY && window.location.href.match(re)) {
        $('h2.discography').before('<h2 class="toptracks">Top Last.fm recordings</h2><ul class="toptracks" />');
        var mbid = window.location.href.match(re)[1];
        var toptracks = $.getJSON('http://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&mbid='+mbid+'&api_key='+LASTFM_APIKEY+'&format=json', function(data) {
            $.each(data.toptracks.track, function (index, track) {
                if (index >= 5) return true;
                var url = track.mbid ? '/recording/'+track.mbid : track.url;
                $('ul.toptracks').append('<li><a href="'+url+'">'+track.name+'</a></li>');
            });
        });
    }

    // Fix for http://tickets.musicbrainz.org/browse/MBS-750
    re = new RegExp("musicbrainz\.org\/release\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})","i");
    if (window.location.href.match(re)) {
        if ($("table.medium thead").length == 1) {
            var text = $.trim($("table.medium thead").text());
            if (text.match(/ 1$/)) {
                $("table.medium thead a").text(text.replace(/ 1$/, ''));
            }
        }
    }

    // Better fix for http://tickets.musicbrainz.org/browse/MBS-1943
    re = new RegExp("musicbrainz\.org\/(artist|release-group|release|recording|work|label)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})","i");
    if (window.location.href.match(re)) {
        $("#sidebar h2:contains('Rating')").before($("#sidebar h2:contains('External links')"));
        var pageHasRGLinks = $("#sidebar h2:contains('Release group external links')").length > 0;
        $("#sidebar h2:contains('Rating')").before(
            $("#sidebar h2:contains('External links')").nextAll("ul.external_links").filter( function() {
                return !pageHasRGLinks || $(this).nextAll("h2:contains('Release group external links')").length > 0;
            }));
        $("#sidebar h2:contains('Rating')").before($("#sidebar h2:contains('Release group external links')"));
        $("#sidebar h2:contains('Rating')").before($("#sidebar h2:contains('Release group external links')").nextAll("ul.external_links"));
    }

    // Remove the affiliate section
    re = new RegExp("musicbrainz\.org\/(artist|release-group|release|recording|work|label)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})","i");
    if (window.location.href.match(re)) {
        $('#sidebar-affiliates').remove();
    }

    // Batch merge -> open in a new tab/windows
    re = new RegExp("musicbrainz\.org\/artist\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/(recordings|releases|works)","i");
    if (window.location.href.match(re)) {
        $("form").filter(function() {
            return $(this).prop("action").match("merge_queue");
        }).attr("target", "_blank");
    }

    // Modify link to edits: remove " - <Edit type>" from the link "Edit XXXX - <Edit type>"
    re = new RegExp("musicbrainz\.org/.*/(open_)?edits","i");
    if (window.location.href.match(re)) {
        $("div.edit-description ~ h2").each(function() {
            var parts = $(this).find("a").text().split(" - ");
            $(this).find("a").text(parts[0]);
            $(this).append(" - " + parts[1]);
        });
    }

    // Add direct link to cover art tab for Add cover art edits
    re = new RegExp("musicbrainz\.org/(.*/(open_)?edits|edit\/\d+)","i");
    if (window.location.href.match(re)) {
        $("div.edit-description ~ h2:contains('cover art')").each(function() {
            $editdetails = $(this).parents('.edit-header').siblings('.edit-details');
            mbid = $editdetails.find("a[href*='musicbrainz.org/release/']").attr('href').match(/\/release\/(.{36})/)[1];
            $editdetails.find('tbody td.edit-cover-art').after("<tr><th span='2'><a href='/release/"+mbid+"/cover-art'>See all artworks for this release</a></th></tr>");
        });
    }

    // Embed Youtube videos
    re = new RegExp("musicbrainz\.org\/recording\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$","i");
    if (window.location.href.match(re)) {
        var $youtube_link = $('#sidebar li.youtube-favicon a');
        if ($youtube_link.length > 0) {
            var youtube_id = $youtube_link.prop("href").match(/http:\/\/www\.youtube\.com\/watch\?v=(.*)/)[1];
            $("table.details").width("60%");
            $("h2:contains('Relationships')").after('<iframe width="360" height="275" frameborder="0" style="float: right;" src="https://www.youtube.com/embed/'+ youtube_id +'?rel=0" allowfullscreen=""></iframe>');
        }
    }

    // When attaching CDTOC, autoselect artist when there's only one result
    re = new RegExp("musicbrainz\.org\/cdtoc\/attach.*&filter-artist.query=.*","i");
    if (window.location.href.match(re)) {
        $artists = $('ul.radio-list li');
        if ($artists.length == 1) {
            $artists.find('input:radio').attr('checked', true);
        }
    }

    // Highlight Year in ISRCs codes
    re = new RegExp("musicbrainz\.org\/artist\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/recordings","i");
    if (window.location.href.match(re)) {
        var isrcColNo; // = ($("#content table.tbl thead th:eq(2)").text() == "Artist") ? 3 : 2;
        $("#content table.tbl thead th").each(function(index, th) {
            if ($(th).text() == "ISRCs") {
                isrcColNo = index;
                return false;
            }
        });
        var reg = new RegExp("([A-Z]{2}[A-Z0-9]{3}[0-9]{7})");
        $("#content table.tbl tbody tr").each(function() {
            var $td = $(this).find("td:eq("+isrcColNo+")");
            var isrcs = $td.text().trim().split("\n<br>\n");
            var newHTML = "";
            $.each(isrcs, function(index, isrc) {
                isrc = isrc.trim();
                newHTML += "<a href='/isrc/" + isrc + "'><code>";
                newHTML += isrc.substring(0,5) + "<b>" + isrc.substring(5,7) + "</b>" + isrc.substring(7);
                newHTML += "</code></a>";
                if (index !=  isrcs.length-1) { newHTML += "<br>" };
            });
            $td.html(newHTML);
        });
    }

    // Display ISRCs and recording comment on release tracklisting
    re = new RegExp("musicbrainz\.org\/release\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})#?$","i");
    if (window.location.href.match(re)) {
        var ISRC_COLUMN_POSITION = 2;
        var mbid = window.location.href.match(re)[1];
        // Get tracks data from webservice
        var wsurl = "/ws/2/release/" + mbid + "?inc=isrcs+recordings";
        $.getJSON(wsurl, function(data) {
            // Store tracks data from webservice in a hash table
            var tracks = {};
            $.each(data.media, function(index, medium) {
                $.each(medium.tracks, function(i, track) {
                    tracks[track.id] = track;
                });
            });
            // Different behavior depending on the number of mediums
            if ($('table.medium').length <= 10) {
                // All mediums are already displayed: handle them now
                $("table.medium").each(function() {
                    handleMedium($(this), tracks)
                });
            } else {
                // Each medium will be handled when it's loaded
                var HANDLED_ATTRIBUTE = 'ui_enh_isrcs_handled';
                $('table.medium').attr(HANDLED_ATTRIBUTE, 'no');
                $('table.medium').bind("DOMNodeInserted", function(event) {
                    $target = $(event.target);
                    if ($target.prop('nodeName') == 'TBODY' && $target.parent().attr(HANDLED_ATTRIBUTE) == 'no' && $target.find('tr.subh').length > 0) {
                        $medium = $target.parent();
                        $medium.attr(HANDLED_ATTRIBUTE, 'pending');
                        handleMedium($medium, tracks);
                        $medium.attr(HANDLED_ATTRIBUTE, 'done');
                    }
                });
            }
        });

        function handleMedium($medium, ws_tracks) {
            // Extend colspan for medium table header
            $medium.find("thead tr").each(function() {
                $(this).find("th:eq(0)").attr("colspan", $(this).find("th:eq(0)").attr("colspan")*1+1);
            });
            // Table sub-header
            $medium.find("tbody tr.subh th:nth-last-child("+ISRC_COLUMN_POSITION+")").before("<th style='width: 150px;' class='isrc c'> ISRC </th>");

            // Handle each track
            $medium.find("tbody tr[id]").each(function(index, medium_track) {
                track_mbid = $(medium_track).attr('id');
                var isrcsLinks = "";
                if (ws_tracks.hasOwnProperty(track_mbid)) {
                    track = ws_tracks[track_mbid];
                    var recording = track.recording;
                    // Recording comment
                    if (recording.disambiguation != "") {
                        var td_title_index = $("#"+track_mbid).find("td:eq(1)").hasClass("video") ? 2 : 1;
                        $("#"+track_mbid).find("td:eq("+td_title_index+") a:eq(0)").after(' <span class="comment">(' + recording.disambiguation + ')</span>');
                    }
                    // ISRCS
                    if (recording.isrcs.length != 0) {
                        var links = jQuery.map(recording.isrcs, function(isrc, i) {
                            return ("<a href='/isrc/" + isrc + "'>" + isrc + "</a>");
                        });
                        isrcsLinks = links.join(", ");
                    }
                }
                $('#'+track_mbid).find("td:nth-last-child("+ISRC_COLUMN_POSITION+")").before("<td class='isrc c'><small>"+isrcsLinks+"</small></td>");
            });
        }
    }

    // Display "Edit relationships" link for release besides "Edit" link
    re = new RegExp("musicbrainz\.org\/release\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})","i");
    if (window.location.href.match(re)) {
        var mbid = window.location.href.match(re)[1];
        $('ul.tabs').append('<li><a href="/release/' + mbid + '/edit-relationships">Edit relationships</a></li>');
    }

    // Discogs link rollover
    // TODO...

    // -------------- End of script ------------------------

});

