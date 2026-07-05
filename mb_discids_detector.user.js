// ==UserScript==
// @name         Musicbrainz DiscIds Detector
// @description  Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @version      2026.07.05.10
// @author       [unknown]
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mb_discids_detector.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mb_discids_detector.user.js
// @match        https://orpheus.network/torrents.php?id=*
// @match        https://redacted.sh/torrents.php?id=*
// @match        https://lztr.me/torrents.php?id=*
// @match        https://notwhat.cd/torrents.php?id=*
// @match        https://rutracker.me/forum/viewtopic.php?t=*
// @match        https://rutracker.org/forum/viewtopic.php?t=*
// @match        https://new-team.org/viewtopic.php?t=*
// @match        https://nnmclub.to/forum/viewtopic.php?t=*
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
  function _taggedTemplateLiteral(e, t) {
    return t || (t = e.slice(0)), Object.freeze(Object.defineProperties(e, {
      raw: {
        value: Object.freeze(t)
      }
    }));
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

  var MB_BASE_URL = 'https://musicbrainz.org';
  var MB_API_URL = function MB_API_URL(discid) {
    return "".concat(MB_BASE_URL, "/ws/2/discid/").concat(discid, "?cdstubs=no");
  };
  var GAZELLE_HOST_PATTERN = /orpheus\.network|redacted\.sh|lztr\.me|notwhat\.cd/;
  var BB_FORUM_HOST_PATTERN = /rutracker\.(me|org)|new-team\.org|nnmclub\.to/;
  var LOGGER = new Logger('mb_discids_detector', LogLevel.INFO);

  function getElementTextWithLineBreaks(element) {
    var lines = [];
    var currentLine = '';
    var flushLine = function flushLine() {
      lines.push(currentLine);
      currentLine = '';
    };
    var _walk = function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var _node$textContent;
        currentLine += (_node$textContent = node.textContent) !== null && _node$textContent !== void 0 ? _node$textContent : '';
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      var tagName = node.tagName.toUpperCase();
      if (tagName === 'BR') {
        flushLine();
        return;
      }
      var _iterator = _createForOfIteratorHelper(node.childNodes),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var child = _step.value;
          _walk(child);
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
    };
    _walk(element);
    if (currentLine.length > 0 || lines.length === 0) {
      lines.push(currentLine);
    }
    return lines.join('\n');
  }

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
      var discs, _iterator, _step, logFile, logText, discsInLog, seenDiscids, uniqueDiscs, _i, _discs, disc, discid;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            discs = [];
            _iterator = _createForOfIteratorHelper(logFiles);
            try {
              for (_iterator.s(); !(_step = _iterator.n()).done;) {
                logFile = _step.value;
                logText = getElementTextWithLineBreaks(logFile);
                discsInLog = MBDiscid.logInputToEntries(logText);
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

  function computeAttachUrl(mbTocNumbers, mbArtistName, mbReleaseName) {
    var mbURL = new URL("".concat(MB_BASE_URL, "/cdtoc/attach"));
    mbURL.searchParams.set('toc', mbTocNumbers.join(' '));
    mbURL.searchParams.set('artist-name', mbArtistName);
    mbURL.searchParams.set('release-name', mbReleaseName);
    return mbURL.toString();
  }
  function createDiscIdLink(discid, mbTocNumbers, artistName, releaseName, found) {
    var htmlElement = document.createElement('a');
    htmlElement.href = computeAttachUrl(mbTocNumbers, artistName, releaseName);
    htmlElement.textContent = discid;
    if (found) {
      htmlElement.style.backgroundColor = '#d0f1d0';
      htmlElement.style.color = 'rgb(30, 70, 32)';
      htmlElement.style.border = '1px solid rgb(30, 70, 32)';
      htmlElement.style.paddingInline = '3px';
      htmlElement.style.borderRadius = '3px';
    }
    return htmlElement;
  }
  var checkAndDisplayDiscs = /*#__PURE__*/function () {
    var _checkAndDisplayDiscs = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(_ref) {
      var artistName, releaseName, discs, displayDiscHandler, getElementIdForResultDisplay, i, _document$getElementB, entries, discNumber, mbTocNumbers, discid, found, response, data, htmlElement, _t;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            artistName = _ref.artistName, releaseName = _ref.releaseName, discs = _ref.discs, displayDiscHandler = _ref.displayDiscHandler, getElementIdForResultDisplay = _ref.getElementIdForResultDisplay;
            i = 0;
          case 1:
            if (!(i < discs.length)) {
              _context.n = 12;
              break;
            }
            entries = discs[i];
            if (!(!entries || entries.length === 0)) {
              _context.n = 2;
              break;
            }
            return _context.a(3, 11);
          case 2:
            discNumber = i + 1;
            mbTocNumbers = MBDiscid.calculateMbTocNumbers(entries);
            if (mbTocNumbers) {
              _context.n = 3;
              break;
            }
            return _context.a(3, 11);
          case 3:
            _context.n = 4;
            return MBDiscid.calculateMbDiscid(entries);
          case 4:
            discid = _context.v;
            LOGGER.info("Computed discid :".concat(discid));
            displayDiscHandler(mbTocNumbers, discid, discNumber);
            found = false;
            _context.p = 5;
            _context.n = 6;
            return fetch(MB_API_URL(discid), {
              headers: {
                Accept: 'application/json'
              }
            });
          case 6:
            response = _context.v;
            if (!response.ok) {
              _context.n = 8;
              break;
            }
            _context.n = 7;
            return response.json();
          case 7:
            data = _context.v;
            if (!('error' in data)) {
              found = true;
            }
          case 8:
            _context.n = 10;
            break;
          case 9:
            _context.p = 9;
            _t = _context.v;
            LOGGER.error("Failed to check if discid ".concat(discid, " is in MusicBrainz database"), _t);
          case 10:
            // Display the result
            htmlElement = createDiscIdLink(discid, mbTocNumbers, artistName, releaseName, found);
            LOGGER.debug("#".concat(getElementIdForResultDisplay(discNumber)));
            (_document$getElementB = document.getElementById(getElementIdForResultDisplay(discNumber))) === null || _document$getElementB === void 0 || _document$getElementB.appendChild(htmlElement);
          case 11:
            i++;
            _context.n = 1;
            break;
          case 12:
            return _context.a(2);
        }
      }, _callee, null, [[5, 9]]);
    }));
    function checkAndDisplayDiscs(_x) {
      return _checkAndDisplayDiscs.apply(this, arguments);
    }
    return checkAndDisplayDiscs;
  }();

  var _templateObject, _templateObject2, _templateObject3, _templateObject4, _templateObject5, _templateObject6, _templateObject7, _templateObject8, _templateObject9;
  var EAC_LOG_HEADER_PATTERN = String.raw(_templateObject || (_templateObject = _taggedTemplateLiteral(["(?:EAC extraction logfile|EAC Auslese-Logdatei|\u041E\u0442\u0447(?:\u0435|\u0451)\u0442 EAC \u043E\u0431 \u0438\u0437\u0432\u043B\u0435\u0447\u0435\u043D\u0438\u0438|\u0417\u0432\u0456\u0442 EAC \u043F\u0440\u043E \u0432\u0438\u0434\u043E\u0431\u0443\u0432\u0430\u043D\u043D\u044F)"])));
  var EAC_LOG_PATTERN = new RegExp(EAC_LOG_HEADER_PATTERN, 'i');
  var EAC_LOG_ARTIST_RELEASE_PATTERN = new RegExp(String.raw(_templateObject2 || (_templateObject2 = _taggedTemplateLiteral(["", "[^\n]*\ns*(.+?)s*/s*(.+?)(?:\n|$)"], ["", "[^\\n]*\\n\\s*(.+?)\\s*\\/\\s*(.+?)(?:\\n|$)"])), EAC_LOG_HEADER_PATTERN), 'i');
  var parseArtistReleaseFromEacLog = function parseArtistReleaseFromEacLog(logText) {
    var _match$1$trim, _match$, _match$2$trim, _match$2;
    var match = EAC_LOG_ARTIST_RELEASE_PATTERN.exec(logText);
    if (!match) {
      return null;
    }
    var artistName = (_match$1$trim = (_match$ = match[1]) === null || _match$ === void 0 ? void 0 : _match$.trim()) !== null && _match$1$trim !== void 0 ? _match$1$trim : '';
    var releaseName = (_match$2$trim = (_match$2 = match[2]) === null || _match$2 === void 0 ? void 0 : _match$2.trim()) !== null && _match$2$trim !== void 0 ? _match$2$trim : '';
    if (artistName.toLowerCase() === 'unknown artist' || releaseName.toLowerCase() === 'unknown title') {
      artistName = '';
    }
    if (releaseName.toLowerCase() === 'unknown title' || releaseName.toLowerCase() === 'неизвестное название') {
      releaseName = '';
    }
    return {
      artistName: artistName,
      releaseName: releaseName
    };
  };
  var LABEL_PACK_PATTERN = /(?:Sub)*Label(?:: | - | Pack)/i;
  var COLLECTION_PATTERN_V1 = /^(.+?)(?:\s+\([^)]*\))?\s+[-/]\s+(?:Official\s+|\d+\s+Releases\s+|Официальная\s+)*(?:Discography|Дискография)/i;
  var COLLECTION_PATTERN_V2 = /^(.+?)(?:\s+\([^)]*\))?\s+[-/]\s+(?:Официальная\s+|Official\s+|Official\sSoundtrack\s+)*(?:Collection|Коллекция)/i;
  var YEAR_PATTERN = String.raw(_templateObject3 || (_templateObject3 = _taggedTemplateLiteral(["(?:19|20)d{2}|197?"], ["(?:19|20)\\d{2}|197\\?"])));
  var YEAR_RANGE_PATTERN = String.raw(_templateObject4 || (_templateObject4 = _taggedTemplateLiteral(["(?:", ")s*-s*(?:", ")"], ["(?:", ")\\s*-\\s*(?:", ")"])), YEAR_PATTERN, YEAR_PATTERN);

  // Artist - Release - 2026
  // Artist - Release - 1957 (1999 Japan Edition)
  var ARTIST_RELEASE_DASH_YEAR_PATTERN = new RegExp(String.raw(_templateObject5 || (_templateObject5 = _taggedTemplateLiteral(["^(.+?)s+-s+(.+?)s+-s+(", ")(?:\b|[,s(])"], ["^(.+?)\\s+-\\s+(.+?)\\s+-\\s+(", ")(?:\\b|[,\\s(])"])), YEAR_PATTERN), 'i');

  // Artist - Release - 1982 - 2026
  var ARTIST_RELEASE_DASH_YEAR_RANGE_PATTERN = new RegExp(String.raw(_templateObject6 || (_templateObject6 = _taggedTemplateLiteral(["^(.+?)s+-s+(.+?)s+-s+(", ")(?:\b|[,s(])"], ["^(.+?)\\s+-\\s+(.+?)\\s+-\\s+(", ")(?:\\b|[,\\s(])"])), YEAR_RANGE_PATTERN), 'i');

  // Artist - Release (2024)
  var ARTIST_RELEASE_PAREN_YEAR_PATTERN = new RegExp(String.raw(_templateObject7 || (_templateObject7 = _taggedTemplateLiteral(["^(.+?)s+-s+(.+?)s+((", "))(?:\b|[,s[])"], ["^(.+?)\\s+-\\s+(.+?)\\s+\\((", ")\\)(?:\\b|[,\\s\\[])"])), YEAR_PATTERN), 'i');

  // Artist - Release, 2000-2016
  // Artist - Release, 1963 -2007
  var ARTIST_RELEASE_COMMA_YEAR_RANGE_PATTERN = new RegExp(String.raw(_templateObject8 || (_templateObject8 = _taggedTemplateLiteral(["^(.+?)s+-s+(.+?),s*(", ")(?:\b|[,s[])"], ["^(.+?)\\s+-\\s+(.+?),\\s*(", ")(?:\\b|[,\\s\\[])"])), YEAR_RANGE_PATTERN), 'i');

  // Artist - Release, 2025
  var ARTIST_RELEASE_COMMA_YEAR_PATTERN = new RegExp(String.raw(_templateObject9 || (_templateObject9 = _taggedTemplateLiteral(["^(.+?)s+-s+(.+?),s*(", ")(?:\b|[,s[])"], ["^(.+?)\\s+-\\s+(.+?),\\s*(", ")(?:\\b|[,\\s\\[])"])), YEAR_PATTERN), 'i');

  // Artist - Release [FLAC|...]
  var ARTIST_RELEASE_BEFORE_FORMAT_BLOCK_PATTERN = /^(.+?)\s+-\s+(.+?)\s+\[[^\]]+\]/i;

  // Last-resort fallback: Artist - Release
  var ARTIST_RELEASE_FALLBACK_PATTERN = /^(.+?)\s+-\s+(.+?)(?:,|\[|$)/i;
  var normalizeForumTopicTitle = function normalizeForumTopicTitle(title) {
    return title.replace(/[–—-]/g, '-') // normalize dash variants
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim().replace(/^(?:\([^)]+\)\s*)+/, '') // strip leading genre parentheses: (Rock, Pop)
    .replace(/^(?:\[[^\]]+\]\s*)+/, '') // strip leading format tags: [CD], [24/192], [LP/MB/DAT]
    .trim();
  };
  var cleanParsedValue = function cleanParsedValue(value) {
    return value.replace(/\s+/g, ' ').replace(/\s+[-/]\s*$/, '').trim();
  };
  var tryMatchArtistRelease = function tryMatchArtistRelease(title, patterns) {
    var _iterator = _createForOfIteratorHelper(patterns),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var _match$3, _match$4;
        var pattern = _step.value;
        var match = title.match(pattern);
        if (!match) {
          continue;
        }
        var artistName = cleanParsedValue((_match$3 = match[1]) !== null && _match$3 !== void 0 ? _match$3 : '');
        var releaseName = cleanParsedValue((_match$4 = match[2]) !== null && _match$4 !== void 0 ? _match$4 : '');
        if (artistName || releaseName) {
          return {
            artistName: artistName,
            releaseName: releaseName
          };
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    return null;
  };
  var parseArtistReleaseFromForumPost = function parseArtistReleaseFromForumPost() {
    var _pageHeader$textConte;
    var pageHeader = document.querySelector('h1.maintitle a, h1 a.maintitle');
    var pageTitle = document.title.replace(/\s*(::|\u2022)[^]*$/, '');
    var title = normalizeForumTopicTitle((_pageHeader$textConte = pageHeader === null || pageHeader === void 0 ? void 0 : pageHeader.textContent) !== null && _pageHeader$textConte !== void 0 ? _pageHeader$textConte : pageTitle);

    // Label packs are not artist releases.
    var isLabelPack = LABEL_PACK_PATTERN.test(title);
    if (isLabelPack) {
      // Abandon parsing since we can't reliably determine the artist and release name
      return {
        artistName: '',
        releaseName: ''
      };
    }
    var isCollectionV1 = title.match(COLLECTION_PATTERN_V1);
    var isCollectionV2 = title.match(COLLECTION_PATTERN_V2);
    if (isCollectionV1 || isCollectionV2) {
      var _ref, _isCollectionV1$1$tri, _isCollectionV1$, _isCollectionV2$;
      var artistName = (_ref = (_isCollectionV1$1$tri = isCollectionV1 === null || isCollectionV1 === void 0 || (_isCollectionV1$ = isCollectionV1[1]) === null || _isCollectionV1$ === void 0 ? void 0 : _isCollectionV1$.trim()) !== null && _isCollectionV1$1$tri !== void 0 ? _isCollectionV1$1$tri : isCollectionV2 === null || isCollectionV2 === void 0 || (_isCollectionV2$ = isCollectionV2[1]) === null || _isCollectionV2$ === void 0 ? void 0 : _isCollectionV2$.trim()) !== null && _ref !== void 0 ? _ref : '';
      return {
        artistName: artistName,
        releaseName: ''
      };
    }
    var parsed = tryMatchArtistRelease(title, [ARTIST_RELEASE_DASH_YEAR_RANGE_PATTERN, ARTIST_RELEASE_DASH_YEAR_PATTERN, ARTIST_RELEASE_PAREN_YEAR_PATTERN, ARTIST_RELEASE_COMMA_YEAR_RANGE_PATTERN, ARTIST_RELEASE_COMMA_YEAR_PATTERN, ARTIST_RELEASE_BEFORE_FORMAT_BLOCK_PATTERN, ARTIST_RELEASE_FALLBACK_PATTERN]);
    return parsed !== null && parsed !== void 0 ? parsed : {
      artistName: '',
      releaseName: ''
    };
  };

  var processInlineEacLog = /*#__PURE__*/function () {
    var _processInlineEacLog = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(_ref) {
      var pre, logIndex, fallbackArtist, fallbackRelease, logText, fromLog, artistName, releaseName, elementPrefix, discs, targetContainer;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            pre = _ref.pre, logIndex = _ref.logIndex, fallbackArtist = _ref.fallbackArtist, fallbackRelease = _ref.fallbackRelease;
            logText = getElementTextWithLineBreaks(pre);
            fromLog = parseArtistReleaseFromEacLog(logText);
            artistName = (fromLog === null || fromLog === void 0 ? void 0 : fromLog.artistName) || fallbackArtist;
            releaseName = (fromLog === null || fromLog === void 0 ? void 0 : fromLog.releaseName) || fallbackRelease;
            elementPrefix = "mb_discid_".concat(logIndex);
            _context.n = 1;
            return analyzeLogFiles([pre]);
          case 1:
            discs = _context.v;
            LOGGER.debug('Number of disc found in inline log', discs.length);
            if (!(discs.length === 0)) {
              _context.n = 2;
              break;
            }
            return _context.a(2);
          case 2:
            pre.insertAdjacentHTML('afterend', "<div class=\"mb-discids-detector\" style=\"margin-top: 0.5em;\"></div>");
            targetContainer = pre.nextElementSibling;
            _context.n = 3;
            return checkAndDisplayDiscs({
              artistName: artistName,
              releaseName: releaseName,
              discs: discs,
              displayDiscHandler: function displayDiscHandler(_mbTocNumbers, _discid, discNumber) {
                targetContainer === null || targetContainer === void 0 || targetContainer.insertAdjacentHTML('beforeend', "<div><strong>".concat(discs.length > 1 ? "Disc ".concat(discNumber, ": ") : '', "MB DiscId: </strong><span id=\"").concat(elementPrefix, "_disc").concat(discNumber, "\"></span></div>"));
              },
              getElementIdForResultDisplay: function getElementIdForResultDisplay(discNumber) {
                return "".concat(elementPrefix, "_disc").concat(discNumber);
              }
            });
          case 3:
            return _context.a(2);
        }
      }, _callee);
    }));
    function processInlineEacLog(_x) {
      return _processInlineEacLog.apply(this, arguments);
    }
    return processInlineEacLog;
  }();
  var bbForumPageHandler = /*#__PURE__*/function () {
    var _bbForumPageHandler = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
      var _parseArtistReleaseFr, artistName, releaseName, eacLogs, i, pre;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            _parseArtistReleaseFr = parseArtistReleaseFromForumPost(), artistName = _parseArtistReleaseFr.artistName, releaseName = _parseArtistReleaseFr.releaseName;
            LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);
            eacLogs = _toConsumableArray(document.querySelectorAll('pre')).filter(function (preElement) {
              return EAC_LOG_PATTERN.test(preElement.textContent);
            });
            LOGGER.info("Found ".concat(eacLogs.length, " inline EAC log(s)"));
            i = 0;
          case 1:
            if (!(i < eacLogs.length)) {
              _context2.n = 4;
              break;
            }
            pre = eacLogs[i];
            if (pre) {
              _context2.n = 2;
              break;
            }
            return _context2.a(3, 3);
          case 2:
            _context2.n = 3;
            return processInlineEacLog({
              pre: pre,
              logIndex: i,
              fallbackArtist: artistName,
              fallbackRelease: releaseName
            });
          case 3:
            i++;
            _context2.n = 1;
            break;
          case 4:
            return _context2.a(2);
        }
      }, _callee2);
    }));
    function bbForumPageHandler() {
      return _bbForumPageHandler.apply(this, arguments);
    }
    return bbForumPageHandler;
  }();

  var resolveLogAction = function resolveLogAction(_ref) {
    var onclick = _ref.onclick,
      serverHost = _ref.serverHost;
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
  };
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
    var logAction = resolveLogAction({
      onclick: onclick,
      serverHost: serverHost
    });
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
                artistName: artistName,
                releaseName: releaseName,
                discs: discs,
                displayDiscHandler: function displayDiscHandler(_mbTocNumbers, _discid, discNumber) {
                  targetContainer === null || targetContainer === void 0 || targetContainer.insertAdjacentHTML('beforeend', "<br /><strong>".concat(discs.length > 1 ? "Disc ".concat(discNumber, ": ") : '', "MB DiscId: </strong><span id=\"").concat(torrentId, "_disc").concat(discNumber, "\"></span>"));
                },
                getElementIdForResultDisplay: function getElementIdForResultDisplay(discNumber) {
                  return "".concat(torrentId, "_disc").concat(discNumber);
                }
              });
            case 2:
              return _context.a(2);
          }
        }, _callee);
      }));
      return function (_x) {
        return _ref3.apply(this, arguments);
      };
    }()).catch(function (err) {
      LOGGER.error('Failed to fetch log', logUrl, err);
    });
  }
  var parseReleaseInfo = function parseReleaseInfo(serverHost) {
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
  };
  var gazellePageHandler = function gazellePageHandler() {
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
  };

  function init() {
    var serverHost = window.location.host;
    if (serverHost.match(GAZELLE_HOST_PATTERN)) {
      LOGGER.info('Gazelle site detected');
      gazellePageHandler();
      return;
    }
    if (serverHost.match(BB_FORUM_HOST_PATTERN)) {
      LOGGER.info('BB Forum site detected');
      void bbForumPageHandler();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
