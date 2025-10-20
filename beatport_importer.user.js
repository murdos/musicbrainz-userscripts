// ==UserScript==
// @name         Import Beatport releases to MusicBrainz
// @description  One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version      2025.10.20.2
// @author       VxJasonxV
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @match        https://www.beatport.com/release/*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

(function () {
    'use strict';

    function luceneEscape(text) {
      var newText = text.replace(/[-[\]{}()*+?~:\\^!"/]/g, '\\$&');
      newText = newText.replace('&&', '&&').replace('||', '||');
      return newText;
    }

    function appendParameter(parameters, paramName, paramValue) {
      if (!paramValue) return;
      parameters.push({
        name: paramName,
        value: paramValue
      });
    }
    function searchParams(release) {
      var params = [];
      var totaltracks = release.discs.reduce(function (acc, _ref) {
        var tracks = _ref.tracks;
        return acc + tracks.length;
      }, 0);
      var release_artist = '';
      for (var i = 0; i < release.artist_credit.length; i++) {
        var ac = release.artist_credit[i];
        if (ac) {
          release_artist += ac.artist_name;
          if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != '') {
            release_artist += ac.joinphrase;
          } else {
            if (i != release.artist_credit.length - 1) release_artist += ', ';
          }
        }
      }
      var query = "artist:(".concat(luceneEscape(release_artist), ")") + " release:(".concat(luceneEscape(release.title), ")") + " tracks:(".concat(totaltracks, ")").concat(release.country ? " country:".concat(release.country) : '');
      appendParameter(params, 'query', query);
      appendParameter(params, 'type', 'release');
      appendParameter(params, 'advanced', '1');
      return params;
    }

    function buildSearchLink(release) {
      var parameters = searchParams(release);
      var url_params = [];
      parameters.forEach(function (parameter) {
        var value = "".concat(parameter.value);
        url_params.push(encodeURI("".concat(parameter.name, "=").concat(value)));
      });
      return "<a class=\"musicbrainz_import\" href=\"https://musicbrainz.org/search?".concat(url_params.join('&'), "\">Search in MusicBrainz</a>");
    }

    // compute HTML of search button
    function buildSearchButton(release) {
      var parameters = searchParams(release);
      var html = "<form class=\"musicbrainz_import musicbrainz_import_search\" action=\"https://musicbrainz.org/search\" method=\"get\" target=\"_blank\" accept-charset=\"UTF-8\" charset=\"".concat(document.characterSet, "\">");
      parameters.forEach(function (parameter) {
        var value = "".concat(parameter.value);
        html += "<input type='hidden' value='".concat(value.replace(/'/g, '&apos;'), "' name='").concat(parameter.name, "'/>");
      });
      html += '<button type="submit" title="Search for this release in MusicBrainz (open a new tab)">Search in MB</button>';
      html += '</form>';
      return html;
    }

    // compute HTML of import form
    function buildFormHTML(parameters) {
      // Build form
      var innerHTML = "<form class=\"musicbrainz_import musicbrainz_import_add\" action=\"https://musicbrainz.org/release/add\" method=\"post\" target=\"_blank\" accept-charset=\"UTF-8\" charset=\"".concat(document.characterSet, "\">");
      parameters.forEach(function (parameter) {
        var value = "".concat(parameter.value);
        innerHTML += "<input type='hidden' value='".concat(value.replace(/'/g, '&apos;'), "' name='").concat(parameter.name, "'/>");
      });
      innerHTML += '<button type="submit" title="Import this release into MusicBrainz (open a new tab)"><img src="https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg" width="16" height="16" />Import into MB</button>';
      innerHTML += '</form>';
      return innerHTML;
    }

    // convert HH:MM:SS or MM:SS to milliseconds
    function hmsToMilliSeconds(str) {
      if (typeof str == 'undefined' || str === null || str === '' || isNaN(Number(str))) return NaN;
      if (typeof str == 'number') return str;
      var t = str.split(':');
      var s = 0;
      var m = 1;
      while (t.length > 0) {
        s += m * parseInt(t.pop(), 10);
        m *= 60;
      }
      return s * 1000;
    }

    // convert ISO8601 duration (limited to hours/minutes/seconds) to milliseconds
    // format looks like PT1H45M5.789S (note: floats can be used)
    // https://en.wikipedia.org/wiki/ISO_8601#Durations
    function ISO8601toMilliSeconds(str) {
      var regex = /^PT(?:(\d*\.?\d*)H)?(?:(\d*\.?\d*)M)?(?:(\d*\.?\d*)S)?$/;
      var m = str.replace(',', '.').match(regex);
      if (!m) return NaN;
      return (3600 * parseFloat(m[1] || '0') + 60 * parseFloat(m[2] || '0') + parseFloat(m[3] || '0')) * 1000;
    }

    // Try to guess release type using number of tracks, title and total duration (in millisecs)
    function guessReleaseType(title, num_tracks, duration_ms) {
      if (num_tracks < 1) return '';
      var has_single = !!title.match(/\bsingle\b/i);
      var has_EP = !!title.match(/\bEP\b/i);
      if (has_single && has_EP) {
        has_single = false;
        has_EP = false;
      }
      var perhaps_single = has_single && num_tracks <= 4 || num_tracks <= 2;
      var perhaps_EP = has_EP || num_tracks > 2 && num_tracks <= 6;
      var perhaps_album = num_tracks > 8;
      if (isNaN(duration_ms)) {
        // no duration, try to guess with title and number of tracks
        if (perhaps_single && !perhaps_EP && !perhaps_album) return 'single';
        if (!perhaps_single && perhaps_EP && !perhaps_album) return 'EP';
        if (!perhaps_single && !perhaps_EP && perhaps_album) return 'album';
        return '';
      }
      var duration_mn = duration_ms / (60 * 1000);
      if (perhaps_single && duration_mn >= 1 && duration_mn < 7) return 'single';
      if (perhaps_EP && duration_mn > 7 && duration_mn <= 30) return 'EP';
      if (perhaps_album && duration_mn > 30) return 'album';
      return '';
    }

    function buildArtistCreditsFormParameters(parameters, paramPrefix, artist_credit) {
      if (!artist_credit) return;
      for (var i = 0; i < artist_credit.length; i++) {
        var ac = artist_credit[i];
        if (ac) {
          appendParameter(parameters, "".concat(paramPrefix, "artist_credit.names.").concat(i, ".name"), ac.credited_name || '');
          appendParameter(parameters, "".concat(paramPrefix, "artist_credit.names.").concat(i, ".artist.name"), ac.artist_name);
          if (ac.mbid) appendParameter(parameters, "".concat(paramPrefix, "artist_credit.names.").concat(i, ".mbid"), ac.mbid);
          if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != '') {
            appendParameter(parameters, "".concat(paramPrefix, "artist_credit.names.").concat(i, ".join_phrase"), ac.joinphrase);
          }
        }
      }
    }

    // build form POST parameters that MB is expecting
    function buildFormParameters(release, edit_note) {
      // Form parameters
      var parameters = [];
      appendParameter(parameters, 'name', release.title);

      // Release Artist credits
      buildArtistCreditsFormParameters(parameters, '', release.artist_credit);
      if (release['secondary_types']) {
        for (var i = 0; i < release.secondary_types.length; i++) {
          var secondaryType = release.secondary_types[i];
          if (secondaryType) {
            appendParameter(parameters, 'type', secondaryType);
          }
        }
      }
      if (release.status) appendParameter(parameters, 'status', release.status);
      if (release.language) appendParameter(parameters, 'language', release.language);
      if (release.script) appendParameter(parameters, 'script', release.script);
      if (release.packaging) appendParameter(parameters, 'packaging', release.packaging);

      // ReleaseGroup
      if (release.release_group_mbid) appendParameter(parameters, 'release_group', release.release_group_mbid);

      // Date + country
      if (release.country) appendParameter(parameters, 'country', release.country);
      if (!isNaN(release.year || 0) && release.year != 0) {
        appendParameter(parameters, 'date.year', release.year);
      }
      if (!isNaN(release.month || 0) && release.month != 0) {
        appendParameter(parameters, 'date.month', release.month);
      }
      if (!isNaN(release.day || 0) && release.day != 0) {
        appendParameter(parameters, 'date.day', release.day);
      }

      // Barcode
      if (release.barcode) appendParameter(parameters, 'barcode', release.barcode);

      // Disambiguation comment
      if (release.comment) appendParameter(parameters, 'comment', release.comment);

      // Annotation
      if (release.annotation) appendParameter(parameters, 'annotation', release.annotation);

      // Label + catnos
      if (Array.isArray(release.labels)) {
        for (var _i = 0; _i < release.labels.length; _i++) {
          var label = release.labels[_i];
          if (label) {
            appendParameter(parameters, "labels.".concat(_i, ".name"), label.name);
            if (label.mbid) appendParameter(parameters, "labels.".concat(_i, ".mbid"), label.mbid);
            if (label.catno && label.catno != 'none') {
              appendParameter(parameters, "labels.".concat(_i, ".catalog_number"), label.catno);
            }
          }
        }
      }

      // URLs
      if (Array.isArray(release.urls)) {
        for (var _i2 = 0; _i2 < release.urls.length; _i2++) {
          var url = release.urls[_i2];
          if (url) {
            appendParameter(parameters, "urls.".concat(_i2, ".url"), url.url);
            appendParameter(parameters, "urls.".concat(_i2, ".link_type"), url.link_type);
          }
        }
      }

      // Mediums
      var total_tracks = 0;
      var total_tracks_with_duration = 0;
      var total_duration = 0;
      for (var _i3 = 0; _i3 < release.discs.length; _i3++) {
        var disc = release.discs[_i3];
        if (disc) {
          appendParameter(parameters, "mediums.".concat(_i3, ".format"), disc.format);
          if (disc.title) appendParameter(parameters, "mediums.".concat(_i3, ".name"), disc.title);

          // Tracks
          for (var j = 0; j < disc.tracks.length; j++) {
            var track = disc.tracks[j];
            if (track) {
              total_tracks++;
              if (track.number) appendParameter(parameters, "mediums.".concat(_i3, ".track.").concat(j, ".number"), track.number);
              appendParameter(parameters, "mediums.".concat(_i3, ".track.").concat(j, ".name"), track.title);
              var tracklength = '?:??';
              var duration_ms = hmsToMilliSeconds(track.duration);
              if (!isNaN(duration_ms)) {
                tracklength = duration_ms.toString();
                total_tracks_with_duration++;
                total_duration += duration_ms;
              }
              appendParameter(parameters, "mediums.".concat(_i3, ".track.").concat(j, ".length"), tracklength);
              // @ts-ignore TODO: recording is not a property of Track and in no importer scripts a recording is found in a track. Once all scripts are migrated, we need to see if we can remove this line entirely.
              appendParameter(parameters, "mediums.".concat(_i3, ".track.").concat(j, ".recording"), track.recording);
              buildArtistCreditsFormParameters(parameters, "mediums.".concat(_i3, ".track.").concat(j, "."), track.artist_credit);
            }
          }
        }
      }

      // Guess release type if not given
      if (!release.type && release.title && total_tracks == total_tracks_with_duration) {
        release.type = guessReleaseType(release.title, total_tracks, total_duration);
      }
      if (release.type) appendParameter(parameters, 'type', release.type);

      // Add Edit note parameter
      if (edit_note) appendParameter(parameters, 'edit_note', edit_note);
      return parameters;
    }

    function _arrayLikeToArray(r, a) {
      (null == a || a > r.length) && (a = r.length);
      for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
      return n;
    }
    function _arrayWithoutHoles(r) {
      if (Array.isArray(r)) return _arrayLikeToArray(r);
    }
    function _classCallCheck(a, n) {
      if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
    }
    function _defineProperties(e, r) {
      for (var t = 0; t < r.length; t++) {
        var o = r[t];
        o.enumerable = o.enumerable || false, o.configurable = true, "value" in o && (o.writable = true), Object.defineProperty(e, _toPropertyKey(o.key), o);
      }
    }
    function _createClass(e, r, t) {
      return r && _defineProperties(e.prototype, r), Object.defineProperty(e, "prototype", {
        writable: false
      }), e;
    }
    function _createForOfIteratorHelper(r, e) {
      var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
      if (!t) {
        if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e) {
          t && (r = t);
          var n = 0,
            F = function () {};
          return {
            s: F,
            n: function () {
              return n >= r.length ? {
                done: true
              } : {
                done: false,
                value: r[n++]
              };
            },
            e: function (r) {
              throw r;
            },
            f: F
          };
        }
        throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
      }
      var o,
        a = true,
        u = false;
      return {
        s: function () {
          t = t.call(r);
        },
        n: function () {
          var r = t.next();
          return a = r.done, r;
        },
        e: function (r) {
          u = true, o = r;
        },
        f: function () {
          try {
            a || null == t.return || t.return();
          } finally {
            if (u) throw o;
          }
        }
      };
    }
    function _defineProperty(e, r, t) {
      return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    function _iterableToArray(r) {
      if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r);
    }
    function _nonIterableSpread() {
      throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }
    function _toConsumableArray(r) {
      return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
    }
    function _toPrimitive(t, r) {
      if ("object" != typeof t || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r);
        if ("object" != typeof i) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return (String )(t);
    }
    function _toPropertyKey(t) {
      var i = _toPrimitive(t, "string");
      return "symbol" == typeof i ? i : i + "";
    }
    function _unsupportedIterableToArray(r, a) {
      if (r) {
        if ("string" == typeof r) return _arrayLikeToArray(r, a);
        var t = {}.toString.call(r).slice(8, -1);
        return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
      }
    }

    // Convert a list of artists to a list of artist credits with joinphrases
    function makeArtistCredits(artists_list) {
      var artists = artists_list.map(function (item) {
        return {
          artist_name: item
        };
      });
      if (artists.length > 2) {
        var last = artists.pop();
        if (last) {
          last.joinphrase = '';
          var prev = artists.pop();
          if (prev) {
            prev.joinphrase = ' & ';
            for (var i = 0; i < artists.length; i++) {
              var artist = artists[i];
              if (artist) {
                artist.joinphrase = ', ';
              }
            }
            artists.push(prev);
            artists.push(last);
          }
        }
      } else if (artists.length == 2) {
        var first = artists[0];
        if (first) {
          first.joinphrase = ' & ';
        }
      }
      var credits = [];
      // re-split artists if featuring or vs
      artists.map(function (item) {
        var c = item.artist_name.replace(/\s*\b(?:feat\.?|ft\.?|featuring)\s+/gi, ' feat. ');
        c = c.replace(/\s*\(( feat. )([^)]+)\)/g, '$1$2');
        c = c.replace(/\s*\b(?:versus|vs\.?)\s+/gi, ' vs. ');
        c = c.replace(/\s+/g, ' ');
        var splitted = c.split(/( feat\. | vs\. )/);
        if (splitted.length === 1) {
          credits.push(item); // nothing to split
        } else {
          var new_items = [];
          var n = 0;
          var _iterator = _createForOfIteratorHelper(splitted),
            _step;
          try {
            for (_iterator.s(); !(_step = _iterator.n()).done;) {
              var element = _step.value;
              if (n && (element === ' feat. ' || element === ' vs. ')) {
                var prevItem = new_items[n - 1];
                if (prevItem) {
                  prevItem.joinphrase = element;
                }
              } else {
                new_items[n++] = {
                  artist_name: element.trim(),
                  joinphrase: ''
                };
              }
            }
          } catch (err) {
            _iterator.e(err);
          } finally {
            _iterator.f();
          }
          var lastItem = new_items[n - 1];
          if (lastItem && item.joinphrase) {
            lastItem.joinphrase = item.joinphrase;
          }
          new_items.forEach(function (newit) {
            return credits.push(newit);
          });
        }
      });
      return credits;
    }

    function makeEditNote(release_url, importer_name, format) {
      var home = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'https://github.com/murdos/musicbrainz-userscripts';
      return "Imported from ".concat(release_url).concat(format ? " (".concat(format, ")") : '', " using ").concat(importer_name, " import script from ").concat(home);
    }

    function searchUrlFor(type, what) {
      type = type.replace('-', '_');
      var params = ["query=".concat(luceneEscape(what)), "type=".concat(type), 'indexed=1'];
      return "https://musicbrainz.org/search?".concat(params.join('&'));
    }

    var URL_TYPES = {
      purchase_for_download: 74,
      download_for_free: 75,
      discogs: 76,
      purchase_for_mail_order: 79,
      other_databases: 82,
      stream_for_free: 85,
      license: 301
    };

    var special_artists = {
      various_artists: {
        name: 'Various Artists',
        mbid: '89ad4ac3-39f7-470e-963a-56509c546377'
      },
      unknown: {
        name: '[unknown]',
        mbid: '125ec42a-7229-4250-afc5-e057484327fe'
      }
    };
    function specialArtist(key, ac) {
      var joinphrase = '';
      if (typeof ac !== 'undefined') {
        joinphrase = ac.joinphrase || '';
      }
      var specialArtist = special_artists[key];
      if (!specialArtist) {
        throw new Error("Unknown special artist: ".concat(key));
      }
      return {
        artist_name: specialArtist.name,
        credited_name: '',
        joinphrase: joinphrase,
        mbid: specialArtist.mbid
      };
    }

    var MBImport = {
      buildSearchLink: buildSearchLink,
      buildSearchButton: buildSearchButton,
      buildFormHTML: buildFormHTML,
      buildFormParameters: buildFormParameters,
      makeArtistCredits: makeArtistCredits,
      guessReleaseType: guessReleaseType,
      hmsToMilliSeconds: hmsToMilliSeconds,
      ISO8601toMilliSeconds: ISO8601toMilliSeconds,
      makeEditNote: makeEditNote,
      searchUrlFor: searchUrlFor,
      URL_TYPES: URL_TYPES,
      SPECIAL_ARTISTS: special_artists,
      specialArtist: specialArtist
    };

    var LogLevel = /*#__PURE__*/function (LogLevel) {
      LogLevel["DEBUG"] = "debug";
      LogLevel["INFO"] = "info";
      LogLevel["ERROR"] = "error";
      return LogLevel;
    }(LogLevel || {});
    var Logger = /*#__PURE__*/function () {
      function Logger(scriptName) {
        var level = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : LogLevel.ERROR;
        _classCallCheck(this, Logger);
        _defineProperty(this, "LOG_LEVEL", LogLevel.INFO);
        this.scriptName = scriptName;
        this.LOG_LEVEL = level;
      }
      return _createClass(Logger, [{
        key: "debug",
        value: function debug() {
          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          this._log(LogLevel.DEBUG, args);
        }
      }, {
        key: "info",
        value: function info() {
          for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
          }
          this._log(LogLevel.INFO, args);
        }
      }, {
        key: "error",
        value: function error() {
          for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            args[_key3] = arguments[_key3];
          }
          this._log(LogLevel.ERROR, args);
        }
      }, {
        key: "setLevel",
        value: function setLevel(level) {
          this.LOG_LEVEL = level;
        }
      }, {
        key: "_log",
        value: function _log(level, args) {
          if (level < this.LOG_LEVEL) {
            return;
          }
          var logMethod = console.log;
          switch (level) {
            case LogLevel.DEBUG:
              logMethod = console.debug;
              break;
            case LogLevel.INFO:
              logMethod = console.info;
              break;
            case LogLevel.ERROR:
              logMethod = console.error;
              break;
          }
          try {
            logMethod.apply(this, ["[".concat(this.scriptName, "]")].concat(_toConsumableArray(args)));
          } catch (_unused) {
            // do nothing
          }
        }
      }]);
    }();

    function _add_css(css) {
      document.head.insertAdjacentHTML('beforeend', "<style>".concat(css.replace(/\s+/g, ' '), "</style>"));
    }
    function MBImportStyle() {
      var css_import_button = "\n    #mb_buttons {\n        display: flex;\n        gap: 5px;\n    }\n  .musicbrainz_import button {\n    margin: 0 !important;\n    border-radius:5px;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    cursor:pointer;\n    font-family:Arial;\n    font-size:12px !important;\n    padding:3px 6px;\n    text-decoration:none;\n    border: 1px solid rgba(180,180,180,0.8) !important;\n    background-color: rgba(240,240,240,0.8) !important;\n    color: #334 !important;\n    height: 26px ;\n  }\n  .musicbrainz_import button:hover {\n    background-color: rgba(250,250,250,0.9) !important;\n  }\n  .musicbrainz_import button:active {\n    background-color: rgba(170,170,170,0.8) !important;\n  }\n  .musicbrainz_import button img {\n    vertical-align: middle !important;\n    margin-right: 4px !important;\n    height: 16px;\n  }\n  img[src*=\"musicbrainz.org\"] {\n    display: inline-block;\n  }\n  ";
      _add_css(css_import_button);
    }

    var LOGGER = new Logger('beatport_importer');

    // prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
    window.$ = window.jQuery = jQuery.noConflict(true);
    $(document).ready(function () {
      var _tracks_release$state;
      MBImportStyle();
      var release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
      var data = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
      var release_data = data.props.pageProps.release;

      // Reversing is less reliable, but the API does not provide track numbers.
      var tracks_table = release_data.tracks.reverse();
      var tracks_release = $.grep(data.props.pageProps.dehydratedState.queries, function (element) {
        return element ? /tracks/g.test(element.queryKey) : false;
      })[0];
      var tracks_data_array = tracks_release === null || tracks_release === void 0 || (_tracks_release$state = tracks_release.state) === null || _tracks_release$state === void 0 || (_tracks_release$state = _tracks_release$state.data) === null || _tracks_release$state === void 0 ? void 0 : _tracks_release$state.results;
      if (!tracks_data_array) {
        LOGGER.error('Could not find tracks data');
        return;
      }
      var tracks_data = $.map(tracks_table, function (url) {
        return $.grep(tracks_data_array, function (element) {
          return element ? element.url === url : false;
        });
      });
      var isrcs = tracks_data.map(function (track) {
        return track.isrc || null;
      });
      var mbrelease = retrieveReleaseInfo(release_url, release_data, tracks_data);
      setTimeout(function () {
        return insertLink(mbrelease, release_url, isrcs);
      }, 1000);
    });
    function retrieveReleaseInfo(release_url, release_data, tracks_data) {
      var release_date = release_data.new_release_date.split('-');

      // Release information global to all Beatport releases
      var mbrelease = {
        artist_credit: [],
        title: release_data.name,
        year: parseInt(release_date[0] || '0'),
        month: parseInt(release_date[1] || '0'),
        day: parseInt(release_date[2] || '0'),
        format: 'Digital Media',
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        barcode: release_data.upc,
        discs: []
      };

      // URLs
      mbrelease.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download
      });
      mbrelease.labels.push({
        name: release_data.label.name,
        catno: release_data.catalog_number
      });

      // Tracks
      var mbtracks = [];
      var seen_tracks = {}; // to shoot duplicates ...
      var release_artists = [];
      $.each(tracks_data, function (index, track) {
        if (track.release.id != release_data.id) {
          return;
        }
        if (seen_tracks[track.id]) {
          return;
        }
        seen_tracks[track.id] = true;
        var artists = [];
        $.each(track.artists, function (index2, artist) {
          artists.push(artist.name);
          release_artists.push(artist.name);
        });
        var title = track.name;
        if (track.mix_name && track.mix_name !== 'Original Mix') {
          title += " (".concat(track.mix_name, ")");
        }
        mbtracks.push({
          artist_credit: MBImport.makeArtistCredits(artists),
          title: title,
          duration: track.length_ms
        });
      });
      var unique_artists = [];
      $.each(release_artists, function (index, el) {
        if ($.inArray(el, unique_artists) === -1) {
          unique_artists.push(el);
        }
      });
      if (unique_artists.length > 4) {
        mbrelease.artist_credit = [MBImport.specialArtist('various_artists')];
      } else {
        mbrelease.artist_credit = MBImport.makeArtistCredits(unique_artists);
      }
      mbrelease.discs.push({
        tracks: mbtracks,
        format: mbrelease.format
      });
      LOGGER.info('Parsed release: ', mbrelease);
      return mbrelease;
    }

    // Insert button into page under label information
    function insertLink(mbrelease, release_url, isrcs) {
      var edit_note = MBImport.makeEditNote(release_url, 'Beatport');
      var parameters = MBImport.buildFormParameters(mbrelease, edit_note);
      var mbUI = $("<div class=\"interior-release-chart-content-item musicbrainz-import\">".concat(MBImport.buildFormHTML(parameters)).concat(MBImport.buildSearchButton(mbrelease), "</div>")).hide();
      $('<form class="musicbrainz_import"><button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC"><span>Submit ISRCs</span></button></form>').on('click', function (event) {
        var query = isrcs.map(function (isrc, index) {
          return isrc == null ? "isrc".concat(index + 1, "=") : "isrc".concat(index + 1, "=").concat(isrc);
        }).join('&');
        event.preventDefault();
        window.open("https://magicisrc.kepstin.ca?".concat(query));
      }).appendTo(mbUI);
      $('div[title="Collection controls"]').append(mbUI);
      $('form.musicbrainz_import').css({
        display: 'inline-block',
        'margin-left': '5px'
      });
      $('form.musicbrainz_import button').css({
        width: '120px'
      });
      $('form.musicbrainz_import button img').css({
        display: 'inline-block'
      });
      var lastReleaseInfo = $('div[class^="ReleaseDetailCard-style__Info"]').last();
      var spanHTML = mbrelease.barcode ? "<a href=\"https://atisket.pulsewidth.org.uk/?upc=".concat(encodeURIComponent(mbrelease.barcode), "\">\n            ").concat(mbrelease.barcode, "\n        </a>") : '[none]';
      var releaseInfoBarcode = $("<div class=\"".concat(lastReleaseInfo.attr('class'), "\">\n            <p>Barcode</p>\n            <span>").concat(spanHTML, "</span>\n        </div>")).hide();
      lastReleaseInfo.after(releaseInfoBarcode);
      mbUI.slideDown();
      releaseInfoBarcode.slideDown();
    }

})();
