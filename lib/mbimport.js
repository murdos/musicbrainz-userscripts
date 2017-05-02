///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                          MusicBrainz Import helper functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * How to use this module?
 *
 * - First build a release object (see expected format below) that you'll fill in from source of data
 * - Call as follows, e.g.:
 *     var parameters = MBImport.buildFormParameters(parsedRelease, optionalEditNote);
 * - Then build the HTML that you'll inject into source site page:
 *     var formHtml = MBImport.buildFormHTML(parameters);
 * - Addinionally, you can inject a search link to verify that the release is not already known by MusicBrainz:
 *     var linkHtml = MBImport.buildSearchLink(parsedRelease);
 *
 * Expected format of release object:
 *
 *     release = {
 *         title,
 *         artist_credit,
 *         type,
 *         status,
 *         language,
 *         script,
 *         packaging,
 *         country,
 *         year,
 *         month,
 *         day,
 *         labels = [ { name, mbid, catno }, ... ],
 *         barcode,
 *         urls = [ {url, link_type }, ... ],
 *         discs = [
 *             {
 *                 title,
 *                 format,
 *                 tracks = [
 *                     { number, title, duration, artist_credit },
 *                     ...
 *                 ]
 *             },
 *             ...
 *         ],
 *     }
 *
 *     where 'artist_credit' has the following format:
 *
 *     artist_credit = [
 *         {
 *             credited_name,
 *             artist_name,
 *             artist_mbid,
 *             joinphrase
 *         },
 *         ...
 *     ]
 *
 */

