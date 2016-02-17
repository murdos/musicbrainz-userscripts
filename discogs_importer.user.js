// ==UserScript==

// @name           Import Discogs releases to MusicBrainz
// @description    Add a button to import Discogs releases to MusicBrainz and add links to matching MusicBrainz entities for various Discogs entities (artist,release,master,label)
// @version        2016.02.17.0
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/discogs_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/discogs_importer.user.js
// @include        http*://www.discogs.com/*
// @include        http*://*.discogs.com/*release/*
// @exclude        http*://*.discogs.com/*release/*?f=xml*
// @exclude        http*://www.discogs.com/release/add
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==


// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

var DEBUG = false;
//DEBUG = true;
if (DEBUG) {
  LOGGER.setLevel('debug');
}

////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Test cases:
 * - http://www.discogs.com/release/1566223 : Artist credit of tracks contains an ending ',' join phrase
 */

var mblinks = new MBLinks('DISCOGS_MBLINKS_CACHE', '1');

$(document).ready(function(){

    MBImportStyle();
    MBSearchItStyle();

    var current_page_key = getDiscogsLinkKey(window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '').replace('/master/view/', '/master/'));
    if (!current_page_key) return;

    // disable evil pjax (used for artist page navigation)
    // it causes various annoying issues with our code;
    // it should be possible to react to pjax events
    $("div#pjax_container").attr('id', 'pjax_disabled');

    // Display links of equivalent MusicBrainz entities
    insertMBLinks(current_page_key);

    // Add an import button in a new section in sidebar, if we're on a release page
    var current_page_info = link_infos[current_page_key];
    if (current_page_info.type == 'release') {

        // Discogs Webservice URL
        var discogsWsUrl = 'https://api.discogs.com/releases/' + current_page_info.id;

        $.ajax({
            url: discogsWsUrl,
            dataType: 'json',
            crossDomain: true,
            success: function (data, textStatus, jqXHR) {
                LOGGER.debug("Discogs JSON Data from API:", data);
                try {
                  var release = parseDiscogsRelease(data);
                  insertMBSection(release, current_page_key);
                } catch (e) {
                  $('div.musicbrainz').remove();
                  var mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>').hide();
                  var mbContentBlock = $('<div class="section_content"></div>');
                  mbUI.append(mbContentBlock);
                  var mbError = $('<p><small>' + e + '<br /><b>Please <a href="https://github.com/murdos/musicbrainz-userscripts/issues">report</a> this error, along the current page URL.</b></small></p>');
                  mbContentBlock.prepend(mbError);
                  insertMbUI(mbUI);
                  mbError.css({'background-color': '#fbb', 'margin-top': '4px', 'margin-bottom': '4px'});
                  mbUI.slideDown();
                  throw e;
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                LOGGER.error("AJAX Status: ", textStatus);
                LOGGER.error("AJAX error thrown: ", errorThrown);
            }
        });

    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                              Display links of equivalent MusicBrainz entities                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Insert MusicBrainz links in a section of the page
function insertMBLinks(current_page_key) {

    function searchAndDisplayMbLinkInSection($tr, discogs_type, mb_type, nosearch) {
        if (!mb_type) mb_type = defaultMBtype(discogs_type);
        $tr.find('a[mlink^="' + discogs_type + '/"]').each(function() {
            var $link = $(this);
            if ($link.attr('mlink_stop')) return; // for places
            var mlink = $link.attr('mlink');
            // ensure we do it only once per link
            var done = ($link.attr('mlink_done') || "").split(",");
            for (var i=0; i<done.length; i++) {
              if (mb_type == done[i]) return;
            }
            done.push(mb_type);
            $link.attr('mlink_done', done.filter(function(e) { return (e!="");}).join(','));
            if (link_infos[mlink] && link_infos[mlink].type == discogs_type) {
              var discogs_url = link_infos[mlink].clean_url;
              var cachekey = getCacheKeyFromInfo(mlink, mb_type);
              var has_wrapper = $link.closest('span.mb_wrapper').length;
              if (!has_wrapper) {
                $link.wrap('<span class="mb_wrapper"><span class="mb_valign"></span></span>');
              }
              if (!nosearch) {
                // add search link for the current link text
                var entities = {
                  'artist': { mark: 'A'},
                  'release': { mark: 'R'},
                  'release-group': { mark: 'G'},
                  'place': { mark: 'P'},
                  'label': { mark: 'L'}
                }
                var mark = '';
                var entity_name = 'entity';
                if (mb_type in entities) {
                  mark = entities[mb_type].mark;
                  entity_name = mb_type.replace(/[_-]/g, ' ');
                }
                $link.closest('span.mb_wrapper').prepend('<span class="mb_valign mb_searchit"><a class="mb_search_link" target="_blank" title="Search this '+ entity_name + ' on MusicBrainz (open in a new tab)" href="' + MBImport.searchUrlFor(mb_type, $link.text()) + '"><small>'+mark+'</small>?</a></span>');
              }
              var insert_normal = function (link) {
                $link.closest('span.mb_valign').before('<span class="mb_valign">'+link+'</span>');
                $link.closest('span.mb_wrapper').find('.mb_searchit').remove();
              };

              var insert_stop = function (link) {
                insert_normal(link);
                $link.attr('mlink_stop', true);
              };

              var insert_func = insert_normal;
              if (mb_type == 'place') {
                // if a place link was added we stop, we don't want further queries for this 'label'
                insert_func = insert_stop;
              }
              mblinks.searchAndDisplayMbLink(discogs_url, mb_type, insert_func, cachekey);
            }
        });
    }

    function debug_color(what, n, id) {
      var colors = [
        '#B3C6FF',
        '#C6B3FF',
        '#ECB3FF',
        '#FFB3EC',
        '#FFB3C6',
        '#FFC6B3',
        '#FFECB3',
        '#ECFFB3',
        '#C6FFB3',
        '#B3FFC6',
        '#B3FFEC',
        '#B3ECFF',
        '#7598FF',
      ];
      if (DEBUG) {
        $(what).css('border', '2px dotted ' + colors[n%colors.length]);
        var debug_attr = $(what).attr('debug_discogs');
        if (!id) id = '';
        if (debug_attr) {
          $(what).attr('debug_discogs', debug_attr + ' || ' + id + '(' + n + ')');
        } else {
          $(what).attr('debug_discogs', id + '(' + n + ')');
        }
      }
    }

    var add_mblinks_counter = 0;
    function add_mblinks(_root, selector, types, nosearch) {
      // types can be:
      // 'discogs type 1'
      // ['discogs_type 1', 'discogs_type 2']
      // [['discogs_type 1', 'mb type 1'], 'discogs_type 2']
      // etc.
      if (!$.isArray(types)) {
        // just one string
        types = [types];
      }
      $.each(types,
        function (idx, val) {
          if (!$.isArray(val)) {
            types[idx] = [val, undefined];
          }
        }
      );

      LOGGER.debug('add_mblinks: ' + selector + ' / ' + JSON.stringify(types));

      _root.find(selector).each(function() {
          var node = $(this).get(0);
          magnifyLinks(node);
          debug_color(this, ++add_mblinks_counter, selector);
          var that = this;
          $.each(types, function (idx, val) {
            var discogs_type = val[0];
            var mb_type = val[1];
            searchAndDisplayMbLinkInSection($(that), discogs_type, mb_type, nosearch);
          });
      });
    }

    // Find MB link for the current page and display it next to page title
    var mbLinkInsert = function (link) {
      var $h1 = $('h1');
      var $titleSpan = $h1.children('span[itemprop="name"]');
      if ($titleSpan.length > 0) {
        $titleSpan.before(link);
      } else {
        $h1.prepend(link);
      }
    }
    var current_page_info = link_infos[current_page_key];
    var mb_type = defaultMBtype(current_page_info.type);
    var cachekey = getCacheKeyFromInfo(current_page_key, mb_type);
    mblinks.searchAndDisplayMbLink(current_page_info.clean_url, mb_type, mbLinkInsert, cachekey);

    var $root = $('body');
    add_mblinks($root, 'div.profile', ['artist', 'label']);
    add_mblinks($root, 'tr[data-object-type="release"] td.artist,td.title', 'artist');
    add_mblinks($root, 'tr[data-object-type="release"] td.title', 'release');
    add_mblinks($root, 'tr[data-object-type="release"]', 'label');
    add_mblinks($root, 'tr[data-object-type~="master"]', ['master', 'artist', 'label']);
    add_mblinks($root, 'div#tracklist', 'artist');
    add_mblinks($root, 'div#companies', [['label', 'place'], 'label']);
    add_mblinks($root, 'div#credits', ['label', 'artist']);
    add_mblinks($root, 'div#page_aside div.section_content:first', 'master', true);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                 Normalize Discogs URLs in a DOM tree                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var mlink_processed = 0;

// Normalize Discogs URLs in a DOM tree
function magnifyLinks(rootNode) {

    if (!rootNode) {
        rootNode = document.body;
    }

    // Check if we already added links for this content
    if (rootNode.hasAttribute('mlink_processed'))
        return;
    rootNode.setAttribute('mlink_processed', ++mlink_processed);

    var elems = rootNode.getElementsByTagName('a');
    for (var i = 0; i < elems.length; i++) {
        var elem = elems[i];

        // Ignore empty links
        if (!elem.href || $.trim(elem.textContent) == '' || elem.textContent.substring(4,0) == 'http')
            continue;
        if (!elem.hasAttribute('mlink')) {
          elem.setAttribute('mlink', getDiscogsLinkKey(elem.href));
        }
    }
}

// contains infos for each link key
var link_infos = {};

// Parse discogs url to extract info, returns a key and set link_infos for this key
// the key is in the form discogs_type/discogs_id
function getDiscogsLinkKey(url) {
    var re = /^https?:\/\/(?:www|api)\.discogs\.com\/(?:(?:(?!sell).+|sell.+)\/)?(master|release|artist|label)s?\/(\d+)(?:[^\?#]*)(?:\?noanv=1|\?anv=[^=]+)?$/i;
    if (m = re.exec(url)) {
      var key = m[1] + '/' + m[2];
      if (!link_infos[key]) {
        link_infos[key] = {
          type: m[1],
          id: m[2],
          clean_url: 'http://www.discogs.com/' + m[1] + '/' + m[2]
        }
        LOGGER.debug('getDiscogsLinkKey:' + url + ' --> ' + key);
      } else {
        LOGGER.debug('getDiscogsLinkKey:' + url + ' --> ' + key + ' (key exists)');
      }
      return key;
    }
    LOGGER.debug('getDiscogsLinkKey:' + url + ' ?');
    return false;
}

function getCleanUrl(url, discogs_type) {
  try {
    var key = getDiscogsLinkKey(url);
    if (key) {
      if (!discogs_type || link_infos[key].type == discogs_type) {
        LOGGER.debug('getCleanUrl: ' + key + ', ' + url + ' --> ' + link_infos[key].clean_url);
        return link_infos[key].clean_url;
      } else {
        LOGGER.debug('getCleanUrl: ' + key + ', ' + url + ' --> unmatched type: ' + discogs_type);
      }
    }
  }
  catch (err) {
    LOGGER.error(err);
  }
  LOGGER.debug('getCleanUrl: ' + url + ' (' + discogs_type + ') failed');
  return false;
}

function defaultMBtype(discogs_type) {
  if (discogs_type == 'master') return 'release-group';
  return discogs_type;
}

function getCacheKeyFromInfo(info_key, mb_type) {
  var inf = link_infos[info_key];
  if (inf) {
    if (!mb_type) mb_type = defaultMBtype(inf.type);
    return inf.type + '/' + inf.id + '/' + mb_type;
  }
  return '';
}

function getCacheKeyFromUrl(url, discogs_type, mb_type) {
  try {
    var key = getDiscogsLinkKey(url);
    if (key) {
      if (!discogs_type || link_infos[key].type == discogs_type) {
        var cachekey = getCacheKeyFromInfo(key, mb_type);
        LOGGER.debug('getCacheKeyFromUrl: ' + key + ', ' + url + ' --> ' + cachekey);
        return cachekey;
      } else {
        LOGGER.debug('getCacheKeyFromUrl: ' + key + ', ' + url + ' --> unmatched type: ' + discogs_type);
      }
    }
  }
  catch (err) {
    LOGGER.error(err);
  }
  LOGGER.debug('getCacheKeyFromUrl: ' + url + ' (' + discogs_type + ') failed');
  return false;
}

function MBIDfromUrl(url, discogs_type, mb_type) {
  var cachekey = getCacheKeyFromUrl(url, discogs_type, mb_type);
  if (!cachekey) return '';
  return mblinks.resolveMBID(cachekey);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                             Insert MusicBrainz section into Discogs page                                           //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function insertMbUI(mbUI) {
  var e;
  if ((e = $("div.section.collections")) && e.length) {
    e.after(mbUI);
  } else if ((e = $('#statistics')) && e.length) {
    e.before(mbUI);
  } else if ((e = $("div.section.social")) && e.length) {
    e.before(mbUI);
  }
}

// Insert links in Discogs page
function insertMBSection(release, current_page_key) {
    var current_page_info = link_infos[current_page_key];

    var mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>').hide();

    if (DEBUG) mbUI.css({'border': '1px dotted red'});

    var mbContentBlock = $('<div class="section_content"></div>');
    mbUI.append(mbContentBlock);

    if (release.maybe_buggy) {
      var warning_buggy = $('<p><small><b>Warning</b>: this release has perhaps a buggy tracklist, please check twice the data you import.</small><p').css({'color': 'red', 'margin-top': '4px', 'margin-bottom': '4px'});
      mbContentBlock.prepend(warning_buggy);
    }

    // Form parameters
    var edit_note = MBImport.makeEditNote(current_page_info.clean_url, 'Discogs');
    var parameters = MBImport.buildFormParameters(release, edit_note);

    // Build form + search button
    var innerHTML = '<div id="mb_buttons">'
      + MBImport.buildFormHTML(parameters)
      + MBImport.buildSearchButton(release)
      + '</div>';
    mbContentBlock.append(innerHTML);

    insertMbUI(mbUI);

    $('#mb_buttons').css({
      display: 'inline-block',
      width: '100%'
    });
    $('form.musicbrainz_import').css({width: '49%', display:'inline-block'});
    $('form.musicbrainz_import_search').css({'float': 'right'})
    $('form.musicbrainz_import > button').css({width: '100%', 'box-sizing': 'border-box'});

    mbUI.slideDown();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                               Parsing of Discogs data                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function cleanup_discogs_artist_credit(obj) {
      // Fix some odd Discogs release (e.g. http://api.discogs.com/releases/1566223) that have a ',' join phrase after the last artist
      // Discogs set a join phrase even there's only one artist or when extraartists is set (ie. remix)
      var last = obj.artist_credit.length-1;
      if (last == 0 || obj.artist_credit[last].joinphrase == ", ") {
          obj.artist_credit[last].joinphrase = "";
      }
}

// Returns the name without the numerical suffic Discogs adds as disambiguation
// ie. "ABC (123)" -> "ABC"
function artistNoNum(artist_name) {
  return artist_name.replace(/ \(\d+\)$/, "");
}

// Parse a US date string and set object properties year, month, day
function parse_YYYY_MM_DD(date, obj) {
  if (!date) return;
  var m = date.split(/\D+/, 3).map(function (e) {
    return parseInt(e, 10);
  });
  if (m[0] !== undefined) {
    obj.year = m[0];
    if (m[1] !== undefined) {
      obj.month = m[1];
      if (m[2] !== undefined) {
        obj.day = m[2];
      }
    }
  }
}

// Analyze Discogs data and return a release object
function parseDiscogsRelease(data) {

    var discogsRelease = data;

    var release = {};
    release.discs = [];

    //buggy tracklist indicator, used to warn user
    release.maybe_buggy = false;

    // Release artist credit
    release.artist_credit = [];
    $.each(discogsRelease.artists, function(index, artist) {
        var ac = {
            'artist_name': artistNoNum(artist.name),
            'credited_name': (artist.anv != "" ? artist.anv : artistNoNum(artist.name)),
            'joinphrase': decodeDiscogsJoinphrase(artist.join),
            'mbid': MBIDfromUrl(artist.resource_url, 'artist')
        };
        if (artist.id == 194) { // discogs place holder for various
          ac = MBImport.specialArtist('various_artists', ac);
        }
        release.artist_credit.push(ac);
    });
    cleanup_discogs_artist_credit(release);

    // ReleaseGroup
    if (discogsRelease.master_url) {
      release.release_group_mbid = MBIDfromUrl(discogsRelease.master_url, 'master');
    }

    // Release title
    release.title = discogsRelease.title;

    // Release date
    if (discogsRelease.released) {
      parse_YYYY_MM_DD(discogsRelease.released, release);
    }

    // Release country
    if (discogsRelease.country) {
        release.country = Countries[discogsRelease.country];
    }

    // Release labels
    release.labels = [];
    if (discogsRelease.labels) {
        $.each(discogsRelease.labels, function(index, label) {
          var labelinfo = {
            name: label.name,
            catno: (label.catno == "none" ? "[none]" : label.catno),
            mbid: MBIDfromUrl(label.resource_url, 'label')
          };
          release.labels.push(labelinfo);
        });
    }

    // Release URL
    release.urls = [ { url: getCleanUrl(discogsRelease.uri, 'release'), link_type: MBImport.URL_TYPES.discogs } ];

    // Release format
    var release_formats = [];
    release.secondary_types = [];

    if (discogsRelease.formats.length > 0) {
        for (var i = 0; i < discogsRelease.formats.length; i++) {

            // Release format
            var discogs_format = discogsRelease.formats[i].name;
            var mb_format = undefined;
            if (discogs_format in MediaTypes) {
                mb_format = MediaTypes[discogs_format];
            }

            if (discogsRelease.formats[i].descriptions) {
                $.each(discogsRelease.formats[i].descriptions, function(index, desc) {
                    if (!(discogs_format in ['Box Set'])) {
                        // Release format: special handling of vinyl 7", 10" and 12" and other more specific CD/DVD formats
                        if (desc.match(/7"|10"|12"|^VCD|SVCD|CD\+G|HDCD|DVD-Audio|DVD-Video/) && (desc in MediaTypes)) mb_format = MediaTypes[desc];
                    }
                    // Release format: special handling of Vinyl, LP == 12" (http://www.discogs.com/help/submission-guidelines-release-format.html#LP)
                    if (discogs_format == "Vinyl" && desc == "LP") mb_format = '12" Vinyl';
                    // Release format: special handling of CD, Mini == 8cm CD
                    if (discogs_format == "CD" && desc == "Mini") mb_format = '8cm CD';
                    // Release status
                    if (desc.match(/Promo|Smplr/)) release.status = "promotion";
                    if (desc.match(/Unofficial Release/)) release.status = "bootleg";
                    // Release type
                    if (desc.match(/Compilation/)) release.secondary_types.push("compilation");
                    if (desc.match(/^Album/)) release.type = "album";
                    if (desc.match(/Single(?! Sided)/)) release.type = "single";
                    if (desc.match(/EP|Mini-Album/)) release.type = "ep";
                });
            }

            if (mb_format) {
                for (var j = 0; j < discogsRelease.formats[i].qty; j++) {
                    release_formats.push(mb_format);
                }
            }

            // Release packaging
            if (discogsRelease.formats[i].text) {
                var freetext = discogsRelease.formats[i].text.toLowerCase().replace(/[\s-]/g, '');
                if (freetext.match(/cardboard|paper/)) release.packaging = "cardboard/paper sleeve";
                else if (freetext.match(/digipak/)) release.packaging = "digipak";
                else if (freetext.match(/keepcase/)) release.packaging = "keep case";
                else if (freetext.match(/jewel/)) {
                    release.packaging = freetext.match(/slim/) ? "slim jewel case" : "jewel case";
                }
                else if (freetext.match(/gatefold|digisleeve/)) release.packaging = "gatefold cover";
            }
        }
    }

    // Barcode
    if (discogsRelease.identifiers) {
        $.each(discogsRelease.identifiers, function(index, identifier) {
            if (identifier.type == "Barcode") {
                release.barcode = identifier.value.replace(/ /g, '');
                return false;
            }
        });
    }

    // Inspect tracks
    var tracks = [];

    var heading = "";
    var releaseNumber = 1;
    var lastPosition = 0;
    $.each(discogsRelease.tracklist, function(index, discogsTrack) {

        if (discogsTrack.type_ == 'heading') {
          heading = discogsTrack.title;
          return;
        }
        if (discogsTrack.type_ != 'track' && discogsTrack.type_ != 'index') {
          return;
        }

        var track = new Object();

        track.title = discogsTrack.title;
        track.duration = MBImport.hmsToMilliSeconds(discogsTrack.duration); // MB in milliseconds

        // Track artist credit
        track.artist_credit = [];
        if (discogsTrack.artists) {
            $.each(discogsTrack.artists, function(index, artist) {
                var ac = {
                    'artist_name': artistNoNum(artist.name),
                    'credited_name': (artist.anv != "" ? artist.anv : artistNoNum(artist.name)),
                    'joinphrase': decodeDiscogsJoinphrase(artist.join),
                    'mbid': MBIDfromUrl(artist.resource_url, 'artist')
                };
                track.artist_credit.push(ac);
            });
            cleanup_discogs_artist_credit(track);
        }

        // Track position and release number
        var trackPosition = discogsTrack.position;

        // Handle sub-tracks
        if (trackPosition == "" && discogsTrack.sub_tracks) {
            trackPosition = discogsTrack.sub_tracks[0].position;
            // Append titles of sub-tracks to main track title
            var subtrack_titles = [];
            var subtrack_total_duration = 0;
            $.each(discogsTrack.sub_tracks, function(subtrack_index, subtrack) {
              if (subtrack.type_ != 'track') {
                return;
              }
              if (subtrack.duration) {
                subtrack_total_duration += MBImport.hmsToMilliSeconds(subtrack.duration);
              }
              if (subtrack.title) {
                subtrack_titles.push(subtrack.title);
              } else {
                subtrack_titles.push('[unknown]');
              }
            });
            if (subtrack_titles.length) {
              if (track.title) {
                track.title += ': ';
              }
              track.title += subtrack_titles.join(' / ');
            }
            if (isNaN(track.duration) && !isNaN(subtrack_total_duration)) {
              track.duration = subtrack_total_duration;
            }
        }

        // Skip special tracks
        if (trackPosition.match(/^(?:video|mp3)/i)) {
            trackPosition = "";
        }

        // Possible track position:
        // A1 or A    => Vinyl or Cassette : guess releaseNumber from vinyl side
        // 1-1 or 1.1 => releaseNumber.trackNumber
        // 1          => trackNumber
        var tmp = trackPosition.match(/(\d+|[A-Z])(?:[\.-]+(\d+))?/i);
        if (tmp) {
            tmp[1] = parseInt(tmp[1], 10);
            var buggyTrackNumber = false;
            var prevReleaseNumber = releaseNumber;

            if (Number.isInteger(tmp[1])) {
              if (tmp[2]) { // 1-1, 1-2, 2-1, ... - we can get release number and track number from this
                  releaseNumber = tmp[1];
                  lastPosition = parseInt(tmp[2], 10);
              }  else if (tmp[1] <= lastPosition) { // 1, 2, 3, ... - We've moved onto a new medium
                  releaseNumber++;
                  lastPosition = tmp[1];
              } else {
                  lastPosition = tmp[1];
              }
            } else {
              if (trackPosition.match(/^[A-Z]\d*$/i)) { // Vinyl or cassette, handle it specially
                  // A,B -> 1; C,D -> 2; E,F -> 3, etc...
                  releaseNumber = ((32|trackPosition.charCodeAt(0))-97>>1)+1;
                  lastPosition++;
              } else if (trackPosition.match(/^[A-Z]+\d*$/i)) { // Vinyl or cassette, handle it specially
                  // something like AA1, exemple : http://www.discogs.com/release/73531
                  // TODO: find a better fix
                  buggyTrackNumber = true;
              }
            }

            if (releaseNumber > release_formats.length) {
                // something went wrong in track position parsing
                buggyTrackNumber = true;
                releaseNumber = prevReleaseNumber;
            }
            if (buggyTrackNumber) {
              // well, it went wrong so ...
              lastPosition++;
            }
        }

        // Create release if needed
        var discindex = releaseNumber-1;
        if (!release.discs[discindex]) {
            var newdisc = {
              tracks: [],
              format: release_formats[discindex],
            };
            if (heading) {
              newdisc.title = heading;
              heading = "";
            }
            release.discs.push(newdisc);
        }

        // Track number (only for Vinyl and Cassette)
        if (buggyTrackNumber || (release.discs[discindex].format.match(/(Vinyl|Cassette)/)
            && discogsTrack.position.match(/^[A-Z]+[\.-]?\d*/i))) {
            track.number = discogsTrack.position;
        }

        // Trackposition is empty e.g. for release title
        if (trackPosition != "" && trackPosition != null) {
            release.discs[discindex].tracks.push(track);
        }

        if (buggyTrackNumber && !release.maybe_buggy) {
          release.maybe_buggy = true;
        }
    });

    if (release.discs.length == 1 && release.discs[0].title) {
      // remove title if there is only one disc
      // https://github.com/murdos/musicbrainz-userscripts/issues/69
      release.discs[0].title = '';
    }

    LOGGER.info("Parsed release: ", release);
    return release;
}

function decodeDiscogsJoinphrase(join) {
    var joinphrase = "";
    var trimedjoin = join.replace(/^\s*/, "").replace(/\s*$/, "");
    if (trimedjoin == "") return trimedjoin;
    if (trimedjoin != ",") joinphrase += " ";
    joinphrase += trimedjoin;
    joinphrase += " ";
    return joinphrase;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Discogs -> MusicBrainz mapping                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var MediaTypes = {
    "8-Track Cartridge": "Cartridge",
    "Acetate": "Vinyl",
    "Betamax": "Betamax",
    "Blu-ray": "Blu-ray",
    "Blu-ray-R": "Blu-ray",
    "Cassette": "Cassette",
    "CD": "CD",
    "CDr": "CD-R",
    "CDV": "CDV",
    "CD+G": "CD+G",
    "Cylinder": "Wax Cylinder",
    "DAT": "DAT",
    "Datassette": "Other",
    "DCC": "DCC",
    "DVD": "DVD",
    "DVDr": "DVD",
    "DVD-Audio": "DVD-Audio",
    "DVD-Video": "DVD-Video",
    "Edison Disc": "Vinyl",
    "File": "Digital Media",
    "Flexi-disc": "Vinyl",
    "Floppy Disk": "Other",
    "HDCD": "HDCD",
    "HD DVD": "HD-DVD",
    "HD DVD-R": "HD-DVD",
    "Hybrid": "Other",
    "Laserdisc": "LaserDisc",
    "Memory Stick": "Other",
    "Microcassette": "Other",
    "Minidisc": "MiniDisc",
    "MVD": "Other",
    "Reel-To-Reel": "Reel-to-reel",
    "SelectaVision": "Other",
    "Shellac": "Vinyl",
    "SVCD": "SVCD",
    "UMD": "UMD",
    "VCD": "VCD",
    "VHS": "VHS",
    "Video 2000": "Other",
    "Vinyl": "Vinyl",
    '7"': '7" Vinyl',
    '10"': '10" Vinyl',
    '12"': '12" Vinyl'
};

var Countries = {
    "Afghanistan": "AF",
    "Albania": "AL",
    "Algeria": "DZ",
    "American Samoa": "AS",
    "Andorra": "AD",
    "Angola": "AO",
    "Anguilla": "AI",
    "Antarctica": "AQ",
    "Antigua and Barbuda": "AG",
    "Argentina": "AR",
    "Armenia": "AM",
    "Aruba": "AW",
    "Australia": "AU",
    "Austria": "AT",
    "Azerbaijan": "AZ",
    "Bahamas": "BS",
    "Bahrain": "BH",
    "Bangladesh": "BD",
    "Barbados": "BB",
    "Belarus": "BY",
    "Belgium": "BE",
    "Belize": "BZ",
    "Benin": "BJ",
    "Bermuda": "BM",
    "Bhutan": "BT",
    "Bolivia": "BO",
    "Croatia": "HR",
    "Botswana": "BW",
    "Bouvet Island": "BV",
    "Brazil": "BR",
    "British Indian Ocean Territory": "IO",
    "Brunei Darussalam": "BN",
    "Bulgaria": "BG",
    "Burkina Faso": "BF",
    "Burundi": "BI",
    "Cambodia": "KH",
    "Cameroon": "CM",
    "Canada": "CA",
    "Cape Verde": "CV",
    "Cayman Islands": "KY",
    "Central African Republic": "CF",
    "Chad": "TD",
    "Chile": "CL",
    "China": "CN",
    "Christmas Island": "CX",
    "Cocos (Keeling) Islands": "CC",
    "Colombia": "CO",
    "Comoros": "KM",
    "Congo": "CG",
    "Cook Islands": "CK",
    "Costa Rica": "CR",
    "Virgin Islands, British": "VG",
    "Cuba": "CU",
    "Cyprus": "CY",
    "Czech Republic": "CZ",
    "Denmark": "DK",
    "Djibouti": "DJ",
    "Dominica": "DM",
    "Dominican Republic": "DO",
    "Ecuador": "EC",
    "Egypt": "EG",
    "El Salvador": "SV",
    "Equatorial Guinea": "GQ",
    "Eritrea": "ER",
    "Estonia": "EE",
    "Ethiopia": "ET",
    "Falkland Islands (Malvinas)": "FK",
    "Faroe Islands": "FO",
    "Fiji": "FJ",
    "Finland": "FI",
    "France": "FR",
    "French Guiana": "GF",
    "French Polynesia": "PF",
    "French Southern Territories": "TF",
    "Gabon": "GA",
    "Gambia": "GM",
    "Georgia": "GE",
    "Germany": "DE",
    "Ghana": "GH",
    "Gibraltar": "GI",
    "Greece": "GR",
    "Greenland": "GL",
    "Grenada": "GD",
    "Guadeloupe": "GP",
    "Guam": "GU",
    "Guatemala": "GT",
    "Guinea": "GN",
    "Guinea-Bissau": "GW",
    "Guyana": "GY",
    "Haiti": "HT",
    "Virgin Islands, U.S.": "VI",
    "Honduras": "HN",
    "Hong Kong": "HK",
    "Hungary": "HU",
    "Iceland": "IS",
    "India": "IN",
    "Indonesia": "ID",
    "Wallis and Futuna": "WF",
    "Iraq": "IQ",
    "Ireland": "IE",
    "Israel": "IL",
    "Italy": "IT",
    "Jamaica": "JM",
    "Japan": "JP",
    "Jordan": "JO",
    "Kazakhstan": "KZ",
    "Kenya": "KE",
    "Kiribati": "KI",
    "Kuwait": "KW",
    "Kyrgyzstan": "KG",
    "Lao People's Democratic Republic": "LA",
    "Latvia": "LV",
    "Lebanon": "LB",
    "Lesotho": "LS",
    "Liberia": "LR",
    "Libyan Arab Jamahiriya": "LY",
    "Liechtenstein": "LI",
    "Lithuania": "LT",
    "Luxembourg": "LU",
    "Montserrat": "MS",
    "Macedonia, The Former Yugoslav Republic of": "MK",
    "Madagascar": "MG",
    "Malawi": "MW",
    "Malaysia": "MY",
    "Maldives": "MV",
    "Mali": "ML",
    "Malta": "MT",
    "Marshall Islands": "MH",
    "Martinique": "MQ",
    "Mauritania": "MR",
    "Mauritius": "MU",
    "Mayotte": "YT",
    "Mexico": "MX",
    "Micronesia, Federated States of": "FM",
    "Morocco": "MA",
    "Monaco": "MC",
    "Mongolia": "MN",
    "Mozambique": "MZ",
    "Myanmar": "MM",
    "Namibia": "NA",
    "Nauru": "NR",
    "Nepal": "NP",
    "Netherlands": "NL",
    "Netherlands Antilles": "AN",
    "New Caledonia": "NC",
    "New Zealand": "NZ",
    "Nicaragua": "NI",
    "Niger": "NE",
    "Nigeria": "NG",
    "Niue": "NU",
    "Norfolk Island": "NF",
    "Northern Mariana Islands": "MP",
    "Norway": "NO",
    "Oman": "OM",
    "Pakistan": "PK",
    "Palau": "PW",
    "Panama": "PA",
    "Papua New Guinea": "PG",
    "Paraguay": "PY",
    "Peru": "PE",
    "Philippines": "PH",
    "Pitcairn": "PN",
    "Poland": "PL",
    "Portugal": "PT",
    "Puerto Rico": "PR",
    "Qatar": "QA",
    "Reunion": "RE",
    "Romania": "RO",
    "Russian Federation": "RU",
    "Russia": "RU",
    "Rwanda": "RW",
    "Saint Kitts and Nevis": "KN",
    "Saint Lucia": "LC",
    "Saint Vincent and The Grenadines": "VC",
    "Samoa": "WS",
    "San Marino": "SM",
    "Sao Tome and Principe": "ST",
    "Saudi Arabia": "SA",
    "Senegal": "SN",
    "Seychelles": "SC",
    "Sierra Leone": "SL",
    "Singapore": "SG",
    "Slovenia": "SI",
    "Solomon Islands": "SB",
    "Somalia": "SO",
    "South Africa": "ZA",
    "Spain": "ES",
    "Sri Lanka": "LK",
    "Sudan": "SD",
    "Suriname": "SR",
    "Swaziland": "SZ",
    "Sweden": "SE",
    "Switzerland": "CH",
    "Syrian Arab Republic": "SY",
    "Tajikistan": "TJ",
    "Tanzania, United Republic of": "TZ",
    "Thailand": "TH",
    "Togo": "TG",
    "Tokelau": "TK",
    "Tonga": "TO",
    "Trinidad and Tobago": "TT",
    "Tunisia": "TN",
    "Turkey": "TR",
    "Turkmenistan": "TM",
    "Turks and Caicos Islands": "TC",
    "Tuvalu": "TV",
    "Uganda": "UG",
    "Ukraine": "UA",
    "United Arab Emirates": "AE",
    "UK": "GB",
    "US": "US",
    "United States Minor Outlying Islands": "UM",
    "Uruguay": "UY",
    "Uzbekistan": "UZ",
    "Vanuatu": "VU",
    "Vatican City State (Holy See)": "VA",
    "Venezuela": "VE",
    "Viet Nam": "VN",
    "Western Sahara": "EH",
    "Yemen": "YE",
    "Zambia": "ZM",
    "Zimbabwe": "ZW",
    "Taiwan": "TW",
    "[Worldwide]": "XW",
    "Europe": "XE",
    "Soviet Union (historical, 1922-1991)": "SU",
    "East Germany (historical, 1949-1990)": "XG",
    "Czechoslovakia (historical, 1918-1992)": "XC",
    "Congo, The Democratic Republic of the": "CD",
    "Slovakia": "SK",
    "Bosnia and Herzegovina": "BA",
    "Korea (North), Democratic People's Republic of": "KP",
    "North Korea": "KP",
    "Korea (South), Republic of": "KR",
    "South Korea": "KR",
    "Montenegro": "ME",
    "South Georgia and the South Sandwich Islands": "GS",
    "Palestinian Territory": "PS",
    "Macao": "MO",
    "Timor-Leste": "TL",
    "<85>land Islands": "AX",
    "Guernsey": "GG",
    "Isle of Man": "IM",
    "Jersey": "JE",
    "Serbia": "RS",
    "Saint Barthélemy": "BL",
    "Saint Martin": "MF",
    "Moldova": "MD",
    "Yugoslavia (historical, 1918-2003)": "YU",
    "Serbia and Montenegro (historical, 2003-2006)": "CS",
    "Côte d'Ivoire": "CI",
    "Heard Island and McDonald Islands": "HM",
    "Iran, Islamic Republic of": "IR",
    "Saint Pierre and Miquelon": "PM",
    "Saint Helena": "SH",
    "Svalbard and Jan Mayen": "SJ"
};

