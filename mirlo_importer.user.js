// ==UserScript==
// @name         Import Mirlo releases to MusicBrainz
// @description  One-click importing of releases from mirlo.space into MusicBrainz
// @version      2026.09.15.6
// @author       Raman Sinclair
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mirlo_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mirlo_importer.user.js
// @match        https://mirlo.space/*
// @connect      musicbrainz.org
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
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

    const VERSION_MARKER = /\b(?:acoustic|clean|club|demo|dub|edit|explicit|extended|instrumental|karaoke|live|mix|mono|radio|remaster(?:ed)?|remix|stereo|version|vocal)\b/i;

    /** Remove version information while retaining the actual work title. */
    function normalizeTrackTitle(title) {
      let normalized = title.normalize('NFKC').toLocaleLowerCase();

      // Remove bracketed qualifiers such as "(Jane Doe Remix)" or "[Live]".
      normalized = normalized.replace(/\s*[([{]([^\])}]*?)[\])}]/g, (match, contents) => VERSION_MARKER.test(contents) ? '' : match);

      // Also support unbracketed suffixes such as " - Radio Edit".
      normalized = normalized.replace(/\s*[-–—:]\s*([^\n]*)$/, (match, suffix) => VERSION_MARKER.test(suffix) ? '' : match);
      return normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    }
    function isMultiTrackSingle(numTracks, trackTitles) {
      if (!Array.isArray(trackTitles) || numTracks < 2 || trackTitles.length !== numTracks || trackTitles.some(title => typeof title !== 'string')) {
        return false;
      }
      const normalizedTitles = trackTitles.map(normalizeTrackTitle);
      return normalizedTitles.every(title => title.length > 0 && title === normalizedTitles[0]);
    }

    /**
     * Guess a primary release type in descending order of confidence:
     *
     * 1. Reject invalid track counts.
     * 2. Honor an explicit "EP" or "E.P." token in the release title. It takes precedence over every other signal, including "Single" and version-title deduplication.
     * 3. Honor an explicit "Single" token when the release remains within broad track count and duration guards. Unlike "EP", "single" is common English text and therefore needs basic false-positive protection.
     * 4. Normalize track titles by removing technical version qualifiers such as "Remix", "Instrumental", "Edit", "Live", and "Version". If every track then has the same non-empty title, classify the release as a multi-track Single.
     * 5. If duration is missing, use track count only where it is reasonably decisive: one track is a Single, three to six tracks is an EP, and seven or more tracks is an album. Leave two tracks unclassified because both Singles and electronic EPs commonly have two tracks.
     * 6. With duration available, seven or more tracks or more than 30 minutes is an album. For releases with fewer than seven tracks, one to seven minutes is a Single; more than seven and up to 30 minutes with at least two tracks is an EP. Leave sub-minute releases and one-track releases between seven and 30 minutes unclassified rather than making a weak guess.
     *
     * `durationMs` is the complete release duration. Pass NaN when one or more track durations are unavailable. `trackTitles` must contain every track title for the multi-track Single check to apply.
     */
    function guessReleaseType(title, numTracks, durationMs, trackTitles = []) {
      if (!Number.isInteger(numTracks) || numTracks < 1) return '';
      const releaseTitle = typeof title === 'string' ? title : '';
      const hasSingle = /\bsingle\b/i.test(releaseTitle);
      const hasEP = /\bE\.?P\b\.?/i.test(releaseTitle);
      const hasDuration = Number.isFinite(durationMs) && durationMs > 0;
      const durationMinutes = hasDuration ? durationMs / 60_000 : Number.NaN;

      // "EP" is a comparatively unambiguous marketing token and takes precedence, including over track-title deduplication and a simultaneous "Single" token.
      if (hasEP) return 'EP';

      // "Single" is a common English word, so retain broad sanity limits. A missing duration is not evidence against an otherwise plausible explicit token.
      if (hasSingle && numTracks <= 8 && (!hasDuration || durationMinutes <= 50)) return 'single';

      // Remix/version bundles of one work are normally marketed as singles. Do this before count/duration heuristics so large remix bundles can still be detected.
      if (isMultiTrackSingle(numTracks, trackTitles)) return 'single';
      if (!hasDuration) {
        if (numTracks === 1) return 'single';
        if (numTracks >= 3 && numTracks <= 6) return 'EP';
        if (numTracks >= 7) return 'album';
        // A two-track release without duration can plausibly be a Single or an EP.
        return '';
      }

      // Track count is strong evidence for albums even when individual tracks are short.
      if (numTracks >= 7) return 'album';
      if (durationMinutes > 30) return 'album';
      if (durationMinutes < 1) return '';
      if (durationMinutes <= 7) return 'single';
      if (numTracks >= 2) return 'EP';

      // A long one-track release is album-like; 7..30 minutes remains too ambiguous.
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
      const track_titles = [];
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
              track_titles.push(track.title);
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
              if (track.recording) appendParameter(parameters, `mediums.${i}.track.${j}.recording`, track.recording); // oxlint-disable-line typescript/no-unsafe-argument
              buildArtistCreditsFormParameters(parameters, `mediums.${i}.track.${j}.`, track.artist_credit);
            }
          }
        }
      }

      // Guess release type if not given
      if (!release.type && release.title) {
        const allTracksHaveDuration = total_tracks === total_tracks_with_duration;
        const complete_duration = allTracksHaveDuration ? total_duration : Number.NaN;
        release.type = guessReleaseType(release.title, total_tracks, complete_duration, track_titles);
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

    const MB_SEARCH_MARKS = {
      artist: 'A',
      recording: 'T',
      release: 'R',
      'release-group': 'G',
      place: 'P',
      label: 'L',
      series: 'S'
    };
    /**
     * Create the compact entity search indicator used next to external entity links.
     * Placement and replacement with resolved MusicBrainz links are left to the caller.
     */
    function createEntitySearchLink(mbType, entityName, {
      searchMode = 'indexed'
    } = {}) {
      const normalizedType = mbType.replaceAll('_', '-');
      const mark = MB_SEARCH_MARKS[normalizedType] || '';
      const displayType = normalizedType in MB_SEARCH_MARKS ? normalizedType.replaceAll('-', ' ') : 'entity';
      const href = searchMode === 'exact' ? exactSearchUrlFor(mbType, entityName) : searchUrlFor(mbType, entityName);
      const indicator = document.createElement('span');
      indicator.className = 'mb_valign mb_searchit';
      const searchLink = document.createElement('a');
      searchLink.className = 'mb_search_link';
      searchLink.target = '_blank';
      searchLink.title = `Search this ${displayType} on MusicBrainz (open in a new tab)`;
      searchLink.href = href;
      searchLink.innerHTML = `<small>${mark}</small>?`;
      indicator.append(searchLink);
      return indicator;
    }
    function setEntityLookupState(indicator, state) {
      indicator.classList.remove('mb_lookup_error', 'mb_lookup_loading');
      indicator.removeAttribute('aria-label');
      indicator.removeAttribute('role');
      indicator.removeAttribute('title');
      if (state === 'matched') {
        indicator.classList.remove('mb_searchit');
        return;
      }
      indicator.classList.add('mb_searchit');
      if (state === 'loading') {
        indicator.classList.add('mb_lookup_loading');
        indicator.setAttribute('aria-label', 'Looking up this entity on MusicBrainz');
        indicator.setAttribute('role', 'status');
        indicator.title = 'Looking up this entity on MusicBrainz';
      } else if (state === 'error') {
        indicator.classList.add('mb_lookup_error');
        indicator.setAttribute('aria-label', 'MusicBrainz lookup failed');
        indicator.setAttribute('role', 'img');
        indicator.title = 'MusicBrainz lookup failed';
      }
    }
    function createEntityLookupIndicator(mbType, entityName, options) {
      const indicator = createEntitySearchLink(mbType, entityName, options);
      setEntityLookupState(indicator, 'loading');
      return indicator;
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
      createEntitySearchLink,
      createEntityLookupIndicator,
      setEntityLookupState,
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
    function MBSearchItStyle() {
      const css_search_it = `
   .mb_valign {
     display: inline-block;
     vertical-align: top;
   }
   .mb_searchit {
     width: 16px;
     height: 16px;
     margin: 0;
     padding: 0;
     background-color: #FFF7BE;
     border: 0px;
     vertical-align: top;
     font-size: 11px;
     text-align: center;
   }
   .mb_valign.mb_searchit {
     font-weight: bold;
     line-height: 16px;
   }
   a.mb_search_link {
     color: #888;
     text-decoration: none;
   }
   a.mb_search_link small {
     font-size: 8px;
   }
   .mb_searchit a.mb_search_link:hover {
     color: darkblue;
   }
   .mb_lookup_loading > *,
   .mb_lookup_error > * {
     display: none !important;
   }
   .mb_lookup_loading,
   .mb_lookup_error {
     display: inline-flex;
     align-items: center;
     justify-content: center;
   }
   .mb_lookup_loading::before {
     content: '';
     display: block;
     width: 11px;
     height: 11px;
     box-sizing: border-box;
     border: 2px solid #d7ca75;
     border-top-color: #ba478f;
     border-radius: 50%;
     animation: mb_lookup_spin 1.2s linear infinite;
   }
   .mb_lookup_error::before {
     content: '⚠';
     color: #c62828;
     font-size: 13px;
     line-height: 16px;
   }
   @keyframes mb_lookup_spin {
     to { transform: rotate(360deg); }
   }
   .mb_wrapper {
     display: inline-block;
   }
   `;
      _add_css(css_search_it);
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

    const LEGACY_GM_API_NAMES = {
      getValue: 'GM_getValue',
      setValue: 'GM_setValue',
      xmlHttpRequest: 'GM_xmlhttpRequest'
    };
    function getOptionalGlobal(name) {
      return Reflect.get(globalThis, name);
    }
    function getGmApi(name) {
      const modernGM = getOptionalGlobal('GM');
      const modernApi = modernGM?.[name];
      return modernApi ?? getOptionalGlobal(LEGACY_GM_API_NAMES[name]);
    }

    // Class MBLinks : query MusicBrainz for urls and display links for matching urls
    // The main method is searchAndDisplayMbLinks()

    function getRawHeader(rawHeaders, name) {
      const expectedName = name.toLowerCase();
      for (const line of rawHeaders.split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator >= 0 && line.slice(0, separator).trim().toLowerCase() === expectedName) {
          return line.slice(separator + 1).trim();
        }
      }
      return null;
    }
    function requestJSON(url) {
      const gmRequest = getGmApi('xmlHttpRequest');
      if (!gmRequest) {
        return fetch(url, {
          headers: {
            Accept: 'application/json'
          }
        }).then(response => ({
          ok: response.ok,
          status: response.status,
          getHeader: name => response.headers?.get(name) ?? null,
          json: () => response.json()
        }));
      }
      return new Promise((resolve, reject) => {
        gmRequest({
          method: 'GET',
          url,
          headers: {
            Accept: 'application/json'
          },
          responseType: 'json',
          onload: response => {
            resolve({
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              getHeader: name => getRawHeader(response.responseHeaders, name),
              json: () => Promise.resolve(response.response ?? JSON.parse(response.responseText))
            });
          },
          onerror: () => reject(new Error('Network request failed'))
        });
      });
    }
    function getRetryDelayMs(response) {
      const retryAfter = response.getHeader('retry-after');
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(delay) && delay >= 0) return delay;
      }
      const resetSeconds = Number(response.getHeader('x-ratelimit-reset'));
      if (!Number.isFinite(resetSeconds) || resetSeconds <= 0) return undefined;
      const serverDate = Date.parse(response.getHeader('date') ?? '');
      const referenceTime = Number.isFinite(serverDate) ? serverDate : Date.now();
      return Math.max(0, resetSeconds * 1000 - referenceTime);
    }
    class AjaxRequests {
      // properties: "key": {handler: function, next: property, context: {}}
      first = '';
      last = '';
      empty() {
        return this.first == '';
      }
      push(key, handler, context) {
        const request = this[key];
        if (typeof request === 'object') {
          request.handler = handler;
          request.context = context;
        } else {
          this[key] = {
            handler: handler,
            next: '',
            context: context
          };
          if (this.first == '') {
            this.first = this.last = key;
          } else {
            const lastRequest = this[this.last];
            if (typeof lastRequest === 'object') {
              lastRequest.next = key;
            }
            this.last = key;
          }
        }
      }
      shift() {
        if (this.empty()) {
          return;
        }
        const key = this.first;
        const request = this[key];
        if (typeof request !== 'object') {
          return;
        }
        const handler = request.handler;
        const context = request.context;
        this.first = request.next;
        // oxlint-disable-next-line typescript/no-dynamic-delete -- Kept in line with the original request queue.
        delete this[key]; // delete this property
        return handler.bind(context);
      }
    }

    /**
     * Processes a URL match from the MusicBrainz API response: updates cache and inserts
     * MusicBrainz links into all batch entries that reference this resource.
     *
     * @private
     * @param options - Options for processing the URL match.
     * @param options.mblinks - The MBLinks instance (for cache and link creation).
     * @param options.batch - Batch of URL data entries for this request.
     * @param options.resource - The resource URL from the API response.
     * @param options.relations - Relations array from the API response.
     */
    function processUrlMatch({
      mblinks,
      batch,
      resource,
      relations,
      foundQueries
    }) {
      const matching_urls_data = batch.filter(query => queryMatchesResource(query, resource));
      if (matching_urls_data.length === 0) return;
      if (!relations) return;
      matching_urls_data.forEach(reference => {
        const key = reference.key || reference.url;
        const _type = reference.mb_type.replace('-', '_');
        if (!mblinks.cache[key]) {
          mblinks.cache[key] = {
            timestamp: new Date().getTime(),
            urls: []
          };
        }

        // Build map of mb_url -> ended (true only if every relation for that URL+entity is ended).
        const urlData = {};
        relations.forEach(relation => {
          if (_type in relation) {
            const entity = relation[_type];
            const mb_url = `${mblinks.mb_server}/${reference.mb_type}/${entity.id}`;
            if (!(mb_url in urlData)) urlData[mb_url] = {
              ended: true
            };
            if (!relation.ended) urlData[mb_url].ended = false;
          }
        });
        const cacheUrls = mblinks.cache[key].urls;
        const getUrl = entry => typeof entry === 'string' ? entry : entry.url;
        Object.keys(urlData).forEach(mb_url => {
          foundQueries?.add(reference);
          const ended = urlData[mb_url].ended;
          const alreadyCached = cacheUrls.some(e => getUrl(e) === mb_url);
          if (!alreadyCached) {
            cacheUrls.push({
              url: mb_url,
              ended: _type === 'release' ? ended : false
            });
          }
          const link = mblinks.createMusicBrainzLink(mb_url, _type, _type === 'release' ? {
            ended
          } : {});
          reference.insert_func(link);
        });
      });
    }
    function queryMatchesResource(query, resource) {
      if (!query.url_regex) return query.url === resource;
      try {
        return new RegExp(`^(?:${query.url_regex})$`).test(resource);
      } catch {
        return false;
      }
    }

    // user_cache_key = textual key used to store cached data in local storage
    // version = optionnal version,  to force creation of a cache (ie. when format of keys changes)
    // expiration = time in minutes before an entry is refreshed, value <= 0 disables cache reads, if undefined or false, use defaults
    class MBLinks {
      supports_local_storage;
      ajax_requests = new AjaxRequests();
      pendingRequests = [];
      requestTimer;
      nextRequestAt = 0;
      rateLimitResetAt = 0;
      cache = {};
      expirationMinutes;
      user_cache_key;
      cache_key;
      mb_server = 'https://musicbrainz.org';
      type_link_info;
      constructor(user_cache_key, version, expiration) {
        this.supports_local_storage = (() => {
          try {
            return !!localStorage.getItem;
          } catch {
            return false;
          }
        })();
        this.expirationMinutes = typeof expiration != 'undefined' && expiration !== false ? parseInt(String(expiration), 10) : 90 * 24 * 60; // default to 90 days
        const cache_version = 3;
        this.user_cache_key = user_cache_key;
        this.cache_key = `${this.user_cache_key}-v${cache_version}${typeof version != 'undefined' ? `.${version}` : ''}`;
        // overrides link title and img src url (per type), see createMusicBrainzLink()
        this.type_link_info = {
          release_group: {
            title: 'See this release group on MusicBrainz'
          },
          place: {
            img_src: `<img src="${this.mb_server}/static/images/entity/place.svg" height=16 width=16 />`
          }
        };
        this.initCache();
        this.initAjaxEngine();
      }
      initAjaxEngine() {
        const ajax_requests = this.ajax_requests;
        setInterval(function () {
          if (!ajax_requests.empty()) {
            const request = ajax_requests.shift();
            if (typeof request === 'function') {
              request();
            }
          }
        }, 1000);
      }

      /**
       * GET JSON with retry on 5xx errors (e.g. 503), using server-provided rate-limit headers when available, with exponential backoff capped at 30 seconds and a five-minute retry budget.
       * @param url - The URL to request.
       * @param successCallback - Called with response data on success.
       * @param alwaysCallback - Called when the request is finally done (success or after giving up retries).
       */
      getJSONWithRetry(url, successCallback, alwaysCallback) {
        const retryDeadline = Date.now() + 5 * 60 * 1000;
        let attempt = 0;
        const doRequest = () => {
          attempt += 1;
          requestJSON(url).then(response => {
            const retryDelayMs = getRetryDelayMs(response);
            if (retryDelayMs !== undefined && (!response.ok || response.getHeader('x-ratelimit-remaining') === '0')) {
              this.pauseRequests(retryDelayMs);
            }
            if (!response.ok) {
              const error = new Error(`HTTP ${response.status}`);
              error.status = response.status;
              if (retryDelayMs !== undefined) error.retryDelayMs = retryDelayMs;
              throw error;
            }
            return response.json();
          }).then(function (data) {
            successCallback(data);
            if (typeof alwaysCallback === 'function') {
              alwaysCallback(true);
            }
          }).catch(error => {
            const status = isErrorWithStatus(error) ? error.status : 0;
            const is5xx = status >= 500 && status < 600;
            if (is5xx) {
              const serverDelayMs = error instanceof Error ? error.retryDelayMs ?? 0 : 0;
              const retryDelayMs = Math.max(serverDelayMs, Math.min(30_000, 1000 * 2 ** (attempt - 1)));
              if (Date.now() + retryDelayMs <= retryDeadline) {
                setTimeout(() => {
                  this.scheduleRequest(doRequest);
                }, retryDelayMs);
              } else if (typeof alwaysCallback === 'function') {
                alwaysCallback(false);
              }
            } else if (typeof alwaysCallback === 'function') {
              alwaysCallback(false);
            }
          });
        };
        this.scheduleRequest(doRequest);
      }
      scheduleRequest(request) {
        this.pendingRequests.push(request);
        this.runNextRequest();
      }
      pauseRequests(delayMs) {
        this.rateLimitResetAt = Math.max(this.rateLimitResetAt, Date.now() + delayMs);
      }
      runNextRequest() {
        if (this.requestTimer || this.pendingRequests.length === 0) return;
        const now = Date.now();
        const runAt = Math.max(now, this.nextRequestAt, this.rateLimitResetAt);
        const delay = runAt - now;
        if (delay > 0) {
          this.requestTimer = setTimeout(() => {
            this.requestTimer = undefined;
            this.runNextRequest();
          }, delay);
          return;
        }
        const request = this.pendingRequests.shift();
        this.nextRequestAt = now + 1000;
        request();
        this.runNextRequest();
      }
      initCache() {
        if (!this.supports_local_storage) return;
        // Check if we already added links for this content
        this.cache = JSON.parse(localStorage.getItem(this.cache_key) || '{}');
        // remove old entries
        this.clearCacheExpired();
        // remove old cache versions
        this.removeOldCacheVersions();
      }
      saveCache() {
        if (!this.supports_local_storage) return;
        try {
          localStorage.setItem(this.cache_key, JSON.stringify(this.cache));
        } catch (e) {
          alert(e);
        }
      }
      removeOldCacheVersions() {
        const to_remove = [];
        for (let i = 0, len = localStorage.length; i < len; ++i) {
          const key = localStorage.key(i);
          if (key.startsWith(this.user_cache_key)) {
            if (key !== this.cache_key) {
              // we don't want to remove current cache
              to_remove.push(key);
            }
          }
        }
        // remove old cache keys
        for (const element of to_remove) {
          localStorage.removeItem(element);
        }
      }
      clearCacheExpired() {
        const new_cache = {};
        Object.keys(this.cache).forEach(key => {
          if (this.is_cached(key)) {
            new_cache[key] = this.cache[key];
          }
        });
        this.cache = new_cache;
      }
      is_cached(key) {
        const entry = this.cache[key];
        return Boolean(entry && entry.urls && entry.urls.length > 0 && this.expirationMinutes > 0 && new Date().getTime() < entry.timestamp + this.expirationMinutes * 60 * 1000);
      }

      // Search for ressource 'url' in local cache, and return the matching MBID if there's only matching MB entity.
      // If the url is not known by the cache, no attempt will be made to request the MusicBrainz webservice, in order to keep this method synchronous.
      resolveMBID(key) {
        if (this.is_cached(key) && this.cache[key].urls.length == 1) {
          const entry = this.cache[key].urls[0];
          const mb_url = typeof entry === 'string' ? entry : entry.url;
          return mb_url.slice(-36);
        }
        return undefined;
      }

      /**
       * Create an HTML element for a MusicBrainz link with the given type and URL.
       * @param mb_url - The URL of the MusicBrainz entity.
       * @param _type - The type of the MusicBrainz entity.
       * @param options - Optional options.
       * @param options.ended - When true and type is release, applies grayscale to the icon.
       * @returns The HTML for the MusicBrainz link.
       */
      createMusicBrainzLink(mb_url, _type, options) {
        let title = `See this ${_type} on MusicBrainz`;
        let img_url = `${this.mb_server}/static/images/entity/${_type}.svg`;
        let img_src = `<img src="${img_url}" height=16 width=16 />`;
        // handle overrides
        const ti = this.type_link_info[_type];
        if (ti) {
          if (ti.title) title = ti.title;
          if (ti.img_url) img_url = ti.img_url;
          if (ti.img_src) img_src = ti.img_src;
        }
        if (_type === 'release' && options?.ended) {
          img_src = img_src.replace('/>', ' style="filter: grayscale(1)" />');
        }
        return `<a href="${mb_url}" title="${title}">${img_src}</a> `;
      }

      // Batch process multiple URLs in a single request
      // urls_data should be an array of objects with the following structure:
      // { url: string, mb_type: string, insert_func: function, key: string }
      searchAndDisplayMbLinks(urls_data) {
        // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the original callback contexts.
        const mblinks = this;

        // Filter out URLs that are already cached
        const uncached_urls = [];
        urls_data.forEach(data => {
          const key = data.key || data.url;
          if (this.is_cached(key)) {
            // Handle cached results immediately
            const data_type = data.mb_type.replace('-', '_');
            mblinks.cache[key].urls.forEach(cacheEntry => {
              const mb_url = typeof cacheEntry === 'string' ? cacheEntry : cacheEntry.url;
              const ended = typeof cacheEntry === 'string' ? false : cacheEntry.ended;
              const options = data_type === 'release' ? {
                ended
              } : {};
              data.insert_func(mblinks.createMusicBrainzLink(mb_url, data_type, options));
            });
            data.complete_func?.({
              found: true,
              status: 'success'
            });
          } else {
            uncached_urls.push(data);
          }
        });
        if (uncached_urls.length === 0) {
          return; // All URLs were cached
        }

        // Process URLs in batches
        const BATCH_SIZE = 75;
        for (let i = 0; i < uncached_urls.length; i += BATCH_SIZE) {
          const batch = uncached_urls.slice(i, i + BATCH_SIZE);
          const resources = batch.map(data => encodeURIComponent(data.url)).join('&resource=');
          const mb_type = batch[0].mb_type;
          const query = `${mblinks.mb_server}/ws/2/url?resource=${resources}&inc=${mb_type}-rels`;

          // Merge with previous context if there's already a pending ajax request
          let handlers = [];
          let failureHandlers = [];
          const request = mblinks.ajax_requests[query];
          if (typeof request === 'object') {
            handlers = request.context.handlers;
            failureHandlers = request.context.failureHandlers;
          }
          handlers.push(function (data) {
            const foundQueries = new Set();
            if ('urls' in data) {
              const processedResources = {};
              data.urls.forEach(url_data => {
                if (processedResources[url_data.resource]) return;
                processedResources[url_data.resource] = true;
                processUrlMatch({
                  mblinks,
                  batch,
                  resource: url_data.resource,
                  relations: url_data.relations,
                  foundQueries
                });
              });
            } else if ('relations' in data && 'resource' in data) {
              /**
               * For some reason, for a single entity request the API response has a different shape.
               */
              processUrlMatch({
                mblinks,
                batch,
                resource: data.resource,
                relations: data.relations,
                foundQueries
              });
            }
            mblinks.saveCache();
            batch.forEach(queryData => {
              queryData.complete_func?.({
                found: foundQueries.has(queryData),
                status: 'success'
              });
            });
          });
          failureHandlers.push(() => {
            batch.forEach(queryData => queryData.complete_func?.({
              found: false,
              status: 'error'
            }));
          });
          mblinks.ajax_requests.push(query, function () {
            // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the original callback context.
            const ctx = this;
            ctx.mblinks.getJSONWithRetry(ctx.query, function (data) {
              ctx.handlers.forEach(handler => {
                handler(data);
              });
            }, function (succeeded) {
              if (!succeeded) ctx.failureHandlers.forEach(handler => handler());
            });
          }, {
            failureHandlers,
            handlers: handlers,
            query: query,
            mblinks: mblinks
          });
        }
      }

      /**
       * Search MusicBrainz's indexed URL field with Lucene regular expressions,
       * then resolve the discovered resources to load their relationships.
       */
      searchAndDisplayMbLinksByRegex(urls_data) {
        // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the callback contexts above.
        const mblinks = this;
        const uncachedQueries = [];
        urls_data.forEach(data => {
          const key = data.key || data.url;
          if (this.is_cached(key)) {
            const dataType = data.mb_type.replace('-', '_');
            mblinks.cache[key].urls.forEach(cacheEntry => {
              const mbUrl = typeof cacheEntry === 'string' ? cacheEntry : cacheEntry.url;
              const ended = typeof cacheEntry === 'string' ? false : cacheEntry.ended;
              data.insert_func(mblinks.createMusicBrainzLink(mbUrl, dataType, dataType === 'release' ? {
                ended
              } : {}));
            });
            data.complete_func?.({
              found: true,
              status: 'success'
            });
          } else if (data.url_regex) {
            uncachedQueries.push(data);
          }
        });
        const batchSize = 20;
        for (let i = 0; i < uncachedQueries.length; i += batchSize) {
          const batch = uncachedQueries.slice(i, i + batchSize);
          const regex = batch.map(data => `(${data.url_regex})`).join('|');
          const lookup = {
            batch,
            discoveredResources: new Set(),
            outcomes: new Map(batch.map(query => [query, {
              failed: false,
              found: false
            }])),
            pending: 0
          };
          this.enqueueRegexSearchPage(batch, regex, 0, lookup);
        }
      }
      enqueueRegexSearchPage(batch, regex, offset, lookup) {
        lookup.pending += 1;
        // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the callback contexts above.
        const mblinks = this;
        const search = `url:/(${regex})/`;
        const query = `${mblinks.mb_server}/ws/2/url?query=${encodeURIComponent(search)}&fmt=json&limit=100&offset=${offset}`;
        let handlers = [];
        let failureHandlers = [];
        const request = mblinks.ajax_requests[query];
        if (typeof request === 'object') {
          handlers = request.context.handlers;
          failureHandlers = request.context.failureHandlers;
        }
        handlers.push(function (data) {
          const urls = data.urls ?? [];
          const discoveredQueries = [];
          const discoveredResources = new Set();
          urls.forEach(urlData => {
            if (discoveredResources.has(urlData.resource)) return;
            discoveredResources.add(urlData.resource);
            batch.forEach(queryData => {
              if (!queryMatchesResource(queryData, urlData.resource)) return;
              const resourceKey = `${queryData.key ?? queryData.url}\0${urlData.resource}`;
              if (lookup.discoveredResources.has(resourceKey)) return;
              lookup.discoveredResources.add(resourceKey);
              lookup.pending += 1;
              discoveredQueries.push({
                url: urlData.resource,
                mb_type: queryData.mb_type,
                insert_func: queryData.insert_func,
                key: queryData.key || queryData.url,
                complete_func: result => {
                  const outcome = lookup.outcomes.get(queryData);
                  outcome.found ||= result.found;
                  outcome.failed ||= result.status === 'error';
                  mblinks.finishRegexOperation(lookup);
                }
              });
            });
          });
          mblinks.searchAndDisplayMbLinks(discoveredQueries);
          const responseOffset = data.offset ?? offset;
          const nextOffset = responseOffset + urls.length;
          if (typeof data.count === 'number' && urls.length > 0 && nextOffset < data.count) {
            mblinks.enqueueRegexSearchPage(batch, regex, nextOffset, lookup);
          }
          mblinks.finishRegexOperation(lookup);
        });
        failureHandlers.push(() => {
          lookup.outcomes.forEach(outcome => {
            outcome.failed = true;
          });
          mblinks.finishRegexOperation(lookup);
        });
        mblinks.ajax_requests.push(query, function () {
          // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the original callback context.
          const ctx = this;
          ctx.mblinks.getJSONWithRetry(ctx.query, function (data) {
            ctx.handlers.forEach(handler => {
              handler(data);
            });
          }, function (succeeded) {
            if (!succeeded) ctx.failureHandlers.forEach(handler => handler());
          });
        }, {
          failureHandlers,
          handlers,
          query,
          mblinks
        });
      }
      finishRegexOperation(lookup) {
        lookup.pending -= 1;
        if (lookup.pending !== 0) return;
        lookup.batch.forEach(query => {
          const outcome = lookup.outcomes.get(query);
          query.complete_func?.({
            found: outcome.found,
            status: outcome.failed ? 'error' : 'success'
          });
        });
      }
    }
    function isErrorWithStatus(error) {
      return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number';
    }

    const LOOKUP_ATTRIBUTE = 'data-mb-mirlo-lookup';
    const RELEASE_PATH = /^\/([^/]+)\/release\/([^/]+)\/?$/;
    const TRACK_PATH = /^\/([^/]+)\/release\/([^/]+)\/tracks\/(\d+)\/?$/;
    const HOMEPAGE_SECTION_HEADINGS = new Set(['Recent releases', 'Recent purchases']);
    const RELEASE_CARD_LINK_SELECTOR = ':is(h2, h3, h4) > a[href]';
    let entityMatchHandler;
    let scheduleLookups;
    const labelRosterTypes = new Map();
    const loadingLabelRosters = new Set();
    function canonicalUrl(pathname) {
      return `${window.location.origin}${pathname.replace(/\/$/, '')}`;
    }
    function pathnameFor(link) {
      try {
        const url = new URL(link.href, window.location.origin);
        return url.origin === window.location.origin ? url.pathname : undefined;
      } catch {
        return undefined;
      }
    }
    function createLookup(queries, type, url, name, target, placement = 'prepend') {
      if (target.hasAttribute(LOOKUP_ATTRIBUTE)) return;
      target.setAttribute(LOOKUP_ATTRIBUTE, type);
      const indicator = MBImport.createEntityLookupIndicator(type, name);
      indicator.classList.add('mb-mirlo-link');
      indicator.addEventListener('click', event => event.stopPropagation());
      if (placement === 'before') target.before(indicator);else target.prepend(indicator);
      let foundMatch = false;
      const matchedMbids = new Set();
      let matchNotificationScheduled = false;
      queries[type].push({
        url,
        mb_type: type,
        key: `${type}:${url}`,
        insert_func: link => {
          if (!indicator.isConnected) return;
          if (!foundMatch) {
            indicator.replaceChildren();
            MBImport.setEntityLookupState(indicator, 'matched');
            foundMatch = true;
          }
          indicator.insertAdjacentHTML('beforeend', link.trim());
          const mbid = link.match(new RegExp(`/${type}/([0-9a-f-]{36})`, 'i'))?.[1];
          if (!mbid) return;
          matchedMbids.add(mbid);
          if (matchNotificationScheduled) return;
          matchNotificationScheduled = true;
          queueMicrotask(() => {
            matchNotificationScheduled = false;
            if (matchedMbids.size === 1) entityMatchHandler?.(type, url, mbid);
          });
        },
        complete_func: result => {
          if (!foundMatch) MBImport.setEntityLookupState(indicator, result.status === 'error' ? 'error' : 'search');
        }
      });
    }
    function addArtistLookup(queries, artistSlug, artistLink) {
      const artistName = artistLink.textContent.trim() || artistLink.title;
      if (!artistName) return;
      createLookup(queries, 'artist', canonicalUrl(`/${artistSlug}`), artistName, artistLink, 'before');
    }
    function addLabelLookups(queries, artistSlug, title) {
      const header = title?.parentElement?.parentElement;
      if (!header) return;
      header.querySelectorAll('a[href]').forEach(link => {
        const pathname = pathnameFor(link)?.replace(/\/$/, '');
        if (!pathname || pathname === `/${artistSlug}` || !/^\/[^/]+$/.test(pathname)) return;
        const labelName = link.textContent.trim() || link.title;
        if (labelName) createLookup(queries, 'label', canonicalUrl(pathname), labelName, link, 'before');
      });
    }
    function addReleasePageLookups(queries, artistSlug, releaseSlug) {
      const releaseUrl = canonicalUrl(`/${artistSlug}/release/${releaseSlug}`);
      const title = document.querySelector('#main-content h1');
      if (title?.textContent.trim()) createLookup(queries, 'release', releaseUrl, title.textContent.trim(), title);
      addLabelLookups(queries, artistSlug, title);
      document.querySelectorAll('#main-content a[href]').forEach(link => {
        if (pathnameFor(link)?.replace(/\/$/, '') === `/${artistSlug}`) addArtistLookup(queries, artistSlug, link);
      });
      document.querySelectorAll('#main-content li[id]').forEach(row => {
        if (!/^\d+$/.test(row.id) || !row.querySelector('button[aria-label="Track options"]')) return;
        const details = row.children.item(1);
        const trackTitle = details?.children.item(0);
        const name = trackTitle?.textContent.trim();
        if (!trackTitle || !name) return;
        createLookup(queries, 'recording', `${releaseUrl}/tracks/${row.id}`, name, trackTitle);
      });
    }
    function addTrackPageLookups(queries, artistSlug, releaseSlug, trackId) {
      const releasePath = `/${artistSlug}/release/${releaseSlug}`;
      const releaseUrl = canonicalUrl(releasePath);
      const title = document.querySelector('#main-content h1');
      if (title?.textContent.trim()) {
        createLookup(queries, 'recording', `${releaseUrl}/tracks/${trackId}`, title.textContent.trim(), title);
      }
      addLabelLookups(queries, artistSlug, title);
      document.querySelectorAll('#main-content a[href]').forEach(link => {
        const pathname = pathnameFor(link)?.replace(/\/$/, '');
        if (pathname === `/${artistSlug}`) addArtistLookup(queries, artistSlug, link);
        if (pathname === releasePath) {
          const releaseName = link.textContent.trim() || link.title;
          if (releaseName) createLookup(queries, 'release', releaseUrl, releaseName, link, 'before');
        }
      });
    }
    function addArtistPageLookups(queries, artistSlug) {
      const releasePathPrefix = `/${artistSlug}/release/`;
      const releases = [...document.querySelectorAll('#main-content h2 > a[href]')].filter(link => pathnameFor(link)?.startsWith(releasePathPrefix));
      if (releases.length === 0) return;
      const artistTitle = document.querySelector('#main-content h1');
      if (artistTitle?.textContent.trim()) {
        createLookup(queries, 'artist', canonicalUrl(`/${artistSlug}`), artistTitle.textContent.trim(), artistTitle);
      }
      releases.forEach(link => {
        const pathname = pathnameFor(link);
        const name = link.textContent.trim() || link.title;
        if (pathname && name) createLookup(queries, 'release', canonicalUrl(pathname), name, link.parentElement ?? link);
      });
    }
    function homepageSectionFor(heading) {
      let section = heading.parentElement;
      while (section && section !== document.body) {
        if (section.querySelector(`li ${RELEASE_CARD_LINK_SELECTOR}`)) return section;
        section = section.parentElement;
      }
      return undefined;
    }
    function addReleaseCardLookups(queries, container) {
      container.querySelectorAll('li').forEach(card => {
        const releaseLink = card.querySelector(RELEASE_CARD_LINK_SELECTOR);
        const releasePath = releaseLink ? pathnameFor(releaseLink) : undefined;
        const releaseMatch = releasePath ? RELEASE_PATH.exec(releasePath) : null;
        const releaseName = releaseLink?.textContent.trim() || releaseLink?.title;
        if (!releaseLink || !releasePath || !releaseMatch?.[1] || !releaseName) return;
        createLookup(queries, 'release', canonicalUrl(releasePath), releaseName, releaseLink.parentElement ?? releaseLink);
        const artistPath = `/${releaseMatch[1]}`;
        const artistLink = [...card.querySelectorAll('a[href]')].find(link => pathnameFor(link)?.replace(/\/$/, '') === artistPath);
        if (artistLink) {
          artistLink.parentElement?.classList.add('mb-mirlo-card-entity');
          addArtistLookup(queries, releaseMatch[1], artistLink);
        }
      });
    }
    function addTrackCardLookups(queries, container) {
      container.querySelectorAll('li').forEach(card => {
        const trackLink = card.querySelector(RELEASE_CARD_LINK_SELECTOR);
        const trackPath = trackLink ? pathnameFor(trackLink) : undefined;
        const trackMatch = trackPath ? TRACK_PATH.exec(trackPath) : null;
        const trackName = trackLink?.textContent.trim() || trackLink?.title;
        if (!trackLink || !trackPath || !trackMatch?.[1] || !trackName) return;
        createLookup(queries, 'recording', canonicalUrl(trackPath), trackName, trackLink.parentElement ?? trackLink);
        const artistPath = `/${trackMatch[1]}`;
        const artistLink = [...card.querySelectorAll('a[href]')].find(link => pathnameFor(link)?.replace(/\/$/, '') === artistPath);
        if (artistLink) {
          artistLink.parentElement?.classList.add('mb-mirlo-card-entity');
          addArtistLookup(queries, trackMatch[1], artistLink);
        }
      });
    }
    function addHomepageLookups(queries) {
      document.querySelectorAll('#main-content h3').forEach(heading => {
        if (!HOMEPAGE_SECTION_HEADINGS.has(heading.textContent.trim())) return;
        const section = homepageSectionFor(heading);
        if (section) addReleaseCardLookups(queries, section);
      });
    }
    function addReleasesPageLookups(queries) {
      const mainContent = document.querySelector('#main-content');
      if (mainContent) addReleaseCardLookups(queries, mainContent);
    }
    function resultContainerAfter(heading, resultSelector) {
      let current = heading;
      while (current && current.parentElement !== document.body) {
        const resultContainer = current.nextElementSibling;
        if (resultContainer?.querySelector(resultSelector)) return resultContainer;
        current = current.parentElement;
      }
      return undefined;
    }
    function addProfileCardLookups(queries, typeForPath, container) {
      const links = [...container.querySelectorAll('a[href]')];
      links.forEach(link => {
        const pathname = pathnameFor(link)?.replace(/\/$/, '');
        const name = link.textContent.trim();
        if (!pathname || !name || !/^\/[^/]+$/.test(pathname)) return;
        const hasMatchingImageLink = links.some(candidate => candidate !== link && pathnameFor(candidate)?.replace(/\/$/, '') === pathname && candidate.querySelector('img'));
        if (!hasMatchingImageLink) return;
        const type = typeof typeForPath === 'function' ? typeForPath(pathname) : typeForPath;
        if (!type) return;
        link.parentElement?.classList.add('mb-mirlo-card-entity');
        createLookup(queries, type, canonicalUrl(pathname), name, link, 'before');
      });
    }
    function addSearchPageLookups(queries) {
      document.querySelectorAll('#main-content h2').forEach(heading => {
        const headingText = heading.textContent.trim();
        if (/^Releases(?: for\b|$)/.test(headingText)) {
          const container = resultContainerAfter(heading, `li ${RELEASE_CARD_LINK_SELECTOR}`);
          if (container) addReleaseCardLookups(queries, container);
        } else if (/^Tracks(?: for\b|$)/.test(headingText)) {
          const container = resultContainerAfter(heading, `li ${RELEASE_CARD_LINK_SELECTOR}`);
          if (container) addTrackCardLookups(queries, container);
        } else if (/^Artists(?: for\b|$)/.test(headingText)) {
          const container = resultContainerAfter(heading, 'a[href] img');
          if (container) addProfileCardLookups(queries, 'artist', container);
        } else if (/^Labels(?: for\b|$)/.test(headingText)) {
          const container = resultContainerAfter(heading, 'a[href] img');
          if (container) addProfileCardLookups(queries, 'label', container);
        }
      });
    }
    function addArtistsPageLookups(queries) {
      const mainContent = document.querySelector('#main-content');
      if (!mainContent) return;
      const type = new URLSearchParams(window.location.search).get('isLabel') === 'true' ? 'label' : 'artist';
      addProfileCardLookups(queries, type, mainContent);
    }
    function labelPageRoute() {
      const match = /^\/([^/]+)(?:\/([^/]+))?\/?$/.exec(window.location.pathname);
      if (!match?.[1]) return undefined;
      const title = document.querySelector('#main-content h1');
      const isLabel = [...(title?.parentElement?.querySelectorAll('span') ?? [])].some(span => span.textContent.trim() === 'Label');
      if (!title || !isLabel) return undefined;
      return {
        labelSlug: match[1],
        ...(match[2] ? {
          tab: match[2]
        } : {})
      };
    }
    function loadLabelRoster(labelSlug) {
      if (labelRosterTypes.has(labelSlug) || loadingLabelRosters.has(labelSlug)) return;
      loadingLabelRosters.add(labelSlug);
      const endpoint = new URL(`/v1/labels/${encodeURIComponent(labelSlug)}`, window.location.origin);
      void fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        }
      }).then(response => {
        if (!response.ok) throw new Error(`Mirlo API returned HTTP ${response.status}`);
        return response.json();
      }).then(data => {
        const result = data && typeof data === 'object' ? data['result'] : undefined;
        const roster = result && typeof result === 'object' ? result['artistLabels'] : undefined;
        const types = new Map();
        if (Array.isArray(roster)) {
          roster.forEach(membership => {
            if (!membership || typeof membership !== 'object') return;
            const artist = membership['artist'];
            if (!artist || typeof artist !== 'object') return;
            const profile = artist;
            if (typeof profile['urlSlug'] !== 'string') return;
            types.set(`/${profile['urlSlug']}`, profile['isLabelProfile'] === true ? 'label' : 'artist');
          });
        }
        labelRosterTypes.set(labelSlug, types);
        scheduleLookups?.();
      }).catch(() => {}).finally(() => loadingLabelRosters.delete(labelSlug));
    }
    function addLabelPageLookups(queries, {
      labelSlug,
      tab
    }) {
      const title = document.querySelector('#main-content h1');
      const labelName = title?.textContent.trim();
      if (title && labelName) createLookup(queries, 'label', canonicalUrl(`/${labelSlug}`), labelName, title);
      const mainContent = document.querySelector('#main-content');
      if (!mainContent) return;
      if (tab === 'releases') {
        addReleaseCardLookups(queries, mainContent);
      } else if (tab === 'roster') {
        const rosterTypes = labelRosterTypes.get(labelSlug);
        if (rosterTypes) addProfileCardLookups(queries, pathname => rosterTypes.get(pathname), mainContent);else loadLabelRoster(labelSlug);
      }
    }
    function addMirloLookups(mblinks) {
      const queries = {
        artist: [],
        label: [],
        recording: [],
        release: []
      };
      const track = TRACK_PATH.exec(window.location.pathname);
      const release = RELEASE_PATH.exec(window.location.pathname);
      const labelPage = labelPageRoute();
      if (window.location.pathname === '/') addHomepageLookups(queries);else if (window.location.pathname.replace(/\/$/, '') === '/releases') addReleasesPageLookups(queries);else if (window.location.pathname.replace(/\/$/, '') === '/search') addSearchPageLookups(queries);else if (window.location.pathname.replace(/\/$/, '') === '/artists') addArtistsPageLookups(queries);else if (track?.[1] && track[2] && track[3]) addTrackPageLookups(queries, track[1], track[2], track[3]);else if (release?.[1] && release[2]) addReleasePageLookups(queries, release[1], release[2]);else if (labelPage) addLabelPageLookups(queries, labelPage);else {
        const artist = /^\/([^/]+)\/?$/.exec(window.location.pathname);
        if (artist?.[1]) addArtistPageLookups(queries, artist[1]);
      }
      Object.values(queries).forEach(typeQueries => {
        if (typeQueries.length > 0) mblinks.searchAndDisplayMbLinks(typeQueries);
      });
    }
    function initMirloLinking(onEntityMatch) {
      entityMatchHandler = onEntityMatch;
      MBSearchItStyle();
      const mblinks = new MBLinks('MIRLO_MBLINKS_CACHE', 1);
      let scheduled = false;
      scheduleLookups = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          addMirloLookups(mblinks);
        });
      };
      scheduleLookups();
      new MutationObserver(scheduleLookups).observe(document.body, {
        childList: true,
        subtree: true
      });
      return mblinks;
    }

    function parseDate(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
      if (!match) return {};
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
      };
    }
    function mapReleaseType(type) {
      switch (type?.trim().toLocaleLowerCase()) {
        case 'album':
        case 'lp':
          return 'album';
        case 'ep':
        case 'e.p.':
          return 'EP';
        case 'single':
          return 'single';
        default:
          return '';
      }
    }
    function trackArtistNames(track, fallbackArtist) {
      const artists = [...(track.trackArtists ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0)).filter(artist => artist.artistName?.trim()).map(artist => ({
        name: artist.artistName.trim(),
        isCoAuthor: artist.isCoAuthor
      }));
      const coAuthors = artists.filter(artist => artist.isCoAuthor);
      return (coAuthors.length > 0 ? coAuthors : artists).map(artist => artist.name).concat(artists.length === 0 ? [fallbackArtist] : []);
    }
    function durationInMilliseconds(track) {
      const seconds = track.audio?.duration;
      return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
    }
    function commonLicenseUrl(tracks) {
      if (tracks.length === 0) return undefined;
      const links = tracks.map(track => track.license?.link?.trim()).filter(link => Boolean(link));
      if (links.length !== tracks.length || new Set(links).size !== 1) return undefined;
      return links[0];
    }
    function buildAnnotation(trackGroup) {
      const genres = [...new Set((trackGroup.tags ?? []).map(tag => tag.trim()).filter(Boolean))].join(', ');
      const sections = [['Credits', trackGroup.credits], ['About', trackGroup.about], ['Genres', genres]].flatMap(([heading, content]) => {
        const trimmedContent = content?.trim().replaceAll('\r', '') ?? '';
        return trimmedContent ? [`=== ${heading} from Mirlo ===`, trimmedContent] : [];
      });
      if (sections.length === 0) return undefined;
      return sections.join('\n\n').replaceAll('[', '&#91;').replaceAll(']', '&#93;');
    }
    function parseMirloRelease(releaseUrl, trackGroup) {
      const sourceTracks = [...trackGroup.tracks].sort((left, right) => left.order - right.order);
      const tracks = sourceTracks.map(track => {
        const mbTrack = {
          artist_credit: makeArtistCredits(trackArtistNames(track, trackGroup.artist.name)),
          title: track.title,
          number: track.order
        };
        const duration = durationInMilliseconds(track);
        if (duration !== undefined) mbTrack.duration = duration;
        return mbTrack;
      });
      const durations = tracks.map(track => typeof track.duration === 'number' ? track.duration : Number.NaN);
      const completeDuration = durations.every(Number.isFinite) ? durations.reduce((total, duration) => total + duration, 0) : Number.NaN;
      const urls = trackGroup.isGettable ? [{
        url: releaseUrl,
        link_type: URL_TYPES.purchase_for_download
      }] : [];
      const licenseUrl = commonLicenseUrl(sourceTracks);
      if (licenseUrl) urls.push({
        url: licenseUrl,
        link_type: URL_TYPES.license
      });
      const explicitType = mapReleaseType(trackGroup.type);
      const annotation = buildAnnotation(trackGroup);
      const release = {
        artist_credit: makeArtistCredits([trackGroup.artist.name]),
        title: trackGroup.title,
        ...parseDate(trackGroup.releaseDate ?? trackGroup.publishedAt),
        ...(annotation ? {
          annotation
        } : {}),
        packaging: 'None',
        country: 'XW',
        status: 'official',
        type: explicitType || guessReleaseType(trackGroup.title, tracks.length, completeDuration, tracks.map(track => track.title)),
        urls,
        discs: [{
          format: 'Digital Media',
          tracks
        }]
      };
      return {
        release,
        isrcs: sourceTracks.map(track => track.isrc?.trim() || null)
      };
    }

    const LOGGER = new Logger('mirlo_importer', LogLevel.INFO);
    const CONTAINER_ID = 'musicbrainz-mirlo-import';
    const STYLE_ID = 'musicbrainz-mirlo-import-style';
    let currentRunId = 0;
    let mirloLinks;
    function releaseRoute() {
      const match = /^\/([^/]+)\/release\/([^/]+)\/?$/.exec(window.location.pathname);
      if (!match?.[1] || !match[2]) return undefined;
      return {
        artistSlug: decodeURIComponent(match[1]),
        releaseSlug: decodeURIComponent(match[2])
      };
    }
    function canonicalReleaseUrl() {
      return `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
    }
    function canonicalArtistUrl() {
      const artistSlug = /^\/([^/]+)/.exec(window.location.pathname)?.[1];
      return artistSlug ? `${window.location.origin}/${artistSlug}` : undefined;
    }
    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${CONTAINER_ID} {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px 10px;
            max-width: 100%;
            box-sizing: border-box;
            margin-block-start: 10px;
            color: inherit;
            font: 12px Arial, sans-serif;
        }
        #${CONTAINER_ID} .mb-mirlo-title { font-weight: bold; }
        #${CONTAINER_ID} .mb-mirlo-status,
        #${CONTAINER_ID} .mb-mirlo-meta { color: var(--mi-secondary-text-color, #888); }
        #${CONTAINER_ID} .mb-mirlo-status.mb-mirlo-error { color: #a33; }
        #${CONTAINER_ID} .mb-mirlo-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
        #${CONTAINER_ID} .mb-mirlo-buttons form { margin: 0; }
        .mb-mirlo-link.mb_valign {
            margin-inline-end: 4px;
            vertical-align: middle;
        }
        .mb-mirlo-link a.mb_search_link { color: #888; }
        .mb-mirlo-link.mb_searchit a.mb_search_link:hover { color: darkblue; }
        .mb-mirlo-card-entity {
            display: flex;
            flex-direction: row;
            align-items: center;
            min-width: 0;
        }
        .mb-mirlo-card-entity > .mb-mirlo-link { flex: none; }
        .mb-mirlo-card-entity > a { min-width: 0; }
        #${CONTAINER_ID}.mb-mirlo-floating {
            position: absolute;
            top: 76px;
            right: 16px;
            z-index: 2147483646;
            max-width: min(360px, calc(100vw - 32px));
            padding: 10px 12px;
            border: 1px solid rgba(120, 120, 120, 0.6);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.97);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            color: #222;
        }
    `;
      document.head.appendChild(style);
    }
    function findMountPoint(releaseTitle) {
      const headings = document.querySelectorAll('#main-content h1');
      const heading = [...headings].find(candidate => {
        if (!releaseTitle) return true;
        const copy = candidate.cloneNode(true);
        copy.querySelectorAll('.mb-mirlo-link').forEach(link => link.remove());
        return copy.textContent.trim() === releaseTitle;
      });
      return heading?.parentElement?.parentElement ?? undefined;
    }
    const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    async function waitForMountPoint(releaseTitle, runId) {
      for (let attempt = 0; attempt < 40 && runId === currentRunId; attempt++) {
        const mountPoint = findMountPoint(releaseTitle);
        if (mountPoint) return mountPoint;
        await wait(100);
      }
      return undefined;
    }
    function createContainer(mountPoint) {
      document.getElementById(CONTAINER_ID)?.remove();
      const container = document.createElement('aside');
      container.id = CONTAINER_ID;
      container.setAttribute('aria-live', 'polite');
      container.innerHTML = '<div class="mb-mirlo-title">MusicBrainz</div><div class="mb-mirlo-status">Loading Mirlo release data…</div>';
      if (mountPoint) {
        mountPoint.appendChild(container);
      } else {
        container.classList.add('mb-mirlo-floating');
        document.body.appendChild(container);
      }
      return container;
    }
    function renderError(container, message) {
      const status = container.querySelector('.mb-mirlo-status');
      if (status) {
        status.classList.add('mb-mirlo-error');
        status.textContent = message;
      }
    }
    function isTrackGroupResponse(value) {
      if (!value || typeof value !== 'object') return false;
      const result = value['result'];
      if (!result || typeof result !== 'object') return false;
      const release = result;
      const artist = release['artist'];
      return typeof release['title'] === 'string' && Array.isArray(release['tracks']) && typeof artist === 'object' && artist !== null && typeof artist['name'] === 'string';
    }
    async function fetchTrackGroup(artistSlug, releaseSlug) {
      const endpoint = new URL(`/v1/trackGroups/${encodeURIComponent(releaseSlug)}/`, window.location.origin);
      endpoint.searchParams.set('artistId', artistSlug);
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) throw new Error(`Mirlo API returned HTTP ${response.status}`);
      const data = await response.json();
      if (!isTrackGroupResponse(data)) throw new Error('Mirlo API returned an unexpected response');
      return data;
    }
    function magicISRCForm(isrcs, editNote) {
      if (!isrcs.some(Boolean)) return undefined;
      const form = document.createElement('form');
      form.className = 'musicbrainz_import';
      form.innerHTML = '<button type="submit" title="Submit ISRCs to MusicBrainz with MagicISRC">Submit ISRCs</button>';
      form.addEventListener('submit', event => {
        event.preventDefault();
        const query = new URLSearchParams({
          'edit-note': editNote
        });
        isrcs.forEach((isrc, index) => query.set(`isrc${index + 1}`, isrc ?? ''));
        window.open(`https://magicisrc.kepstin.ca?${query.toString()}`, '_blank', 'noopener');
      });
      return form;
    }
    function populateArtistMbid(mbid) {
      const form = document.querySelector(`#${CONTAINER_ID} form.musicbrainz_import_add`);
      const releaseArtist = form?.querySelector('input[name="artist_credit.names.0.artist.name"]');
      if (!form || !releaseArtist) return;
      form.querySelectorAll('input[name$=".artist.name"]').forEach(artistNameInput => {
        if (artistNameInput.value !== releaseArtist.value) return;
        const mbidParameterName = artistNameInput.name.replace(/\.artist\.name$/, '.mbid');
        const existingInput = [...form.elements].find(element => element instanceof HTMLInputElement && element.name === mbidParameterName);
        const mbidInput = existingInput ?? document.createElement('input');
        mbidInput.type = 'hidden';
        mbidInput.name = mbidParameterName;
        mbidInput.value = mbid;
        if (!existingInput) form.appendChild(mbidInput);
      });
    }
    function handleEntityMatch(type, url, mbid) {
      if (type === 'artist' && url === canonicalArtistUrl()) populateArtistMbid(mbid);
    }
    async function processPage() {
      const runId = ++currentRunId;
      document.getElementById(CONTAINER_ID)?.remove();
      const route = releaseRoute();
      if (!route) return;
      try {
        const data = await fetchTrackGroup(route.artistSlug, route.releaseSlug);
        if (runId !== currentRunId) return;
        const mountPoint = await waitForMountPoint(data.result.title, runId);
        if (runId !== currentRunId) return;
        if (!mountPoint) LOGGER.error('Could not find the Mirlo release heading; using the floating fallback');
        const container = createContainer(mountPoint);
        const releaseUrl = canonicalReleaseUrl();
        const {
          release,
          isrcs
        } = parseMirloRelease(releaseUrl, data.result);
        const editNote = MBImport.makeEditNote(releaseUrl, 'Mirlo');
        const buttons = document.createElement('div');
        buttons.className = 'mb-mirlo-buttons';
        buttons.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, editNote)) + MBImport.buildSearchButton(release);
        const isrcForm = magicISRCForm(isrcs, editNote);
        if (isrcForm) buttons.appendChild(isrcForm);
        container.replaceChildren();
        const title = document.createElement('div');
        title.className = 'mb-mirlo-title';
        title.textContent = 'MusicBrainz';
        const meta = document.createElement('div');
        meta.className = 'mb-mirlo-meta';
        meta.textContent = `${release.discs[0]?.tracks.length ?? 0} tracks · Digital Media`;
        container.append(title, meta, buttons);
        const artistUrl = canonicalArtistUrl();
        const artistMbid = artistUrl ? mirloLinks?.resolveMBID(`artist:${artistUrl}`) : undefined;
        if (artistMbid) populateArtistMbid(artistMbid);
      } catch (error) {
        if (runId !== currentRunId) return;
        LOGGER.error('Failed to import Mirlo release:', error);
        const mountPoint = findMountPoint();
        renderError(createContainer(mountPoint), error instanceof Error ? error.message : 'Could not load this Mirlo release.');
      }
    }
    function init() {
      MBImportStyle();
      ensureStyles();
      mirloLinks = initMirloLinking(handleEntityMatch);
      void processPage();
      subscribeToSPANavigation({
        onNavigate: processPage
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

})();