var MBImport = (function() {

    // --------------------------------------- publics ----------------------------------------- //

    var special_artists = {
      various_artists: {
        name: 'Various Artists',
        mbid: '89ad4ac3-39f7-470e-963a-56509c546377'
      },
      unknown: {
        name: '[unknown]',
        mbid: '125ec42a-7229-4250-afc5-e057484327fe'
      }
    };

    var url_types = {
       purchase_for_download: 74,
       download_for_free: 75,
       discogs: 76,
       purchase_for_mail_order: 79,
       other_databases: 82,
       stream_for_free: 85,
       license: 301
    }

    function fnSpecialArtist(key, ac) {
      var credited_name = "";
      var joinphrase = "";
      if (typeof ac !== 'undefined') {
        joinphrase = ac.joinphrase;
      }
      return {
        'artist_name': special_artists[key].name,
        'credited_name': credited_name,
        'joinphrase': joinphrase,
        'mbid': special_artists[key].mbid
      };
    }

    // compute HTML of search link
    function fnBuildSearchLink(release) {
        var parameters = searchParams(release);
        var url_params = [];
        parameters.forEach(function(parameter) {
          var value = parameter.value + "";
          url_params.push(encodeURI(parameter.name + '=' + value));
        });
        return '<a class="musicbrainz_import" href="//musicbrainz.org/search?' + url_params.join('&') + '">Search in MusicBrainz</a>';
    }

    // compute HTML of search button
    function fnBuildSearchButton(release) {
        var parameters = searchParams(release);
        var html = '<form class="musicbrainz_import musicbrainz_import_search" action="//musicbrainz.org/search" method="get" target="_blank" accept-charset="UTF-8" charset="' + document.characterSet + '">';
        parameters.forEach(function(parameter) {
          var value = parameter.value + "";
          html += "<input type='hidden' value='" + value.replace(/'/g,"&apos;") + "' name='" + parameter.name + "'/>";
        });
        html += '<button type="submit" title="Search for this release in MusicBrainz (open a new tab)"><span>Search in MB</span></button>';
        html += '</form>';
        return html;
    }

    function fnSearchUrlFor(type, what) {
      type = type.replace('-', '_');

      var params = [
          'query=' + luceneEscape(what),
          'type=' + type,
          'indexed=1'
        ];
        return '//musicbrainz.org/search?' + params.join('&');
    }

    // compute HTML of import form
    function fnBuildFormHTML(parameters) {

        // Build form
        var innerHTML = '<form class="musicbrainz_import musicbrainz_import_add" action="//musicbrainz.org/release/add" method="post" target="_blank" accept-charset="UTF-8" charset="' + document.characterSet + '">';
        parameters.forEach(function(parameter) {
            var value = parameter.value + "";
            innerHTML += "<input type='hidden' value='" + value.replace(/'/g,"&apos;") + "' name='" + parameter.name + "'/>";
        });

        innerHTML += '<button type="submit" title="Import this release into MusicBrainz (open a new tab)"><img src="//musicbrainz.org/favicon.ico" /><span>Import into MB</span></button>';
        innerHTML += '</form>';

        return innerHTML;
    }

    // build form POST parameters that MB is waiting
    function fnBuildFormParameters(release, edit_note) {
        // Form parameters
        var parameters = new Array();
        appendParameter(parameters, 'name', release.title);

        // Release Artist credits
        buildArtistCreditsFormParameters(parameters, "", release.artist_credit);

        if (release["secondary_types"]) {
            for (var i=0; i < release.secondary_types.length; i++) {
                appendParameter(parameters, 'type', release.secondary_types[i]);
            }
        }
        appendParameter(parameters, 'status', release.status);
        appendParameter(parameters, 'language', release.language);
        appendParameter(parameters, 'script', release.script);
        appendParameter(parameters, 'packaging', release.packaging);

        // ReleaseGroup
        appendParameter(parameters, 'release_group', release.release_group_mbid);

        // Date + country
        appendParameter(parameters, 'country', release.country);
        if (!isNaN(release.year) && release.year != 0) { appendParameter(parameters, 'date.year', release.year); };
        if (!isNaN(release.month) && release.month != 0) { appendParameter(parameters, 'date.month', release.month); };
        if (!isNaN(release.day) && release.day != 0) { appendParameter(parameters, 'date.day', release.day); };

        // Barcode
        appendParameter(parameters, 'barcode', release.barcode);

        // Label + catnos
        for (var i=0; i < release.labels.length; i++) {
            var label = release.labels[i];
            appendParameter(parameters, 'labels.'+i+'.name', label.name);
            appendParameter(parameters, 'labels.'+i+'.mbid', label.mbid);
            if (label.catno != "none") {
                appendParameter(parameters, 'labels.'+i+'.catalog_number', label.catno);
            }
        }

        // URLs
        for (var i=0; i < release.urls.length; i++) {
            var url = release.urls[i];
            appendParameter(parameters, 'urls.'+i+'.url', url.url);
            appendParameter(parameters, 'urls.'+i+'.link_type', url.link_type);
        }

        // Mediums
        var total_tracks = 0;
        var total_tracks_with_duration = 0;
        var total_duration = 0;
        for (var i=0; i < release.discs.length; i++) {
            var disc = release.discs[i];
            appendParameter(parameters, 'mediums.'+i+'.format', disc.format);
            appendParameter(parameters, 'mediums.'+i+'.name', disc.title);

            // Tracks
            for (var j=0; j < disc.tracks.length; j++) {
                var track = disc.tracks[j];
                total_tracks++;
                appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.number', track.number);
                appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.name', track.title);
                var tracklength = "?:??";
                var duration_ms = hmsToMilliSeconds(track.duration);
                if (!isNaN(duration_ms)) {
                  tracklength = duration_ms;
                  total_tracks_with_duration++;
                  total_duration += duration_ms;
                }
                appendParameter(parameters, 'mediums.'+i+'.track.'+j+'.length', tracklength);

                buildArtistCreditsFormParameters(parameters, 'mediums.'+i+'.track.'+j+'.', track.artist_credit);
            }
        }

        // Guess release type if not given
        if (!release.type && release.title && total_tracks == total_tracks_with_duration) {
          release.type = fnGuessReleaseType(release.title, total_tracks, total_duration);
        }
        appendParameter(parameters, 'type', release.type);

        // Add Edit note parameter
        appendParameter(parameters, 'edit_note', edit_note);

        return parameters;
    }

    // Convert a list of artists to a list of artist credits with joinphrases
    function fnArtistCredits(artists_list) {
      var artists = artists_list.map(function(item) { return {artist_name: item}; });
      if (artists.length > 2) {
        var last = artists.pop();
        last.joinphrase = '';
        var prev = artists.pop();
        prev.joinphrase = ' & ';
        for (var i = 0; i < artists.length; i++) {
          artists[i].joinphrase = ', ';
        }
        artists.push(prev);
        artists.push(last);
      } else if (artists.length == 2) {
        artists[0].joinphrase = ' & ';
      }
      var credits = [];
      // re-split artists if featuring or vs
      artists.map(function (item) {
        var c = item.artist_name.replace(/\s*\b(?:feat\.?|ft\.?|featuring)\s+/gi, ' feat. ');
        c = c.replace(/\s*\(( feat. )([^\)]+)\)/g, '$1$2');
        c = c.replace(/\s*\b(?:versus|vs\.?)\s+/gi, ' vs. ');
        c = c.replace(/\s+/g, ' ');
        var splitted = c.split(/( feat\. | vs\. )/);
        if (splitted.length == 1) {
          credits.push(item); // nothing to split
        } else {
          var new_items = [];
          var n = 0;
          for (var i = 0; i < splitted.length; i++) {
            if (n && (splitted[i] == ' feat. ' || splitted[i] == ' vs. ')) {
              new_items[n-1].joinphrase = splitted[i];
            } else {
              new_items[n++] = {
                artist_name: splitted[i].trim(),
                joinphrase: ''
              };
            }
          }
          new_items[n-1].joinphrase = item.joinphrase;
          new_items.map(function (newit) {
            credits.push(newit)
          });
        }
      });
      return credits;
    }

    // Try to guess release type using number of tracks, title and total duration (in millisecs)
    function fnGuessReleaseType(title, num_tracks, duration_ms) {
      if (num_tracks < 1) return '';
      var has_single = !!title.match(/\bsingle\b/i);
      var has_EP = !!title.match(/\bEP\b/i);
      if (has_single && has_EP) {
        has_single = false;
        has_EP = false;
      }
      var perhaps_single = ((has_single && num_tracks <= 4) || num_tracks <= 2);
      var perhaps_EP = has_EP || (num_tracks > 2 && num_tracks <= 6);
      var perhaps_album = (num_tracks > 8);
      if (isNaN(duration_ms)) {
        // no duration, try to guess with title and number of tracks
        if (perhaps_single && !perhaps_EP && !perhaps_album) return 'single';
        if (!perhaps_single && perhaps_EP && !perhaps_album) return 'EP';
        if (!perhaps_single && !perhaps_EP && perhaps_album) return 'album';
        return '';
      }
      var duration_mn = duration_ms / (60*1000);
      if (perhaps_single && duration_mn >= 1 && duration_mn < 7) return 'single';
      if (perhaps_EP && duration_mn > 7 && duration_mn <= 30) return 'EP';
      if (perhaps_album && duration_mn > 30) return 'album';
      return '';
    }

    // convert HH:MM:SS or MM:SS to milliseconds
    function hmsToMilliSeconds(str) {
        if (typeof str == 'undefined' || str === null || str === NaN || str === '') return NaN;
        if (typeof str == 'number') return str;
        var t = str.split(':');
        var s = 0;
        var m = 1;
        while (t.length > 0) {
            s += m * parseInt(t.pop(), 10);
            m *= 60;
        }
        return s*1000;
    }

    // convert ISO8601 duration (limited to hours/minutes/seconds) to milliseconds
    // format looks like PT1H45M5.789S (note: floats can be used)
    // https://en.wikipedia.org/wiki/ISO_8601#Durations
    function fnISO8601toMilliSeconds(str) {
        var regex = /^PT(?:(\d*\.?\d*)H)?(?:(\d*\.?\d*)M)?(?:(\d*\.?\d*)S)?$/,
            m = str.replace(',', '.').match(regex);
        if (!m) return NaN;
        return (3600 * parseFloat(m[1] || 0) + 60 * parseFloat(m[2] || 0) + parseFloat(m[3] || 0)) * 1000;
    }

    function fnMakeEditNote(release_url, importer_name, format) {
      var home = 'https://github.com/murdos/musicbrainz-userscripts';
      return 'Imported from ' + release_url + (format ? ' (' + format + ')' : '') +' using ' + importer_name + ' import script from ' + home;
    }

    // --------------------------------------- privates ----------------------------------------- //

    function appendParameter(parameters, paramName, paramValue) {
        if(!paramValue) return;
        parameters.push( { name: paramName, value: paramValue } );
    }

    function luceneEscape(text) {
        var newtext = text.replace(/[-[\]{}()*+?~:\\^!"\/]/g, "\\$&");
        return newtext.replace("&&", "\&&").replace("||", "\||");
    }

    function buildArtistCreditsFormParameters(parameters, paramPrefix, artist_credit) {
        if(!artist_credit) return;
        for (var i=0; i < artist_credit.length; i++) {
            var ac = artist_credit[i];
            appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.name', ac.credited_name);
            appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.artist.name', ac.artist_name);
            appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.mbid', ac.mbid);
            if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != "") {
                appendParameter(parameters, paramPrefix+'artist_credit.names.'+i+'.join_phrase', ac.joinphrase);
            }
        }
    }

    function searchParams(release) {
        var params = [];

        var totaltracks = 0;
        for (var i=0; i < release.discs.length; i++) {
            totaltracks += release.discs[i].tracks.length;
        }
        var release_artist = "";
        for (var i=0; i < release.artist_credit.length; i++) {
            var ac = release.artist_credit[i];
            release_artist += ac.artist_name;
            if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != "") {
                release_artist += ac.joinphrase;
            } else {
                if (i != release.artist_credit.length-1) release_artist += ", ";
            }
        }

        var query = 'artist:(' + luceneEscape(release_artist) + ')'
          + ' release:(' + luceneEscape(release.title) + ')'
          + ' tracks:(' + totaltracks + ')'
          + (release.country ? ' country:' + release.country : '');

        appendParameter(params, 'query', query);
        appendParameter(params, 'type', 'release');
        appendParameter(params, 'advanced', '1');
        return params;
    }

    // ---------------------------------- expose publics here ------------------------------------ //

    return {
       buildSearchLink: fnBuildSearchLink,
       buildSearchButton: fnBuildSearchButton,
       buildFormHTML: fnBuildFormHTML,
       buildFormParameters: fnBuildFormParameters,
       makeArtistCredits: fnArtistCredits,
       guessReleaseType: fnGuessReleaseType,
       hmsToMilliSeconds: hmsToMilliSeconds,
       ISO8601toMilliSeconds: fnISO8601toMilliSeconds,
       makeEditNote: fnMakeEditNote,
       searchUrlFor: fnSearchUrlFor,
       URL_TYPES: url_types,
       SPECIAL_ARTISTS: special_artists,
       specialArtist: fnSpecialArtist
    };
})();
