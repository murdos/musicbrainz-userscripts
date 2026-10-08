// ==UserScript==
// @name         Import Boomkat releases to Musicbrainz
// @description  Add a button on Boomkat release pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.10.8
// @license      X11
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/boomkat_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/boomkat_importer.user.js
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @match        https://boomkat.com/artists/*/releases/*/*
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/6886f50a8bfa231416831cdfd6421ba6782aee75/lib/mbimport.js
// @require      lib/logger.js
// @require      lib/mbimportstyle.js
// ==/UserScript==

function onLoad() {
    MBImportStyle();

    const release_url = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
    const releases = retrieveReleaseInfo(release_url);
    insertLink(releases, release_url);
}

function getFormat(format) {
    if (format.match(/MP3|WAV|FLAC|AAC|LOSSLESS|DOWNLOAD|DIGITAL/i)) {
        return 'Digital Media';
    }

    if (format.match(/CD/i)) {
        return 'CD';
    }

    if (format.match(/LP|VINYL|\d+\s*["″]/i)) {
        return 'Vinyl';
    }

    if (format.match(/CASSETTE|TAPE/i)) {
        return 'Cassette';
    }

    return '';
}

function getLinkType(media) {
    if (media == 'Digital Media') {
        return MBImport.URL_TYPES.purchase_for_download;
    }
    return MBImport.URL_TYPES.purchase_for_mail_order;
}

// Boomkat shows release dates as e.g. “1st October 2026”. Strip the ordinal
// suffix so the string can be parsed into a Date.
function parseReleaseDate(str) {
    if (!str) return null;
    const cleaned = str.replace(/(\d+)(?:st|nd|rd|th)/i, '$1').trim();
    const date = new Date(`${cleaned} UTC`);
    return isNaN(date.getTime()) ? null : date;
}

// Return the release artist displayed in the page header.
function getReleaseArtist() {
    const el = document.querySelector('[data-role="artist"]');
    return el ? el.textContent.trim() : '';
}

// Split a leading “Artist - Title” string. Returns null when there is no
// “ - ” separator to split on.
function splitArtistTitle(text) {
    const parts = text.split(/\s[-–—]\s/);
    if (parts.length < 2) return null;
    return { artist: parts.shift().trim(), title: parts.join(' - ').trim() };
}

// Extract the tracks for a given tracklisting container.
//
// Boomkat encodes the per-track artist inconsistently. The link text is either
// just the title (digital tracklists) or “Artist - Title” (physical
// tracklists), and a trailing text node after the link may hold the track
// artist, the release artist, or nothing at all. We reconcile those shapes per
// track, preferring the most specific artist available.
function retrieveTracks(container, releaseArtist) {
    const tracks = [];
    if (!container) return tracks;

    const isVarious = /various/i.test(releaseArtist);
    const releaseArtistKey = releaseArtist.replace(/[.\s]+$/, '').toLowerCase();

    container.querySelectorAll('ul li[data-track-ids]').forEach(function (li) {
        const link = li.querySelector('a[href*="/tracks/"]');
        if (!link) return;

        const anchor = link.textContent.replace(/\s+/g, ' ').trim();

        let trailing = '';
        for (let node = link.nextSibling; node; node = node.nextSibling) {
            if (node.nodeType === Node.TEXT_NODE) {
                trailing += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                break;
            }
        }
        trailing = trailing
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^[-–—]\s*/, '')
            .trim();

        let title = anchor;
        let trackArtist = releaseArtist;

        if (trailing) {
            const trailingKey = trailing.replace(/[.\s]+$/, '').toLowerCase();
            const prefix = anchor.slice(0, trailing.length);
            const rest = anchor.slice(trailing.length);
            if (prefix.toLowerCase() === trailing.toLowerCase() && /^\s*[-–—]\s/.test(rest)) {
                // Physical form, artist repeated: “Artist - Title” plus “ - Artist”.
                trackArtist = trailing;
                title = rest.replace(/^\s*[-–—]\s*/, '').trim();
            } else if (trailingKey === releaseArtistKey) {
                // Trailing text is just the release artist; the real split, if
                // any, lives in the link text.
                const split = isVarious ? splitArtistTitle(anchor) : null;
                if (split) {
                    trackArtist = split.artist;
                    title = split.title;
                }
            } else {
                // Digital form: the link text is the title, the artist trails it.
                trackArtist = trailing;
            }
        } else if (isVarious) {
            // Physical form, no trailing text: “Artist - Title”.
            const split = splitArtistTitle(anchor);
            if (split) {
                trackArtist = split.artist;
                title = split.title;
            }
        }

        const durationEl = li.querySelector('.font-regular');
        const duration = durationEl ? durationEl.textContent.trim() : '';

        tracks.push({
            artist_credit: MBImport.makeArtistCredits([trackArtist]),
            title: title,
            duration: duration,
        });
    });

    return tracks;
}

// Build one release object per available format/tracklisting.
function retrieveReleaseInfo(release_url) {
    const releaseArtist = getReleaseArtist();
    const title = document.querySelector('[data-role="title"]').textContent.trim();
    const labelEl = document.querySelector('[data-role="release-details"] a[href*="/labels/"]');
    const label = labelEl ? labelEl.textContent.trim() : '';

    const releases = [];

    document.querySelectorAll('.tracklisting-container[data-switcher-id]').forEach(function (container) {
        const id = container.dataset.switcherId;

        // Prefer the human-readable label from the tracklisting selector,
        // falling back to the matching buying-option card.
        const option = document.querySelector(`#tracklisting_format_selection option[value="${id}"]`);
        const card = document.querySelector(`[data-role="product-variant"][data-product-id="${id}"]`);

        let formatLabel = '';
        if (option) {
            formatLabel = option.textContent.trim();
        } else if (card) {
            const h = card.querySelector('h4 span');
            if (h) formatLabel = h.textContent.trim();
        }

        // Catalogue number and release date live together in the buying-option
        // card, e.g. “SPECIAL001CD | Release date: 1st October 2026”.
        let catno = '';
        let dateStr = '';
        if (card) {
            const paragraphs = card.querySelectorAll('p');
            for (const p of paragraphs) {
                const text = p.textContent.replace(/\s+/g, ' ').trim();
                if (/release date:/i.test(text)) {
                    const parts = text.split('|');
                    if (parts.length >= 2) {
                        catno = parts[0].trim();
                    }
                    const dateMatch = text.match(/release date:\s*(.+)$/i);
                    if (dateMatch) dateStr = dateMatch[1].trim();
                    break;
                }
            }
        }

        const releaseDate = parseReleaseDate(dateStr);
        const format = getFormat(formatLabel);

        const release = {
            artist_credit: MBImport.makeArtistCredits([releaseArtist]),
            title: title,
            country: 'XW',
            status: 'official',
            language: 'eng',
            script: 'Latn',
            type: '',
            urls: [],
            labels: [],
            discs: [],
            format: format,
            formatLabel: formatLabel,
        };

        if (releaseDate) {
            release.year = releaseDate.getUTCFullYear();
            release.month = releaseDate.getUTCMonth() + 1;
            release.day = releaseDate.getUTCDate();
        }

        if (label || catno) {
            release.labels.push({ name: label, catno: catno });
        }

        release.packaging = release.format == 'Digital Media' ? 'None' : '';

        release.urls.push({
            url: release_url,
            link_type: getLinkType(release.format),
        });

        release.discs.push({
            tracks: retrieveTracks(container, releaseArtist),
            format: release.format,
        });

        LOGGER.info('Parsed release: ', release);
        releases.push(release);
    });

    return releases;
}

// Insert import/search buttons into the page.
function insertLink(releases, release_url) {
    // Remove any existing buttons
    document.querySelectorAll('.musicbrainz-import').forEach(function (elem) {
        elem.remove();
    });

    if (!releases.length) return;

    const container = document.createElement('div');
    container.className = 'musicbrainz-import';
    container.style.margin = '1em 0';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '0.5em';
    container.style.alignItems = 'center';

    releases.forEach(function (release) {
        const edit_note = MBImport.makeEditNote(release_url, 'Boomkat', release.formatLabel);

        const formButton = document.createElement('span');
        formButton.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, edit_note));

        // Label each button with its format so the different imports can be
        // told apart. buildFormHTML() renders an icon followed by the text
        // node “Import into MB”; replace that text with the format label.
        if (release.formatLabel) {
            const button = formButton.querySelector('button');
            if (button && button.lastChild) {
                button.lastChild.textContent = `Import ${release.formatLabel}`;
            }
        }

        container.appendChild(formButton);
    });

    // A single search button is enough — searching is format-independent.
    const searchButton = document.createElement('span');
    searchButton.innerHTML = MBImport.buildSearchButton(releases[0]);
    container.appendChild(searchButton);

    const albumHeader = document.querySelector('[data-role="title"]');
    if (albumHeader) {
        albumHeader.after(container);
    } else {
        document.body.insertBefore(container, document.body.firstChild);
    }
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
