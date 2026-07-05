// ==UserScript==
// @name         Musicbrainz DiscIds Detector
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @version      2026.07.05.5
// @description  Generate MusicBrainz DiscIds from online EAC logs, and check existence in MusicBrainz database.
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_discids_detector.user.js
// @match        https://orpheus.network/torrents.php?id=*
// @match        https://redacted.sh/torrents.php?id=*
// @match        https://lztr.me/torrents.php?id=*
// @match        https://notwhat.cd/torrents.php?id=*
// @require      lib/logger.js
// ==/UserScript==

LOGGER.setLevel('info');

function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onReady(function () {
    if (window.location.host.match(/orpheus\.network|redacted\.sh|passtheheadphones\.me|lztr\.(us|me)|notwhat\.cd/)) {
        LOGGER.info('Gazelle site detected');
        gazellePageHandler();
    }
});

function gazellePageHandler() {
    const serverHost = window.location.host;

    // Determine Artist name and Release title
    const titleAndArtists = document.querySelector('#content div.thin h2')?.textContent ?? '';
    let pattern = /(.*) - (.*) \[.*\] \[.*/;
    if (serverHost.match(/orpheus/)) {
        pattern = /(.*) [-–] (.*) \[.*\]( \[.*)?/;
    }
    let artistName, releaseName;
    const m = titleAndArtists.match(pattern);
    if (m) {
        artistName = m[1];
        releaseName = m[2];
    }
    LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);

    // Parse each torrent
    for (const torrentRow of document.querySelectorAll('tr.group_torrent')) {
        if (!torrentRow.id) {
            continue;
        }
        const torrentInfo = torrentRow.nextElementSibling;
        if (!torrentInfo) {
            continue;
        }
        for (const link of torrentInfo.querySelectorAll('a')) {
            if (!link.textContent.match(/View\s+Log/i)) {
                continue;
            }
            LOGGER.debug('Log link', link);
            let logAction;
            const onclick = link.getAttribute('onclick') ?? '';
            if (onclick.match(/show_logs/)) {
                if (window.location.host.match(/orpheus/)) {
                    LOGGER.debug('Orpheus');
                    logAction = 'viewlog';
                } else if (window.location.host.match(/redacted|passtheheadphones/)) {
                    LOGGER.debug('RED');
                    logAction = 'loglist';
                }
            } else if (onclick.match(/get_log/)) {
                LOGGER.debug('LzTR');
                logAction = 'log_ajax';
            } else if (onclick.match(/show_log/)) {
                LOGGER.debug('NotWhat.CD');
                logAction = 'viewlog';
            } else {
                continue;
            }
            const targetContainer = link.closest('.linkbox');
            const torrentId = /(show_logs|get_log|show_log)\('(\d+)/.exec(onclick)[2];
            const logUrl = `/torrents.php?action=${logAction}&torrentid=${torrentId}`;
            LOGGER.info('Log URL: ', logUrl);
            LOGGER.debug('targetContainer: ', targetContainer);

            // Get log content
            fetch(logUrl)
                .then(response => response.text())
                .then(async data => {
                    const doc = new DOMParser().parseFromString(data, 'text/html');
                    const pres = doc.querySelectorAll('pre');
                    LOGGER.debug('Log content', pres);
                    const discs = await analyze_log_files(pres);
                    LOGGER.debug('Number of disc found', discs.length);
                    await check_and_display_discs(
                        artistName,
                        releaseName,
                        discs,
                        function (mb_toc_numbers, discid, discNumber) {
                            targetContainer?.insertAdjacentHTML(
                                'beforeend',
                                `<br /><strong>${
                                    discs.length > 1 ? `Disc ${discNumber}: ` : ''
                                }MB DiscId: </strong><span id="${torrentId}_disc${discNumber}"></span>`,
                            );
                        },
                        function (mb_toc_numbers, discid, discNumber, found) {
                            const url = computeAttachURL(mb_toc_numbers, artistName, releaseName);

                            const html_element = document.createElement('a');
                            html_element.href = url;
                            html_element.textContent = discid;
                            if (found) {
                                html_element.style.backgroundColor = '#d0f1d0';
                                html_element.style.color = 'rgb(30, 70, 32)';
                                html_element.style.border = '1px solid rgb(30, 70, 32)';
                                html_element.style.paddingInline = '3px';
                                html_element.style.borderRadius = '3px';
                            }

                            LOGGER.debug(`#${torrentId}_disc${discNumber}`);
                            const el = document.getElementById(`${torrentId}_disc${discNumber}`);
                            if (el) el.appendChild(html_element);
                        },
                    );
                })
                .catch(err => LOGGER.error('Failed to fetch log', logUrl, err));
        }
    }
}

// Common functions

function computeAttachURL(mb_toc_numbers, artistName, releaseName) {
    let url = `${'http://musicbrainz.org/cdtoc/attach?toc='}${mb_toc_numbers.join('%20')}&artist-name=${encodeURIComponent(
        artistName,
    )}&release-name=${encodeURIComponent(releaseName)}`;
    return url;
}

async function sha1MusicBrainzDiscId(message) {
    const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return b64.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-');
}

async function analyze_log_files(log_files) {
    let discs = [];
    for (const log_file of log_files) {
        const discsInLog = MBDiscid.log_input_to_entries(log_file.textContent);
        for (const disc of discsInLog) {
            discs.push(disc);
        }
    }

    // Remove dupes discs
    let keys = new Object();
    let uniqueDiscs = new Array();
    for (let i = 0; i < discs.length; i++) {
        let discid = await MBDiscid.calculate_mb_discid(discs[i]);
        if (discid in keys) {
            continue;
        } else {
            keys[discid] = 1;
            uniqueDiscs.push(discs[i]);
        }
    }
    discs = uniqueDiscs;
    return discs;
}

async function check_and_display_discs(artistName, releaseName, discs, displayDiscHandler, displayResultHandler) {
    // For each disc, check if it's in MusicBrainz database
    for (let i = 0; i < discs.length; i++) {
        let entries = discs[i];
        let discNumber = i + 1;
        if (entries.length > 0) {
            let mb_toc_numbers = MBDiscid.calculate_mb_toc_numbers(entries);
            let discid = await MBDiscid.calculate_mb_discid(entries);
            LOGGER.info(`Computed discid :${discid}`);
            displayDiscHandler(mb_toc_numbers, discid, discNumber);

            // Now check if this discid is known by MusicBrainz
            (function (discid, discNumber, mb_toc_numbers) {
                fetch(`https://musicbrainz.org/ws/2/discid/${discid}?cdstubs=no`, {
                    headers: { Accept: 'application/json' },
                })
                    .then(response => {
                        if (!response.ok) {
                            displayResultHandler(mb_toc_numbers, discid, discNumber, false);
                            return null;
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (!data) {
                            return;
                        }
                        let existsInMusicbrainz = !('error' in data) && data.error != 'Not found';
                        displayResultHandler(mb_toc_numbers, discid, discNumber, existsInMusicbrainz);
                    })
                    .catch(() => {
                        // If discid is not found, the webservice returns a 404 http code
                        displayResultHandler(mb_toc_numbers, discid, discNumber, false);
                    });
            })(discid, discNumber, mb_toc_numbers);
        }
    }
}

/* -------------------------------------------- */

// MBDiscid code comes from https://gist.github.com/kolen/766668
// Copyright 2010, kolen
// Released under the MIT License

const MBDiscid = (function () {
    this.PREGAP = 150;
    this.DATA_TRACK_GAP = 11400;

    this.toc_entry_matcher = new RegExp(
        '^\\s*' +
            '(\\d+)' + // 1 - track number
            '\\s*\\|\\s*' +
            '([0-9:.]+)' + // 2 - time start
            '\\s*\\|\\s*' +
            '([0-9:.]+)' + // 3 - time length
            '\\s*\\|\\s*' +
            '(\\d+)' + // 4 - start sector
            '\\s*\\|\\s*' +
            '(\\d+)' + // 5 - end sector
            '\\s*$',
    );
    this.log_input_to_entries = function (text) {
        let discs = [];
        let entries = [];
        for (const value of text.split('\n')) {
            let m = toc_entry_matcher.exec(value);
            if (m) {
                // New disc
                if (parseInt(m[1], 10) == 1) {
                    if (entries.length > 0) {
                        discs.push(entries);
                    }
                    entries = [];
                }
                entries.push(m);
            }
        }
        if (entries.length > 0) {
            discs.push(entries);
        }

        for (let i = 0; i < discs.length; i++) {
            const discEntries = discs[i];
            let layout_type = get_layout_type(discEntries);
            let entries_audio;
            if (layout_type === 'with_data') {
                entries_audio = discEntries.slice(0, discEntries.length - 1);
            } else {
                entries_audio = discEntries;
            }
            discs[i] = entries_audio;
        }
        return discs;
    };

    this.get_layout_type = function (entries) {
        let type = 'standard';
        for (let i = 0; i < entries.length - 1; i++) {
            let gap = parseInt(entries[i + 1][4], 10) - parseInt(entries[i][5], 10) - 1;
            if (gap !== 0) {
                if (i === entries.length - 2 && gap === this.DATA_TRACK_GAP) {
                    type = 'with_data';
                } else {
                    type = 'unknown';
                    break;
                }
            }
        }
        return type;
    };

    this.calculate_mb_toc_numbers = function (entries) {
        if (entries.length === 0) {
            return null;
        }

        let leadout_offset = parseInt(entries[entries.length - 1][5], 10) + this.PREGAP + 1;

        let offsets = entries.map(function (entry) {
            return parseInt(entry[4], 10) + PREGAP;
        });
        return [1, entries.length, leadout_offset].concat(offsets);
    };

    this.calculate_mb_discid = async function (entries) {
        let hex_left_pad = function (input, totalChars) {
            input = `${parseInt(input, 10).toString(16).toUpperCase()}`;
            let padWith = '0';
            if (input.length < totalChars) {
                while (input.length < totalChars) {
                    input = padWith + input;
                }
            }
            if (input.length > totalChars) {
                //if padWith was a multiple character string and num was overpadded
                input = input.substring(input.length - totalChars, totalChars);
            }

            return input;
        };

        let mb_toc_numbers = calculate_mb_toc_numbers(entries);
        let message = '';
        let first_track = mb_toc_numbers[0];
        let last_track = mb_toc_numbers[1];
        let leadout_offset = mb_toc_numbers[2];
        message = message + hex_left_pad(first_track, 2);
        message = message + hex_left_pad(last_track, 2);
        message = message + hex_left_pad(leadout_offset, 8);
        for (let i = 0; i < 99; i++) {
            let offset = i + 3 < mb_toc_numbers.length ? mb_toc_numbers[i + 3] : 0;
            message = message + hex_left_pad(offset, 8);
        }

        return sha1MusicBrainzDiscId(message);
    };

    return this;
})();
