// ==UserScript==
// @name         Import ElasticStage releases to MusicBrainz
// @description  One-click importing of releases from elasticstage.com release pages into MusicBrainz
// @version      2026.08.07.1
// @author       Raman Sinclair
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/elasticstage_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/elasticstage_importer.user.js
// @match        https://elasticstage.com/*
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

    // convert HH:MM:SS or MM:SS to milliseconds
    function hmsToMilliSeconds(str) {
      if (typeof str == 'undefined' || str === '' || isNaN(Number(str))) return NaN;
      if (typeof str == 'number') return str;
      const t = str.split(':');
      let s = 0;
      let m = 1;
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
      const regex = /^PT(?:(\d*\.?\d*)H)?(?:(\d*\.?\d*)M)?(?:(\d*\.?\d*)S)?$/;
      const m = str.replace(',', '.').match(regex);
      if (!m) return NaN;
      return (3600 * parseFloat(m[1] || '0') + 60 * parseFloat(m[2] || '0') + parseFloat(m[3] || '0')) * 1000;
    }

    // compute HTML of import form
    function buildFormHTML(parameters) {
      // Build form
      let innerHTML = `<form class="musicbrainz_import musicbrainz_import_add" action="https://musicbrainz.org/release/add" method="post" target="_blank" accept-charset="UTF-8" charset="${document.characterSet}">`;
      parameters.forEach(function (parameter) {
        const value = parameter.value.toString();
        innerHTML += `<input type='hidden' value='${value.replace(/'/g, '&apos;')}' name='${parameter.name}'/>`;
      });
      innerHTML += '<button type="submit" title="Import this release into MusicBrainz (open a new tab)"><img src="https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg" width="16" height="16" />Import into MB</button>';
      innerHTML += '</form>';
      return innerHTML;
    }

    function luceneEscape(text) {
      let newText = text.replace(/[-[\]{}()*+?~:\\^!"/]/g, '\\$&');
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
      const params = [];
      const totaltracks = release.discs.reduce((acc, {
        tracks
      }) => acc + tracks.length, 0);
      let release_artist = '';
      for (let i = 0; i < release.artist_credit.length; i++) {
        const ac = release.artist_credit[i];
        if (ac) {
          release_artist += ac.artist_name;
          if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != '') {
            release_artist += ac.joinphrase;
          } else {
            if (i != release.artist_credit.length - 1) release_artist += ', ';
          }
        }
      }
      const query = `artist:(${luceneEscape(release_artist)})` + ` release:(${luceneEscape(release.title)})` + ` tracks:(${totaltracks})${release.country ? ` country:${release.country}` : ''}`;
      appendParameter(params, 'query', query);
      appendParameter(params, 'type', 'release');
      appendParameter(params, 'advanced', '1');
      return params;
    }

    // Try to guess release type using number of tracks, title and total duration (in millisecs)
    function guessReleaseType(title, num_tracks, duration_ms) {
      if (num_tracks < 1) return '';
      let has_single = !!title.match(/\bsingle\b/i);
      let has_EP = !!title.match(/\bEP\b/i);
      if (has_single && has_EP) {
        has_single = false;
        has_EP = false;
      }
      const perhaps_single = has_single && num_tracks <= 4 || num_tracks <= 2;
      const perhaps_EP = has_EP || num_tracks > 2 && num_tracks <= 6;
      const perhaps_album = num_tracks > 8;
      if (isNaN(duration_ms)) {
        // no duration, try to guess with title and number of tracks
        if (perhaps_single && !perhaps_EP && !perhaps_album) return 'single';
        if (!perhaps_single && perhaps_EP && !perhaps_album) return 'EP';
        if (!perhaps_single && !perhaps_EP && perhaps_album) return 'album';
        return '';
      }
      const duration_mn = duration_ms / (60 * 1000);
      if (perhaps_single && duration_mn >= 1 && duration_mn < 7) return 'single';
      if (perhaps_EP && duration_mn > 7 && duration_mn <= 30) return 'EP';
      if (perhaps_album && duration_mn > 30) return 'album';
      return '';
    }

    function buildArtistCreditsFormParameters(parameters, paramPrefix, artist_credit) {
      for (let i = 0; i < artist_credit.length; i++) {
        const ac = artist_credit[i];
        if (ac) {
          appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.name`, ac.credited_name || '');
          appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.artist.name`, ac.artist_name);
          if (ac.mbid) appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.mbid`, ac.mbid);
          if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != '') {
            appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.join_phrase`, ac.joinphrase);
          }
        }
      }
    }

    // build form POST parameters that MB is expecting
    function buildFormParameters(release, edit_note) {
      // Form parameters
      const parameters = [];
      appendParameter(parameters, 'name', release.title);

      // Release Artist credits
      buildArtistCreditsFormParameters(parameters, '', release.artist_credit);
      if (release['secondary_types']) {
        for (let i = 0; i < release.secondary_types.length; i++) {
          const secondaryType = release.secondary_types[i];
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
        for (let i = 0; i < release.labels.length; i++) {
          const label = release.labels[i];
          if (label) {
            appendParameter(parameters, `labels.${i}.name`, label.name);
            if (label.mbid) appendParameter(parameters, `labels.${i}.mbid`, label.mbid);
            if (label.catno && label.catno != 'none') {
              appendParameter(parameters, `labels.${i}.catalog_number`, label.catno);
            }
          }
        }
      }

      // URLs
      if (Array.isArray(release.urls)) {
        for (let i = 0; i < release.urls.length; i++) {
          const url = release.urls[i];
          if (url) {
            appendParameter(parameters, `urls.${i}.url`, url.url);
            appendParameter(parameters, `urls.${i}.link_type`, url.link_type);
          }
        }
      }

      // Mediums
      let total_tracks = 0;
      let total_tracks_with_duration = 0;
      let total_duration = 0;
      for (let i = 0; i < release.discs.length; i++) {
        const disc = release.discs[i];
        if (disc) {
          appendParameter(parameters, `mediums.${i}.format`, disc.format);
          if (disc.title) appendParameter(parameters, `mediums.${i}.name`, disc.title);

          // Tracks
          for (let j = 0; j < disc.tracks.length; j++) {
            const track = disc.tracks[j];
            if (track) {
              total_tracks++;
              if (track.number) appendParameter(parameters, `mediums.${i}.track.${j}.number`, track.number);
              appendParameter(parameters, `mediums.${i}.track.${j}.name`, track.title);
              let tracklength = '?:??';
              const duration_ms = hmsToMilliSeconds(track.duration);
              if (!isNaN(duration_ms)) {
                tracklength = duration_ms.toString();
                total_tracks_with_duration++;
                total_duration += duration_ms;
              }
              appendParameter(parameters, `mediums.${i}.track.${j}.length`, tracklength);
              // @ts-expect-error TODO: recording is not a property of Track and in no importer scripts a recording is found in a track. Once all scripts are migrated, we need to see if we can remove this line entirely.
              if (track.recording) appendParameter(parameters, `mediums.${i}.track.${j}.recording`, track.recording); // eslint-disable-line @typescript-eslint/no-unsafe-argument
              buildArtistCreditsFormParameters(parameters, `mediums.${i}.track.${j}.`, track.artist_credit);
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

    const styleBlockIconButton = `
    <style>
        .harmony-button {
            display: inline-block;
            position: relative;
        }

        .harmony-button:hover {
            transform: scale(1.1);
        }

        .harmony-button:active {
            transform: scale(0.9);
        }
    </style>
`;
    const styleBlockFullButton = `
    <style>
        .harmony-button {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 0 !important;
            border-radius: 5px;
            justify-content: center;
            cursor: pointer;
            font-family: Arial;
            font-size: 12px !important;
            padding: 3px 6px;
            border: 1px solid rgba(180,180,180,0.8) !important;
            background-color: rgba(240,240,240,0.8) !important;
            color: #334 !important;
            height: 26px;
            user-select: none;
            text-decoration: none !important;
            box-sizing: border-box;
        }

        .harmony-button:hover {
            background-color: rgba(250,250,250,0.9) !important;
        }

        .harmony-button:active {
            background-color: rgba(170,170,170,0.8) !important;
        }
    </style>
`;
    function buildHarmonyButton({
      barcode,
      release_url,
      variant
    }) {
      const searchParams = new URLSearchParams();
      if (barcode) {
        searchParams.set('gtin', barcode);
      }
      if (release_url) {
        searchParams.set('url', encodeURI(release_url));
      }
      searchParams.set('category', 'preferred'); // take Harmony user preferences into account
      searchParams.set('musicbrainz', ''); // enforce lookup by barcode in MusicBrainz

      const harmonyURL = `https://harmony.pulsewidth.org.uk/release?${searchParams.toString()}`;
      return `
        ${variant === 'full' ? styleBlockFullButton : styleBlockIconButton}
        <a
            class="harmony-button"
            title="Import this release into MusicBrainz using Harmony (open a new tab)" 
            target="_blank"
            href="${harmonyURL}"
        >
            <img src="https://harmony.pulsewidth.org.uk/favicon.svg" alt="Harmony icon" width="16" height="16" />
            ${variant === 'full' ? 'Import with Harmony' : ''}
        </a>`;
    }

    // compute HTML of search button
    function buildSearchButton(release) {
      const parameters = searchParams(release);
      let html = `<form class="musicbrainz_import musicbrainz_import_search" action="https://musicbrainz.org/search" method="get" target="_blank" accept-charset="UTF-8" charset="${document.characterSet}">`;
      parameters.forEach(function (parameter) {
        const value = `${parameter.value}`;
        html += `<input type='hidden' value='${value.replace(/'/g, '&apos;')}' name='${parameter.name}'/>`;
      });
      html += '<button type="submit" title="Search for this release in MusicBrainz (open a new tab)">Search in MB</button>';
      html += '</form>';
      return html;
    }

    function buildSearchLink(release) {
      const parameters = searchParams(release);
      const url_params = [];
      parameters.forEach(function (parameter) {
        const value = `${parameter.value}`;
        url_params.push(encodeURI(`${parameter.name}=${value}`));
      });
      return `<a class="musicbrainz_import" href="https://musicbrainz.org/search?${url_params.join('&')}">Search in MusicBrainz</a>`;
    }

    // Convert a list of artists to a list of artist credits with joinphrases
    function makeArtistCredits(artists_list) {
      const artists = artists_list.map(function (item) {
        return {
          artist_name: item
        };
      });
      if (artists.length > 2) {
        const last = artists.pop();
        if (last) {
          last.joinphrase = '';
          const prev = artists.pop();
          if (prev) {
            prev.joinphrase = ' & ';
            for (let i = 0; i < artists.length; i++) {
              const artist = artists[i];
              if (artist) {
                artist.joinphrase = ', ';
              }
            }
            artists.push(prev);
            artists.push(last);
          }
        }
      } else if (artists.length == 2) {
        const first = artists[0];
        if (first) {
          first.joinphrase = ' & ';
        }
      }
      const credits = [];
      // re-split artists if featuring or vs
      artists.map(function (item) {
        let c = item.artist_name.replace(/\s*\b(?:feat\.?|ft\.?|featuring)\s+/gi, ' feat. ');
        c = c.replace(/\s*\(( feat. )([^)]+)\)/g, '$1$2');
        c = c.replace(/\s*\b(?:versus|vs\.?)\s+/gi, ' vs. ');
        c = c.replace(/\s+/g, ' ');
        const splitted = c.split(/( feat\. | vs\. )/);
        if (splitted.length === 1) {
          credits.push(item); // nothing to split
        } else {
          const new_items = [];
          let n = 0;
          for (const element of splitted) {
            if (n && (element === ' feat. ' || element === ' vs. ')) {
              const prevItem = new_items[n - 1];
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
          const lastItem = new_items[n - 1];
          if (lastItem && item.joinphrase) {
            lastItem.joinphrase = item.joinphrase;
          }
          new_items.forEach(newit => credits.push(newit));
        }
      });
      return credits;
    }

    function makeEditNote(release_url, importer_name, format, home = 'https://github.com/murdos/musicbrainz-userscripts') {
      return `Imported from ${release_url}${format ? ` (${format})` : ''} using ${importer_name} import script from ${home}`;
    }

    function searchUrlFor(type, what) {
      type = type.replace('-', '_');
      const params = [`query=${luceneEscape(what)}`, `type=${type}`, 'indexed=1'];
      return `https://musicbrainz.org/search?${params.join('&')}`;
    }
    function exactSearchUrlFor(type, what, limit = 25) {
      type = type.replace('-', '_');
      const query = `"${luceneEscape(what)}"`;
      const params = [`query=${encodeURIComponent(query)}`, `type=${type}`, `limit=${limit}`, 'method=advanced'];
      return `https://musicbrainz.org/search?${params.join('&')}`;
    }

    const special_artists = {
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
      let joinphrase = '';
      if (typeof ac !== 'undefined') {
        joinphrase = ac.joinphrase || '';
      }
      const specialArtist = special_artists[key];
      if (!specialArtist) {
        throw new Error(`Unknown special artist: ${key}`);
      }
      return {
        artist_name: specialArtist.name,
        credited_name: '',
        joinphrase: joinphrase,
        mbid: specialArtist.mbid
      };
    }

    const URL_TYPES = {
      purchase_for_download: 74,
      download_for_free: 75,
      discogs: 76,
      purchase_for_mail_order: 79,
      other_databases: 82,
      stream_for_free: 85,
      license: 301
    };

    const MBImport = {
      buildHarmonyButton,
      buildSearchLink,
      buildSearchButton,
      buildFormHTML,
      buildFormParameters,
      makeArtistCredits,
      guessReleaseType,
      hmsToMilliSeconds,
      ISO8601toMilliSeconds,
      makeEditNote,
      searchUrlFor,
      exactSearchUrlFor,
      URL_TYPES,
      SPECIAL_ARTISTS: special_artists,
      specialArtist
    };

    function _add_css(css) {
      document.head.insertAdjacentHTML('beforeend', `<style>${css.replace(/\s+/g, ' ')}</style>`);
    }
    function MBImportStyle() {
      const css_import_button = `
    #mb_buttons {
        display: flex;
        gap: 5px;
    }
  .musicbrainz_import button {
    margin: 0 !important;
    border-radius:5px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor:pointer;
    font-family:Arial;
    font-size:12px !important;
    padding:3px 6px;
    text-decoration:none;
    border: 1px solid rgba(180,180,180,0.8) !important;
    background-color: rgba(240,240,240,0.8) !important;
    color: #334 !important;
    height: 26px ;
  }
  .musicbrainz_import button:hover {
    background-color: rgba(250,250,250,0.9) !important;
  }
  .musicbrainz_import button:active {
    background-color: rgba(170,170,170,0.8) !important;
  }
  .musicbrainz_import button img {
    vertical-align: middle !important;
    margin-right: 4px !important;
    height: 16px;
  }
  img[src*="musicbrainz.org"] {
    display: inline-block;
  }
  `;
      _add_css(css_import_button);
    }

    /**
     * Subscribe to Single Page Application (SPA) navigation events.
     * Uses pushState/replaceState interception when possible; falls back to URL polling in sandboxed environments
     * (e.g. Firefox/Greasemonkey) where the page uses a different history object.
     *
     * @param onNavigate - Callback function to execute when navigation occurs
     * @param delay - Delay in milliseconds before calling onNavigate (default: 200ms)
     * @param pollInterval - If set, polls location.href for changes; use when pushState interception doesn't work (default: 400ms, 0 to disable)
     * @returns Cleanup function to unsubscribe from navigation events
     */
    function subscribeToSPANavigation({
      onNavigate,
      delay = 200,
      pollInterval = 400
    }) {
      let currentUrl = window.location.href;
      const originalPushState = history.pushState.bind(history);
      const originalReplaceState = history.replaceState.bind(history);
      const scheduleOnNavigate = () => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
          currentUrl = newUrl;
          setTimeout(() => {
            void onNavigate();
          }, delay);
        }
      };
      let pushStatePatched = false;
      let replaceStatePatched = false;
      try {
        history.pushState = function (...args) {
          originalPushState.apply(history, args);
          scheduleOnNavigate();
        };
        pushStatePatched = true;
      } catch {
        // pushState is read-only in some sandboxed environments
      }
      try {
        history.replaceState = function (...args) {
          originalReplaceState.apply(history, args);
          scheduleOnNavigate();
        };
        replaceStatePatched = true;
      } catch {
        // replaceState is read-only in some sandboxed environments
      }
      let pollTimer;
      if (pollInterval > 0) {
        pollTimer = setInterval(scheduleOnNavigate, pollInterval);
      }
      const popstateHandler = () => {
        currentUrl = window.location.href;
        setTimeout(() => {
          void onNavigate();
        }, delay);
      };
      window.addEventListener('popstate', popstateHandler);
      return () => {
        if (pollTimer) clearInterval(pollTimer);
        if (pushStatePatched) history.pushState = originalPushState;
        if (replaceStatePatched) history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', popstateHandler);
      };
    }

    /**
     * elasticstage.com is a Vue 3 single-page app. The release page fetches the
     * release group's releases itself and keeps them in the Vue component state, so
     * instead of issuing our own API requests we read the data straight out of the
     * mounted components. This requires running in page context (`@grant none`) so
     * that the `__vueParentComponent` expando property added by Vue is visible.
     */

    /** Minimal shape of a mounted Vue 3 internal component instance. */

    /** The component that renders the list of purchasable formats for a release group. */
    const RELEASE_DETAILS_COMPONENT = 'ReleaseDetails';

    /** Does this value look like the array of releases exposed by the page? */
    function isReleaseArray(value) {
      if (!Array.isArray(value) || value.length === 0) {
        return false;
      }
      const [first] = value;
      return typeof first === 'object' && first !== null && 'ean' in first && 'tracks' in first && 'release_type' in first;
    }

    /**
     * Walk the mounted Vue components and return the release list held in state.
     * Prefers the dedicated `ReleaseDetails` component but falls back to any
     * component prop that looks like the release array, in case elasticstage
     * renames or restructures its components.
     */
    function getReleasesFromVueState() {
      let fallback = null;
      for (const el of document.querySelectorAll('*')) {
        const component = el.__vueParentComponent;
        const props = component?.props;
        if (!props) {
          continue;
        }
        const name = component.type?.name ?? component.type?.__name;
        if (name === RELEASE_DETAILS_COMPONENT && isReleaseArray(props['releases'])) {
          return cloneReleases(props['releases']);
        }
        if (!fallback) {
          for (const key of Object.keys(props)) {
            let value;
            try {
              value = props[key];
            } catch {
              continue;
            }
            if (isReleaseArray(value)) {
              fallback = value;
              break;
            }
          }
        }
      }
      return fallback ? cloneReleases(fallback) : [];
    }

    /**
     * Detach the data from Vue's reactive proxies, returning plain serialisable
     * objects. The release data is plain JSON, so a structured clone is sufficient.
     */
    function cloneReleases(releases) {
      try {
        return JSON.parse(JSON.stringify(releases));
      } catch {
        return releases;
      }
    }
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Poll for the release data, which is populated asynchronously after the page
     * (or an SPA navigation) finishes fetching it.
     */
    async function waitForReleases(maxAttempts = 40, intervalMs = 250) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const releases = getReleasesFromVueState();
        if (releases.length > 0) {
          return releases;
        }
        await sleep(intervalMs);
      }
      return [];
    }

    const LOGGER = new Logger('elasticstage_importer', LogLevel.INFO);
    const MB_IMPORT_CONTAINER_ID = 'mb_elasticstage_import';
    const MB_STYLE_ID = 'mb_elasticstage_style';
    const MB_MINIMIZED_CLASS = 'mb-es-minimized';
    const MB_PRODUCT_BADGE_CLASS = 'mb-es-product-badge';
    const MB_MINIMIZED_STORAGE_KEY = 'mb_elasticstage_minimized';
    const MB_LOOKUP_CACHE_PREFIX = 'mb_elasticstage_lookup:v1:';
    // Match the default positive-result lifetime used by lib/mblinks.js (and the Bandcamp importer).
    const MB_LOOKUP_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
    const MB_EMPTY_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
    const MB_LOGO_URL = 'https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg';
    let productButtonObserver;

    // Keep ElasticStage's keyboard handlers from cancelling browser-level actions.
    window.addEventListener('keydown', event => {
      if (event.key === 'F5' || event.key === 'F12' || event.code === 'F5' || event.code === 'F12') {
        event.stopImmediatePropagation();
      }
    }, {
      capture: true
    });
    function isMinimizedPreferred() {
      try {
        return window.localStorage.getItem(MB_MINIMIZED_STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    }
    function saveMinimizedPreference(minimized) {
      try {
        window.localStorage.setItem(MB_MINIMIZED_STORAGE_KEY, minimized ? '1' : '0');
      } catch {
        // localStorage unavailable; preference simply won't persist
      }
    }
    function lookupCacheKey(releaseUrl) {
      return `${MB_LOOKUP_CACHE_PREFIX}${releaseUrl}`;
    }
    function isMusicBrainzReleaseMatch(value) {
      if (!value || typeof value !== 'object') return false;
      const release = value;
      return typeof release['id'] === 'string' && typeof release['title'] === 'string' && typeof release['disambiguation'] === 'string' && (typeof release['barcode'] === 'string' || release['barcode'] === null);
    }
    function readLookupCache(releaseUrl) {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(lookupCacheKey(releaseUrl)) ?? 'null');
        if (!parsed || typeof parsed !== 'object') return undefined;
        const cache = parsed;
        if (typeof cache['fetchedAt'] !== 'number' || !Array.isArray(cache['releases'])) return undefined;
        if (!cache['releases'].every(isMusicBrainzReleaseMatch)) return undefined;
        const ttl = cache['releases'].length > 0 ? MB_LOOKUP_CACHE_TTL_MS : MB_EMPTY_LOOKUP_CACHE_TTL_MS;
        if (Date.now() - cache['fetchedAt'] > ttl) return undefined;
        return cache['releases'];
      } catch {
        return undefined;
      }
    }
    function saveLookupCache(releaseUrl, releases) {
      try {
        const cache = {
          fetchedAt: Date.now(),
          releases
        };
        window.localStorage.setItem(lookupCacheKey(releaseUrl), JSON.stringify(cache));
      } catch {
        // A live lookup still works when localStorage is unavailable.
      }
    }
    function parseMusicBrainzReleaseMatches(data) {
      if (!data || typeof data !== 'object') return [];
      const relations = data['relations'];
      if (!Array.isArray(relations)) return [];
      const matches = new Map();
      for (const relationValue of relations) {
        if (!relationValue || typeof relationValue !== 'object') continue;
        const releaseValue = relationValue['release'];
        if (!releaseValue || typeof releaseValue !== 'object') continue;
        const release = releaseValue;
        if (typeof release['id'] !== 'string' || typeof release['title'] !== 'string') continue;
        matches.set(release['id'], {
          id: release['id'],
          title: release['title'],
          disambiguation: typeof release['disambiguation'] === 'string' ? release['disambiguation'] : '',
          barcode: typeof release['barcode'] === 'string' ? release['barcode'] : null
        });
      }
      return [...matches.values()];
    }
    async function lookupMusicBrainzReleases(releaseUrl, forceRefresh = false) {
      if (!forceRefresh) {
        const cached = readLookupCache(releaseUrl);
        if (cached) return cached;
      }
      const endpoint = new URL('https://musicbrainz.org/ws/2/url');
      endpoint.searchParams.set('resource', releaseUrl);
      endpoint.searchParams.set('inc', 'release-rels');
      endpoint.searchParams.set('fmt', 'json');
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) throw new Error(`MusicBrainz URL lookup failed with HTTP ${response.status}`);
      const matches = parseMusicBrainzReleaseMatches(await response.json());
      saveLookupCache(releaseUrl, matches);
      return matches;
    }

    /** Detect a release page, e.g. /{artist}/releases/{release}. */
    function isReleasePage() {
      return /^\/[^/]+\/releases\/[^/]+/.test(window.location.pathname);
    }

    /** Remove any previously inserted import UI to avoid duplicates on SPA navigation. */
    function cleanup() {
      clearProductButtonMarks();
      document.getElementById(MB_IMPORT_CONTAINER_ID)?.remove();
    }
    function clearProductButtonMarks() {
      productButtonObserver?.disconnect();
      productButtonObserver = undefined;
      document.querySelectorAll(`.${MB_PRODUCT_BADGE_CLASS}`).forEach(badge => {
        badge.remove();
      });
    }

    /** Map an elasticstage medium string to a MusicBrainz medium format. */
    function mapMediumFormat(medium) {
      switch (medium.trim().toLowerCase()) {
        case 'cd':
          return 'CD';
        case 'vinyl':
          return 'Vinyl';
        case 'cassette':
          return 'Cassette';
        default:
          return medium;
      }
    }

    /** Map an elasticstage format string to a MusicBrainz primary release type. */
    function mapPrimaryType(format) {
      switch (format.trim().toLowerCase()) {
        case 'album':
          return 'album';
        case 'single':
          return 'single';
        case 'ep':
          return 'EP';
        default:
          return '';
      }
    }

    /** Normalise the elasticstage artist fields into a flat list of artist names. */
    function normalizeArtists(primary, additional) {
      const names = [];
      if (primary) {
        names.push(primary);
      }
      for (const entry of additional) {
        if (typeof entry === 'string') {
          if (entry) names.push(entry);
        } else if (entry && typeof entry === 'object') {
          const record = entry;
          const name = record['name'] ?? record['primary_artist'] ?? record['artist'];
          if (typeof name === 'string' && name) {
            names.push(name);
          }
        }
      }
      return names;
    }
    function buildTrackTitle(title, subtitle) {
      const trimmedSubtitle = subtitle?.trim();
      if (trimmedSubtitle) {
        return `${title} (${trimmedSubtitle})`;
      }
      return title;
    }
    function buildReleaseInfo(release_url, esRelease) {
      const releaseDate = esRelease.release_date.split('T')[0]?.split('-') ?? [];
      const medium = esRelease.release_type.product_type.medium;
      const mediumFormat = mapMediumFormat(medium);
      const isVinyl = medium.trim().toLowerCase() === 'vinyl';
      const mbrelease = {
        artist_credit: [],
        title: esRelease.title,
        year: parseInt(releaseDate[0] || '0'),
        month: parseInt(releaseDate[1] || '0'),
        day: parseInt(releaseDate[2] || '0'),
        format: mediumFormat,
        country: 'XW',
        status: 'official',
        type: mapPrimaryType(esRelease.release_type.format || ''),
        urls: [],
        labels: [],
        barcode: esRelease.ean,
        discs: []
      };
      mbrelease.artist_credit = MBImport.makeArtistCredits(normalizeArtists(esRelease.primary_artist, esRelease.additional_artists));
      mbrelease.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_mail_order
      });
      if (esRelease.label) {
        const label = {
          name: esRelease.label
        };
        // elasticstage often reuses the EAN as the catalog number; only keep a
        // genuine catalog number to avoid polluting MB with the barcode.
        if (esRelease.catalog_no && esRelease.catalog_no !== esRelease.ean) {
          label.catno = esRelease.catalog_no;
        }
        mbrelease.labels.push(label);
      }
      const mbtracks = [];
      const sideCounters = {};
      for (const sideGroup of esRelease.tracks) {
        for (const esTrack of sideGroup) {
          const artists = normalizeArtists(esTrack.primary_artist, esTrack.additional_artists);
          const track = {
            artist_credit: MBImport.makeArtistCredits(artists),
            title: buildTrackTitle(esTrack.title, esTrack.subtitle),
            duration: Math.round(esTrack.duration * 1000)
          };
          if (isVinyl) {
            const side = esTrack.side || 1;
            sideCounters[side] = (sideCounters[side] ?? 0) + 1;
            track.number = `${String.fromCharCode(64 + side)}${sideCounters[side]}`;
          }
          mbtracks.push(track);
        }
      }
      mbrelease.discs.push({
        tracks: mbtracks,
        format: mediumFormat
      });
      return mbrelease;
    }
    function buildStyles() {
      if (document.getElementById(MB_STYLE_ID)) {
        return;
      }
      const style = document.createElement('style');
      style.id = MB_STYLE_ID;
      style.textContent = `
        #${MB_IMPORT_CONTAINER_ID} {
            position: fixed;
            left: 16px;
            bottom: 16px;
            z-index: 2147483646;
            max-width: 360px;
            max-height: 70vh;
            overflow-y: auto;
            background: rgba(255, 255, 255, 0.97);
            color: #222;
            border: 1px solid rgba(120, 120, 120, 0.6);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            padding: 10px 12px;
            font-family: Arial, sans-serif;
            font-size: 12px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-logo {
            flex: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-minimize {
            margin-left: auto;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #555;
            font-size: 16px;
            line-height: 1;
            padding: 0 4px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-minimize:hover {
            color: #000;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-refresh {
            cursor: pointer;
            border: none;
            background: transparent;
            color: #555;
            font-size: 16px;
            line-height: 1;
            padding: 0 2px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-refresh:hover {
            color: #000;
        }
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized {
            max-width: none;
            width: 44px;
            height: 44px;
            padding: 0;
            overflow: hidden;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-header {
            margin-bottom: 0;
        }
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-title,
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-refresh,
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-minimize,
        #${MB_IMPORT_CONTAINER_ID}.mb-es-minimized .mb-es-release {
            display: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release {
            border-top: 1px solid rgba(120, 120, 120, 0.25);
            padding-top: 8px;
            margin-top: 8px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release:first-of-type {
            border-top: none;
            padding-top: 0;
            margin-top: 0;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release-title {
            font-weight: bold;
            margin-bottom: 2px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release-meta {
            color: #555;
            margin-bottom: 6px;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status {
            margin-bottom: 6px;
            color: #666;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status.mb-es-found {
            color: #287c2d;
            font-weight: bold;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status.mb-es-error {
            color: #a33;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-mb-status a {
            color: inherit;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release.mb-es-imported .musicbrainz_import_add {
            display: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-release.mb-es-imported .mb-es-buttons {
            display: none;
        }
        #${MB_IMPORT_CONTAINER_ID} .mb-es-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            align-items: center;
        }
        .${MB_PRODUCT_BADGE_CLASS} {
            display: inline-flex;
            align-items: center;
            margin-left: 8px;
            padding: 3px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.95);
            vertical-align: middle;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
        }
        .${MB_PRODUCT_BADGE_CLASS}:hover {
            background: #fff;
            transform: scale(1.08);
        }
        .${MB_PRODUCT_BADGE_CLASS} img {
            display: block;
            width: 20px;
            height: 20px;
        }
    `;
      document.head.appendChild(style);
    }
    function buildReleaseBlock(esRelease, mbrelease, release_url) {
      const block = document.createElement('div');
      block.className = 'mb-es-release';
      const title = document.createElement('div');
      title.className = 'mb-es-release-title';
      title.textContent = esRelease.release_type.description || esRelease.release_type.product_type.medium;
      block.appendChild(title);
      const metaLine = document.createElement('div');
      metaLine.className = 'mb-es-release-meta';
      const metaParts = [`${mbrelease.discs[0]?.tracks.length ?? 0} tracks`];
      if (esRelease.ean) metaParts.push(`Barcode: ${esRelease.ean}`);
      if (esRelease.is_limited_edition) metaParts.push('Limited edition');
      metaLine.textContent = metaParts.join(' · ');
      block.appendChild(metaLine);
      const status = document.createElement('div');
      status.className = 'mb-es-mb-status';
      status.textContent = 'Checking MusicBrainz…';
      block.appendChild(status);
      const editNote = MBImport.makeEditNote(release_url, 'ElasticStage', esRelease.release_type.description);
      const parameters = MBImport.buildFormParameters(mbrelease, editNote);
      const buttons = document.createElement('div');
      buttons.className = 'mb-es-buttons';
      buttons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(mbrelease);
      block.appendChild(buttons);
      return {
        element: block,
        esRelease,
        status
      };
    }
    function normalizeBarcode(barcode) {
      return barcode?.replace(/[^0-9A-Z]/gi, '').toUpperCase() ?? '';
    }
    function matchesForReleaseBlock(block, blocks, matches) {
      const barcode = normalizeBarcode(block.esRelease.ean);
      const barcodeMatches = barcode ? matches.filter(match => normalizeBarcode(match.barcode) === barcode) : [];

      // A lone relationship is unambiguous even when the source or MB release has no barcode.
      if (barcodeMatches.length === 0 && blocks.length === 1 && matches.length === 1) return matches;
      return barcodeMatches;
    }
    function normalizeProductDescription(description) {
      return description.toLowerCase().replace(/\s*\|.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    }
    function mediumCategory(description) {
      const normalized = normalizeProductDescription(description);
      if (/\bcd\b/.test(normalized)) return 'cd';
      if (/\bvinyl\b/.test(normalized)) return 'vinyl';
      if (/\bcassette\b/.test(normalized)) return 'cassette';
      return normalized;
    }
    function blockProductDescriptions(block) {
      const releaseType = block.esRelease.release_type;
      return [releaseType.product_type.description, releaseType.description, releaseType.product_type.medium].map(normalizeProductDescription).filter(Boolean);
    }
    function markProductButtons(blocks, matches) {
      const imported = blocks.map(block => ({
        block,
        matches: matchesForReleaseBlock(block, blocks, matches)
      })).filter(entry => entry.matches.length > 0);
      const buttons = [...document.querySelectorAll('[data-test="retail.releaseGroup.chooseReleaseButton.container"]')];
      const buttonCategories = buttons.map(button => {
        const description = button.querySelector('[data-test="retail.releaseGroup.chooseReleaseButton.productDescription"]')?.textContent;
        return description ? mediumCategory(description) : '';
      });
      for (const button of buttons) {
        if (button.querySelector(`.${MB_PRODUCT_BADGE_CLASS}`)) continue;
        const descriptionElement = button.querySelector('[data-test="retail.releaseGroup.chooseReleaseButton.productDescription"]');
        if (!descriptionElement) continue;
        const description = normalizeProductDescription(descriptionElement.textContent);
        let candidates = imported.filter(entry => blockProductDescriptions(entry.block).includes(description));
        if (candidates.length === 0) {
          const category = mediumCategory(description);
          candidates = imported.filter(entry => mediumCategory(entry.block.esRelease.release_type.product_type.medium) === category);
          if (candidates.length !== 1 || buttonCategories.filter(buttonCategory => buttonCategory === category).length !== 1) continue;
        }
        if (candidates.length !== 1) continue;
        const releaseMatches = candidates[0]?.matches ?? [];
        for (const match of releaseMatches) {
          const link = document.createElement('a');
          link.className = MB_PRODUCT_BADGE_CLASS;
          link.href = `https://musicbrainz.org/release/${match.id}`;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = `View ${match.title} on MusicBrainz`;
          link.setAttribute('aria-label', `View ${match.title} on MusicBrainz`);
          link.innerHTML = `<img src="${MB_LOGO_URL}" alt="" />`;
          link.addEventListener('click', event => {
            event.stopPropagation();
          });
          descriptionElement.insertAdjacentElement('afterend', link);
        }
      }
    }
    function watchProductButtons(blocks, matches) {
      clearProductButtonMarks();
      markProductButtons(blocks, matches);
      productButtonObserver = new MutationObserver(() => {
        markProductButtons(blocks, matches);
      });
      productButtonObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    function setReleaseMatches(blocks, matches) {
      let importedCount = 0;
      for (const block of blocks) {
        const releaseMatches = matchesForReleaseBlock(block, blocks, matches);
        block.status.replaceChildren();
        block.status.classList.remove('mb-es-found', 'mb-es-error');
        if (releaseMatches.length === 0) {
          block.element.classList.remove('mb-es-imported');
          block.status.textContent = matches.length > 0 ? 'No barcode-matched MusicBrainz release found.' : 'Not found in MusicBrainz.';
          continue;
        }
        block.element.classList.add('mb-es-imported');
        importedCount++;
        block.status.classList.add('mb-es-found');
        block.status.append('Already in MusicBrainz: ');
        releaseMatches.forEach((match, index) => {
          if (index > 0) block.status.append(', ');
          const link = document.createElement('a');
          link.href = `https://musicbrainz.org/release/${match.id}`;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = match.disambiguation ? `${match.title} (${match.disambiguation})` : match.title;
          block.status.appendChild(link);
        });
      }
      return importedCount === blocks.length;
    }
    function setLookupError(blocks) {
      for (const block of blocks) {
        block.element.classList.remove('mb-es-imported');
        block.status.classList.remove('mb-es-found');
        block.status.classList.add('mb-es-error');
        block.status.textContent = 'Could not check MusicBrainz. You can still import or search.';
      }
    }
    function insertMBButtons(esReleases, release_url) {
      if (esReleases.length === 0) {
        LOGGER.error('No releases found to import');
        return;
      }
      buildStyles();
      const container = document.createElement('div');
      container.id = MB_IMPORT_CONTAINER_ID;
      const header = document.createElement('div');
      header.className = 'mb-es-header';
      header.innerHTML = `
        <img class="mb-es-logo" src="${MB_LOGO_URL}" width="18" height="18" />
        <span class="mb-es-title">Import to MusicBrainz</span>
        <button type="button" class="mb-es-refresh" title="Refresh MusicBrainz lookup" aria-label="Refresh MusicBrainz lookup">↻</button>
        <button type="button" class="mb-es-minimize" title="Minimise" aria-label="Minimise">&minus;</button>
    `;
      container.appendChild(header);
      const setMinimized = (minimized, savePreference = true) => {
        container.classList.toggle(MB_MINIMIZED_CLASS, minimized);
        container.title = minimized ? 'Expand MusicBrainz import' : '';
        if (savePreference) saveMinimizedPreference(minimized);
      };
      header.querySelector('.mb-es-minimize')?.addEventListener('click', event => {
        event.stopPropagation();
        setMinimized(true);
      });

      // When collapsed to an icon, a click anywhere on it expands it again.
      container.addEventListener('click', () => {
        if (container.classList.contains(MB_MINIMIZED_CLASS)) {
          setMinimized(false);
        }
      });
      const blocks = [];
      for (const esRelease of esReleases) {
        const mbrelease = buildReleaseInfo(release_url, esRelease);
        const block = buildReleaseBlock(esRelease, mbrelease, release_url);
        blocks.push(block);
        container.appendChild(block.element);
      }
      if (isMinimizedPreferred()) {
        container.classList.add(MB_MINIMIZED_CLASS);
        container.title = 'Expand MusicBrainz import';
      }
      document.body.appendChild(container);
      const refreshButton = header.querySelector('.mb-es-refresh');
      const checkMusicBrainz = async (forceRefresh = false) => {
        if (refreshButton) refreshButton.disabled = true;
        clearProductButtonMarks();
        for (const block of blocks) {
          block.status.classList.remove('mb-es-found', 'mb-es-error');
          block.status.textContent = 'Checking MusicBrainz…';
        }
        try {
          const matches = await lookupMusicBrainzReleases(release_url, forceRefresh);
          if (!container.isConnected || window.location.href.replace(/[?#].*$/, '') !== release_url) return;
          const allImported = setReleaseMatches(blocks, matches);
          watchProductButtons(blocks, matches);
          if (allImported && !forceRefresh) setMinimized(true, false);
        } catch (error) {
          LOGGER.error('MusicBrainz lookup failed:', error);
          if (container.isConnected) setLookupError(blocks);
        } finally {
          if (refreshButton && container.isConnected) refreshButton.disabled = false;
        }
      };
      refreshButton?.addEventListener('click', event => {
        event.stopPropagation();
        void checkMusicBrainz(true);
      });
      void checkMusicBrainz();
    }
    async function processReleasePage() {
      cleanup();
      if (!isReleasePage()) {
        return;
      }
      try {
        const releases = await waitForReleases();

        // The page may have re-rendered while we waited; bail out if we navigated away.
        if (!isReleasePage()) {
          return;
        }
        if (releases.length === 0) {
          LOGGER.error('Could not find release data in the page state');
          return;
        }
        const release_url = window.location.href.replace(/[?#].*$/, '');
        insertMBButtons(releases, release_url);
      } catch (error) {
        LOGGER.error('Error processing release page:', error);
      }
    }
    function init() {
      MBImportStyle();
      setTimeout(() => {
        void processReleasePage();
      }, 1000);
    }
    subscribeToSPANavigation({
      onNavigate: () => processReleasePage()
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

})();
