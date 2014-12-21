// ==UserScript==
// @name           Musicbrainz UI enhancements
// @description    Various UI enhancements for Musicbrainz
// @version        2014.12.21.1
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @icon           http://wiki.musicbrainz.org/-/images/3/3d/Musicbrainz_logo.png
// @namespace      http://userscripts.org/users/22504
// @include        http*://*musicbrainz.org/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        https://raw.github.com/murdos/mbediting.js/master/mbediting.js
// ==/UserScript==

function addJQuery(callback) {var script = document.createElement("script");script.setAttribute("src", "https://ajax.googleapis.com/ajax/libs/jquery/1.7/jquery.min.js");script.addEventListener('load', function() {var script = document.createElement("script");script.textContent = "(" + callback.toString() + ")();";document.body.appendChild(script);}, false);document.body.appendChild(script);}addJQuery(main);

function main() {
    LASTFM_APIKEY = null;
    jQuery.noConflict(); 
    (function ($) {

    // -------------- Start of script ------------------------
    
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
		if ( $("tr.subh").length == 1 ) {
		    var text = $.trim($("tr.subh:eq(0)").text());
		    if (text.match(/ 1$/)) {
                $("tr.subh:eq(0) a").text(text.replace(/ 1$/, ''));
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
    var re = new RegExp("musicbrainz\.org\/artist\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/(recordings|releases|works)","i");
    if (window.location.href.match(re)) {
        $("form").filter(function() {
            return $(this).prop("action").match("merge_queue");
        }).attr("target", "_blank");
    }	

    // Modify link to edits: remove " - <Edit type>" from the link "Edit XXXX - <Edit type>"
    var re = new RegExp("musicbrainz\.org/.*/(open_)?edits","i");
    if (window.location.href.match(re)) {
        $("div.edit-description ~ h2").each(function() {
            var parts = $(this).find("a").text().split(" - ");
            $(this).find("a").text(parts[0]);
            $(this).append(" - " + parts[1]);
        });
    }

    // Add direct link to cover art tab for Add cover art edits 
    var re = new RegExp("musicbrainz\.org/(.*/(open_)?edits|edit\/\d+)","i");
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
            var youtube_id = $youtube_link.attr("href").match(/http:\/\/www\.youtube\.com\/watch\?v=(.*)/)[1];
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
            if ($(th).text() == "ISRCs") isrcColNo = index;
        });
        $("#content table.tbl tbody tr").each(function() {
            var $td = $(this).find("td:eq("+isrcColNo+")");
            var reg = new RegExp("([A-Z]{2}[A-Z0-9]{3}[0-9]{7})");
            var isrcs = $td.text().trim().split("\n<br>\n");
            var newHTML = "";
            $.each(isrcs, function(index, isrc) {
                isrc = isrc.trim();
                newHTML += isrc.substring(0,5) + "<b>" + isrc.substring(5,7) + "</b>" + isrc.substring(7);
                if (index !=  isrcs.length-1) { newHTML += "<br>" };
            });
            $td.html(newHTML);
        });
    }	
	
	// Discogs link rollover
    // TODO...
	
    // -------------- End of script ------------------------

}(jQuery));
}

