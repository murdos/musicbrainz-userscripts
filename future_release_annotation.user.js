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

    let LogLevel = /*#__PURE__*/function (LogLevel) {
      LogLevel["DEBUG"] = "debug";
      LogLevel["INFO"] = "info";
      LogLevel["ERROR"] = "error";
      return LogLevel;
    }({});
    class Logger {
      LOG_LEVEL = LogLevel.INFO;
      scriptName;
      constructor(scriptName, level = LogLevel.ERROR) {
        this.scriptName = scriptName;
        this.LOG_LEVEL = level;
      }
      debug(...args) {
        this._log(LogLevel.DEBUG, args);
      }
      info(...args) {
        this._log(LogLevel.INFO, args);
      }
      error(...args) {
        this._log(LogLevel.ERROR, args);
      }
      setLevel(level) {
        this.LOG_LEVEL = level;
      }
      _log(level, args) {
        if (level < this.LOG_LEVEL) {
          return;
        }
        let logMethod = console.log;
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
          logMethod.apply(this, [`[${this.scriptName}]`, ...args]);
        } catch {
          // do nothing
        }
      }
    }

    function parsePart(value) {
      if (value === '') {
        return null;
      }
      const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
      if (Number.isNaN(parsed) || parsed <= 0) {
        return null;
      }
      return parsed;
    }
    /** True when a MB partial date is strictly after today; false when unset or not in the future. */
    function isEventDateInFuture({
      event,
      today
    }) {
      const {
        year,
        month,
        day
      } = event;
      const y = parsePart(year);
      if (y === null) {
        return false;
      }
      const todayYear = today.getFullYear();
      if (y > todayYear) {
        return true;
      }
      if (y < todayYear) {
        return false;
      }
      const m = parsePart(month);
      if (m === null) {
        return false;
      }
      const todayMonth = today.getMonth() + 1;
      if (m > todayMonth) {
        return true;
      }
      if (m < todayMonth) {
        return false;
      }
      const d = parsePart(day);
      if (d === null) {
        return false;
      }
      return d > today.getDate();
    }

    /** True when every dated release event is strictly after today. */
    function isFutureRelease(events) {
      const fullyDatedEvents = events.filter(event => event.year !== '' && event.month !== '' && event.day !== '');
      if (fullyDatedEvents.length === 0) {
        return false;
      }
      const today = new Date();
      return fullyDatedEvents.every(event => isEventDateInFuture({
        event,
        today
      }));
    }

    const LOGGER = new Logger('future_release_annotation', LogLevel.INFO);
    const ANNOTATION_NOTE = 'Note: this release was imported before the official release, after it is released please verify all info and then remove this note.';
    const POLL_INTERVAL_MS = 500;
    const MB_WAIT_INTERVAL_MS = 200;
    const MAX_POLLS = 20;
    function isReleaseAddPage() {
      return window.location.pathname === '/release/add';
    }
    function getRelease() {
      const release = window.MB?.releaseEditor.rootField.release();
      return release ?? null;
    }
    function getReleaseEventDates(events) {
      return events.map(event => ({
        year: event.date.year(),
        month: event.date.month(),
        day: event.date.day()
      }));
    }
    function prependAnnotationNote(currentAnnotation) {
      if (currentAnnotation.includes(ANNOTATION_NOTE)) {
        return currentAnnotation;
      }
      LOGGER.info('Updated annotation note');
      const trimmed = currentAnnotation.trim();
      return trimmed ? `${ANNOTATION_NOTE}\n\n${trimmed}` : ANNOTATION_NOTE;
    }
    function buildStateFingerprint(release) {
      const dates = getReleaseEventDates(release.events());
      return JSON.stringify({
        annotation: release.annotation(),
        dates
      });
    }
    function updateAnnotationIfNeeded() {
      if (!isReleaseAddPage()) {
        LOGGER.debug('Not on release add page, skipping');
        return;
      }
      const release = getRelease();
      if (!release) {
        LOGGER.debug('No release found, skipping');
        return;
      }
      const eventDates = getReleaseEventDates(release.events());
      if (!isFutureRelease(eventDates)) {
        LOGGER.debug('Release event dates are not in the future, skipping');
        return;
      }
      const currentAnnotation = release.annotation();
      const updatedAnnotation = prependAnnotationNote(currentAnnotation);
      if (updatedAnnotation !== currentAnnotation) {
        release.annotation(updatedAnnotation);
        LOGGER.debug('Added future release annotation note');
      }
    }
    function waitForReleaseEditor() {
      return new Promise(resolve => {
        let attempts = 0;
        const check = () => {
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
          window.setTimeout(check, MB_WAIT_INTERVAL_MS);
        };
        check();
      });
    }
    function startWatching() {
      let lastFingerprint = '';
      window.setInterval(() => {
        if (!isReleaseAddPage()) {
          return;
        }
        const release = getRelease();
        if (!release) {
          return;
        }
        const fingerprint = buildStateFingerprint(release);
        if (fingerprint !== lastFingerprint) {
          lastFingerprint = fingerprint;
          updateAnnotationIfNeeded();
        }
      }, POLL_INTERVAL_MS);
    }
    async function init() {
      LOGGER.debug('Initializing future release annotation');
      if (!isReleaseAddPage()) {
        return;
      }
      LOGGER.debug('Waiting for release editor');
      const releaseEditorFound = await waitForReleaseEditor();
      if (releaseEditorFound) {
        LOGGER.debug('Updating annotation if needed');
        updateAnnotationIfNeeded();
      }
      LOGGER.debug('Starting to watch for changes');
      startWatching();
    }
    void init();

})();
