// ==UserScript==
// @name           Musicbrainz DiscIds Detector
// @namespace      http://userscripts.org/users/22504
// @version        2017.02.22.0
// @description    Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @include        http://avaxhome.ws/music/*
// @include        https://apollo.rip/torrents.php?id=*
// @include        https://passtheheadphones.me/torrents.php?id=*
// @include        https://redacted.ch/torrents.php?id=*
// @include        http*://lztr.us/torrents.php?id=*
// @include        http*://lztr.me/torrents.php?id=*
// @include        http*://mutracker.org/torrents.php?id=*
// @require        http://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.js
// @require        http://pajhome.org.uk/crypt/md5/sha1.js
// @require        lib/logger.js
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

LOGGER.setLevel('info');

var CHECK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/gD+AP7rGNSCAAAACXBIWXMAAABIAAAASABGyWs+AAAACXZwQWcAAAAQAAAAEABcxq3DAAADKklEQVQ4y32TS2hcZRiGn/8/Z87MNNc2zczEmptO0jSXagJtXCjWhhSEXpCI4EYENy6KG8FFBYtgEbzQ4k5QqNp2VyMtJVGpRU0tGDNoQxvrmCbkMslkSJrJXM6cOef8v4ukQqX4wbP5eL/327wv/M/Em+qNeFO9ASDEwzUPrM+fP8dqOhXqeGJ/f21ddCAYCsfRyFLJvru2mvnh9mTil8am1uJLQ8ceNOhoa+XC8HfMJm81x1q63glV179oBMLVhpQYEiQKzy0VNtZWLs9OT53s6X3qrxPHX+bSyNVNgyujV8lvrDXG2vZ/7oWig64nAY0hwZCCgIRwUGBJRSGbvp6cHH91R33078ODTyNOnXqPxcRl88ibX5wuBJuP5x2BVhop2PwuBA01kn2tJo4HtxfL5DIzZ7+/8MHrOx7tcMQ3I9dwnWKvF+kfTdlVEc/10f59A0HAgMEui90xgxvTLn8u+9SYhXUnNX60smr7z7Jx3wG8UOSZhUI4spJTrGwo0lssZxVSQlOdZGrJYyzpks4qlvLBWhWMHOgb7Mfsq4PfXOvx+bwgk/WxSwrfUwRNQSgAh7oCFB3N1xNllrMK04A5V7PLMOOvCSFMgFzJl6u2Jl8Gx9XkCppSWdEWNWiPGZy9XmIs6WJKKHuasq+p3qlkOwhz9B54dnbOkorOR0yG9gZJ3fP5cNTm4J4Akws+FyfKOK5GCFAatm/T4ObmB7RWxt74k9hrC0LVtLwwmw2FwyY8323hK2iLGnz2U4lMTiHvR04IGiqLxbrS7x/np3NJozoEmcTFTLTz2U7bivTcXNSsFxWHeyyGE2XGZ7x/j7WGyhA0W3e/LU58eiY1N+0IgLc++or1VLLb6hz6MmPGe/M2NFTBzIpH3lYoX6MQhC1NkzV/p2Jp5JX6eP+vn7wxsJnEXXUVnL6T59K7J/u2tR96365oey7nVQTKnsDzNFr5hETBq3ZmbrB47cS5M2+PdTbHmJpL89+OGbv3dLc81n/kWLih+yDhnTGtEcpeXXHSUz/OJ64M3/ojMS3BUw9rI2BsIUxBsLYyEJYC1nNuqawpARrwtwDgHxTwbTT5CxY9AAAALnpUWHRjcmVhdGUtZGF0ZQAAeNozMjCw0DWw0DUyCTEwsDIyszIw0jUwtTIwAABB3gURQfNnBAAAAC56VFh0bW9kaWZ5LWRhdGUAAHjaMzIwsNA1sNA1MggxNLMyNLYyNtM1MLUyMAAAQgUFF56jVzIAAAAASUVORK5CYII%3D";

