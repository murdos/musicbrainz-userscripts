// ==UserScript==
// @name         Musicbrainz DiscIds Detector
// @description  Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @version      2026.07.05.8
// @author       [unknown]
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mb_discids_detector.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mb_discids_detector.user.js
// @match        https://orpheus.network/torrents.php?id=*
// @match        https://redacted.sh/torrents.php?id=*
// @match        https://lztr.me/torrents.php?id=*
// @match        https://notwhat.cd/torrents.php?id=*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function _arrayLikeToArray(r, a) {
    (null == a || a > r.length) && (a = r.length);
    for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
    return n;
  }
  function _arrayWithoutHoles(r) {
    if (Array.isArray(r)) return _arrayLikeToArray(r);
  }
  function asyncGeneratorStep(n, t, e, r, o, a, c) {
    try {
      var i = n[a](c),
        u = i.value;
    } catch (n) {
      return void e(n);
    }
    i.done ? t(u) : Promise.resolve(u).then(r, o);
  }
  function _asyncToGenerator(n) {
    return function () {
      var t = this,
        e = arguments;
      return new Promise(function (r, o) {
        var a = n.apply(t, e);
        function _next(n) {
          asyncGeneratorStep(a, r, o, _next, _throw, "next", n);
        }
        function _throw(n) {
          asyncGeneratorStep(a, r, o, _next, _throw, "throw", n);
        }
        _next(void 0);
      });
    };
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
  function _regenerator() {
    /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
    var e,
      t,
      r = "function" == typeof Symbol ? Symbol : {},
      n = r.iterator || "@@iterator",
      o = r.toStringTag || "@@toStringTag";
    function i(r, n, o, i) {
      var c = n && n.prototype instanceof Generator ? n : Generator,
        u = Object.create(c.prototype);
      return _regeneratorDefine(u, "_invoke", function (r, n, o) {
        var i,
          c,
          u,
          f = 0,
          p = o || [],
          y = false,
          G = {
            p: 0,
            n: 0,
            v: e,
            a: d,
            f: d.bind(e, 4),
            d: function (t, r) {
              return i = t, c = 0, u = e, G.n = r, a;
            }
          };
        function d(r, n) {
          for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) {
            var o,
              i = p[t],
              d = G.p,
              l = i[2];
            r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0));
          }
          if (o || r > 1) return a;
          throw y = true, n;
        }
        return function (o, p, l) {
          if (f > 1) throw TypeError("Generator is already running");
          for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) {
            i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u);
            try {
              if (f = 2, i) {
                if (c || (o = "next"), t = i[o]) {
                  if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object");
                  if (!t.done) return t;
                  u = t.value, c < 2 && (c = 0);
                } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1);
                i = e;
              } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break;
            } catch (t) {
              i = e, c = 1, u = t;
            } finally {
              f = 1;
            }
          }
          return {
            value: t,
            done: y
          };
        };
      }(r, o, i), true), u;
    }
    var a = {};
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}
    t = Object.getPrototypeOf;
    var c = [][n] ? t(t([][n]())) : (_regeneratorDefine(t = {}, n, function () {
        return this;
      }), t),
      u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c);
    function f(e) {
      return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e;
    }
    return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine(u), _regeneratorDefine(u, o, "Generator"), _regeneratorDefine(u, n, function () {
      return this;
    }), _regeneratorDefine(u, "toString", function () {
      return "[object Generator]";
    }), (_regenerator = function () {
      return {
        w: i,
        m: f
      };
    })();
  }
  function _regeneratorDefine(e, r, n, t) {
    var i = Object.defineProperty;
    try {
      i({}, "", {});
    } catch (e) {
      i = 0;
    }
    _regeneratorDefine = function (e, r, n, t) {
      function o(r, n) {
        _regeneratorDefine(e, r, function (e) {
          return this._invoke(r, n, e);
        });
      }
      r ? i ? i(e, r, {
        value: n,
        enumerable: !t,
        configurable: !t,
        writable: !t
      }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2));
    }, _regeneratorDefine(e, r, n, t);
  }
  function _regeneratorValues(e) {
    if (null != e) {
      var t = e["function" == typeof Symbol && Symbol.iterator || "@@iterator"],
        r = 0;
      if (t) return t.call(e);
      if ("function" == typeof e.next) return e;
      if (!isNaN(e.length)) return {
        next: function () {
          return e && r >= e.length && (e = void 0), {
            value: e && e[r++],
            done: !e
          };
        }
      };
    }
    throw new TypeError(typeof e + " is not iterable");
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

  var LogLevel = /*#__PURE__*/function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["ERROR"] = "error";
    return LogLevel;
  }({});
  var Logger = /*#__PURE__*/function () {
    function Logger(scriptName) {
      var level = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : LogLevel.ERROR;
      _classCallCheck(this, Logger);
      _defineProperty(this, "LOG_LEVEL", LogLevel.INFO);
      _defineProperty(this, "scriptName", void 0);
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

  // MBDiscid code comes from https://gist.github.com/kolen/766668
  // Copyright 2010, kolen
  // Released under the MIT License

  var PREGAP = 150;
  var DATA_TRACK_GAP = 11400;
  var TOC_ENTRY_MATCHER = new RegExp('^\\s*' + '(\\d+)' +
  // 1 - track number
  '\\s*\\|\\s*' + '([0-9:.]+)' +
  // 2 - time start
  '\\s*\\|\\s*' + '([0-9:.]+)' +
  // 3 - time length
  '\\s*\\|\\s*' + '(\\d+)' +
  // 4 - start sector
  '\\s*\\|\\s*' + '(\\d+)' +
  // 5 - end sector
  '\\s*$');
  function parseTocEntry(match) {
    var _match$, _match$2, _match$3, _match$4, _match$5;
    return {
      trackNumber: (_match$ = match[1]) !== null && _match$ !== void 0 ? _match$ : '',
      timeStart: (_match$2 = match[2]) !== null && _match$2 !== void 0 ? _match$2 : '',
      timeLength: (_match$3 = match[3]) !== null && _match$3 !== void 0 ? _match$3 : '',
      startSector: (_match$4 = match[4]) !== null && _match$4 !== void 0 ? _match$4 : '',
      endSector: (_match$5 = match[5]) !== null && _match$5 !== void 0 ? _match$5 : ''
    };
  }
  function sha1MusicBrainzDiscId(_x) {
    return _sha1MusicBrainzDiscId.apply(this, arguments);
  }
  function _sha1MusicBrainzDiscId() {
    _sha1MusicBrainzDiscId = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(message) {
      var hash, b64;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            _context.n = 1;
            return crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
          case 1:
            hash = _context.v;
            b64 = btoa(String.fromCharCode.apply(String, _toConsumableArray(new Uint8Array(hash))));
            return _context.a(2, b64.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-'));
        }
      }, _callee);
    }));
    return _sha1MusicBrainzDiscId.apply(this, arguments);
  }
  function getLayoutType(entries) {
    var type = 'standard';
    for (var i = 0; i < entries.length - 1; i++) {
      var current = entries[i];
      var next = entries[i + 1];
      if (!current || !next) {
        continue;
      }
      var gap = parseInt(next.startSector, 10) - parseInt(current.endSector, 10) - 1;
      if (gap !== 0) {
        if (i === entries.length - 2 && gap === DATA_TRACK_GAP) {
          type = 'with_data';
        } else {
          type = 'unknown';
          break;
        }
      }
    }
    return type;
  }
  function logInputToEntries(text) {
    var discs = [];
    var entries = [];
    var _iterator = _createForOfIteratorHelper(text.split('\n')),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var _match$6;
        var value = _step.value;
        var match = TOC_ENTRY_MATCHER.exec(value);
        if (!match) {
          continue;
        }
        if (parseInt((_match$6 = match[1]) !== null && _match$6 !== void 0 ? _match$6 : '0', 10) === 1) {
          if (entries.length > 0) {
            discs.push(entries);
          }
          entries = [];
        }
        entries.push(parseTocEntry(match));
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    if (entries.length > 0) {
      discs.push(entries);
    }
    return discs.map(function (discEntries) {
      var layoutType = getLayoutType(discEntries);
      if (layoutType === 'with_data') {
        return discEntries.slice(0, discEntries.length - 1);
      }
      return discEntries;
    });
  }
  function calculateMbTocNumbers(entries) {
    if (entries.length === 0) {
      return null;
    }
    var lastEntry = entries[entries.length - 1];
    if (!lastEntry) {
      return null;
    }
    var leadoutOffset = parseInt(lastEntry.endSector, 10) + PREGAP + 1;
    var offsets = entries.map(function (entry) {
      return parseInt(entry.startSector, 10) + PREGAP;
    });
    return [1, entries.length, leadoutOffset].concat(_toConsumableArray(offsets));
  }
  function hexLeftPad(input, totalChars) {
    var hex = parseInt(String(input), 10).toString(16).toUpperCase();
    var padWith = '0';
    while (hex.length < totalChars) {
      hex = "".concat(padWith).concat(hex);
    }
    if (hex.length > totalChars) {
      // If padWith was a multiple character string and num was overpadded
      hex = hex.substring(hex.length - totalChars);
    }
    return hex;
  }
  function calculateMbDiscid(_x2) {
    return _calculateMbDiscid.apply(this, arguments);
  }
  function _calculateMbDiscid() {
    _calculateMbDiscid = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(entries) {
      var _mbTocNumbers$, _mbTocNumbers$2, _mbTocNumbers$3;
      var mbTocNumbers, message, firstTrack, lastTrack, leadoutOffset, i, _mbTocNumbers, offset;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            mbTocNumbers = calculateMbTocNumbers(entries);
            if (mbTocNumbers) {
              _context2.n = 1;
              break;
            }
            throw new Error('Cannot calculate disc ID from empty TOC entries');
          case 1:
            message = '';
            firstTrack = (_mbTocNumbers$ = mbTocNumbers[0]) !== null && _mbTocNumbers$ !== void 0 ? _mbTocNumbers$ : 0;
            lastTrack = (_mbTocNumbers$2 = mbTocNumbers[1]) !== null && _mbTocNumbers$2 !== void 0 ? _mbTocNumbers$2 : 0;
            leadoutOffset = (_mbTocNumbers$3 = mbTocNumbers[2]) !== null && _mbTocNumbers$3 !== void 0 ? _mbTocNumbers$3 : 0;
            message += hexLeftPad(firstTrack, 2);
            message += hexLeftPad(lastTrack, 2);
            message += hexLeftPad(leadoutOffset, 8);
            for (i = 0; i < 99; i++) {
              offset = i + 3 < mbTocNumbers.length ? (_mbTocNumbers = mbTocNumbers[i + 3]) !== null && _mbTocNumbers !== void 0 ? _mbTocNumbers : 0 : 0;
              message += hexLeftPad(offset, 8);
            }
            return _context2.a(2, sha1MusicBrainzDiscId(message));
        }
      }, _callee2);
    }));
    return _calculateMbDiscid.apply(this, arguments);
  }
  var MBDiscid = {
    calculateMbDiscid: calculateMbDiscid,
    calculateMbTocNumbers: calculateMbTocNumbers,
    logInputToEntries: logInputToEntries
  };

  function analyzeLogFiles(_x) {
    return _analyzeLogFiles.apply(this, arguments);
  }
  function _analyzeLogFiles() {
    _analyzeLogFiles = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(logFiles) {
      var discs, _iterator, _step, logFile, discsInLog, seenDiscids, uniqueDiscs, _i, _discs, disc, discid;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            discs = [];
            _iterator = _createForOfIteratorHelper(logFiles);
            try {
              for (_iterator.s(); !(_step = _iterator.n()).done;) {
                logFile = _step.value;
                discsInLog = MBDiscid.logInputToEntries(logFile.textContent);
                discs.push.apply(discs, _toConsumableArray(discsInLog));
              }
            } catch (err) {
              _iterator.e(err);
            } finally {
              _iterator.f();
            }
            seenDiscids = new Set();
            uniqueDiscs = [];
            _i = 0, _discs = discs;
          case 1:
            if (!(_i < _discs.length)) {
              _context.n = 5;
              break;
            }
            disc = _discs[_i];
            _context.n = 2;
            return MBDiscid.calculateMbDiscid(disc);
          case 2:
            discid = _context.v;
            if (!seenDiscids.has(discid)) {
              _context.n = 3;
              break;
            }
            return _context.a(3, 4);
          case 3:
            seenDiscids.add(discid);
            uniqueDiscs.push(disc);
          case 4:
            _i++;
            _context.n = 1;
            break;
          case 5:
            return _context.a(2, uniqueDiscs);
        }
      }, _callee);
    }));
    return _analyzeLogFiles.apply(this, arguments);
  }

  var LOGGER = new Logger('mb_discids_detector', LogLevel.INFO);
  var MB_BASE_URL = 'https://musicbrainz.org';
  var GAZELLE_HOST_PATTERN = /orpheus\.network|redacted\.sh|lztr\.me|notwhat\.cd/;
  function computeAttachUrl(mbTocNumbers, mbArtistName, mbReleaseName) {
    var tocNumbers = mbTocNumbers.join('%20');
    var artistName = encodeURIComponent(mbArtistName);
    var releaseName = encodeURIComponent(mbReleaseName);
    var mbURL = new URL("".concat(MB_BASE_URL, "/cdtoc/attach"));
    mbURL.searchParams.set('toc', tocNumbers);
    mbURL.searchParams.set('artist-name', artistName);
    mbURL.searchParams.set('release-name', releaseName);
    return mbURL.toString();
  }
  function checkAndDisplayDiscs(_x) {
    return _checkAndDisplayDiscs.apply(this, arguments);
  }
  function _checkAndDisplayDiscs() {
    _checkAndDisplayDiscs = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(_ref) {
      var discs, displayDiscHandler, displayResultHandler, _loop, _ret, i;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            discs = _ref.discs, displayDiscHandler = _ref.displayDiscHandler, displayResultHandler = _ref.displayResultHandler;
            _loop = /*#__PURE__*/_regenerator().m(function _loop() {
              var entries, discNumber, mbTocNumbers, discid;
              return _regenerator().w(function (_context2) {
                while (1) switch (_context2.n) {
                  case 0:
                    entries = discs[i];
                    if (!(!entries || entries.length === 0)) {
                      _context2.n = 1;
                      break;
                    }
                    return _context2.a(2, 0);
                  case 1:
                    discNumber = i + 1;
                    mbTocNumbers = MBDiscid.calculateMbTocNumbers(entries);
                    if (mbTocNumbers) {
                      _context2.n = 2;
                      break;
                    }
                    return _context2.a(2, 0);
                  case 2:
                    _context2.n = 3;
                    return MBDiscid.calculateMbDiscid(entries);
                  case 3:
                    discid = _context2.v;
                    LOGGER.info("Computed discid :".concat(discid));
                    displayDiscHandler(mbTocNumbers, discid, discNumber);
                    void fetch("".concat(MB_BASE_URL, "/ws/2/discid/").concat(discid, "?cdstubs=no"), {
                      headers: {
                        Accept: 'application/json'
                      }
                    }).then(function (response) {
                      if (!response.ok) {
                        displayResultHandler(mbTocNumbers, discid, discNumber, false);
                        return null;
                      }
                      return response.json();
                    }).then(function (data) {
                      if (!data) {
                        return;
                      }
                      var existsInMusicbrainz = !('error' in data);
                      displayResultHandler(mbTocNumbers, discid, discNumber, existsInMusicbrainz);
                    }).catch(function () {
                      displayResultHandler(mbTocNumbers, discid, discNumber, false);
                    });
                  case 4:
                    return _context2.a(2);
                }
              }, _loop);
            });
            i = 0;
          case 1:
            if (!(i < discs.length)) {
              _context3.n = 4;
              break;
            }
            return _context3.d(_regeneratorValues(_loop()), 2);
          case 2:
            _ret = _context3.v;
            if (!(_ret === 0)) {
              _context3.n = 3;
              break;
            }
            return _context3.a(3, 3);
          case 3:
            i++;
            _context3.n = 1;
            break;
          case 4:
            return _context3.a(2);
        }
      }, _callee2);
    }));
    return _checkAndDisplayDiscs.apply(this, arguments);
  }
  function parseReleaseInfo(serverHost) {
    var _document$querySelect, _document$querySelect2, _match$, _match$2;
    var titleAndArtists = (_document$querySelect = (_document$querySelect2 = document.querySelector('#content div.thin h2')) === null || _document$querySelect2 === void 0 ? void 0 : _document$querySelect2.textContent) !== null && _document$querySelect !== void 0 ? _document$querySelect : '';
    var regularPattern = /(.*) - (.*) \[.*\] \[.*/;
    var orpheusPattern = /(.*) [-–] (.*) \[.*\]( \[.*)?/;
    var pattern = serverHost.match(/orpheus/) ? orpheusPattern : regularPattern;
    var match = titleAndArtists.match(pattern);
    return {
      artistName: (_match$ = match === null || match === void 0 ? void 0 : match[1]) !== null && _match$ !== void 0 ? _match$ : '',
      releaseName: (_match$2 = match === null || match === void 0 ? void 0 : match[2]) !== null && _match$2 !== void 0 ? _match$2 : ''
    };
  }
  function resolveLogAction(onclick, serverHost) {
    if (onclick.match(/show_logs/)) {
      if (serverHost.match(/orpheus/)) {
        LOGGER.debug('Orpheus');
        return 'viewlog';
      }
      if (serverHost.match(/redacted/)) {
        LOGGER.debug('RED');
        return 'loglist';
      }
      return null;
    }
    if (onclick.match(/get_log/)) {
      LOGGER.debug('LzTR');
      return 'log_ajax';
    }
    if (onclick.match(/show_log/)) {
      LOGGER.debug('NotWhat.CD');
      return 'viewlog';
    }
    return null;
  }
  function processLogLink(_ref2) {
    var _link$getAttribute;
    var link = _ref2.link,
      artistName = _ref2.artistName,
      releaseName = _ref2.releaseName,
      serverHost = _ref2.serverHost;
    if (!/View\s+Log/i.test(link.textContent)) {
      return;
    }
    LOGGER.debug('Log link', link);
    var onclick = (_link$getAttribute = link.getAttribute('onclick')) !== null && _link$getAttribute !== void 0 ? _link$getAttribute : '';
    var logAction = resolveLogAction(onclick, serverHost);
    if (!logAction) {
      return;
    }
    var targetContainer = link.closest('.linkbox');
    var torrentIdMatch = /(show_logs|get_log|show_log)\('(\d+)/.exec(onclick);
    var torrentId = torrentIdMatch === null || torrentIdMatch === void 0 ? void 0 : torrentIdMatch[2];
    if (!torrentId) {
      return;
    }
    var logUrl = "/torrents.php?action=".concat(logAction, "&torrentid=").concat(torrentId);
    LOGGER.info('Log URL: ', logUrl);
    LOGGER.debug('targetContainer: ', targetContainer);
    void fetch(logUrl).then(function (response) {
      return response.text();
    }).then(/*#__PURE__*/function () {
      var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(data) {
        var doc, pres, discs;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.n) {
            case 0:
              doc = new DOMParser().parseFromString(data, 'text/html');
              pres = doc.querySelectorAll('pre');
              LOGGER.debug('Log content', pres);
              _context.n = 1;
              return analyzeLogFiles(pres);
            case 1:
              discs = _context.v;
              LOGGER.debug('Number of disc found', discs.length);
              _context.n = 2;
              return checkAndDisplayDiscs({
                discs: discs,
                displayDiscHandler: function displayDiscHandler(_mbTocNumbers, _discid, discNumber) {
                  targetContainer === null || targetContainer === void 0 || targetContainer.insertAdjacentHTML('beforeend', "<br /><strong>".concat(discs.length > 1 ? "Disc ".concat(discNumber, ": ") : '', "MB DiscId: </strong><span id=\"").concat(torrentId, "_disc").concat(discNumber, "\"></span>"));
                },
                displayResultHandler: function displayResultHandler(mbTocNumbers, discid, discNumber, found) {
                  var _document$getElementB;
                  var url = computeAttachUrl(mbTocNumbers, artistName, releaseName);
                  var htmlElement = document.createElement('a');
                  htmlElement.href = url;
                  htmlElement.textContent = discid;
                  if (found) {
                    htmlElement.style.backgroundColor = '#d0f1d0';
                    htmlElement.style.color = 'rgb(30, 70, 32)';
                    htmlElement.style.border = '1px solid rgb(30, 70, 32)';
                    htmlElement.style.paddingInline = '3px';
                    htmlElement.style.borderRadius = '3px';
                  }
                  LOGGER.debug("#".concat(torrentId, "_disc").concat(discNumber));
                  (_document$getElementB = document.getElementById("".concat(torrentId, "_disc").concat(discNumber))) === null || _document$getElementB === void 0 || _document$getElementB.appendChild(htmlElement);
                }
              });
            case 2:
              return _context.a(2);
          }
        }, _callee);
      }));
      return function (_x2) {
        return _ref3.apply(this, arguments);
      };
    }()).catch(function (err) {
      LOGGER.error('Failed to fetch log', logUrl, err);
    });
  }
  function gazellePageHandler() {
    var serverHost = window.location.host;
    var _parseReleaseInfo = parseReleaseInfo(serverHost),
      artistName = _parseReleaseInfo.artistName,
      releaseName = _parseReleaseInfo.releaseName;
    LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);
    var _iterator = _createForOfIteratorHelper(document.querySelectorAll('tr.group_torrent')),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var torrentRow = _step.value;
        if (!torrentRow.id) {
          continue;
        }
        var torrentInfo = torrentRow.nextElementSibling;
        if (!torrentInfo) {
          continue;
        }
        var _iterator2 = _createForOfIteratorHelper(torrentInfo.querySelectorAll('a')),
          _step2;
        try {
          for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
            var link = _step2.value;
            processLogLink({
              link: link,
              artistName: artistName,
              releaseName: releaseName,
              serverHost: serverHost
            });
          }
        } catch (err) {
          _iterator2.e(err);
        } finally {
          _iterator2.f();
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  }
  function init() {
    if (!window.location.host.match(GAZELLE_HOST_PATTERN)) {
      return;
    }
    LOGGER.info('Gazelle site detected');
    gazellePageHandler();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
