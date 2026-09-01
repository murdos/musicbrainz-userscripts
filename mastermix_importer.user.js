// ==UserScript==
// @name         Import Mastermix releases to MusicBrainz
// @description  Import Mastermix releases and show links to matching MusicBrainz releases
// @version      2026.09.01.1
// @author       Raman Sinclair
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mastermix_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/mastermix_importer.user.js
// @match        https://mastermixdj.com/*
// @match        https://www.mastermixdj.com/*
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
   .mb_wrapper {
     display: inline-block;
   }
   `;
      _add_css(css_search_it);
    }

    // Class MBLinks : query MusicBrainz for urls and display links for matching urls
    // The main method is searchAndDisplayMbLinks()

    // Example:
    // document.addEventListener('DOMContentLoaded', function () {
    //
    //  const mblinks = new MBLinks('EXAMPLE_MBLINKS_CACHE', undefined, 7*24*60); // force refresh of cached links once a week
    //
    //  const album_link = 'http://' + window.location.href.match( /^https?:\/\/(.*\/album\/.+)$/i)[1];
    //  mblinks.searchAndDisplayMbLinks([{ url: album_link, mb_type: 'release', insert_func: function (link) {
    //      document.querySelector('div#there').insertAdjacentHTML('afterend', link);
    //  } }]);
    // });

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
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Kept in line with the original request queue.
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
      relations
    }) {
      const matching_urls_data = batch.filter(query => {
        if (!query.url_regex) return query.url === resource;
        try {
          return new RegExp(`^(?:${query.url_regex})$`).test(resource);
        } catch {
          return false;
        }
      });
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
    function searchRelations(url) {
      if (url.relations) return url.relations;
      const relationLists = url['relation-list'];
      if (!relationLists) return undefined;
      return relationLists.flatMap(relationList => relationList.relations ?? []);
    }

    // user_cache_key = textual key used to store cached data in local storage
    // version = optionnal version,  to force creation of a cache (ie. when format of keys changes)
    // expiration = time in minutes before an entry is refreshed, value <= 0 disables cache reads, if undefined or false, use defaults
    class MBLinks {
      supports_local_storage;
      ajax_requests = new AjaxRequests();
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
       * GET JSON with retry on 5xx errors (e.g. 503). Retries up to 3 times with a delay between attempts.
       * @param url - The URL to request.
       * @param successCallback - Called with response data on success.
       * @param alwaysCallback - Called when the request is finally done (success or after giving up retries).
       */
      getJSONWithRetry(url, successCallback, alwaysCallback) {
        const maxRetries = 3;
        const retryDelayMs = 2000;
        let attempt = 0;
        function doRequest() {
          attempt += 1;
          fetch(url, {
            headers: {
              Accept: 'application/json'
            }
          }).then(function (response) {
            if (!response.ok) {
              const error = new Error(`HTTP ${response.status}`);
              error.status = response.status;
              throw error;
            }
            return response.json();
          }).then(function (data) {
            successCallback(data);
            if (typeof alwaysCallback === 'function') {
              alwaysCallback();
            }
          }).catch(function (error) {
            const status = isErrorWithStatus(error) ? error.status : 0;
            const is5xx = status >= 500 && status < 600;
            if (is5xx && attempt <= maxRetries) {
              setTimeout(doRequest, retryDelayMs);
            } else if (typeof alwaysCallback === 'function') {
              alwaysCallback();
            }
          });
        }
        doRequest();
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
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the original callback contexts.
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
          const request = mblinks.ajax_requests[query];
          if (typeof request === 'object') {
            handlers = request.context.handlers;
          }
          handlers.push(function (data) {
            if ('urls' in data) {
              const processedResources = {};
              data.urls.forEach(url_data => {
                if (processedResources[url_data.resource]) return;
                processedResources[url_data.resource] = true;
                processUrlMatch({
                  mblinks,
                  batch,
                  resource: url_data.resource,
                  relations: url_data.relations
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
                relations: data.relations
              });
            }
            mblinks.saveCache();
          });
          mblinks.ajax_requests.push(query, function () {
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the original callback context.
            const ctx = this;
            ctx.mblinks.getJSONWithRetry(ctx.query, function (data) {
              ctx.handlers.forEach(handler => {
                handler(data);
              });
            });
          }, {
            handlers: handlers,
            query: query,
            mblinks: mblinks
          });
        }
      }

      /**
       * Search MusicBrainz's indexed URL field with Lucene regular expressions.
       */
      searchAndDisplayMbLinksByRegex(urls_data) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the callback contexts above.
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
          } else if (data.url_regex) {
            uncachedQueries.push(data);
          }
        });
        const batchSize = 20;
        for (let i = 0; i < uncachedQueries.length; i += batchSize) {
          const batch = uncachedQueries.slice(i, i + batchSize);
          const regex = batch.map(data => `(${data.url_regex})`).join('|');
          this.enqueueRegexSearchPage(batch, regex, 0);
        }
      }
      enqueueRegexSearchPage(batch, regex, offset) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the callback contexts above.
        const mblinks = this;
        const search = `url:/(${regex})/`;
        const query = `${mblinks.mb_server}/ws/2/url?query=${encodeURIComponent(search)}&fmt=json&limit=100&offset=${offset}`;
        let handlers = [];
        const request = mblinks.ajax_requests[query];
        if (typeof request === 'object') handlers = request.context.handlers;
        handlers.push(function (data) {
          const urls = data.urls ?? [];
          urls.forEach(urlData => {
            processUrlMatch({
              mblinks,
              batch,
              resource: urlData.resource,
              relations: searchRelations(urlData)
            });
          });
          mblinks.saveCache();
          const responseOffset = data.offset ?? offset;
          const nextOffset = responseOffset + urls.length;
          if (typeof data.count === 'number' && urls.length > 0 && nextOffset < data.count) {
            mblinks.enqueueRegexSearchPage(batch, regex, nextOffset);
          }
        });
        mblinks.ajax_requests.push(query, function () {
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the original callback context.
          const ctx = this;
          ctx.mblinks.getJSONWithRetry(ctx.query, function (data) {
            ctx.handlers.forEach(handler => {
              handler(data);
            });
          });
        }, {
          handlers,
          query,
          mblinks
        });
      }
    }
    function isErrorWithStatus(error) {
      return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number';
    }

    function normalizeProductUrl(url) {
      const parsed = new URL(url, window.location.origin);
      parsed.search = '';
      parsed.hash = '';
      return parsed.href;
    }
    function createReleaseSearchLink(title) {
      const indicator = MBImport.createEntitySearchLink('release', title);
      indicator.classList.add('mastermix-mb-indicator');
      indicator.addEventListener('click', event => {
        event.stopPropagation();
      });
      return indicator;
    }
    function addReleaseLookup(queries, {
      url,
      title,
      target
    }) {
      const indicator = createReleaseSearchLink(title);
      target.prepend(indicator);
      let foundMatch = false;
      queries.push({
        url,
        mb_type: 'release',
        key: `release:${url}`,
        insert_func: link => {
          if (!foundMatch) {
            indicator.replaceChildren();
            indicator.classList.remove('mb_searchit');
            foundMatch = true;
          }
          indicator.insertAdjacentHTML('beforeend', link.trim());
        }
      });
    }

    function collectElements(root, selector) {
      const elements = Array.from(root.querySelectorAll(selector));
      if (root instanceof Element && root.matches(selector)) elements.unshift(root);
      return elements;
    }
    function addSingleResultLookups(context, roots, queries) {
      roots.flatMap(root => collectElements(root, 'td:nth-child(3)')).forEach(albumCell => {
        if (!(albumCell instanceof HTMLTableCellElement) || !albumCell.closest('#singles tbody') || context.processedTargets.has(albumCell)) return;
        const albumLink = albumCell.querySelector(':scope > a[href*="/product/"]');
        const title = albumLink?.textContent.trim();
        if (!albumLink || !title) return;
        context.processedTargets.add(albumCell);
        albumCell.classList.add('mastermix-search-single-album');
        addReleaseLookup(queries, {
          url: normalizeProductUrl(albumLink.href),
          title,
          target: albumCell
        });
      });
    }
    function addAlbumResultLookups(context, roots, queries) {
      roots.flatMap(root => collectElements(root, '.text-container > h3')).forEach(titleElement => {
        if (!(titleElement instanceof HTMLElement) || !titleElement.closest('#js-list-albums') || context.processedTargets.has(titleElement)) return;
        const productLink = titleElement.closest('a[href*="/product/"]');
        const title = titleElement.textContent.trim();
        if (!productLink || !title) return;
        context.processedTargets.add(titleElement);
        titleElement.classList.add('mastermix-search-album-title');
        addReleaseLookup(queries, {
          url: normalizeProductUrl(productLink.href),
          title,
          target: titleElement
        });
      });
    }
    function addSearchResultLookups(context, roots) {
      const queries = [];
      addSingleResultLookups(context, roots, queries);
      addAlbumResultLookups(context, roots, queries);
      if (queries.length > 0) context.mblinks.searchAndDisplayMbLinks(queries);
    }
    function handleResultMutations(context, mutations) {
      const addedElements = mutations.flatMap(mutation => Array.from(mutation.addedNodes).filter(node => node instanceof Element));
      if (addedElements.length > 0) addSearchResultLookups(context, addedElements);
    }
    function observeDynamicResults(context) {
      const resultContainers = document.querySelectorAll('#singles tbody, #js-list-singles, #js-list-albums');
      if (resultContainers.length === 0) return;
      const observer = new MutationObserver(handleResultMutations.bind(undefined, context));
      resultContainers.forEach(container => {
        observer.observe(container, {
          childList: true,
          subtree: true
        });
      });
    }
    function initSearchResultLookups(mblinks) {
      const context = {
        mblinks,
        processedTargets: new WeakSet()
      };
      addSearchResultLookups(context, [document]);
      observeDynamicResults(context);
    }

    const LOGGER = new Logger('MusicBrainz mastermix_importer', LogLevel.INFO);
    const MASTERMIX_MBID = '8e0090e8-9081-4797-a386-990040f0accf'; // Music Factory label
    const MASTERMIX_LABEL = 'Music Factory';
    const PRODUCT_URL_PATTERN = /^\/product\/[^/]+\/?$/;
    function getCurrentProductUrl() {
      const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href;
      return normalizeProductUrl(canonicalUrl || window.location.href);
    }
    function addReleaseLookups(mblinks) {
      MBSearchItStyle();
      const queries = [];
      document.querySelectorAll('article.article--album').forEach(article => {
        const productLink = article.querySelector(':scope > a[href*="/product/"]');
        const titleElement = productLink?.querySelector('h2');
        const title = titleElement?.textContent.trim();
        if (!productLink || !titleElement || !title) return;
        const titleText = document.createElement('span');
        titleText.className = 'mastermix-card-title-text';
        titleText.textContent = title;
        titleElement.replaceChildren(titleText);
        titleElement.classList.add('mastermix-card-title');
        addReleaseLookup(queries, {
          url: normalizeProductUrl(productLink.href),
          title,
          target: titleElement
        });
      });
      if (PRODUCT_URL_PATTERN.test(window.location.pathname)) {
        const title = document.querySelector('h1.product_title');
        if (title?.textContent.trim()) {
          addReleaseLookup(queries, {
            url: getCurrentProductUrl(),
            title: title.textContent.trim(),
            target: title
          });
        }
      }
      if (queries.length > 0) {
        mblinks.searchAndDisplayMbLinks(queries);
      }
    }
    function getProductId() {
      const product = document.querySelector('.product[id^="product-"]');
      return product?.id.match(/^product-(\d+)$/)?.[1];
    }
    async function getPublicationDate() {
      const productId = getProductId();
      if (!productId) return undefined;
      try {
        const response = await fetch(`/wp-json/wp/v2/product/${productId}`, {
          headers: {
            Accept: 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const match = data.date?.match(/^(\d{4})-(\d{2})-(\d{2})T/);
        if (!match) return undefined;
        return {
          year: parseInt(match[1], 10),
          month: parseInt(match[2], 10),
          day: parseInt(match[3], 10)
        };
      } catch (error) {
        LOGGER.error('Could not retrieve the product publication date', error);
        return undefined;
      }
    }
    function getReleaseArtistCredit(tracks) {
      const artists = tracks.map(track => track.artist_credit[0]?.artist_name).filter(artist => typeof artist === 'string');
      const uniqueArtists = [...new Set(artists)];
      return uniqueArtists.length === 1 && uniqueArtists[0] !== 'Various Artists' ? MBImport.makeArtistCredits(uniqueArtists) : [MBImport.specialArtist('various_artists')];
    }
    function getTrackArtistCredit(artist) {
      return artist === 'Mastermix' ? [MBImport.specialArtist('various_artists')] : MBImport.makeArtistCredits([artist]);
    }
    function getAnnotation() {
      const description = document.querySelector('.woocommerce-product-details__short-description .wysiwyg');
      if (!description) return undefined;
      const paragraphs = Array.from(description.querySelectorAll('p')).map(paragraph => paragraph.textContent.trim()).filter(Boolean);
      let annotation = paragraphs.length > 0 ? paragraphs.join('\n\n') : description.textContent.trim();
      if (annotation) {
        annotation = `=== Description from Mastermix ===\n\n${annotation}`;
      }
      return annotation || undefined;
    }
    function parseTracks() {
      return Array.from(document.querySelectorAll('#mfeg-single-list tbody tr.single-item')).flatMap(row => {
        const title = row.querySelector('.single-item__title')?.textContent.trim();
        const artist = row.querySelector('.single-item__artist')?.textContent.trim();
        const duration = row.querySelector('.single-item__runtime')?.textContent.trim();
        const number = row.querySelector('.track-number')?.textContent.trim();
        if (!title || !artist) return [];
        const durationMs = duration ? MBImport.hmsToMilliSeconds(duration) : undefined;
        return [{
          ...(number ? {
            number
          } : {}),
          title,
          ...(durationMs === undefined ? {} : {
            duration: durationMs
          }),
          artist_credit: getTrackArtistCredit(artist)
        }];
      });
    }
    async function parseRelease() {
      const titleElement = document.querySelector('h1.product_title');
      const title = Array.from(titleElement?.childNodes ?? []).filter(node => !(node instanceof HTMLElement && node.classList.contains('mastermix-mb-indicator'))).map(node => node.textContent).join('').trim();
      const tracks = parseTracks();
      if (!title || tracks.length === 0) return undefined;

      // Publication date is not found in the DOM, so we need to call their API
      const publicationDate = await getPublicationDate();
      const sku = document.querySelector('.product_meta .sku')?.textContent.trim();
      const releaseUrl = getCurrentProductUrl();
      const annotation = getAnnotation();
      return {
        title,
        artist_credit: getReleaseArtistCredit(tracks),
        ...(annotation ? {
          annotation
        } : {}),
        type: 'album',
        secondary_types: ['compilation', 'dj-mix'],
        status: 'official',
        language: 'eng',
        script: 'Latn',
        packaging: 'None',
        country: 'XW',
        ...(publicationDate ?? {}),
        labels: [{
          mbid: MASTERMIX_MBID,
          name: MASTERMIX_LABEL,
          ...(sku ? {
            catno: sku
          } : {})
        }],
        barcode: '',
        urls: [{
          url: releaseUrl,
          link_type: MBImport.URL_TYPES.purchase_for_download
        }],
        discs: [{
          format: 'Digital Media',
          tracks
        }]
      };
    }
    async function addImportButtons() {
      if (!PRODUCT_URL_PATTERN.test(window.location.pathname)) return;
      const release = await parseRelease();
      if (!release) {
        LOGGER.error('Could not parse release data from the product page');
        return;
      }
      const releaseUrl = getCurrentProductUrl();
      const editNote = MBImport.makeEditNote(releaseUrl, 'Mastermix');
      const parameters = MBImport.buildFormParameters(release, editNote);
      const buttons = document.createElement('div');
      buttons.id = 'mb_buttons';
      buttons.className = 'mastermix-import-buttons';
      buttons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release);
      const productMeta = document.querySelector('.product_meta');
      if (!productMeta) {
        LOGGER.error('Could not find the product metadata container');
        return;
      }
      productMeta.insertAdjacentElement('afterend', buttons);
    }
    function addStyles() {
      MBImportStyle();
      document.head.insertAdjacentHTML('beforeend', `<style>
            .article--album a h2.mastermix-card-title {
                display: flex;
                align-items: center;
            }
            .mastermix-card-title-text {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            h1.product_title {
                display: flex;
                align-items: center;
            }
            .mastermix-search-album-title {
                display: flex;
                align-items: center;
            }
            span.mastermix-mb-indicator {
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                min-height: 16px;
                margin-right: 4px;
                line-height: 16px;
                vertical-align: middle;
            }
            .mastermix-mb-indicator a {
                display: inline-flex;
                align-items: center;
                height: 16px;
                line-height: 16px;
            }
            .mastermix-mb-indicator img { display: block; }
            #singles td .mastermix-mb-indicator img {
                width: 16px;
                height: 16px;
                max-width: 16px;
            }
            .mastermix-import-buttons { margin-top: 1rem; flex-wrap: wrap; }
        </style>`);
    }
    function init() {
      addStyles();
      const mblinks = new MBLinks('MASTERMIX_MBLINKS_CACHE', 1);
      addReleaseLookups(mblinks);
      initSearchResultLookups(mblinks);
      void addImportButtons();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

})();
