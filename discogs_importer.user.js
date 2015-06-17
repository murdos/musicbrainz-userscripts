// ==UserScript==

// @name           Import Discogs releases to MusicBrainz
// @description    Add a button to import Discogs releases to MusicBrainz and add links to matching MusicBrainz entities for various Discogs entities (artist,release,master,label)
// @version        2015.06.17.1
// @namespace      http://userscripts.org/users/22504
// @icon           http://www.discogs.com/images/discogs130.png
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/discogs_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/discogs_importer.user.js
// @include        http://www.discogs.com/*
// @include        http://*.discogs.com/*release/*
// @exclude        http://*.discogs.com/*release/*?f=xml*
// @exclude        http://www.discogs.com/release/add
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/import_functions.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
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

    // Display links of equivalent MusicBrainz entities for masters and releases
    insertMBLinks();

    // Add an import button in a new section in sidebar, if we're on a release page?
    var current_page_info = link_infos[current_page_key];
    if (current_page_info.type == 'release') {

        // Discogs Webservice URL
        var discogsWsUrl = 'http://api.discogs.com/releases/' + current_page_info.id;

        $.ajax({
            url: discogsWsUrl,
            dataType: 'json',
            crossDomain: true,
            success: function (data, textStatus, jqXHR) {
                LOGGER.debug("Discogs JSON Data from API:", data);
                try {
                  var release = parseDiscogsRelease(data);
                  insertLink(release, current_page_key);
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
//                 Display links of equivalent MusicBrainz entities for masters and releases                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Insert MusicBrainz links in a section of the page
function insertMBLinks($root) {

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
                $link.closest('span.mb_wrapper').prepend('<span class="mb_valign mb_searchit"><a class="mb_search_link" target="_blank" title="Search this '+ entity_name + ' on MusicBrainz (open in a new tab)" href="' + MBReleaseImportHelper.searchUrlFor(mb_type, $link.text()) + '"><small>'+mark+'</small>?</a></span>');
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

    if (!$root) {
        $root = $('body');
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
    var re = /^http:\/\/(?:www|api)\.discogs\.com\/(?:(?:(?!sell).+|sell.+)\/)?(master|release|artist|label)s?\/(\d+)(?:[^\?#]*)(?:\?noanv=1|\?anv=[^=]+)?$/i;
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
  if ((e = $("div.section.social")) && e.length) {
    e.before(mbUI);
  } else if ((e = $('#statistics')) && e.length) {
    e.before(mbUI);
  } else if ((e = $("div.marketplace_box_links")) && e.length) {
    e.after(mbUI);
  }
}

// Insert links in Discogs page
function insertLink(release, current_page_key) {
    var current_page_info = link_infos[current_page_key];

    var mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>').hide();

    if (DEBUG) mbUI.css({'border': '1px dotted red'});

    var mbContentBlock = $('<div class="section_content"></div>');
    mbUI.append(mbContentBlock);

    var mbLinked = $('<p><small>MusicBrainz release(s) linked to this page: </small></p>').hide();
    mbContentBlock.prepend(mbLinked);

    if (release.maybe_buggy) {
      var warning_buggy = $('<p><small><b>Warning</b>: this release has perhaps a buggy tracklist, please check twice the data you import.</small><p').css({'color': 'red', 'margin-top': '4px', 'margin-bottom': '4px'});
      mbContentBlock.prepend(warning_buggy);
    }

    // Form parameters
    var edit_note = 'Imported from ' + current_page_info.clean_url;
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    // Build form + search button
    var innerHTML = '<div id="mb_buttons">'
      + MBReleaseImportHelper.buildFormHTML(parameters)
      + MBReleaseImportHelper.buildSearchButton(release)
      + '</div>';
    mbContentBlock.append(innerHTML);

    insertMbUI(mbUI);

    // Find MB release(s) linked to this Discogs release
    var mbLinkInsert = function (link) {
      var sel = "div.section.musicbrainz div.section_content p";
      $(sel).append(link);
      $(sel).find('img').css({'vertical-align': 'text-top'});
      mbLinked.show();
    }
    var cachekey = getCacheKeyFromInfo(current_page_key, 'release');
    mblinks.searchAndDisplayMbLink(current_page_info.clean_url, 'release', mbLinkInsert, cachekey);

    $('#mb_buttons').css({
      display: 'inline-block',
      width: '100%'
    });
    $('form.musicbrainz_import').css({width: '48%', display:'inline-block'});
    $('form.musicbrainz_import_search').css({'margin-left': '3%'})
    $('form.musicbrainz_import > button').css({width: '100%', 'box-sizing': 'padding-box'});

    mbUI.slideDown();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                               Parsing of Discogs data                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// Analyze Discogs data and return a release object
function parseDiscogsRelease(data) {

    var discogsRelease = data;

    var release = new Object();
    release.discs = [];

    //buggy tracklist indicator, used to warn user
    release.maybe_buggy = false;

    // Release artist credit
    release.artist_credit = new Array();
    $.each(discogsRelease.artists, function(index, artist) {
        var ac = {
            'artist_name': artist.name.replace(/ \(\d+\)$/, ""),
            'credited_name': (artist.anv != "" ? artist.anv : artist.name.replace(/ \(\d+\)$/, "")),
            'joinphrase': decodeDiscogsJoinphrase(artist.join),
            'mbid': MBIDfromUrl(artist.resource_url, 'artist')
        };
        release.artist_credit.push(ac);
    });

    // ReleaseGroup
    if (discogsRelease.master_url) {
      release.release_group_mbid = MBIDfromUrl(discogsRelease.master_url, 'master');
    }

    // Release title
    release.title = discogsRelease.title;

    // Release date
    if (discogsRelease.released) {
        var releasedate = discogsRelease.released;
        if (typeof releasedate != "undefined" && releasedate != "") {
            var tmp = releasedate.split('-');        if (tmp[0] != "undefined" && tmp[0] != "") {
                release.year = parseInt(tmp[0], 10);
                if (tmp[1] != "undefined" && tmp[1] != "") {
                    release.month = parseInt(tmp[1], 10);
                    if (tmp[2] != "undefined" && tmp[2] != "") {
                        release.day = parseInt(tmp[2], 10);
                    }
                }
            }
        }
    }

    // Release country
    if (discogsRelease.country) {
        release.country = Countries[ discogsRelease.country ];
    }

    // Release labels
    release.labels = new Array();
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
    release.urls = new Array();
    var release_url = getCleanUrl(discogsRelease.uri, 'release');
    release.urls.push( { url: release_url, link_type: MBReleaseImportHelper.URL_TYPES.discogs } );

    // Release format
    var release_formats = new Array();
    release.secondary_types = new Array();

    if (discogsRelease.formats.length > 0) {
        for(var i = 0; i < discogsRelease.formats.length; i++)
        {
            for(var j = 0; j < discogsRelease.formats[i].qty; j++)
                release_formats.push(MediaTypes[ discogsRelease.formats[i].name ]);

            if (discogsRelease.formats[i].descriptions) {
                $.each(discogsRelease.formats[i].descriptions, function(index, desc) {
                    // Release format: special handling of vinyl 7", 10" and 12" and other more specific CD/DVD formats
                    if (desc.match(/7"|10"|12"|^VCD|SVCD|CD\+G|HDCD|DVD-Audio|DVD-Video/)) release_formats[release_formats.length-1] = MediaTypes[desc];
                    // Release format: special handling of Vinyl, LP == 12" (http://www.discogs.com/help/submission-guidelines-release-format.html#LP)
                    if (discogsRelease.formats[i].name == "Vinyl" && desc == "LP") release_formats[release_formats.length-1] = '12" Vinyl';
                    // Release format: special handling of CD, Mini == 8cm CD
                    if (discogsRelease.formats[i].name == "CD" && desc == "Mini") release_formats[release_formats.length-1] = '8cm CD';
                    // Release status
                    if (desc.match(/Promo|Smplr/)) release.status = "promotion";
                    if (desc.match(/Unofficial Release/)) release.status = "bootleg";
                    // Release type
                    if (desc.match(/Compilation/)) release.secondary_types.push("compilation");
                    if (desc.match(/^Album/)) release.type = "album";
                    if (desc.match(/Single/)) release.type = "single";
                    if (desc.match(/EP|Mini-Album/)) release.type = "ep";

                });
            }

            // Release packaging
            if (discogsRelease.formats[i].text) {
                var freetext = discogsRelease.formats[i].text.toLowerCase().replace(/-/g, '').replace(/ /g, '');
                if (freetext.match(/cardboard|paper/)) release.packaging = "cardboard/paper sleeve";
                if (freetext.match(/digipak/)) release.packaging = "digipak";
                if (freetext.match(/keepcase/)) release.packaging = "keep case";
                if (freetext.match(/jewel/)) {
                    release.packaging = freetext.match(/slim/) ? "slim jewel case" : "jewel case";
                }
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
        } else if (discogsTrack.type_ != 'track' && discogsTrack.type_ != 'index') {
          return;
        }

        var track = new Object();

        track.title = discogsTrack.title;
        track.duration = MBReleaseImportHelper.hmsToMilliSeconds(discogsTrack.duration); // MB in milliseconds

        // Track artist credit
        track.artist_credit = new Array();
        if (discogsTrack.artists) {
            $.each(discogsTrack.artists, function(index, artist) {
                var ac = {
                    'artist_name': artist.name.replace(/ \(\d+\)$/, ""),
                    'credited_name': (artist.anv != "" ? artist.anv : artist.name.replace(/ \(\d+\)$/, "")),
                    'joinphrase': decodeDiscogsJoinphrase(artist.join),
                    'mbid': MBIDfromUrl(artist.resource_url, 'artist')
                };
                track.artist_credit.push(ac);
            });
            // Fix some odd Discogs release (e.g. http://api.discogs.com/releases/1566223) that have a ',' join phrase after the last artist
            if (track.artist_credit[track.artist_credit.length-1].joinphrase == ", ") {
                track.artist_credit[track.artist_credit.length-1].joinphrase = "";
            }
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
                subtrack_total_duration += MBReleaseImportHelper.hmsToMilliSeconds(subtrack.duration);
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
        if (trackPosition.toLowerCase().match("^(video|mp3)")) {
            trackPosition = "";
        }

        var tmp = trackPosition.match(/(\d+)(?:[\.-](\d+))?/);
        if(tmp)
        {
            tmp[1] = parseInt(tmp[1], 10);
            var trackNumber = 1;
            var buggyTrackNumber = false;
            var prevReleaseNumber = releaseNumber;

            if(tmp[2]) // 1-1, 1-2, 2-1, ... - we can get release number and track number from this
            {
                releaseNumber = tmp[1];
                trackNumber = parseInt(tmp[2], 10);
            }
            else if(trackPosition.match(/^[A-Za-z]\d*$/)) // Vinyl or cassette, handle it specially
            {
                var code = trackPosition.charCodeAt(0);
                // A-Z
                if (65 <= code && code <= 90) {
                    code = code - 65;
                } else if (97 <= code && code <= 122) {
                // a-z
                    code = code - (65 + 32);
                }
                releaseNumber = (code-code%2)/2+1;
            }
            else if(trackPosition.match(/^[A-Za-z]+\d*$/)) // Vinyl or cassette, handle it specially
            {
                // something like AA1, exemple : http://www.discogs.com/release/73531
                // TODO: find a better fix
                buggyTrackNumber = true;
            }
            else if(tmp[1] <= lastPosition) // 1, 2, 3, ... - We've moved onto a new medium
            {
                releaseNumber++;
                trackNumber = tmp[1];
            }
            else
            {
                trackNumber = tmp[1];
            }

            if (releaseNumber > release_formats.length) {
                // something went wrong in track position parsing
                buggyTrackNumber = true;
                releaseNumber = prevReleaseNumber;
            }
            if (buggyTrackNumber) {
              // well, it went wrong so ...
              lastPosition++;
            } else {
              lastPosition = trackNumber;
            }
        }

        // Create release if needed
        if ( !release.discs[releaseNumber-1] ) {
            release.discs.push(new Object());
            release.discs[releaseNumber-1].tracks = [];
            release.discs[releaseNumber-1].format = release_formats[releaseNumber-1];
            if (heading) {
              release.discs[releaseNumber-1].title = heading;
              heading = "";
            }
        }

        // Track number (only for Vinyl and Cassette)
        if (buggyTrackNumber || (release.discs[releaseNumber-1].format.match(/(Vinyl|Cassette)/)
            && discogsTrack.position.match(/^[A-Z]+[\.-]?\d*/)) ){
            track.number = discogsTrack.position;
        }

        // Trackposition is empty e.g. for release title
        if (trackPosition != "" && trackPosition != null) {
            release.discs[releaseNumber-1].tracks.push(track);
        }

        if (buggyTrackNumber && !release.maybe_buggy) {
          release.maybe_buggy = true;
        }
    });

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

var MediaTypes = new Array();
MediaTypes["8-Track Cartridge"] = "Cartridge";
MediaTypes["Acetate"] = "Vinyl";
MediaTypes["Betamax"] = "Betamax";
MediaTypes["Blu-ray"] = "Blu-ray";
MediaTypes["Blu-ray-R"] = "Blu-ray";
MediaTypes["Cassette"] = "Cassette";
MediaTypes["CD"] = "CD";
MediaTypes["CDr"] = "CD-R";
MediaTypes["CDV"] = "CDV";
MediaTypes["CD+G"] = "CD+G";
MediaTypes["Cylinder"] = "Wax Cylinder";
MediaTypes["DAT"] = "DAT";
MediaTypes["Datassette"] = "Other";
MediaTypes["DCC"] = "DCC";
MediaTypes["DVD"] = "DVD";
MediaTypes["DVDr"] = "DVD";
MediaTypes["DVD-Audio"] = "DVD-Audio";
MediaTypes["DVD-Video"] = "DVD-Video";
MediaTypes["Edison Disc"] = "Vinyl";
MediaTypes["File"] = "Digital Media";
MediaTypes["Flexi-disc"] = "Vinyl";
MediaTypes["Floppy Disk"] = "Other";
MediaTypes["HDCD"] = "HDCD";
MediaTypes["HD DVD"] = "HD-DVD";
MediaTypes["HD DVD-R"] = "HD-DVD";
MediaTypes["Hybrid"] = "Other";
MediaTypes["Laserdisc"] = "LaserDisc";
MediaTypes["Memory Stick"] = "Other";
MediaTypes["Microcassette"] = "Other";
MediaTypes["Minidisc"] = "MiniDisc";
MediaTypes["MVD"] = "Other";
MediaTypes["Reel-To-Reel"] = "Reel-to-reel";
MediaTypes["SelectaVision"] = "Other";
MediaTypes["Shellac"] = "Vinyl";
MediaTypes["SVCD"] = "SVCD";
MediaTypes["UMD"] = "UMD";
MediaTypes["VCD"] = "VCD";
MediaTypes["VHS"] = "VHS";
MediaTypes["Video 2000"] = "Other";
MediaTypes["Vinyl"] = "Vinyl";
MediaTypes['7"'] = '7" Vinyl';
MediaTypes['10"'] = '10" Vinyl';
MediaTypes['12"'] = '12" Vinyl';

var Countries = new Array();
Countries["Afghanistan"] = "AF";
Countries["Albania"] = "AL";
Countries["Algeria"] = "DZ";
Countries["American Samoa"] = "AS";
Countries["Andorra"] = "AD";
Countries["Angola"] = "AO";
Countries["Anguilla"] = "AI";
Countries["Antarctica"] = "AQ";
Countries["Antigua and Barbuda"] = "AG";
Countries["Argentina"] = "AR";
Countries["Armenia"] = "AM";
Countries["Aruba"] = "AW";
Countries["Australia"] = "AU";
Countries["Austria"] = "AT";
Countries["Azerbaijan"] = "AZ";
Countries["Bahamas"] = "BS";
Countries["Bahrain"] = "BH";
Countries["Bangladesh"] = "BD";
Countries["Barbados"] = "BB";
Countries["Belarus"] = "BY";
Countries["Belgium"] = "BE";
Countries["Belize"] = "BZ";
Countries["Benin"] = "BJ";
Countries["Bermuda"] = "BM";
Countries["Bhutan"] = "BT";
Countries["Bolivia"] = "BO";
Countries["Croatia"] = "HR";
Countries["Botswana"] = "BW";
Countries["Bouvet Island"] = "BV";
Countries["Brazil"] = "BR";
Countries["British Indian Ocean Territory"] = "IO";
Countries["Brunei Darussalam"] = "BN";
Countries["Bulgaria"] = "BG";
Countries["Burkina Faso"] = "BF";
Countries["Burundi"] = "BI";
Countries["Cambodia"] = "KH";
Countries["Cameroon"] = "CM";
Countries["Canada"] = "CA";
Countries["Cape Verde"] = "CV";
Countries["Cayman Islands"] = "KY";
Countries["Central African Republic"] = "CF";
Countries["Chad"] = "TD";
Countries["Chile"] = "CL";
Countries["China"] = "CN";
Countries["Christmas Island"] = "CX";
Countries["Cocos (Keeling) Islands"] = "CC";
Countries["Colombia"] = "CO";
Countries["Comoros"] = "KM";
Countries["Congo"] = "CG";
Countries["Cook Islands"] = "CK";
Countries["Costa Rica"] = "CR";
Countries["Virgin Islands, British"] = "VG";
Countries["Cuba"] = "CU";
Countries["Cyprus"] = "CY";
Countries["Czech Republic"] = "CZ";
Countries["Denmark"] = "DK";
Countries["Djibouti"] = "DJ";
Countries["Dominica"] = "DM";
Countries["Dominican Republic"] = "DO";
Countries["Ecuador"] = "EC";
Countries["Egypt"] = "EG";
Countries["El Salvador"] = "SV";
Countries["Equatorial Guinea"] = "GQ";
Countries["Eritrea"] = "ER";
Countries["Estonia"] = "EE";
Countries["Ethiopia"] = "ET";
Countries["Falkland Islands (Malvinas)"] = "FK";
Countries["Faroe Islands"] = "FO";
Countries["Fiji"] = "FJ";
Countries["Finland"] = "FI";
Countries["France"] = "FR";
Countries["French Guiana"] = "GF";
Countries["French Polynesia"] = "PF";
Countries["French Southern Territories"] = "TF";
Countries["Gabon"] = "GA";
Countries["Gambia"] = "GM";
Countries["Georgia"] = "GE";
Countries["Germany"] = "DE";
Countries["Ghana"] = "GH";
Countries["Gibraltar"] = "GI";
Countries["Greece"] = "GR";
Countries["Greenland"] = "GL";
Countries["Grenada"] = "GD";
Countries["Guadeloupe"] = "GP";
Countries["Guam"] = "GU";
Countries["Guatemala"] = "GT";
Countries["Guinea"] = "GN";
Countries["Guinea-Bissau"] = "GW";
Countries["Guyana"] = "GY";
Countries["Haiti"] = "HT";
Countries["Virgin Islands, U.S."] = "VI";
Countries["Honduras"] = "HN";
Countries["Hong Kong"] = "HK";
Countries["Hungary"] = "HU";
Countries["Iceland"] = "IS";
Countries["India"] = "IN";
Countries["Indonesia"] = "ID";
Countries["Wallis and Futuna"] = "WF";
Countries["Iraq"] = "IQ";
Countries["Ireland"] = "IE";
Countries["Israel"] = "IL";
Countries["Italy"] = "IT";
Countries["Jamaica"] = "JM";
Countries["Japan"] = "JP";
Countries["Jordan"] = "JO";
Countries["Kazakhstan"] = "KZ";
Countries["Kenya"] = "KE";
Countries["Kiribati"] = "KI";
Countries["Kuwait"] = "KW";
Countries["Kyrgyzstan"] = "KG";
Countries["Lao People's Democratic Republic"] = "LA";
Countries["Latvia"] = "LV";
Countries["Lebanon"] = "LB";
Countries["Lesotho"] = "LS";
Countries["Liberia"] = "LR";
Countries["Libyan Arab Jamahiriya"] = "LY";
Countries["Liechtenstein"] = "LI";
Countries["Lithuania"] = "LT";
Countries["Luxembourg"] = "LU";
Countries["Montserrat"] = "MS";
Countries["Macedonia, The Former Yugoslav Republic of"] = "MK";
Countries["Madagascar"] = "MG";
Countries["Malawi"] = "MW";
Countries["Malaysia"] = "MY";
Countries["Maldives"] = "MV";
Countries["Mali"] = "ML";
Countries["Malta"] = "MT";
Countries["Marshall Islands"] = "MH";
Countries["Martinique"] = "MQ";
Countries["Mauritania"] = "MR";
Countries["Mauritius"] = "MU";
Countries["Mayotte"] = "YT";
Countries["Mexico"] = "MX";
Countries["Micronesia, Federated States of"] = "FM";
Countries["Morocco"] = "MA";
Countries["Monaco"] = "MC";
Countries["Mongolia"] = "MN";
Countries["Mozambique"] = "MZ";
Countries["Myanmar"] = "MM";
Countries["Namibia"] = "NA";
Countries["Nauru"] = "NR";
Countries["Nepal"] = "NP";
Countries["Netherlands"] = "NL";
Countries["Netherlands Antilles"] = "AN";
Countries["New Caledonia"] = "NC";
Countries["New Zealand"] = "NZ";
Countries["Nicaragua"] = "NI";
Countries["Niger"] = "NE";
Countries["Nigeria"] = "NG";
Countries["Niue"] = "NU";
Countries["Norfolk Island"] = "NF";
Countries["Northern Mariana Islands"] = "MP";
Countries["Norway"] = "NO";
Countries["Oman"] = "OM";
Countries["Pakistan"] = "PK";
Countries["Palau"] = "PW";
Countries["Panama"] = "PA";
Countries["Papua New Guinea"] = "PG";
Countries["Paraguay"] = "PY";
Countries["Peru"] = "PE";
Countries["Philippines"] = "PH";
Countries["Pitcairn"] = "PN";
Countries["Poland"] = "PL";
Countries["Portugal"] = "PT";
Countries["Puerto Rico"] = "PR";
Countries["Qatar"] = "QA";
Countries["Reunion"] = "RE";
Countries["Romania"] = "RO";
Countries["Russian Federation"] = "RU";
Countries["Russia"] = "RU";
Countries["Rwanda"] = "RW";
Countries["Saint Kitts and Nevis"] = "KN";
Countries["Saint Lucia"] = "LC";
Countries["Saint Vincent and The Grenadines"] = "VC";
Countries["Samoa"] = "WS";
Countries["San Marino"] = "SM";
Countries["Sao Tome and Principe"] = "ST";
Countries["Saudi Arabia"] = "SA";
Countries["Senegal"] = "SN";
Countries["Seychelles"] = "SC";
Countries["Sierra Leone"] = "SL";
Countries["Singapore"] = "SG";
Countries["Slovenia"] = "SI";
Countries["Solomon Islands"] = "SB";
Countries["Somalia"] = "SO";
Countries["South Africa"] = "ZA";
Countries["Spain"] = "ES";
Countries["Sri Lanka"] = "LK";
Countries["Sudan"] = "SD";
Countries["Suriname"] = "SR";
Countries["Swaziland"] = "SZ";
Countries["Sweden"] = "SE";
Countries["Switzerland"] = "CH";
Countries["Syrian Arab Republic"] = "SY";
Countries["Tajikistan"] = "TJ";
Countries["Tanzania, United Republic of"] = "TZ";
Countries["Thailand"] = "TH";
Countries["Togo"] = "TG";
Countries["Tokelau"] = "TK";
Countries["Tonga"] = "TO";
Countries["Trinidad and Tobago"] = "TT";
Countries["Tunisia"] = "TN";
Countries["Turkey"] = "TR";
Countries["Turkmenistan"] = "TM";
Countries["Turks and Caicos Islands"] = "TC";
Countries["Tuvalu"] = "TV";
Countries["Uganda"] = "UG";
Countries["Ukraine"] = "UA";
Countries["United Arab Emirates"] = "AE";
Countries["UK"] = "GB";
Countries["US"] = "US";
Countries["United States Minor Outlying Islands"] = "UM";
Countries["Uruguay"] = "UY";
Countries["Uzbekistan"] = "UZ";
Countries["Vanuatu"] = "VU";
Countries["Vatican City State (Holy See)"] = "VA";
Countries["Venezuela"] = "VE";
Countries["Viet Nam"] = "VN";
Countries["Western Sahara"] = "EH";
Countries["Yemen"] = "YE";
Countries["Zambia"] = "ZM";
Countries["Zimbabwe"] = "ZW";
Countries["Taiwan"] = "TW";
Countries["[Worldwide]"] = "XW";
Countries["Europe"] = "XE";
Countries["Soviet Union (historical, 1922-1991)"] = "SU";
Countries["East Germany (historical, 1949-1990)"] = "XG";
Countries["Czechoslovakia (historical, 1918-1992)"] = "XC";
Countries["Congo, The Democratic Republic of the"] = "CD";
Countries["Slovakia"] = "SK";
Countries["Bosnia and Herzegovina"] = "BA";
Countries["Korea (North), Democratic People's Republic of"] = "KP";
Countries["North Korea"] = "KP";
Countries["Korea (South), Republic of"] = "KR";
Countries["South Korea"] = "KR";
Countries["Montenegro"] = "ME";
Countries["South Georgia and the South Sandwich Islands"] = "GS";
Countries["Palestinian Territory"] = "PS";
Countries["Macao"] = "MO";
Countries["Timor-Leste"] = "TL";
Countries["<85>land Islands"] = "AX";
Countries["Guernsey"] = "GG";
Countries["Isle of Man"] = "IM";
Countries["Jersey"] = "JE";
Countries["Serbia"] = "RS";
Countries["Saint Barthélemy"] = "BL";
Countries["Saint Martin"] = "MF";
Countries["Moldova"] = "MD";
Countries["Yugoslavia (historical, 1918-2003)"] = "YU";
Countries["Serbia and Montenegro (historical, 2003-2006)"] = "CS";
Countries["Côte d'Ivoire"] = "CI";
Countries["Heard Island and McDonald Islands"] = "HM";
Countries["Iran, Islamic Republic of"] = "IR";
Countries["Saint Pierre and Miquelon"] = "PM";
Countries["Saint Helena"] = "SH";
Countries["Svalbard and Jan Mayen"] = "SJ";