$(document).ready(function () {

    if (window.location.host.match(/apollo\.rip|redacted\.ch|passtheheadphones\.me|lztr\.(us|me)|mutracker\.org/)) {
        LOGGER.info("Gazelle site detected");
        gazellePageHandler();
    } else if (window.location.host.match(/avaxhome\.ws/)) {
        avaxHomePageHandler();
    }

});

function avaxHomePageHandler() {

    // Find artist and release titles
    var artistName = "";
    var releaseName = "";
    var m = $('div.title h1').text().match(/(.*) (?:-|–) (.*)( \(\d{4}\))?/);
    if (m) {
        artistName = m[1];
        releaseName = m[2];
    }
    if (artistName == "VA") artistName = "Various Artists";

    // Find and analyze EAC log
    $('div.spoiler').filter(function () {
        return $(this).find('a').text().match(/(EAC|log)/i);
    })
        .find('div')
        .each(function () {

            var $eacLog = $(this);
            var discs = analyze_log_files($eacLog);

            // Check and display
            check_and_display_discs(artistName, releaseName, discs,
                function (mb_toc_numbers, discid, discNumber) {
                    $eacLog.parents('div.spoiler').prevAll('div.center:first').append('<br /><strong>' + (discs.length > 1 ? 'Disc ' + discNumber + ': ' : '' ) + 'MB DiscId </strong><span id="' + discid + '" />');
                },
                function (mb_toc_numbers, discid, discNumber, found) {
                    var url = computeAttachURL(mb_toc_numbers, artistName, releaseName);
                    var html = '<a href="' + url + '">' + discid + '</a>';
                    if (found) {
                        html = html + '<img src="' + CHECK_IMAGE + '" />';
                    }
                    $('#' + discid.replace('.', '\\.')).html(html);
                }
            );

        });
}

