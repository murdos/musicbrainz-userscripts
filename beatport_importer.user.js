// ==UserScript==
// @name         Import Beatport releases to MusicBrainz
// @description  One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version      2026.11.20.3
// @author       VxJasonxV
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js
// @match        https://www.beatport.com/*
// @grant        none
// @run-at       document-start
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

    const SECONDARY_TYPE_TITLE_MATCHERS = [['remix', /\bremix(?:e[sd])?\b/i],
    // Soundtrack patterns adapted from Harmony’s title detection.
    ['soundtrack', /\bsoundtrack\b/i], ['soundtrack', /(?<!\p{L})саундтрек(?:а|у|ом|е|и|ов|ам|ами|ах)?(?!\p{L})/iu], ['soundtrack', /\b(?:bande (?:originale|sonore)|trame sonore|bandes (?:originales|sonores)|trames sonores)\b/i], ['soundtrack', /(?:Original|Official)(?:.*?)(?:Soundtrack|Score)/i], ['soundtrack', /(?:Soundtrack|Score|Music)\s(?:(?:from|to) the)\s(?:.+[\s-])?(?:(?:Video\s)?Game|Motion Picture|Film|Movie|(?:(?:TV|Television)[\s-]?)?(?:Mini[\s-]?)?Series|Musical)/i],
    // Harmony treats uppercase OST variants as soundtrack markers only at the start or end of a longer title.
    ['soundtrack', /(?:^(?:\(O\.S\.T\.\)|O\.S\.T\.|OST|\(OST\))\s.+|.+\s(?:\(O\.S\.T\.\)|O\.S\.T\.|OST|\(OST\))$)/], ['soundtrack', /Original (?:.+\s)?Cast Recording/i], ['soundtrack', /(?:Soundtrack|Musik)\s(?:zum|zur)\s(?:.+[\s-])?(?:(?:Kino)?Film|Theaterstück|(?:TV[\s-]?)?Serie)/i], ['soundtrack', /(?:Soundtrack|Musik(?:en)?)\s(?:från|till|ur)\s(?:.+[\s-])?(?:Film(?:en)?|(?:TV[\s-]?)?(?:Mini[\s-]?)?Serien?|Musikalen)/i], ['soundtrack', /Musikk(?:en)? (?:fra) (?:Filmen|TV[\s-]serien|(?:teater)?forestillingen)/i]];

    /** Guess secondary release types from explicit words in the release title. */
    function guessSecondaryReleaseTypes(title) {
      return [...new Set(SECONDARY_TYPE_TITLE_MATCHERS.filter(([, pattern]) => pattern.test(title)).map(([type]) => type))];
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
     * 6. With duration available, seven or more tracks or more than 30 minutes is an album. A one-track release from one to 15 minutes is a Single, while one over 15 and up to 30 minutes is an EP. For multi-track releases with fewer than seven tracks, one to seven minutes is a Single and more than seven and up to 30 minutes is an EP. Leave sub-minute releases unclassified.
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
      if (numTracks === 1) return durationMinutes <= 15 ? 'single' : 'EP';
      if (durationMinutes <= 7) return 'single';
      return 'EP';
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
      const secondaryTypes = new Set(release.secondary_types?.filter(Boolean));
      for (const secondaryType of guessSecondaryReleaseTypes(release.title)) {
        secondaryTypes.add(secondaryType);
      }
      for (const secondaryType of secondaryTypes) {
        if (secondaryType) {
          appendParameter(parameters, 'type', secondaryType);
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

    const VARIOUS_ARTISTS = /^(?:various(?: artists?)?|v\.?a\.?)$/i;
    function normalizeSpecialArtist(artistCredit) {
      return VARIOUS_ARTISTS.test(artistCredit.artist_name.trim()) ? specialArtist('various_artists', artistCredit) : artistCredit;
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
      // Re-split artist strings containing common join phrases.
      artists.map(function (item) {
        let c = item.artist_name.replace(/\s*\b(?:feat\.?|ft\.?|featuring)\s+/gi, ' feat. ');
        c = c.replace(/\s*\(( feat. )([^)]+)\)/g, '$1$2');
        c = c.replace(/\s*\b(?:versus|vs\.?)\s+/gi, ' vs. ');
        c = c.replace(/\s+/g, ' ');
        const splitted = c.split(/( feat\. | vs\. | \/ | & | x | × )/);
        if (splitted.length === 1) {
          credits.push(normalizeSpecialArtist(item)); // nothing to split
        } else {
          const new_items = [];
          let n = 0;
          for (const element of splitted) {
            if (n && [' feat. ', ' vs. ', ' / ', ' & ', ' x ', ' × '].includes(element)) {
              const prevItem = new_items[n - 1];
              if (prevItem) {
                prevItem.joinphrase = element === ' x ' ? ' × ' : element;
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
          new_items.forEach(newit => credits.push(normalizeSpecialArtist(newit)));
        }
      });
      return credits;
    }

    function makeEditNote(release_url, importer_name, format, home = 'https://github.com/murdos/musicbrainz-userscripts') {
      return `Imported from ${release_url}${format ? ` (${format})` : ''} using ${importer_name} import script from ${home}`;
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

    function getGmApi(name) {
      // Tampermonkey may only inject granted APIs when the script references them directly.
      const apis = {};
      if (typeof GM !== 'undefined') {
        apis.getValue = GM.getValue;
        apis.setValue = GM.setValue;
        apis.xmlHttpRequest = GM.xmlHttpRequest;
      }
      if (!apis.getValue && typeof GM_getValue !== 'undefined') {
        apis.getValue = GM_getValue;
      }
      if (!apis.setValue && typeof GM_setValue !== 'undefined') {
        apis.setValue = GM_setValue;
      }
      if (!apis.xmlHttpRequest && typeof GM_xmlhttpRequest !== 'undefined') {
        apis.xmlHttpRequest = GM_xmlhttpRequest;
      }
      return apis[name];
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
      requestInFlight = false;
      nextRequestAt = 0;
      rateLimitResetAt = 0;
      consecutiveRequestFailures = 0;
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
       * GET JSON with retry on 5xx and status-less network errors, using server-provided rate-limit headers when available, with queue-wide exponential backoff capped at 30 seconds and a five-minute retry budget.
       * @param url - The URL to request.
       * @param successCallback - Called with response data on success.
       * @param alwaysCallback - Called when the request is finally done (success or after giving up retries).
       */
      getJSONWithRetry(url, successCallback, alwaysCallback) {
        const retryDeadline = Date.now() + 5 * 60 * 1000;
        const retry = (serverDelayMs = 0) => {
          const retryDelayMs = this.recordRequestFailure(serverDelayMs);
          if (Date.now() + retryDelayMs <= retryDeadline) {
            setTimeout(() => this.scheduleRequest(doRequest, true), retryDelayMs);
          } else {
            alwaysCallback?.(false);
          }
        };
        const doRequest = async () => {
          let response;
          try {
            response = await requestJSON(url);
          } catch {
            // Extension throttling and ordinary network failures both arrive without an HTTP status.
            retry();
            return;
          }
          const serverDelayMs = getRetryDelayMs(response) ?? 0;
          if (!response.ok) {
            if (response.status >= 500 && response.status < 600) {
              retry(serverDelayMs);
            } else if (response.status === 404) {
              // The URL endpoint uses 404 to report a resource with no relationships.
              this.consecutiveRequestFailures = 0;
              try {
                successCallback({});
                alwaysCallback?.(true);
              } catch {
                alwaysCallback?.(false);
              }
            } else {
              this.consecutiveRequestFailures = 0;
              alwaysCallback?.(false);
            }
            return;
          }
          this.consecutiveRequestFailures = 0;
          if (response.getHeader('x-ratelimit-remaining') === '0') this.pauseRequests(serverDelayMs);
          try {
            successCallback(await response.json());
            alwaysCallback?.(true);
          } catch {
            alwaysCallback?.(false);
          }
        };
        this.scheduleRequest(doRequest);
      }
      scheduleRequest(request, priority = false) {
        if (priority) this.pendingRequests.unshift(request);else this.pendingRequests.push(request);
        this.runNextRequest();
      }
      recordRequestFailure(serverDelayMs) {
        this.consecutiveRequestFailures += 1;
        const retryDelayMs = Math.max(serverDelayMs, Math.min(30_000, 1000 * 2 ** (this.consecutiveRequestFailures - 1)));
        this.pauseRequests(retryDelayMs);
        return retryDelayMs;
      }
      pauseRequests(delayMs) {
        this.rateLimitResetAt = Math.max(this.rateLimitResetAt, Date.now() + delayMs);
      }
      runNextRequest() {
        if (this.requestTimer || this.requestInFlight || this.pendingRequests.length === 0) return;
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
        this.requestInFlight = true;
        void Promise.resolve().then(request).catch(() => undefined).finally(() => {
          this.requestInFlight = false;
          this.runNextRequest();
        });
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

    const API_ORIGIN = 'https://api.beatport.com';
    const trackRequests = new Map();
    let authorization = null;
    const readTracks = async request => {
      try {
        const response = await request;
        if (!response.ok) {
          return null;
        }
        const copy = response.clone();
        const data = await copy.json();
        return data.results;
      } catch {
        return null;
      }
    };

    // Called before awaiting fetch so the importer can reuse an in-flight request.
    const captureTrackRequest = (input, init, request) => {
      let requestURL = String(input);
      let requestHeaders = init?.headers;
      if (input instanceof Request) {
        requestURL = input.url;
        requestHeaders ??= input.headers;
      }
      const url = new URL(requestURL, window.location.href);
      if (url.origin !== API_ORIGIN) {
        return;
      }
      const headers = new Headers(requestHeaders);
      authorization = headers.get('Authorization') ?? authorization;
      const isTracksRequest = /^\/v4\/catalog\/releases\/\d+\/tracks\/$/.test(url.pathname);
      if (isTracksRequest) {
        url.searchParams.sort();
        const tracks = readTracks(request);
        trackRequests.set(url.href, tracks);
      }
    };
    const readXHRResponse = xhr => {
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          let response;
          if (xhr.responseType === 'json') {
            response = Response.json(xhr.response);
          } else {
            response = new Response(xhr.responseText);
          }
          return response;
        }
      } catch {
        // Unsupported response types are ignored without affecting Beatport.
      }
      const failedResponse = Response.error();
      return failedResponse;
    };

    /** Beatport’s API client uses XHR rather than fetch on some pages. */
    const installXHRInterceptor = logger => {
      const requests = new WeakMap();
      const prototype = XMLHttpRequest.prototype;
      const originalOpen = prototype.open;
      const originalSetRequestHeader = prototype.setRequestHeader;
      const originalSend = prototype.send;
      try {
        prototype.open = function (method, url, async = true, username, password) {
          originalOpen.call(this, method, url, async, username, password);
          const requestURL = new URL(url, window.location.href);

          // Clear metadata when the same XHR object is reused for another origin.
          requests.delete(this);
          if (requestURL.origin === API_ORIGIN) {
            const headers = new Headers();
            const request = {
              url: requestURL.href,
              headers
            };
            requests.set(this, request);
          }
        };
        prototype.setRequestHeader = function (name, value) {
          originalSetRequestHeader.call(this, name, value);
          const request = requests.get(this);
          request?.headers.append(name, value);
        };
        prototype.send = function (body) {
          const request = requests.get(this);
          if (request) {
            const response = new Promise(resolve => {
              const onLoadEnd = () => {
                const capturedResponse = readXHRResponse(this);
                resolve(capturedResponse);
              };
              this.addEventListener('loadend', onLoadEnd, {
                once: true
              });
            });
            const options = {
              headers: request.headers
            };
            captureTrackRequest(request.url, options, response);
          }
          originalSend.call(this, body);
        };
      } catch {
        logger.error('Could not intercept Beatport’s XMLHttpRequest requests');
      }
    };
    const getBeatportTracks = async (releaseId, trackCount, logger) => {
      const path = `/v4/catalog/releases/${releaseId}/tracks/`;
      const startedAt = Date.now();
      const deadline = startedAt + 10_000;

      // Beatport may start its authenticated request after the importer runs.
      while (!authorization) {
        const now = Date.now();
        if (now >= deadline) {
          logger.error('Could not load tracks: no authenticated Beatport request was observed. Reload the page and try again.');
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const tracks = [];
      const totalPages = Math.ceil(trackCount / 100);
      for (let page = 1; page <= totalPages; page++) {
        const url = new URL(path, API_ORIGIN);
        const pageNumber = String(page);
        url.searchParams.set('page', pageNumber);
        url.searchParams.set('per_page', '100');
        url.searchParams.sort();
        const cached = trackRequests.get(url.href);
        let pageTracks = null;
        if (cached) {
          pageTracks = await cached;
        }
        if (!pageTracks) {
          const options = {
            headers: {
              Authorization: authorization
            },
            redirect: 'error'
          };
          const request = fetch(url.href, options);
          pageTracks = await readTracks(request);
        }
        if (!pageTracks) {
          // Do not log request objects or credentials.
          logger.error('Could not fetch Beatport tracks');
          return null;
        }
        tracks.push(...pageTracks);
      }
      return tracks;
    };

    /**
     * Cache for release data intercepted from Beatport's own fetch requests.
     * When the user navigates via SPA, Beatport fetches the release JSON — we capture
     * it here to avoid making a duplicate request.
     */
    const interceptedReleaseCache = new Map();
    const isTracksQuery = queryKey => {
      const key = String(queryKey);
      const matchesTracks = /tracks/.test(key);
      return matchesTracks;
    };

    /**
     * Install a fetch interceptor to capture Beatport's release data responses.
     * Call once at script load, before any navigation can occur.
     * Skips installation if fetch is read-only (e.g. Firefox/Greasemonkey sandbox).
     */
    function installFetchInterceptor(logger) {
      installXHRInterceptor(logger);
      const originalFetch = window.fetch.bind(window);
      const interceptor = async function (input, init) {
        const request = originalFetch(input, init);
        captureTrackRequest(input, init, request);
        const response = await request;
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
      const tracksQuery = pageData.pageProps.dehydratedState.queries.find(q => isTracksQuery(q.queryKey));
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
        const pageTracksQuery = paginatedData.pageProps.dehydratedState.queries.find(q => isTracksQuery(q.queryKey));
        const pageResults = pageTracksQuery?.state?.data.results ?? [];
        allResults.push(...pageResults);
      }
      if (allResults.length < release.track_count) {
        logger.info('Could not fetch all paginated track data, using partial data');
        return pageData;
      }

      // Merge full track data into our page data
      const updatedQueries = pageData.pageProps.dehydratedState.queries.map(q => {
        if (!isTracksQuery(q.queryKey)) return q;
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
      const queries = pageData.pageProps.dehydratedState.queries;
      const tracksQuery = queries.find(query => isTracksQuery(query.queryKey));
      if (buildId && tracksQuery) {
        pageData = await ensureFullTrackData(pageData, buildId, releaseIdFromURL, logger);
      }

      // Newer pages fetch tracks separately rather than embedding a tracks query.
      if (!tracksQuery && pageData.pageProps.release) {
        const trackCount = pageData.pageProps.release.track_count;
        const tracks = await getBeatportTracks(releaseIdFromURL, trackCount, logger);
        if (!tracks) {
          return null;
        }
        const query = {
          queryKey: [`release-${releaseIdFromURL}-tracks`],
          state: {
            data: {
              results: tracks
            }
          }
        };
        queries.push(query);
      }
      return pageData;
    };

    const LOOKUP_ATTRIBUTE = 'data-mb-beatport-lookup';
    const INDICATOR_CLASS = 'mb-beatport-link';

    /** Link the release header and visible table entities, including newly paginated rows. */
    function linkBeatportRelease(mblinks, release, data, tracks) {
      const pageUrl = window.location.href;
      const form = document.querySelector('.musicbrainz-import form.musicbrainz_import_add');
      let active = true;
      const updateForm = (name, value) => {
        if (!active || window.location.href !== pageUrl || !form?.isConnected) return;
        let input = [...form.querySelectorAll('input')].find(element => element.name === name);
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          form.append(input);
        }
        input.value = value;
      };
      const scan = () => {
        if (!active || window.location.href !== pageUrl) return;
        const queries = {
          artist: [],
          label: [],
          release: []
        };
        const addLookup = (target, type, url, name, onMatch) => {
          if (!name || target.hasAttribute(LOOKUP_ATTRIBUTE)) return;
          target.setAttribute(LOOKUP_ATTRIBUTE, type);
          const indicator = MBImport.createEntityLookupIndicator(type, name);
          indicator.classList.add(INDICATOR_CLASS);
          indicator.style.marginRight = '4px';
          indicator.addEventListener('click', event => event.stopPropagation());
          if (type === 'release') target.prepend(indicator);else target.before(indicator);
          let matched = false;
          const key = `${type}:${url}`;
          queries[type].push({
            url,
            mb_type: type,
            key,
            insert_func: link => {
              if (!active || window.location.href !== pageUrl || !indicator.isConnected) return;
              if (!matched) {
                indicator.replaceChildren();
                MBImport.setEntityLookupState(indicator, 'matched');
                matched = true;
              }
              indicator.insertAdjacentHTML('beforeend', link.trim());
            },
            complete_func: result => {
              if (!active || window.location.href !== pageUrl || !indicator.isConnected) return;
              if (!matched) MBImport.setEntityLookupState(indicator, result.status === 'error' ? 'error' : 'search');
              // Ambiguous URL relationships remain visible, but must not select an arbitrary entity.
              const mbid = result.status === 'success' && matched ? mblinks.resolveMBID(key) : undefined;
              if (mbid) onMatch?.(mbid);
            }
          });
        };
        const header = document.querySelector('[class^="ReleaseDetailCard_meta"]');
        const title = header?.querySelector('h1');
        if (title) {
          const path = window.location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/release\/)/, '').replace(/\/$/, '');
          addLookup(title, 'release', `https://www.beatport.com${path}`, release.title);
        }
        document.querySelectorAll('[class^="ReleaseDetailCard_meta"] a[href], [class*="DetailsCell-style__"] a[href]').forEach(link => {
          const url = new URL(link.href, window.location.origin);
          const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(artist|label)\/[^/]+\/(\d+)\/?$/.exec(url.pathname);
          if (url.origin !== window.location.origin || !match) return;
          const type = match[1];
          const id = Number(match[2]);
          const path = url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/(?:artist|label)\/)/, '').replace(/\/$/, '');
          const primary = header?.contains(link);
          addLookup(link, type, `https://www.beatport.com${path}`, link.title || link.textContent.trim(), mbid => {
            if (type === 'label') {
              if (primary && data.label.id === id) updateForm('labels.0.mbid', mbid);
              return;
            }
            if (primary) {
              const artist = data.artists.find(candidate => candidate.id === id);
              if (artist && data.artists.filter(candidate => candidate.name === artist.name).length === 1) {
                release.artist_credit.forEach((credit, index) => {
                  if (credit.artist_name !== artist.name || credit.mbid) return;
                  updateForm(`artist_credit.names.${index}.mbid`, mbid);
                  updateForm(`artist_credit.names.${index}.name`, credit.credited_name || credit.artist_name);
                });
              }
            }

            // Track credits use their own Beatport artist IDs, independently of release credits.
            tracks.forEach((track, trackIndex) => {
              track.artists.forEach((trackArtist, artistIndex) => {
                if (trackArtist.id !== id) return;
                const credit = release.discs[0]?.tracks[trackIndex]?.artist_credit[artistIndex];
                if (!credit || credit.mbid) return;
                const prefix = `mediums.0.track.${trackIndex}.artist_credit.names.${artistIndex}`;
                updateForm(`${prefix}.mbid`, mbid);
                updateForm(`${prefix}.name`, credit.credited_name || credit.artist_name);
              });
            });
          });
        });
        Object.values(queries).forEach(batch => {
          if (batch.length) mblinks.searchAndDisplayMbLinks(batch);
        });
      };
      const observer = new MutationObserver(scan);
      scan();
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      return () => {
        active = false;
        observer.disconnect();
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach(indicator => indicator.remove());
        document.querySelectorAll(`[${LOOKUP_ATTRIBUTE}]`).forEach(target => target.removeAttribute(LOOKUP_ATTRIBUTE));
      };
    }

    const LOGGER = new Logger('beatport_importer', LogLevel.INFO);

    // Capture Beatport's release fetches to avoid duplicate requests on SPA navigation
    installFetchInterceptor(LOGGER);
    const MB_IMPORT_SELECTOR = 'div.musicbrainz-import';
    const MB_IMPORT_BARCODE_ELEMENT = 'mb-import-barcode';
    const RELEASE_INFO_STYLE = 'display: flex; align-items: center; gap: 5px; flex-wrap: wrap;';
    let mblinks;
    let stopLinking;
    let processingGeneration = 0;

    /**
     * Remove existing MusicBrainz import UI to avoid duplicates
     */
    const cleanup = () => {
      stopLinking?.();
      stopLinking = undefined;
      document.querySelectorAll(MB_IMPORT_SELECTOR).forEach(el => {
        el.remove();
      });
      document.getElementById(MB_IMPORT_BARCODE_ELEMENT)?.remove();
    };
    async function processReleasePage() {
      const generation = ++processingGeneration;
      cleanup();
      const isReleasePage = window.location.pathname.includes('/release/');
      if (!isReleasePage) {
        return;
      }
      const releaseData = await getBeatportReleaseData(LOGGER);
      if (generation !== processingGeneration) return;
      if (!releaseData) {
        return;
      }
      if (!releaseData.pageProps.release) {
        LOGGER.error('Could not find release data on the release page');
        return;
      }
      const releaseMatch = window.location.pathname.match(/release\/[^/]+\/(\d+)/);
      const currentReleaseId = releaseMatch?.[1];
      const loadedReleaseId = String(releaseData.pageProps.release.id);
      if (currentReleaseId !== loadedReleaseId) {
        return;
      }
      const release_url = `${window.location.origin}${window.location.pathname}`;
      try {
        const release = releaseData.pageProps.release;

        // Reversing is less reliable, but the API does not provide track numbers.
        const tracks_table = release.tracks.toReversed();
        const tracks_release = releaseData.pageProps.dehydratedState.queries.find(element => {
          const key = String(element.queryKey);
          const isTracksQuery = /tracks/.test(key);
          return isTracksQuery;
        });
        const tracks_data_array = tracks_release?.state?.data.results;
        if (!tracks_data_array) {
          LOGGER.error('Could not find tracks data');
          return;
        }
        const tracks_data = tracks_table.map(url => {
          const match = url.match(/\/tracks\/(\d+)\/?$/);
          const trackId = Number(match?.[1]);
          const track = tracks_data_array.find(element => element.id === trackId && element.release.id === release.id);
          return track;
        }).filter(track => track !== undefined);
        if (tracks_data.length !== release.track_count) {
          LOGGER.error('Could not find complete tracks data');
          return;
        }
        const isrcs = tracks_data.map(track => track.isrc || null);
        const mbrelease = retrieveReleaseInfo(release_url, release, tracks_data);
        insertMBButtons(mbrelease, release_url, isrcs);
        stopLinking = linkBeatportRelease(mblinks, mbrelease, release, tracks_data);
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
      const releaseInfoElements = document.querySelectorAll('div[class^="ReleaseDetailCard_info"]');
      const lastReleaseInfo = releaseInfoElements[releaseInfoElements.length - 1];
      if (!lastReleaseInfo) {
        LOGGER.error('Could not find release info container');
        return;
      }
      const controlsElements = document.querySelectorAll('div[class^="ReleaseDetailCard_controls"]');
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
      MBSearchItStyle();
      document.head.insertAdjacentHTML('beforeend', `<style>
            .mb-beatport-link {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                vertical-align: middle;
                font-size: 11px;
                line-height: 16px;
            }
            .mb-beatport-link > a {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                line-height: 16px;
            }
            .mb-beatport-link img {
                display: block;
            }
            [class^="ReleaseDetailCard_artistList__"] {
                font-family: var(--font-aeonik);
                font-size: var(--bp-font-size-xl);
                line-height: var(--bp-line-height-xl);
            }
            [class^="ReleaseDetailCard_info"] > span:has(> .mb-beatport-link) {
                display: inline-flex;
                align-items: center;
                min-width: 0;
            }
            [class^="ReleaseDetailCard_info"] > span > .mb-beatport-link {
                flex-shrink: 0;
            }
            [class^="ReleaseDetailCard_info"] > span:has(> .mb-beatport-link) > a {
                min-width: 0;
            }
        </style>`);
      mblinks = new MBLinks('BEATPORT_MBLINKS_CACHE', 1);

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
