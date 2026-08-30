// ==UserScript==
// @name         Import Beatport releases to MusicBrainz
// @description  One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version      2026.08.30.1
// @author       VxJasonxV
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js
// @match        https://www.beatport.com/*
// @icon         https://metabrainz.org/static/img/projects/musicbrainz.svg
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
      if (typeof str == 'undefined' || str === null || str === '') return NaN;
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
     * Cache for release data intercepted from Beatport's own fetch requests.
     * When the user navigates via SPA, Beatport fetches the release JSON — we capture
     * it here to avoid making a duplicate request.
     */
    const interceptedReleaseCache = new Map();

    /**
     * Install a fetch interceptor to capture Beatport's release data responses.
     * Call once at script load, before any navigation can occur.
     * Skips installation if fetch is read-only (e.g. Firefox/Greasemonkey sandbox).
     */
    function installFetchInterceptor(logger) {
      const originalFetch = window.fetch.bind(window);
      const interceptor = async function (input, init) {
        const response = await originalFetch(input, init);
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const releaseMatch = url.match(/beatport\.com\/_next\/data\/[^/]+\/[a-z]{2}(?:-[a-z]{2})?\/release\/[^/]+\/(\d+)\.json/);
        const releaseId = releaseMatch?.[1];
        if (releaseId && response.ok) {
          response.clone().json().then(data => {
            const pageData = data;
            const releaseIdFromData = pageData.pageProps.release?.id.toString();
            if (releaseIdFromData === releaseId) {
              interceptedReleaseCache.set(releaseId, pageData);
            }
          }).catch(error => {
            logger.error('Error parsing release data: ', error);
          });
        }
        return response;
      };
      try {
        window.fetch = interceptor;
      } catch {
        // fetch is read-only in Firefox/Greasemonkey sandbox; script works without interceptor
      }
    }
    function getLocaleFromPath() {
      const match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
      return match?.[1] ?? 'en';
    }
    function getReleaseSlugFromPath() {
      const match = window.location.pathname.match(/\/release\/([^/]+)\/\d+/);
      return match?.[1] ?? null;
    }
    async function fetchReleaseFromNextDataApi(buildId, releaseId, logger, page) {
      const locale = getLocaleFromPath();
      const slug = getReleaseSlugFromPath();
      const name_placeholder = slug ?? '0'; // Use actual slug when available for pagination
      let pageDataURL = `https://www.beatport.com/_next/data/${buildId}/${locale}/release/${name_placeholder}/${releaseId}.json?id=${releaseId}`;
      if (page != null && page > 1) {
        pageDataURL += `&per_page=100&page=${page}`;
        if (slug) {
          pageDataURL += `&description=${encodeURIComponent(slug)}`;
        }
      }
      try {
        const response = await fetch(pageDataURL);
        const pageData = await response.json();
        return pageData;
      } catch (error) {
        logger.error('Error fetching release data:', error);
        return null;
      }
    }

    /**
     * For releases with 100+ tracks, Beatport paginates the track data. Each page returns only
     * that page's tracks (page 1 = 100, page 2 = 9 for a 109-track release). The initial data
     * may be from whichever page the user is viewing, so we always fetch all pages to ensure
     * we get the complete track list regardless of the current view.
     */
    async function ensureFullTrackData(pageData, buildId, releaseId, logger) {
      const release = pageData.pageProps.release;
      if (!release || release.track_count <= 100) {
        return pageData;
      }
      const tracksQuery = pageData.pageProps.dehydratedState.queries.find(q => /tracks/.test(q.queryKey));
      const currentTrackCount = tracksQuery?.state?.data.results.length ?? 0;
      if (currentTrackCount >= release.track_count) {
        return pageData;
      }
      const totalPages = Math.ceil(release.track_count / 100);
      const allResults = [];
      for (let page = 1; page <= totalPages; page++) {
        logger.info(`Fetching page ${page}/${totalPages} to get full track list (${release.track_count} tracks)`);
        const paginatedData = await fetchReleaseFromNextDataApi(buildId, releaseId, logger, page);
        if (!paginatedData) continue;
        const pageTracksQuery = paginatedData.pageProps.dehydratedState.queries.find(q => /tracks/.test(q.queryKey));
        const pageResults = pageTracksQuery?.state?.data.results ?? [];
        allResults.push(...pageResults);
      }
      if (allResults.length < release.track_count) {
        logger.info('Could not fetch all paginated track data, using partial data');
        return pageData;
      }

      // Merge full track data into our page data
      const updatedQueries = pageData.pageProps.dehydratedState.queries.map(q => {
        if (!/tracks/.test(q.queryKey)) return q;
        const updatedState = q.state ? {
          ...q.state,
          data: {
            ...q.state.data,
            results: allResults
          }
        } : undefined;
        return updatedState != null ? {
          ...q,
          state: updatedState
        } : q;
      });
      return {
        pageProps: {
          ...pageData.pageProps,
          dehydratedState: {
            ...pageData.pageProps.dehydratedState,
            queries: updatedQueries
          }
        }
      };
    }
    function getBuildId() {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return undefined;
      try {
        const data = JSON.parse(el.innerHTML);
        return data.buildId;
      } catch {
        return undefined;
      }
    }

    /**
     * Release ID always comes from the URL. On SPA navigation, use interceptor cache;
     * on initial load, read __NEXT_DATA__ (its release id only verifies URL match — Next does not refresh it on client nav).
     */
    const getBeatportReleaseData = async logger => {
      const releaseIdFromURL = window.location.pathname.match(/release\/[^/]+\/(\d+)/)?.[1];
      if (!releaseIdFromURL) {
        /** Early return to avoid running the script on non-release pages */
        return null;
      }
      let pageData = null;
      let buildId;

      // SPA navigation: fresh JSON from Beatport's own fetch (see installFetchInterceptor).
      const cached = interceptedReleaseCache.get(releaseIdFromURL);
      if (cached) {
        interceptedReleaseCache.delete(releaseIdFromURL);
        pageData = cached;
      }
      const initialNextDataElement = document.getElementById('__NEXT_DATA__');
      if (initialNextDataElement && !pageData) {
        const data = JSON.parse(initialNextDataElement.innerHTML);
        // Initial load only: confirm embedded payload matches the URL before trusting it.
        const initialReleaseId = data.props.pageProps.release?.id.toString();
        buildId = data.buildId;
        if (initialReleaseId === releaseIdFromURL) {
          pageData = data.props;
        } else if (buildId) {
          pageData = await fetchReleaseFromNextDataApi(buildId, releaseIdFromURL, logger);
        }
      }
      if (!pageData) {
        logger.error('Cannot fetch release data: no __NEXT_DATA__ or buildId found');
        return null;
      }
      buildId ??= getBuildId();
      if (buildId) {
        pageData = await ensureFullTrackData(pageData, buildId, releaseIdFromURL, logger);
      }
      return pageData;
    };

    const LOGGER = new Logger('beatport_importer', LogLevel.INFO);

    // Capture Beatport's release fetches to avoid duplicate requests on SPA navigation
    installFetchInterceptor(LOGGER);
    const MB_IMPORT_SELECTOR = 'div.musicbrainz-import';
    const MB_IMPORT_BARCODE_ELEMENT = 'mb-import-barcode';
    const RELEASE_INFO_STYLE = 'display: flex; align-items: center; gap: 5px; flex-wrap: wrap;';

    /**
     * Remove existing MusicBrainz import UI to avoid duplicates
     */
    const cleanup = () => {
      document.querySelectorAll(MB_IMPORT_SELECTOR).forEach(el => {
        el.remove();
      });
      document.getElementById(MB_IMPORT_BARCODE_ELEMENT)?.remove();
    };
    async function processReleasePage() {
      cleanup();
      const isReleasePage = window.location.pathname.includes('/release/');
      if (!isReleasePage) {
        return;
      }
      const releaseData = await getBeatportReleaseData(LOGGER);
      if (!releaseData?.pageProps.release) {
        LOGGER.error('Could not find release data on the release page');
        return;
      }
      const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
      try {
        const release = releaseData.pageProps.release;

        // Reversing is less reliable, but the API does not provide track numbers.
        const tracks_table = release.tracks.reverse();
        const tracks_release = releaseData.pageProps.dehydratedState.queries.find(element => /tracks/g.test(element.queryKey));
        const tracks_data_array = tracks_release?.state?.data.results;
        if (!tracks_data_array) {
          LOGGER.error('Could not find tracks data');
          return;
        }
        const tracks_data = tracks_table.map(url => tracks_data_array.find(element => element.url === url)).filter(track => track !== undefined);
        const isrcs = tracks_data.map(track => track.isrc || null);
        const mbrelease = retrieveReleaseInfo(release_url, release, tracks_data);
        insertMBButtons(mbrelease, release_url, isrcs);
      } catch (error) {
        LOGGER.error('Error processing release page:', error);
      }
    }
    function retrieveReleaseInfo(release_url, release_data, tracks_data) {
      const release_date = release_data.new_release_date.split('-');

      // Release information global to all Beatport releases
      const mbrelease = {
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
      const mbtracks = [];
      const seen_tracks = {}; // to shoot duplicates ...
      const release_artists = [];
      for (const track of tracks_data) {
        if (track.release.id != release_data.id) {
          continue;
        }
        if (seen_tracks[track.id]) {
          continue;
        }
        seen_tracks[track.id] = true;
        const artists = [];
        for (const artist of track.artists) {
          artists.push(artist.name);
          release_artists.push(artist.name);
        }
        let title = track.name;
        if (track.mix_name && track.mix_name !== 'Original Mix') {
          title += ` (${track.mix_name})`;
        }
        mbtracks.push({
          artist_credit: MBImport.makeArtistCredits(artists),
          title: title,
          duration: track.length_ms
        });
      }
      const unique_artists = [...new Set(release_artists)];
      if (unique_artists.length > 4) {
        mbrelease.artist_credit = [MBImport.specialArtist('various_artists')];
      } else {
        mbrelease.artist_credit = MBImport.makeArtistCredits(unique_artists);
      }
      mbrelease.discs.push({
        tracks: mbtracks,
        format: mbrelease.format
      });
      return mbrelease;
    }

    // Insert MusicBrainz import UI into the release details under the controls section
    function insertMBButtons(mbrelease, release_url, isrcs) {
      const edit_note = MBImport.makeEditNote(release_url, 'Beatport');
      const parameters = MBImport.buildFormParameters(mbrelease, edit_note);
      const releaseInfoElements = document.querySelectorAll('div[class^="ReleaseDetailCard-style__Info"]');
      const lastReleaseInfo = releaseInfoElements[releaseInfoElements.length - 1];
      if (!lastReleaseInfo) {
        LOGGER.error('Could not find release info container');
        return;
      }
      const controlsElements = document.querySelectorAll('div[class^="ReleaseDetailCard-style__Controls"]');
      const controls = controlsElements[0];
      if (!controls) {
        LOGGER.error('Could not find controls container');
        return;
      }

      // Insert barcode information
      const barcodeText = mbrelease.barcode || '[none]';
      const releaseInfoBarcode = document.createElement('div');
      releaseInfoBarcode.className = lastReleaseInfo.className;
      releaseInfoBarcode.id = MB_IMPORT_BARCODE_ELEMENT;
      releaseInfoBarcode.style.cssText = RELEASE_INFO_STYLE;
      releaseInfoBarcode.innerHTML = `
        <p>Barcode</p>
        <span>${barcodeText}</span>
    `;
      lastReleaseInfo.insertAdjacentElement('afterend', releaseInfoBarcode);

      // Insert MusicBrainz import UI

      const isrcForm = document.createElement('form');
      isrcForm.className = 'musicbrainz_import';
      isrcForm.innerHTML = `<button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC">
            <img src="https://magicisrc.kepstin.ca/favicon.svg" alt="MagicISRC icon" width="14" height="14" style="margin-right: 4px;" />
            Submit ISRCs
        </button>`;
      isrcForm.addEventListener('click', event => {
        const query = isrcs.map((isrc, index) => isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`).join('&');
        event.preventDefault();
        window.open(`https://magicisrc.kepstin.ca?${query}`);
      });
      const importLinkHTML = MBImport.buildHarmonyButton({
        barcode: mbrelease.barcode,
        release_url,
        variant: 'full'
      });
      const releaseInfoButtons = document.createElement('div');
      releaseInfoButtons.className = `${lastReleaseInfo.className} musicbrainz-import`;
      releaseInfoButtons.style.cssText = RELEASE_INFO_STYLE;
      releaseInfoButtons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(mbrelease);
      releaseInfoButtons.appendChild(isrcForm);
      releaseInfoButtons.insertAdjacentHTML('beforeend', importLinkHTML);
      controls.insertAdjacentElement('afterend', releaseInfoButtons);
    }
    function init() {
      MBImportStyle();

      // Process initial page load
      setTimeout(() => {
        void processReleasePage();
      }, 1000);
    }

    // Subscribe to SPA navigation events
    subscribeToSPANavigation({
      onNavigate: () => processReleasePage()
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

})();
