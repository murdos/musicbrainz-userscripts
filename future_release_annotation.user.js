// ==UserScript==
// @name         MusicBrainz: Future release annotation
// @description  Adds an annotation note when importing a release with a future release date on the release editor. The annotation note serves as a reminder to verify the release info when it is released.
// @version      2026.06.23.1
// @author       Raman Sinclair
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/future_release_annotation.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/future_release_annotation.user.js
// @match        https://musicbrainz.org/release/add*
// @match        https://beta.musicbrainz.org/release/add*
// @match        https://eu.musicbrainz.org/release/add*
// @match        https://test.musicbrainz.org/release/add*
// @grant        none
// @run-at       document-start
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
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

  function parsePart(value) {
    if (value === '') {
      return null;
    }
    var parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }
  /** True when a MB partial date is strictly after today; false when unset or not in the future. */
  function isEventDateInFuture(_ref) {
    var event = _ref.event,
      today = _ref.today;
    var year = event.year,
      month = event.month,
      day = event.day;
    var y = parsePart(year);
    if (y === null) {
      return false;
    }
    var todayYear = today.getFullYear();
    if (y > todayYear) {
      return true;
    }
    if (y < todayYear) {
      return false;
    }
    var m = parsePart(month);
    if (m === null) {
      return false;
    }
    var todayMonth = today.getMonth() + 1;
    if (m > todayMonth) {
      return true;
    }
    if (m < todayMonth) {
      return false;
    }
    var d = parsePart(day);
    if (d === null) {
      return false;
    }
    return d > today.getDate();
  }

  /** True when every dated release event is strictly after today. */
  function isFutureRelease(events) {
    var fullyDatedEvents = events.filter(function (event) {
      return event.year !== '' && event.month !== '' && event.day !== '';
    });
    if (fullyDatedEvents.length === 0) {
      return false;
    }
    var today = new Date();
    return fullyDatedEvents.every(function (event) {
      return isEventDateInFuture({
        event: event,
        today: today
      });
    });
  }

  var LOGGER = new Logger('future_release_annotation', LogLevel.INFO);
  var ANNOTATION_NOTE = 'Note: this release was imported before the official release, after it is released please verify all info and then remove this note.';
  var POLL_INTERVAL_MS = 500;
  var MB_WAIT_INTERVAL_MS = 200;
  var MAX_POLLS = 20;
  function isReleaseAddPage() {
    return window.location.pathname === '/release/add';
  }
  function getRelease() {
    var _window$MB;
    var release = (_window$MB = window.MB) === null || _window$MB === void 0 ? void 0 : _window$MB.releaseEditor.rootField.release();
    return release !== null && release !== void 0 ? release : null;
  }
  function getReleaseEventDates(events) {
    return events.map(function (event) {
      return {
        year: event.date.year(),
        month: event.date.month(),
        day: event.date.day()
      };
    });
  }
  function prependAnnotationNote(currentAnnotation) {
    if (currentAnnotation.includes(ANNOTATION_NOTE)) {
      return currentAnnotation;
    }
    LOGGER.info('Updated annotation note');
    var trimmed = currentAnnotation.trim();
    return trimmed ? "".concat(ANNOTATION_NOTE, "\n\n").concat(trimmed) : ANNOTATION_NOTE;
  }
  function buildStateFingerprint(release) {
    var dates = getReleaseEventDates(release.events());
    return JSON.stringify({
      annotation: release.annotation(),
      dates: dates
    });
  }
  function updateAnnotationIfNeeded() {
    if (!isReleaseAddPage()) {
      LOGGER.debug('Not on release add page, skipping');
      return;
    }
    var release = getRelease();
    if (!release) {
      LOGGER.debug('No release found, skipping');
      return;
    }
    var eventDates = getReleaseEventDates(release.events());
    if (!isFutureRelease(eventDates)) {
      LOGGER.debug('Release event dates are not in the future, skipping');
      return;
    }
    var currentAnnotation = release.annotation();
    var updatedAnnotation = prependAnnotationNote(currentAnnotation);
    if (updatedAnnotation !== currentAnnotation) {
      release.annotation(updatedAnnotation);
      LOGGER.debug('Added future release annotation note');
    }
  }
  function waitForReleaseEditor() {
    return new Promise(function (resolve) {
      var attempts = 0;
      var _check = function check() {
        LOGGER.debug('Checking for release editor');
        if (getRelease()) {
          LOGGER.debug('Release editor found');
          resolve(true);
          return;
        }
        attempts++;
        if (attempts >= MAX_POLLS) {
          LOGGER.debug('Release editor not found after max polls, giving up');
          resolve(false);
          return;
        }
        window.setTimeout(_check, MB_WAIT_INTERVAL_MS);
      };
      _check();
    });
  }
  function startWatching() {
    var lastFingerprint = '';
    window.setInterval(function () {
      if (!isReleaseAddPage()) {
        return;
      }
      var release = getRelease();
      if (!release) {
        return;
      }
      var fingerprint = buildStateFingerprint(release);
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        updateAnnotationIfNeeded();
      }
    }, POLL_INTERVAL_MS);
  }
  function init() {
    return _init.apply(this, arguments);
  }
  function _init() {
    _init = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
      var releaseEditorFound;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            LOGGER.debug('Initializing future release annotation');
            if (isReleaseAddPage()) {
              _context.n = 1;
              break;
            }
            return _context.a(2);
          case 1:
            LOGGER.debug('Waiting for release editor');
            _context.n = 2;
            return waitForReleaseEditor();
          case 2:
            releaseEditorFound = _context.v;
            if (releaseEditorFound) {
              LOGGER.debug('Updating annotation if needed');
              updateAnnotationIfNeeded();
            }
            LOGGER.debug('Starting to watch for changes');
            startWatching();
          case 3:
            return _context.a(2);
        }
      }, _callee);
    }));
    return _init.apply(this, arguments);
  }
  void init();

})();
