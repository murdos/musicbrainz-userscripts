// ==UserScript==
// @name         Import Deezer releases into MusicBrainz
// @description  One-click importing of releases from deezer.com into MusicBrainz. Also allows to submit their ISRCs to MusicBrainz releases.
// @version      2026.8.26.3
// @author       atj
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/deezer_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/deezer_importer.user.js
// @match        https://www.deezer.com/*/album/*
// @connect      api.deezer.com
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

    const releaseCache = new Map();
    function httpGetJson(url, logger) {
      const request = getGmApi('xmlHttpRequest');
      if (!request) {
        logger.error('Userscript requires GM_xmlHttpRequest or GM.xmlHttpRequest');
        return Promise.resolve(null);
      }
      return new Promise(resolve => {
        request({
          method: 'GET',
          url,
          onload: res => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const data = JSON.parse(res.responseText);
                resolve(data);
              } catch (err) {
                logger.error(`Failed to parse JSON from ${url}:`, err);
                resolve(null);
              }
            } else {
              logger.error(`HTTP request to ${url} failed with status ${res.status}`);
              resolve(null);
            }
          },
          onerror: res => {
            logger.error(`Network error requesting ${url} (status: ${res.status})`);
            resolve(null);
          }
        });
      });
    }

    /**
     * Fetches complete Deezer album data and all paginated tracks.
     * If any track pagination request fails, returns null without caching partial data.
     */
    async function getDeezerReleaseData(releaseId, logger) {
      const cached = releaseCache.get(releaseId);
      if (cached) {
        return cached;
      }
      const albumApiUrl = `https://api.deezer.com/album/${releaseId}?limit=1`;
      const album = await httpGetJson(albumApiUrl, logger);
      if (!album || !album.title) {
        logger.error(`Could not retrieve Deezer album info for release ID ${releaseId}`);
        return null;
      }
      album.tracks = {
        data: []
      };
      let nextTracksUrl = `https://api.deezer.com/album/${releaseId}/tracks?limit=100`;
      while (nextTracksUrl) {
        const tracksResponse = await httpGetJson(nextTracksUrl, logger);
        if (!tracksResponse || !tracksResponse.data) {
          logger.error(`Failed to fetch complete track list for album ${releaseId}`);
          return null;
        }
        album.tracks.data.push(...tracksResponse.data);
        nextTracksUrl = tracksResponse.next;
      }
      releaseCache.set(releaseId, album);
      return album;
    }

    function parseDeezerRelease(releaseUrl, data) {
      const releaseDate = (data.release_date || '').split('-');
      const year = parseInt(releaseDate[0] || '', 10);
      const month = parseInt(releaseDate[1] || '', 10);
      const day = parseInt(releaseDate[2] || '', 10);
      const artist_credit = [];
      const urls = [{
        link_type: URL_TYPES.stream_for_free,
        url: releaseUrl
      }];
      const labels = data.label ? [{
        name: data.label
      }] : [];
      const discs = [];
      const release = {
        artist_credit,
        title: data.title,
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: data.record_type,
        urls,
        labels,
        discs
      };
      if (!Number.isNaN(year)) {
        release.year = year;
      }
      if (!Number.isNaN(month)) {
        release.month = month;
      }
      if (!Number.isNaN(day)) {
        release.day = day;
      }
      if (data.upc) {
        release.barcode = data.upc;
      }
      const isrcs = [];
      const contributors = data.contributors || [];
      contributors.forEach((contributor, index) => {
        if (contributor.role !== 'Main') return;
        let ac = {
          artist_name: contributor.name,
          joinphrase: index === contributors.length - 1 ? '' : ', '
        };
        if (contributor.name === 'Various Artists') {
          ac = specialArtist('various_artists', ac);
        }
        artist_credit.push(ac);
      });
      for (const track of data.tracks.data) {
        const mbTrack = {
          number: track.track_position,
          title: track.title_short,
          duration: track.duration * 1000,
          artist_credit: [{
            artist_name: track.artist.name
          }]
        };
        if (track.isrc) isrcs.push(track.isrc);else isrcs.push(null);

        // ignore pointless "(Original Mix)" in title version
        if (track.title_version && !/^\s*\(Original Mix\)\s*$/i.test(track.title_version)) {
          mbTrack.title += ` ${track.title_version}`;
        }
        const diskNumber = track.disk_number || 1;
        while (discs.length < diskNumber) {
          discs.push({
            format: 'Digital Media',
            title: '',
            tracks: []
          });
        }
        const currentDisc = discs[diskNumber - 1];
        if (currentDisc) {
          currentDisc.tracks.push(mbTrack);
        }
      }
      return {
        release,
        isrcs
      };
    }

    const LOGGER = new Logger('deezer_importer', LogLevel.INFO);
    function waitForEl(selector, callback) {
      if (document.querySelector(selector)) {
        callback();
      } else {
        setTimeout(() => {
          waitForEl(selector, callback);
        }, 100);
      }
    }
    function insertLink(release, releaseUrl, isrcs) {
      const editNote = MBImport.makeEditNote(releaseUrl, 'Deezer');
      const parameters = MBImport.buildFormParameters(release, editNote);
      const importItem = document.createElement('div');
      importItem.className = 'toolbar-item';
      importItem.innerHTML = MBImport.buildFormHTML(parameters);
      const searchItem = document.createElement('div');
      searchItem.className = 'toolbar-item';
      searchItem.innerHTML = MBImport.buildSearchButton(release);
      const isrcItem = document.createElement('div');
      isrcItem.className = 'toolbar-item';
      const isrcForm = document.createElement('form');
      isrcForm.className = 'musicbrainz_import';
      const isrcButton = document.createElement('button');
      isrcButton.type = 'submit';
      isrcButton.title = "Submit ISRCs to MusicBrainz with kepstin's MagicISRC";
      isrcButton.innerHTML = '<span>Submit ISRCs</span>';
      isrcForm.appendChild(isrcButton);
      isrcForm.addEventListener('click', event => {
        event.preventDefault();
        const query = [`edit-note=${encodeURIComponent(editNote)}`, ...isrcs.map((isrc, index) => isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`)].join('&');
        window.open(`https://magicisrc.kepstin.ca?${query}`);
      });
      isrcItem.appendChild(isrcForm);
      const toolbarItems = [importItem, searchItem, isrcItem];
      waitForEl('[data-testid="toolbar"]', () => {
        const toolbar = document.querySelector('[data-testid="toolbar"]');
        if (toolbar) {
          toolbar.style.alignItems = 'center';
          toolbar.append(...toolbarItems);
        }
      });

      // Deezer Mobile is a completely different App, so we need to mount differently
      waitForEl('[data-tracking-label="main-CTA"]', () => {
        const cta = document.querySelector('[data-tracking-label="main-CTA"]');
        if (cta) {
          const mbUIContainer = document.createElement('div');
          mbUIContainer.style.cssText = 'display: flex; flex-direction: row; flex-wrap: wrap; justify-content: center; width: 100%; gap: 4px;';
          mbUIContainer.append(...toolbarItems);
          cta.insertAdjacentElement('afterend', mbUIContainer);
        }
      });
    }
    function init() {
      // allow 1 second for Deezer SPA to initialize
      setTimeout(() => {
        MBImportStyle();
        const releaseUrl = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
        const releaseId = releaseUrl.replace(/^https?:\/\/www\.deezer\.com\/[^/]+\/album\//i, '');
        if (!releaseId || !/^\d+$/.test(releaseId)) {
          return;
        }
        void getDeezerReleaseData(releaseId, LOGGER).then(data => {
          if (data) {
            const {
              release,
              isrcs
            } = parseDeezerRelease(releaseUrl, data);
            insertLink(release, releaseUrl, isrcs);
          }
        }).catch(err => {
          LOGGER.error('Failed to parse release: ', err);
        });
      }, 1000);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

})();
