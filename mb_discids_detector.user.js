// ==UserScript==
// @name         Musicbrainz DiscIds Detector
// @description  Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @version      2026.07.17.2
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
// @match        https://new-team.org/viewtopic.php*
// @match        https://nnmclub.to/forum/viewtopic.php?t=*
// @grant        none
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

    const MB_BASE_URL = 'https://musicbrainz.org';
    const MB_API_URL = discid => `${MB_BASE_URL}/ws/2/discid/${discid}?cdstubs=no`;
    const GAZELLE_HOST_PATTERN = /orpheus\.network|redacted\.sh|lztr\.me|notwhat\.cd/;
    const BB_FORUM_HOST_PATTERN = /rutracker\.(me|org)|new-team\.org|nnmclub\.to/;
    const LOGGER = new Logger('mb_discids_detector', LogLevel.INFO);

    function getElementTextWithLineBreaks(element) {
      const lines = [];
      let currentLine = '';
      const flushLine = () => {
        lines.push(currentLine);
        currentLine = '';
      };
      const walk = node => {
        if (node.nodeType === Node.TEXT_NODE) {
          currentLine += node.textContent ?? '';
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        const tagName = node.tagName.toUpperCase();
        if (tagName === 'BR') {
          flushLine();
          return;
        }
        for (const child of node.childNodes) {
          walk(child);
        }
      };
      walk(element);
      if (currentLine.length > 0 || lines.length === 0) {
        lines.push(currentLine);
      }
      return lines.join('\n');
    }

    // MBDiscid code comes from https://gist.github.com/kolen/766668
    // Copyright 2010, kolen
    // Released under the MIT License

    const PREGAP = 150;
    const DATA_TRACK_GAP = 11400;
    const TOC_ENTRY_MATCHER = new RegExp('^\\s*' + '(\\d+)' +
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
      return {
        trackNumber: match[1] ?? '',
        timeStart: match[2] ?? '',
        timeLength: match[3] ?? '',
        startSector: match[4] ?? '',
        endSector: match[5] ?? ''
      };
    }
    async function sha1MusicBrainzDiscId(message) {
      const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
      const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
      return b64.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-');
    }
    function getLayoutType(entries) {
      let type = 'standard';
      for (let i = 0; i < entries.length - 1; i++) {
        const current = entries[i];
        const next = entries[i + 1];
        if (!current || !next) {
          continue;
        }
        const gap = parseInt(next.startSector, 10) - parseInt(current.endSector, 10) - 1;
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
      const discs = [];
      let entries = [];
      for (const value of text.split('\n')) {
        const match = TOC_ENTRY_MATCHER.exec(value);
        if (!match) {
          continue;
        }
        if (parseInt(match[1] ?? '0', 10) === 1) {
          if (entries.length > 0) {
            discs.push(entries);
          }
          entries = [];
        }
        entries.push(parseTocEntry(match));
      }
      if (entries.length > 0) {
        discs.push(entries);
      }
      return discs.map(discEntries => {
        const layoutType = getLayoutType(discEntries);
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
      const lastEntry = entries[entries.length - 1];
      if (!lastEntry) {
        return null;
      }
      const leadoutOffset = parseInt(lastEntry.endSector, 10) + PREGAP + 1;
      const offsets = entries.map(entry => parseInt(entry.startSector, 10) + PREGAP);
      return [1, entries.length, leadoutOffset, ...offsets];
    }
    function hexLeftPad(input, totalChars) {
      let hex = parseInt(String(input), 10).toString(16).toUpperCase();
      const padWith = '0';
      while (hex.length < totalChars) {
        hex = `${padWith}${hex}`;
      }
      if (hex.length > totalChars) {
        // If padWith was a multiple character string and num was overpadded
        hex = hex.substring(hex.length - totalChars);
      }
      return hex;
    }
    async function calculateMbDiscid(entries) {
      const mbTocNumbers = calculateMbTocNumbers(entries);
      if (!mbTocNumbers) {
        throw new Error('Cannot calculate disc ID from empty TOC entries');
      }
      let message = '';
      const firstTrack = mbTocNumbers[0] ?? 0;
      const lastTrack = mbTocNumbers[1] ?? 0;
      const leadoutOffset = mbTocNumbers[2] ?? 0;
      message += hexLeftPad(firstTrack, 2);
      message += hexLeftPad(lastTrack, 2);
      message += hexLeftPad(leadoutOffset, 8);
      for (let i = 0; i < 99; i++) {
        const offset = i + 3 < mbTocNumbers.length ? mbTocNumbers[i + 3] ?? 0 : 0;
        message += hexLeftPad(offset, 8);
      }
      return sha1MusicBrainzDiscId(message);
    }
    const MBDiscid = {
      calculateMbDiscid,
      calculateMbTocNumbers,
      logInputToEntries
    };

    async function analyzeLogFiles(logFiles) {
      const discs = [];
      for (const logFile of logFiles) {
        const logText = getElementTextWithLineBreaks(logFile);
        const discsInLog = MBDiscid.logInputToEntries(logText);
        discs.push(...discsInLog);
      }
      const seenDiscids = new Set();
      const uniqueDiscs = [];
      for (const disc of discs) {
        const discid = await MBDiscid.calculateMbDiscid(disc);
        if (seenDiscids.has(discid)) {
          continue;
        }
        seenDiscids.add(discid);
        uniqueDiscs.push(disc);
      }
      return uniqueDiscs;
    }

    function computeAttachUrl(mbTocNumbers, mbArtistName, mbReleaseName) {
      const mbURL = new URL(`${MB_BASE_URL}/cdtoc/attach`);
      mbURL.searchParams.set('toc', mbTocNumbers.join(' '));
      mbURL.searchParams.set('artist-name', mbArtistName);
      mbURL.searchParams.set('release-name', mbReleaseName);
      return mbURL.toString();
    }
    function createDiscIdLink(discid, mbTocNumbers, artistName, releaseName, found) {
      const htmlElement = document.createElement('a');
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
    const checkAndDisplayDiscs = async ({
      artistName,
      releaseName,
      discs,
      displayDiscHandler,
      getElementIdForResultDisplay
    }) => {
      // For each disc, check if it's in MusicBrainz database
      for (let i = 0; i < discs.length; i++) {
        const entries = discs[i];
        if (!entries || entries.length === 0) {
          continue;
        }
        const discNumber = i + 1;
        const mbTocNumbers = MBDiscid.calculateMbTocNumbers(entries);
        if (!mbTocNumbers) {
          continue;
        }
        const discid = await MBDiscid.calculateMbDiscid(entries);
        LOGGER.info(`Computed discid :${discid}`);
        displayDiscHandler(mbTocNumbers, discid, discNumber);
        let found = false;
        try {
          const response = await fetch(MB_API_URL(discid), {
            headers: {
              Accept: 'application/json'
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (!('error' in data)) {
              found = true;
            }
          }
        } catch (error) {
          LOGGER.error(`Failed to check if discid ${discid} is in MusicBrainz database`, error);
        }

        // Display the result
        const htmlElement = createDiscIdLink(discid, mbTocNumbers, artistName, releaseName, found);
        LOGGER.debug(`#${getElementIdForResultDisplay(discNumber)}`);
        document.getElementById(getElementIdForResultDisplay(discNumber))?.appendChild(htmlElement);
      }
    };

    const EAC_LOG_HEADER_PATTERN = String.raw`(?:EAC extraction logfile|EAC Auslese-Logdatei|Отч(?:е|ё)т EAC об извлечении|Звіт EAC про видобування)`;
    const EAC_LOG_PATTERN = new RegExp(EAC_LOG_HEADER_PATTERN, 'i');
    const EAC_LOG_ARTIST_RELEASE_PATTERN = new RegExp(String.raw`${EAC_LOG_HEADER_PATTERN}[^\n]*\n\s*(.+?)\s*\/\s*(.+?)(?:\n|$)`, 'i');
    const parseArtistReleaseFromEacLog = logText => {
      const match = EAC_LOG_ARTIST_RELEASE_PATTERN.exec(logText);
      if (!match) {
        return null;
      }
      let artistName = match[1]?.trim() ?? '';
      let releaseName = match[2]?.trim() ?? '';
      if (artistName.toLowerCase() === 'unknown artist' || releaseName.toLowerCase() === 'unknown title') {
        artistName = '';
      }
      if (releaseName.toLowerCase() === 'unknown title' || releaseName.toLowerCase() === 'неизвестное название') {
        releaseName = '';
      }
      return {
        artistName,
        releaseName
      };
    };
    const LABEL_PACK_PATTERN = /(?:Sub)*Label(?:: | - | Pack)/i;
    const COLLECTION_PATTERN_V1 = /^(.+?)(?:\s+\([^)]*\))?\s+[-/]\s+(?:Official\s+|\d+\s+Releases\s+|Официальная\s+)*(?:Discography|Дискография)/i;
    const COLLECTION_PATTERN_V2 = /^(.+?)(?:\s+\([^)]*\))?\s+[-/]\s+(?:Официальная\s+|Official\s+|Official\sSoundtrack\s+)*(?:Collection|Коллекция)/i;
    const YEAR_PATTERN = String.raw`(?:19|20)\d{2}|197\?`;
    const YEAR_RANGE_PATTERN = String.raw`(?:${YEAR_PATTERN})\s*-\s*(?:${YEAR_PATTERN})`;

    // Artist - Release - 2026
    // Artist - Release - 1957 (1999 Japan Edition)
    const ARTIST_RELEASE_DASH_YEAR_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?)\s+-\s+(${YEAR_PATTERN})(?:\b|[,\s(])`, 'i');

    // Artist - Release - 1982 - 2026
    const ARTIST_RELEASE_DASH_YEAR_RANGE_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?)\s+-\s+(${YEAR_RANGE_PATTERN})(?:\b|[,\s(])`, 'i');

    // Artist - Release (2024)
    const ARTIST_RELEASE_PAREN_YEAR_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?)\s+\((${YEAR_PATTERN})\)(?:\b|[,\s\[])`, 'i');

    // Artist - Release, 2000-2016
    // Artist - Release, 1963 -2007
    const ARTIST_RELEASE_COMMA_YEAR_RANGE_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?),\s*(${YEAR_RANGE_PATTERN})(?:\b|[,\s\[])`, 'i');

    // Artist - Release, 2025
    const ARTIST_RELEASE_COMMA_YEAR_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?),\s*(${YEAR_PATTERN})(?:\b|[,\s\[])`, 'i');

    // Artist - Release [FLAC|...]
    const ARTIST_RELEASE_BEFORE_FORMAT_BLOCK_PATTERN = /^(.+?)\s+-\s+(.+?)\s+\[[^\]]+\]/i;

    // Last-resort fallback: Artist - Release
    const ARTIST_RELEASE_FALLBACK_PATTERN = /^(.+?)\s+-\s+(.+?)(?:,|\[|$)/i;
    const normalizeForumTopicTitle = title => {
      return title.replace(/[–—-]/g, '-') // normalize dash variants
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim().replace(/^(?:\([^)]+\)\s*)+/, '') // strip leading genre parentheses: (Rock, Pop)
      .replace(/^(?:\[[^\]]+\]\s*)+/, '') // strip leading format tags: [CD], [24/192], [LP/MB/DAT]
      .trim();
    };
    const cleanParsedValue = value => {
      return value.replace(/\s+/g, ' ').replace(/\s+[-/]\s*$/, '').trim();
    };
    const tryMatchArtistRelease = (title, patterns) => {
      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (!match) {
          continue;
        }
        const artistName = cleanParsedValue(match[1] ?? '');
        const releaseName = cleanParsedValue(match[2] ?? '');
        if (artistName || releaseName) {
          return {
            artistName,
            releaseName
          };
        }
      }
      return null;
    };
    const parseArtistReleaseFromForumPost = () => {
      const pageHeader = document.querySelector('h1.maintitle a, h1 a.maintitle');
      const pageTitle = document.title.replace(/\s*(::|•).*$/s, '');
      const title = normalizeForumTopicTitle(pageHeader?.textContent ?? pageTitle);

      // Label packs are not artist releases.
      const isLabelPack = LABEL_PACK_PATTERN.test(title);
      if (isLabelPack) {
        // Abandon parsing since we can't reliably determine the artist and release name
        return {
          artistName: '',
          releaseName: ''
        };
      }
      const isCollectionV1 = title.match(COLLECTION_PATTERN_V1);
      const isCollectionV2 = title.match(COLLECTION_PATTERN_V2);
      if (isCollectionV1 || isCollectionV2) {
        const artistName = isCollectionV1?.[1]?.trim() ?? isCollectionV2?.[1]?.trim() ?? '';
        return {
          artistName,
          releaseName: ''
        };
      }
      const parsed = tryMatchArtistRelease(title, [ARTIST_RELEASE_DASH_YEAR_RANGE_PATTERN, ARTIST_RELEASE_DASH_YEAR_PATTERN, ARTIST_RELEASE_PAREN_YEAR_PATTERN, ARTIST_RELEASE_COMMA_YEAR_RANGE_PATTERN, ARTIST_RELEASE_COMMA_YEAR_PATTERN, ARTIST_RELEASE_BEFORE_FORMAT_BLOCK_PATTERN, ARTIST_RELEASE_FALLBACK_PATTERN]);
      return parsed ?? {
        artistName: '',
        releaseName: ''
      };
    };

    const processInlineEacLog = async ({
      pre,
      logIndex,
      fallbackArtist,
      fallbackRelease
    }) => {
      const logText = getElementTextWithLineBreaks(pre);
      const fromLog = parseArtistReleaseFromEacLog(logText);
      const artistName = fromLog?.artistName || fallbackArtist;
      const releaseName = fromLog?.releaseName || fallbackRelease;
      const elementPrefix = `mb_discid_${logIndex}`;
      const discs = await analyzeLogFiles([pre]);
      LOGGER.debug('Number of disc found in inline log', discs.length);
      if (discs.length === 0) {
        return;
      }
      pre.insertAdjacentHTML('afterend', `<div class="mb-discids-detector" style="margin-top: 0.5em;"></div>`);
      const targetContainer = pre.nextElementSibling;
      await checkAndDisplayDiscs({
        artistName,
        releaseName,
        discs,
        displayDiscHandler: (_mbTocNumbers, _discid, discNumber) => {
          targetContainer?.insertAdjacentHTML('beforeend', `<div><strong>${discs.length > 1 ? `Disc ${discNumber}: ` : ''}MB DiscId: </strong><span id="${elementPrefix}_disc${discNumber}"></span></div>`);
        },
        getElementIdForResultDisplay: discNumber => `${elementPrefix}_disc${discNumber}`
      });
    };
    const bbForumPageHandler = async () => {
      const {
        artistName,
        releaseName
      } = parseArtistReleaseFromForumPost();
      LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);
      const eacLogs = [...document.querySelectorAll('pre')].filter(preElement => EAC_LOG_PATTERN.test(preElement.textContent));
      LOGGER.info(`Found ${eacLogs.length} inline EAC log(s)`);
      for (let i = 0; i < eacLogs.length; i++) {
        const pre = eacLogs[i];
        if (!pre) {
          continue;
        }
        await processInlineEacLog({
          pre,
          logIndex: i,
          fallbackArtist: artistName,
          fallbackRelease: releaseName
        });
      }
    };

    const resolveLogAction = ({
      onclick,
      link,
      serverHost
    }) => {
      if (serverHost.match(/orpheus/) && link.classList.contains('view-riplog')) {
        LOGGER.debug('Orpheus');
        return 'viewlog';
      }
      if (onclick.match(/show_logs/)) {
        // TODO: Orpheus had changed the way to show logs, so this is not working anymore. Will keep it here just in case and remove in the future.
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
    const getTorrentIdFromHref = link => {
      const href = link.getAttribute('href');
      if (!href) {
        return null;
      }
      const url = new URL(href, window.location.origin);
      const torrentId = url.searchParams.get('torrentid');
      if (torrentId) {
        return torrentId;
      }
      const action = url.searchParams.get('action');
      if (url.pathname.endsWith('/torrents.php') && action === 'download' || url.pathname.endsWith('/ajax.php') && action === 'torrent' || url.pathname.endsWith('/reportsv2.php') && action === 'report') {
        return url.searchParams.get('id');
      }
      return null;
    };
    const resolveTorrentId = (link, onclick) => {
      const inlineHandlerMatch = /(show_logs|get_log|show_log)\('(\d+)/.exec(onclick);
      if (inlineHandlerMatch?.[2]) {
        return inlineHandlerMatch[2];
      }
      const dataIdContainer = link.closest('[data-id]');
      if (dataIdContainer?.dataset['id']) {
        return dataIdContainer.dataset['id'];
      }
      const torrentInfo = link.closest('tr') ?? link.parentElement;
      if (!torrentInfo) {
        return null;
      }
      for (const torrentLink of torrentInfo.querySelectorAll('a[href]')) {
        const torrentId = getTorrentIdFromHref(torrentLink);
        if (torrentId) {
          return torrentId;
        }
      }
      return null;
    };
    function processLogLink({
      link,
      artistName,
      releaseName,
      serverHost
    }) {
      if (!/View\s+Log/i.test(link.textContent)) {
        return;
      }
      LOGGER.debug('Log link', link);
      const onclick = link.getAttribute('onclick') ?? '';
      const logAction = resolveLogAction({
        onclick,
        link,
        serverHost
      });
      if (!logAction) {
        return;
      }
      const targetContainer = link.closest('.linkbox') ?? link.closest('[data-id]') ?? link.parentElement;
      const torrentId = resolveTorrentId(link, onclick);
      if (!torrentId) {
        return;
      }
      const logUrl = `/torrents.php?action=${logAction}&torrentid=${torrentId}`;
      LOGGER.info('Log URL: ', logUrl);
      LOGGER.debug('targetContainer: ', targetContainer);
      void fetch(logUrl).then(response => response.text()).then(async data => {
        const doc = new DOMParser().parseFromString(data, 'text/html');
        const pres = doc.querySelectorAll('pre');
        LOGGER.debug('Log content', pres);
        const discs = await analyzeLogFiles(pres);
        LOGGER.debug('Number of disc found', discs.length);
        await checkAndDisplayDiscs({
          artistName,
          releaseName,
          discs,
          displayDiscHandler: (_mbTocNumbers, _discid, discNumber) => {
            targetContainer?.insertAdjacentHTML('beforeend', `<br /><strong>${discs.length > 1 ? `Disc ${discNumber}: ` : ''}MB DiscId: </strong><span id="${torrentId}_disc${discNumber}"></span>`);
          },
          getElementIdForResultDisplay: discNumber => `${torrentId}_disc${discNumber}`
        });
      }).catch(err => {
        LOGGER.error('Failed to fetch log', logUrl, err);
      });
    }
    const parseReleaseInfo = serverHost => {
      const titleAndArtists = document.querySelector('#content div.thin h2')?.textContent ?? '';
      const regularPattern = /(.*) - (.*) \[.*\] \[.*/;
      const orpheusPattern = /(.*) [-–] (.*) \[.*\]( \[.*)?/;
      const pattern = serverHost.match(/orpheus/) ? orpheusPattern : regularPattern;
      const match = titleAndArtists.match(pattern);
      return {
        artistName: match?.[1] ?? '',
        releaseName: match?.[2] ?? ''
      };
    };
    const gazellePageHandler = () => {
      const serverHost = window.location.host;
      const {
        artistName,
        releaseName
      } = parseReleaseInfo(serverHost);
      LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);
      for (const torrentRow of document.querySelectorAll('tr.group_torrent')) {
        if (!torrentRow.id) {
          continue;
        }
        const torrentInfo = torrentRow.nextElementSibling;
        if (!torrentInfo) {
          continue;
        }
        for (const link of torrentInfo.querySelectorAll('a')) {
          processLogLink({
            link,
            artistName,
            releaseName,
            serverHost
          });
        }
      }
    };

    function init() {
      const serverHost = window.location.host;
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
