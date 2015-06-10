// ==UserScript==
// @name           Musicbrainz DiscIds Detector
// @namespace      http://userscripts.org/users/22504
// @version	       2014.12.21.1
// @description    Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @include        http://avaxhome.ws/music/*
// @include        http*://what.cd/torrents.php?id=*
// @include        https://ssl.what.cd/torrents.php?id=*
// @include        http*://lztr.us/torrents.php?id=*
// @include        http*://mutracker.org/torrents.php?id=*
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @grant          GM_xmlhttpRequest
// ==/UserScript==

(function () {

var EMPTY_WS_RESPONSE = '<?xml version="1.0" encoding="UTF-8"?><error><text>Not Found</text><text>For usage, please see: http://musicbrainz.org/development/mmd</text></error>';

var CHECK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/gD+AP7rGNSCAAAACXBIWXMAAABIAAAASABGyWs+AAAACXZwQWcAAAAQAAAAEABcxq3DAAADKklEQVQ4y32TS2hcZRiGn/8/Z87MNNc2zczEmptO0jSXagJtXCjWhhSEXpCI4EYENy6KG8FFBYtgEbzQ4k5QqNp2VyMtJVGpRU0tGDNoQxvrmCbkMslkSJrJXM6cOef8v4ukQqX4wbP5eL/327wv/M/Em+qNeFO9ASDEwzUPrM+fP8dqOhXqeGJ/f21ddCAYCsfRyFLJvru2mvnh9mTil8am1uJLQ8ceNOhoa+XC8HfMJm81x1q63glV179oBMLVhpQYEiQKzy0VNtZWLs9OT53s6X3qrxPHX+bSyNVNgyujV8lvrDXG2vZ/7oWig64nAY0hwZCCgIRwUGBJRSGbvp6cHH91R33078ODTyNOnXqPxcRl88ibX5wuBJuP5x2BVhop2PwuBA01kn2tJo4HtxfL5DIzZ7+/8MHrOx7tcMQ3I9dwnWKvF+kfTdlVEc/10f59A0HAgMEui90xgxvTLn8u+9SYhXUnNX60smr7z7Jx3wG8UOSZhUI4spJTrGwo0lssZxVSQlOdZGrJYyzpks4qlvLBWhWMHOgb7Mfsq4PfXOvx+bwgk/WxSwrfUwRNQSgAh7oCFB3N1xNllrMK04A5V7PLMOOvCSFMgFzJl6u2Jl8Gx9XkCppSWdEWNWiPGZy9XmIs6WJKKHuasq+p3qlkOwhz9B54dnbOkorOR0yG9gZJ3fP5cNTm4J4Akws+FyfKOK5GCFAatm/T4ObmB7RWxt74k9hrC0LVtLwwmw2FwyY8323hK2iLGnz2U4lMTiHvR04IGiqLxbrS7x/np3NJozoEmcTFTLTz2U7bivTcXNSsFxWHeyyGE2XGZ7x/j7WGyhA0W3e/LU58eiY1N+0IgLc++or1VLLb6hz6MmPGe/M2NFTBzIpH3lYoX6MQhC1NkzV/p2Jp5JX6eP+vn7wxsJnEXXUVnL6T59K7J/u2tR96365oey7nVQTKnsDzNFr5hETBq3ZmbrB47cS5M2+PdTbHmJpL89+OGbv3dLc81n/kWLih+yDhnTGtEcpeXXHSUz/OJ64M3/ojMS3BUw9rI2BsIUxBsLYyEJYC1nNuqawpARrwtwDgHxTwbTT5CxY9AAAALnpUWHRjcmVhdGUtZGF0ZQAAeNozMjCw0DWw0DUyCTEwsDIyszIw0jUwtTIwAABB3gURQfNnBAAAAC56VFh0bW9kaWZ5LWRhdGUAAHjaMzIwsNA1sNA1MggxNLMyNLYyNtM1MLUyMAAAQgUFF56jVzIAAAAASUVORK5CYII%3D";

$(document).ready(function(){

    if (window.location.host.match(/(what\.cd|lztr\.us)|mutracker\.org/)) {
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
    $('div.spoiler').filter(function() { return $(this).find('a').text().match(/(EAC|log)/i); })
                    .find('div')
                    .each(function() {

        var $eacLog = $(this);
        var discs = analyze_log_files($eacLog);

        // Check and display
        check_and_display_discs(artistName, releaseName, discs, 
            function(mb_toc_numbers, discid, discNumber) { 
                $eacLog.parents('div.spoiler').prevAll('div.center:first').append('<br /><strong>' + (discs.length > 1 ? 'Disc '+discNumber+': ' : '' ) + 'MB DiscId </strong><span id="'+discid+'" />');
            },
            function(mb_toc_numbers, discid, discNumber, found) { 
                var url = computeAttachURL(mb_toc_numbers, artistName, releaseName);
                var html = '<a href="'+url+'">' + discid + '</a>';
				if (found) { html = html + '<img src="' + CHECK_IMAGE + '" />'; }
                $('#'+discid.replace('.', '\\.')).html(html);
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
/*
    if (texts.length == 0) { texts = $("#content div.thin h2 span") };
    texts = texts.contents().filter(function() { return this.nodeType == 3 || $.nodeName(this, "a") });

	var artistName = "";
	texts.each(function(i) {
		if (i < texts.length-1) { artistName = artistName + ((this.nodeType == 3) ? this.textContent : $(this).text()); }
	});
	
    var releaseName = texts[texts.length-1].textContent.replace(/\s\[.*\]$/, '');
    releaseName = releaseName.substring(artistName.length > 0 ? 3 : 0, releaseName.length).replace(/ \[.*\]/g, "").replace("Various Artists - ", "");
*/

    // Parse each torrent
	$('tr.group_torrent').filter(function() { return $(this).attr("id"); }).each(function() {
		var torrentInfo = $(this).next();

		$(torrentInfo).find('a')
            // Only investigate the ones with a log
			.filter( function(index) { return $(this).attr("href").match(/action=viewlog/) || $(this).text().contains("View Log"); })
			.each(function() {

                // What.CD way                
                if ($(this).attr("href").match(/action=viewlog/)) {
                    var blockquote = $(this).parents('blockquote');
                    var torrentId = /torrentid=(\d+)/.exec($(this).attr('href'))[1];
				    var url = '/' + $(this).attr('href');
                }
                // LzTR way  
                else if ($(this).text().contains("View Log")) {
                    var blockquote = $(this).parents('div.linkbox');
                    var torrentId = $(this).parents("tr.pad").attr("id").match(/torrent_(\d+)/)[1];
                    var url = '/torrents.php?action=log_ajax&torrentid=' + torrentId;
                } else {
                    return true;
                }

                // Get log content
			    $.get(url, 
				    function(data) {
				        mylog($(data).find('pre'));
                        var discs = analyze_log_files( $(data).find('pre') );
                        mylog(discs.length);
                        check_and_display_discs(artistName, releaseName, discs, 
                            function(mb_toc_numbers, discid, discNumber) {
                                blockquote.append('<br /><strong>' + (discs.length > 1 ? 'Disc '+discNumber+': ' : '' ) + 'MB DiscId: </strong><span id="' + torrentId + '_disc' + discNumber +'" />');
                            },
                            function(mb_toc_numbers, discid, discNumber, found) { 
                                
					            var url = computeAttachURL(mb_toc_numbers, artistName, releaseName);
					            var html = '<a href="'+url+'">' + discid + '</a>';
					            if (found) { html = html + '<img src="' + CHECK_IMAGE + '" />'; }
                                $('#'+torrentId+'_disc'+discNumber).html(html); 
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
			    +'?toc='+mb_toc_numbers.join("%20")
			    +'&artist-name='+encodeURIComponent(artistName)
			    +'&release-name='+encodeURIComponent(releaseName);
    return url;
}


var analyze_log_files = function(log_files) {
    var discs = [];
    $.each(log_files, function(i, log_file) {
        var discsInLog = log_input_to_entries($(log_file).text());
        for (var i = 0; i < discsInLog.length ; i++) {
            discs.push(discsInLog[i]);
        }
    });

	// Remove dupes discs
	var keys = new Object();
	var uniqueDiscs = new Array();
	for (var i = 0; i < discs.length ; i++) {
		var discid = calculate_mb_discid(discs[i]);
		mylog(discid);
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

var check_and_display_discs = function(artistName, releaseName, discs, displayDiscHandler, displayResultHandler) {

    // For each disc, check if it's in MusicBrainz database
    for (var i = 0; i < discs.length ; i++) {
        var entries = discs[i];
        var discNumber = i+1;
        if (entries.length > 0) {

	        var mb_toc_numbers = calculate_mb_toc_numbers(entries);
            var discid = calculate_mb_discid(entries);
            mylog(discid);
            displayDiscHandler(mb_toc_numbers, discid, discNumber);

            // Now check if this discid is known by MusicBrainz
            (function(discid, discNumber, mb_toc_numbers) {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'http://musicbrainz.org/ws/2/discid/'+discid+'?cdstubs=no',
                    headers: {
                        'User-agent': 'Mozilla/4.0 (compatible) Greasemonkey',
                        'Accept': 'application/atom+xml,application/xml,text/xml',
                    },
                    onload: function(responseDetails) {
      
                        displayResultHandler(mb_toc_numbers, discid, discNumber, responseDetails.responseText != EMPTY_WS_RESPONSE);

                    }
                });
            })(discid, discNumber, mb_toc_numbers);
        } 
     }

}

function mylog(text) {
    var DEBUG = true;
    if (DEBUG && unsafeWindow.console) {
        unsafeWindow.console.log(text);
    }
}

/* -------------------------------------------- */

var SECTORS_PER_SECOND = 75
var PREGAP = 150
var DATA_TRACK_GAP = 11400

var toc_entry_matcher = new RegExp(
            "^\\s*"+
            "(\\d+)"+  // 1 - track number
            "\\s*\\|\\s*"+
            "([0-9:.]+)"+ // 2 - time start
            "\\s*\\|\\s*"+
            "([0-9:.]+)"+ // 3 - time length
            "\\s*\\|\\s*"+
            "(\\d+)"+ // 4 - start sector
            "\\s*\\|\\s*"+
            "(\\d+)"+ // 5 - end sector
            "\\s*$"
)
var log_input_to_entries = function(text) {
    var discs = [];
    var entries = [];
    $.each(text.split("\n"), function(index, value) {
        var m = toc_entry_matcher.exec(value);
        if (m) {
            // New disc
            if (parseInt(m[1], 10) == 1) {
                if (entries.length > 0) { discs.push(entries); }
                entries = [];
            }
            entries.push(m);
        }
    });
    if (entries.length > 0) { discs.push(entries); }
	
    for (var i = 0; i < discs.length ; i++) {
        var entries = discs[i];
	    var layout_type = get_layout_type(entries);
	    var entries_audio;
	    if (layout_type == "with_data") {
		    entries_audio = entries.slice(0, entries.length-1);
	    } else {
		    entries_audio = entries;
	    }
        discs[i] = entries_audio;
    }	
    return discs;
}

var get_layout_type = function(entries) {
    var type = "standard";
    for (var i=0; i<entries.length-1; i++) {
        var gap = parseInt(entries[i+1][4], 10) - parseInt(entries[i][5], 10) - 1;
        if (gap != 0) {
            if (i == entries.length-2 && gap == DATA_TRACK_GAP) {
                type = "with_data";
            } else {
                type = "unknown";
                break;
            }
        }
    }
    return type;
}

var calculate_mb_toc_numbers = function(entries) {
    if (entries.length == 0) {
        return null;
    }

    var leadout_offset = parseInt(entries[entries.length - 1][5], 10) + PREGAP + 1;

    var offsets = $.map(entries, function(entry) {
        return parseInt(entry[4], 10) + PREGAP;
    })
    return [1, entries.length, leadout_offset].concat(offsets);
}

var calculate_cddb_id = function(entries) {
    var sum_of_digits = function(n) {
      var sum = 0;
      while (n > 0) {
        sum = sum + (n % 10);
        n = Math.floor(n / 10);
      }
      return sum;
    }

    var decimalToHexString = function(number) {
        if (number < 0)
        {
            number = 0xFFFFFFFF + number + 1;
        }

        return number.toString(16).toUpperCase();
    }

    var length_seconds = Math.floor((parseInt(entries[entries.length-1][5], 10) - parseInt(entries[0][4], 10) + 1)
        / SECTORS_PER_SECOND);
    var checksum = 0;
    $.each(entries, function(index, entry) {
        checksum += sum_of_digits(Math.floor((parseInt(entry[4], 10) + PREGAP) / SECTORS_PER_SECOND));
    })

    var xx = checksum % 255;
    var discid_num = (xx << 24) | (length_seconds << 8) | entries.length;
    //return discid_num
    return decimalToHexString(discid_num);
}

var calculate_mb_discid = function(entries) {

	var mb_toc_numbers = calculate_mb_toc_numbers(entries);
	var message = "";
	var first_track = mb_toc_numbers[0];
	var last_track = mb_toc_numbers[1];
	var leadout_offset = mb_toc_numbers[2];
	message = message + hex_left_pad(first_track, 2);
	message = message + hex_left_pad(last_track,2);
	message = message + hex_left_pad(leadout_offset,8);
	for (var i=0; i<99; i++) {
		var offset = (i+3 < mb_toc_numbers.length) ? mb_toc_numbers[i+3] : 0;
		message = message + hex_left_pad(offset,8);
	}

	b64pad = "=";
	var discid = b64_sha1(message);
	discid = discid.replace(/\+/g,".").replace(/\//g,"_").replace(/=/g,"-");
	return discid;
}

var hex_left_pad = function(input, totalChars) {

	input = '' + parseInt(input, 10).toString(16).toUpperCase();
	var padWith = "0";
	if (input.length < totalChars) {
		while (input.length < totalChars) {
			input = padWith + input;
		}
	} else {}
 
		if (input.length > totalChars) { //if padWith was a multiple character string and num was overpadded
		input = input.substring((input.length - totalChars), totalChars);
		} else {}
 
	return input;

}

/* ---------------------------------------------------------------------------------------------------------- */

/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS 180-1
 * Version 2.2 Copyright Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_sha1(s)    { return rstr2hex(rstr_sha1(str2rstr_utf8(s))); }
function b64_sha1(s)    { return rstr2b64(rstr_sha1(str2rstr_utf8(s))); }
function any_sha1(s, e) { return rstr2any(rstr_sha1(str2rstr_utf8(s)), e); }
function hex_hmac_sha1(k, d)
  { return rstr2hex(rstr_hmac_sha1(str2rstr_utf8(k), str2rstr_utf8(d))); }
function b64_hmac_sha1(k, d)
  { return rstr2b64(rstr_hmac_sha1(str2rstr_utf8(k), str2rstr_utf8(d))); }
function any_hmac_sha1(k, d, e)
  { return rstr2any(rstr_hmac_sha1(str2rstr_utf8(k), str2rstr_utf8(d)), e); }

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
  return hex_sha1("abc").toLowerCase() == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

/*
 * Calculate the SHA1 of a raw string
 */
function rstr_sha1(s)
{
  return binb2rstr(binb_sha1(rstr2binb(s), s.length * 8));
}

/*
 * Calculate the HMAC-SHA1 of a key and some data (raw strings)
 */
function rstr_hmac_sha1(key, data)
{
  var bkey = rstr2binb(key);
  if(bkey.length > 16) bkey = binb_sha1(bkey, key.length * 8);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = binb_sha1(ipad.concat(rstr2binb(data)), 512 + data.length * 8);
  return binb2rstr(binb_sha1(opad.concat(hash), 512 + 160));
}

/*
 * Convert a raw string to a hex string
 */
function rstr2hex(input)
{
  try { hexcase } catch(e) { hexcase=0; }
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var output = "";
  var x;
  for(var i = 0; i < input.length; i++)
  {
    x = input.charCodeAt(i);
    output += hex_tab.charAt((x >>> 4) & 0x0F)
           +  hex_tab.charAt( x        & 0x0F);
  }
  return output;
}

/*
 * Convert a raw string to a base-64 string
 */
function rstr2b64(input)
{
  try { b64pad } catch(e) { b64pad=''; }
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var output = "";
  var len = input.length;
  for(var i = 0; i < len; i += 3)
  {
    var triplet = (input.charCodeAt(i) << 16)
                | (i + 1 < len ? input.charCodeAt(i+1) << 8 : 0)
                | (i + 2 < len ? input.charCodeAt(i+2)      : 0);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > input.length * 8) output += b64pad;
      else output += tab.charAt((triplet >>> 6*(3-j)) & 0x3F);
    }
  }
  return output;
}

/*
 * Convert a raw string to an arbitrary string encoding
 */
function rstr2any(input, encoding)
{
  var divisor = encoding.length;
  var remainders = Array();
  var i, q, x, quotient;

  /* Convert to an array of 16-bit big-endian values, forming the dividend */
  var dividend = Array(Math.ceil(input.length / 2));
  for(i = 0; i < dividend.length; i++)
  {
    dividend[i] = (input.charCodeAt(i * 2) << 8) | input.charCodeAt(i * 2 + 1);
  }

  /*
   * Repeatedly perform a long division. The binary array forms the dividend,
   * the length of the encoding is the divisor. Once computed, the quotient
   * forms the dividend for the next step. We stop when the dividend is zero.
   * All remainders are stored for later use.
   */
  while(dividend.length > 0)
  {
    quotient = Array();
    x = 0;
    for(i = 0; i < dividend.length; i++)
    {
      x = (x << 16) + dividend[i];
      q = Math.floor(x / divisor);
      x -= q * divisor;
      if(quotient.length > 0 || q > 0)
        quotient[quotient.length] = q;
    }
    remainders[remainders.length] = x;
    dividend = quotient;
  }

  /* Convert the remainders to the output string */
  var output = "";
  for(i = remainders.length - 1; i >= 0; i--)
    output += encoding.charAt(remainders[i]);

  /* Append leading zero equivalents */
  var full_length = Math.ceil(input.length * 8 /
                                    (Math.log(encoding.length) / Math.log(2)))
  for(i = output.length; i < full_length; i++)
    output = encoding[0] + output;

  return output;
}

/*
 * Encode a string as utf-8.
 * For efficiency, this assumes the input is valid utf-16.
 */
function str2rstr_utf8(input)
{
  var output = "";
  var i = -1;
  var x, y;

  while(++i < input.length)
  {
    /* Decode utf-16 surrogate pairs */
    x = input.charCodeAt(i);
    y = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
    if(0xD800 <= x && x <= 0xDBFF && 0xDC00 <= y && y <= 0xDFFF)
    {
      x = 0x10000 + ((x & 0x03FF) << 10) + (y & 0x03FF);
      i++;
    }

    /* Encode output as utf-8 */
    if(x <= 0x7F)
      output += String.fromCharCode(x);
    else if(x <= 0x7FF)
      output += String.fromCharCode(0xC0 | ((x >>> 6 ) & 0x1F),
                                    0x80 | ( x         & 0x3F));
    else if(x <= 0xFFFF)
      output += String.fromCharCode(0xE0 | ((x >>> 12) & 0x0F),
                                    0x80 | ((x >>> 6 ) & 0x3F),
                                    0x80 | ( x         & 0x3F));
    else if(x <= 0x1FFFFF)
      output += String.fromCharCode(0xF0 | ((x >>> 18) & 0x07),
                                    0x80 | ((x >>> 12) & 0x3F),
                                    0x80 | ((x >>> 6 ) & 0x3F),
                                    0x80 | ( x         & 0x3F));
  }
  return output;
}

/*
 * Encode a string as utf-16
 */
function str2rstr_utf16le(input)
{
  var output = "";
  for(var i = 0; i < input.length; i++)
    output += String.fromCharCode( input.charCodeAt(i)        & 0xFF,
                                  (input.charCodeAt(i) >>> 8) & 0xFF);
  return output;
}

function str2rstr_utf16be(input)
{
  var output = "";
  for(var i = 0; i < input.length; i++)
    output += String.fromCharCode((input.charCodeAt(i) >>> 8) & 0xFF,
                                   input.charCodeAt(i)        & 0xFF);
  return output;
}

/*
 * Convert a raw string to an array of big-endian words
 * Characters >255 have their high-byte silently ignored.
 */
function rstr2binb(input)
{
  var output = Array(input.length >> 2);
  for(var i = 0; i < output.length; i++)
    output[i] = 0;
  for(var i = 0; i < input.length * 8; i += 8)
    output[i>>5] |= (input.charCodeAt(i / 8) & 0xFF) << (24 - i % 32);
  return output;
}

/*
 * Convert an array of big-endian words to a string
 */
function binb2rstr(input)
{
  var output = "";
  for(var i = 0; i < input.length * 32; i += 8)
    output += String.fromCharCode((input[i>>5] >>> (24 - i % 32)) & 0xFF);
  return output;
}

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function binb_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = bit_rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(bit_rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = bit_rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

/* ----------------------------------------------------------------------------------- */

})();