function gazellePageHandler() {

    var serverHost = window.location.host;

    // Determine Artist name and Release title
    var titleAndArtists = $("#content div.thin h2:eq(0)").text();
    var pattern = /(.*) - (.*) \[.*\] \[.*/;
    var artistName, releaseName;
    if (m = titleAndArtists.match(pattern)) {
        artistName = m[1];
        releaseName = m[2];
    }
    LOGGER.debug("artist:", artistName, "- releaseName:", releaseName);

    // Parse each torrent
    $('tr.group_torrent').filter(function () {
        return $(this).attr("id");
    }).each(function () {
        var torrentInfo = $(this).next();

        $(torrentInfo).find('a')
            // Only investigate the ones with a log
            .filter(function (index) {
                return $(this).text().match(/View Log/i);
            })
            .each(function () {
                LOGGER.debug("Log link", this);
                if ($(this).attr("onclick").match(/show_logs/)) {
                    if (window.location.host.match(/apollo/)) {
                        LOGGER.debug("Apollo");
                        var logAction = 'viewlog';
                    } else if (window.location.host.match(/redacted|passtheheadphones/)){
                        LOGGER.debug("RED");
                        var logAction = 'loglist';
                    }
                }
                // LzTR
                else if ($(this).attr("onclick").match(/get_log/)) {
                    LOGGER.debug("LzTR");
                    var logAction = 'log_ajax';
                } else {
                    return true;
                }
                var targetContainer = $(this).parents(".linkbox");
                var torrentId = /(show_logs|get_log)\('(\d+)/.exec($(this).attr('onclick'))[2];
                var logUrl = '/torrents.php?action=' + logAction + '&torrentid=' + torrentId;
                LOGGER.info("Log URL: ", logUrl);
                LOGGER.debug("targetContainer: ", targetContainer);

                // Get log content
                $.get(logUrl,
                    function (data) {
                        LOGGER.debug("Log content", $(data).find('pre'));
                        var discs = analyze_log_files($(data).find('pre'));
                        LOGGER.debug("Number of disc found", discs.length);
                        check_and_display_discs(artistName, releaseName, discs,
                            function (mb_toc_numbers, discid, discNumber) {
                                targetContainer.append('<br /><strong>' + (discs.length > 1 ? 'Disc ' + discNumber + ': ' : '' ) + 'MB DiscId: </strong><span id="' + torrentId + '_disc' + discNumber + '" />');
                            },
                            function (mb_toc_numbers, discid, discNumber, found) {
                                var url = computeAttachURL(mb_toc_numbers, artistName, releaseName);
                                var html = '<a href="' + url + '">' + discid + '</a>';
                                if (found) {
                                    html = html + '<img src="' + CHECK_IMAGE + '" />';
                                }
                                LOGGER.debug('#' + torrentId + '_disc' + discNumber);
                                $('#' + torrentId + '_disc' + discNumber).html(html);
                            }
                        );
                    }
                );

            }
        );
    });
}


// Common functions

function computeAttachURL(mb_toc_numbers, artistName, releaseName) {
    var url = 'http://musicbrainz.org/cdtoc/attach'
        + '?toc=' + mb_toc_numbers.join("%20")
        + '&artist-name=' + encodeURIComponent(artistName)
        + '&release-name=' + encodeURIComponent(releaseName);
    return url;
}

function analyze_log_files(log_files) {
    var discs = [];
    $.each(log_files, function (i, log_file) {
        var discsInLog = MBDiscid.log_input_to_entries($(log_file).text());
        for (var i = 0; i < discsInLog.length; i++) {
            discs.push(discsInLog[i]);
        }
    });

    // Remove dupes discs
    var keys = new Object();
    var uniqueDiscs = new Array();
    for (var i = 0; i < discs.length; i++) {
        var discid = MBDiscid.calculate_mb_discid(discs[i]);
        if (discid in keys) {
            continue;
        } else {
            keys[discid] = 1;
            uniqueDiscs.push(discs[i]);
        }
    }
    discs = uniqueDiscs;
    return discs;
}

function check_and_display_discs(artistName, releaseName, discs, displayDiscHandler, displayResultHandler) {

    // For each disc, check if it's in MusicBrainz database
    for (var i = 0; i < discs.length; i++) {
        var entries = discs[i];
        var discNumber = i + 1;
        if (entries.length > 0) {

            var mb_toc_numbers = MBDiscid.calculate_mb_toc_numbers(entries);
            var discid = MBDiscid.calculate_mb_discid(entries);
            LOGGER.info("Computed discid :" + discid);
            displayDiscHandler(mb_toc_numbers, discid, discNumber);

            // Now check if this discid is known by MusicBrainz
            (function (discid, discNumber, mb_toc_numbers) {
                var query = $.getJSON('//musicbrainz.org/ws/2/discid/' + discid + '?cdstubs=no');
                query.done(function (data) {
                    var existsInMusicbrainz = !('error' in data) && data.error != "Not found";
                    displayResultHandler(mb_toc_numbers, discid, discNumber, existsInMusicbrainz);
                });
                query.fail(function () {
                    // If discid is not found, the webservice returns a 404 http code
                    displayResultHandler(mb_toc_numbers, discid, discNumber, false);
                });
            })(discid, discNumber, mb_toc_numbers);
        }
    }
}

/* -------------------------------------------- */

// MBDiscid code comes from https://gist.github.com/kolen/766668
// Copyright 2010, kolen
// Released under the MIT License

var MBDiscid = (function () {

    this.SECTORS_PER_SECOND = 75;
    this.PREGAP = 150;
    this.DATA_TRACK_GAP = 11400;

    this.toc_entry_matcher = new RegExp(
        "^\\s*" +
        "(\\d+)" +  // 1 - track number
        "\\s*\\|\\s*" +
        "([0-9:.]+)" + // 2 - time start
        "\\s*\\|\\s*" +
        "([0-9:.]+)" + // 3 - time length
        "\\s*\\|\\s*" +
        "(\\d+)" + // 4 - start sector
        "\\s*\\|\\s*" +
        "(\\d+)" + // 5 - end sector
        "\\s*$"
    );
    this.log_input_to_entries = function (text) {
        var discs = [];
        var entries = [];
        $.each(text.split("\n"), function (index, value) {
            var m = toc_entry_matcher.exec(value);
            if (m) {
                // New disc
                if (parseInt(m[1], 10) == 1) {
                    if (entries.length > 0) {
                        discs.push(entries);
                    }
                    entries = [];
                }
                entries.push(m);
            }
        });
        if (entries.length > 0) {
            discs.push(entries);
        }

        for (var i = 0; i < discs.length; i++) {
            var entries = discs[i];
            var layout_type = get_layout_type(entries);
            var entries_audio;
            if (layout_type == "with_data") {
                entries_audio = entries.slice(0, entries.length - 1);
            } else {
                entries_audio = entries;
            }
            discs[i] = entries_audio;
        }
        return discs;
    };

    this.get_layout_type = function (entries) {
        var type = "standard";
        for (var i = 0; i < entries.length - 1; i++) {
            var gap = parseInt(entries[i + 1][4], 10) - parseInt(entries[i][5], 10) - 1;
            if (gap != 0) {
                if (i == entries.length - 2 && gap == DATA_TRACK_GAP) {
                    type = "with_data";
                } else {
                    type = "unknown";
                    break;
                }
            }
        }
        return type;
    };

    this.calculate_mb_toc_numbers = function (entries) {
        if (entries.length == 0) {
            return null;
        }

        var leadout_offset = parseInt(entries[entries.length - 1][5], 10) + PREGAP + 1;

        var offsets = $.map(entries, function (entry) {
            return parseInt(entry[4], 10) + PREGAP;
        })
        return [1, entries.length, leadout_offset].concat(offsets);
    };

    this.calculate_cddb_id = function (entries) {
        var sum_of_digits = function (n) {
            var sum = 0;
            while (n > 0) {
                sum = sum + (n % 10);
                n = Math.floor(n / 10);
            }
            return sum;
        }

        var decimalToHexString = function (number) {
            if (number < 0) {
                number = 0xFFFFFFFF + number + 1;
            }

            return number.toString(16).toUpperCase();
        }

        var length_seconds = Math.floor((parseInt(entries[entries.length - 1][5], 10) - parseInt(entries[0][4], 10) + 1) / SECTORS_PER_SECOND);
        var checksum = 0;
        $.each(entries, function (index, entry) {
            checksum += sum_of_digits(Math.floor((parseInt(entry[4], 10) + PREGAP) / SECTORS_PER_SECOND));
        })

        var xx = checksum % 255;
        var discid_num = (xx << 24) | (length_seconds << 8) | entries.length;
        //return discid_num
        return decimalToHexString(discid_num);
    };

    this.calculate_mb_discid = function (entries) {

        var hex_left_pad = function (input, totalChars) {
            input = '' + parseInt(input, 10).toString(16).toUpperCase();
            var padWith = "0";
            if (input.length < totalChars) {
                while (input.length < totalChars) {
                    input = padWith + input;
                }
            } else {
            }
            if (input.length > totalChars) { //if padWith was a multiple character string and num was overpadded
                input = input.substring((input.length - totalChars), totalChars);
            } else {
            }

            return input;
        };

        var mb_toc_numbers = calculate_mb_toc_numbers(entries);
        var message = "";
        var first_track = mb_toc_numbers[0];
        var last_track = mb_toc_numbers[1];
        var leadout_offset = mb_toc_numbers[2];
        message = message + hex_left_pad(first_track, 2);
        message = message + hex_left_pad(last_track, 2);
        message = message + hex_left_pad(leadout_offset, 8);
        for (var i = 0; i < 99; i++) {
            var offset = (i + 3 < mb_toc_numbers.length) ? mb_toc_numbers[i + 3] : 0;
            message = message + hex_left_pad(offset, 8);
        }

        b64pad = "=";
        var discid = b64_sha1(message);
        discid = discid.replace(/\+/g, ".").replace(/\//g, "_").replace(/=/g, "-");
        return discid;
    };

    return this;
})();
