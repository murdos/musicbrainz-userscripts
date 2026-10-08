import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';
import { subscribeToSPANavigation } from '~/lib/shared/spa-navigation';
import type { Release, Track } from '~/types/importers';

const LOGGER = new Logger('boomkat_importer', LogLevel.INFO);

const CONTAINER_CLASS = 'musicbrainz-import';

// A release as parsed for a single Boomkat buying format, paired with the
// human-readable format label used to tell the import buttons apart.
interface FormatRelease {
    release: Release;
    formatLabel: string;
}

function isReleasePage(): boolean {
    return /^\/artists\/[^/]+\/releases\/[^/]+\/[^/]+/.test(window.location.pathname);
}

function getFormat(format: string): string {
    if (/MP3|WAV|FLAC|AAC|LOSSLESS|DOWNLOAD|DIGITAL/i.test(format)) {
        return 'Digital Media';
    }

    if (/CD/i.test(format)) {
        return 'CD';
    }

    if (/LP|VINYL|\d+\s*["″]/i.test(format)) {
        return 'Vinyl';
    }

    if (/CASSETTE|TAPE/i.test(format)) {
        return 'Cassette';
    }

    return '';
}

function getLinkType(media: string): number {
    if (media === 'Digital Media') {
        return MBImport.URL_TYPES.purchase_for_download;
    }
    return MBImport.URL_TYPES.purchase_for_mail_order;
}

// Boomkat shows release dates as e.g. “1st October 2026”. Strip the ordinal
// suffix so the string can be parsed into a Date.
function parseReleaseDate(str: string): Date | null {
    if (!str) return null;
    const cleaned = str.replace(/(\d+)(?:st|nd|rd|th)/i, '$1').trim();
    const date = new Date(`${cleaned} UTC`);
    return isNaN(date.getTime()) ? null : date;
}

// Return the release artist displayed in the page header.
function getReleaseArtist(): string {
    const el = document.querySelector('[data-role="artist"]');
    return el ? (el.textContent ?? '').trim() : '';
}

// Split a leading “Artist - Title” string. Returns null when there is no
// “ - ” separator to split on.
function splitArtistTitle(text: string): { artist: string; title: string } | null {
    const parts = text.split(/\s[-–—]\s/);
    if (parts.length < 2) return null;
    return { artist: (parts.shift() ?? '').trim(), title: parts.join(' - ').trim() };
}

// Extract the tracks for a given tracklisting container.
//
// Boomkat encodes the per-track artist inconsistently. The link text is either
// just the title (digital tracklists) or “Artist - Title” (physical
// tracklists), and a trailing text node after the link may hold the track
// artist, the release artist, or nothing at all. We reconcile those shapes per
// track, preferring the most specific artist available.
function retrieveTracks(container: Element, releaseArtist: string): Track[] {
    const tracks: Track[] = [];

    const isVarious = /various/i.test(releaseArtist);
    const releaseArtistKey = releaseArtist.replace(/[.\s]+$/, '').toLowerCase();

    container.querySelectorAll('ul li[data-track-ids]').forEach(li => {
        const link = li.querySelector<HTMLAnchorElement>('a[href*="/tracks/"]');
        if (!link) return;

        const anchor = (link.textContent ?? '').replace(/\s+/g, ' ').trim();

        let trailing = '';
        for (let node = link.nextSibling; node; node = node.nextSibling) {
            if (node.nodeType === Node.TEXT_NODE) {
                trailing += node.textContent ?? '';
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
        const duration = durationEl ? (durationEl.textContent ?? '').trim() : '';

        tracks.push({
            artist_credit: MBImport.makeArtistCredits([trackArtist]),
            title: title,
            duration: duration,
        });
    });

    return tracks;
}

// Build one release object per available format/tracklisting.
function retrieveReleaseInfo(release_url: string): FormatRelease[] {
    const titleEl = document.querySelector('[data-role="title"]');
    if (!titleEl) return [];

    const releaseArtist = getReleaseArtist();
    const title = (titleEl.textContent ?? '').trim();
    const labelEl = document.querySelector('[data-role="release-details"] a[href*="/labels/"]');
    const label = labelEl ? (labelEl.textContent ?? '').trim() : '';

    const releases: FormatRelease[] = [];

    document.querySelectorAll<HTMLElement>('.tracklisting-container[data-switcher-id]').forEach(container => {
        const id = container.dataset['switcherId'];
        if (!id) return;

        // Prefer the human-readable label from the tracklisting selector,
        // falling back to the matching buying-option card.
        const option = document.querySelector(`#tracklisting_format_selection option[value="${id}"]`);
        const card = document.querySelector(`[data-role="product-variant"][data-product-id="${id}"]`);

        let formatLabel = '';
        if (option) {
            formatLabel = (option.textContent ?? '').trim();
        } else if (card) {
            const h = card.querySelector('h4 span');
            if (h) formatLabel = (h.textContent ?? '').trim();
        }

        // Catalogue number and release date live together in the buying-option
        // card, e.g. “SPECIAL001CD | Release date: 1st October 2026”.
        let catno = '';
        let dateStr = '';
        if (card) {
            for (const p of card.querySelectorAll('p')) {
                const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
                if (/release date:/i.test(text)) {
                    const parts = text.split('|');
                    if (parts.length >= 2) {
                        catno = (parts[0] ?? '').trim();
                    }
                    const dateMatch = /release date:\s*(.+)$/i.exec(text);
                    if (dateMatch?.[1]) dateStr = dateMatch[1].trim();
                    break;
                }
            }
        }

        const releaseDate = parseReleaseDate(dateStr);
        const format = getFormat(formatLabel);

        const release: Release = {
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
            packaging: format === 'Digital Media' ? 'None' : '',
        };

        if (releaseDate) {
            release.year = releaseDate.getUTCFullYear();
            release.month = releaseDate.getUTCMonth() + 1;
            release.day = releaseDate.getUTCDate();
        }

        if (label || catno) {
            release.labels = [{ name: label, catno: catno }];
        }

        release.urls = [
            {
                url: release_url,
                link_type: getLinkType(format),
            },
        ];

        release.discs = [
            {
                tracks: retrieveTracks(container, releaseArtist),
                format: format,
            },
        ];

        LOGGER.info('Parsed release: ', release);
        releases.push({ release, formatLabel });
    });

    return releases;
}

// Insert import/search buttons into the page.
function insertLink(releases: FormatRelease[], release_url: string): void {
    // Remove any existing buttons
    document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach(elem => {
        elem.remove();
    });

    if (!releases.length) return;

    const container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    container.style.margin = '1em 0';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '0.5em';
    container.style.alignItems = 'center';

    releases.forEach(({ release, formatLabel }) => {
        const edit_note = MBImport.makeEditNote(release_url, 'Boomkat', formatLabel);

        const formButton = document.createElement('span');
        formButton.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, edit_note));

        // Label each button with its format so the different imports can be
        // told apart. buildFormHTML() renders an icon followed by the text
        // node “Import into MB”; replace that text with the format label.
        if (formatLabel) {
            const button = formButton.querySelector('button');
            if (button?.lastChild) {
                button.lastChild.textContent = `Import ${formatLabel}`;
            }
        }

        container.appendChild(formButton);
    });

    // A single search button is enough — searching is format-independent.
    const firstRelease = releases[0];
    if (firstRelease) {
        const searchButton = document.createElement('span');
        searchButton.innerHTML = MBImport.buildSearchButton(firstRelease.release);
        container.appendChild(searchButton);
    }

    const albumHeader = document.querySelector('[data-role="title"]');
    if (albumHeader) {
        albumHeader.after(container);
    } else {
        document.body.insertBefore(container, document.body.firstChild);
    }
}

function run(): void {
    if (!isReleasePage()) {
        document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach(elem => {
            elem.remove();
        });
        return;
    }

    const release_url = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
    insertLink(retrieveReleaseInfo(release_url), release_url);
}

MBImportStyle();

subscribeToSPANavigation({
    onNavigate: () => {
        run();
        return Promise.resolve();
    },
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
} else {
    run();
}
