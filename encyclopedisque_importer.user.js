// ==UserScript==
// @name         Import Encyclopedisque releases to MusicBrainz
// @version      2026.06.21.2
// @namespace    http://userscripts.org/users/22504
// @description  Easily import Encyclopedisque releases into MusicBrainz
// @downloadURL  https://raw.github.com/murdos/musicbrainz-userscripts/master/encyclopedisque_importer.user.js
// @updateURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/encyclopedisque_importer.user.js
// @include      https://www.encyclopedisque.fr/disque/*.html
// @include      https://www.encyclopedisque.fr/artiste/*.html
// @require      lib/mbimport.js
// @require      lib/mblinks.js?version=v2026.05.31.1
// @require      lib/logger.js
// @require      lib/mbimportstyle.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

const mbLinks = new MBLinks('ENCYLOPEDISQUE_MBLINKS_CACHE');

/* === Encyclopedisque-specific functions === */

function setupImportUI(release) {
    // Form parameters
    let edit_note = MBImport.makeEditNote(window.location.href, 'Encyclopedisque');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    // Build form
    const recherchebox = document.querySelector('#recherchebox');
    if (!recherchebox) {
        LOGGER.error('encyclopedisque_importer: #recherchebox not found, cannot insert MBImport UI');
        return;
    }
    const mbUI = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release);
    recherchebox.insertAdjacentHTML('beforeend', mbUI);
    document.querySelectorAll('form.musicbrainz_import button').forEach(button => {
        button.style.width = '100%';
    });
}

function insertMBLinks() {
    let current_url = window.location.href;
    if (current_url.match(/\/disque\//)) {
        mbLinks.searchAndDisplayMbLink(current_url, 'release', function (link) {
            document.querySelectorAll('h2 span').forEach(span => {
                span.insertAdjacentHTML('beforebegin', link);
            });
        });
    } else if (current_url.match(/\/artiste\//)) {
        mbLinks.searchAndDisplayMbLink(current_url, 'artist', function (link) {
            document.querySelectorAll('h2').forEach(h2 => {
                h2.insertAdjacentHTML('afterbegin', link);
            });
        });
    }

    document.querySelectorAll('div.v7P a[href*="/disque/"], div.v12P a[href*="/disque/"]').forEach(linkEl => {
        let external_url = window.location.origin + linkEl.getAttribute('href');
        mbLinks.searchAndDisplayMbLink(external_url, 'release', function (link) {
            linkEl.insertAdjacentHTML('afterend', link);
            linkEl.insertAdjacentHTML('afterend', '<br />');
        });
    });

    document.querySelectorAll('h2 a[href*="/artiste/"], div.main a[href*="/artiste/"]').forEach(linkEl => {
        let external_url = window.location.origin + linkEl.getAttribute('href');
        mbLinks.searchAndDisplayMbLink(external_url, 'artist', function (link) {
            linkEl.insertAdjacentHTML('beforebegin', link);
        });
    });
}

// Analyze Encyclopedisque data and prepare to release object
function parseEncyclopedisquePage() {
    const release = {
        labels: [],
    };

    let infoHeader = document.body.querySelector('#contenu > h2:nth-of-type(1)');

    // Release artist credit
    let artist_name = infoHeader.querySelector('div.floatright:nth-of-type(1)').textContent.trim();
    release.artist_credit = [{ artist_name: artist_name }];

    // Release title
    release.title = infoHeader.querySelector('span:nth-of-type(1)').textContent.trim();

    // Default status is official, will change if "tirage promo" is found (see below)
    release.status = 'official';

    // Other hard-coded info
    release.language = 'fra';
    release.script = 'Latn';

    let disc = { position: 1, tracks: [] };
    release.discs = [disc];

    // Release URL
    release.urls = [{ url: window.location.href, link_type: MBImport.URL_TYPES.other_databases }];

    // Parse other infos
    let lastMediumSide = '';
    let lastInfoType = undefined;
    document.body.querySelectorAll('div.main tr').forEach(releaseInfo => {
        let infoType = releaseInfo.querySelector('td:nth-of-type(1)').textContent.trim();

        // Release date
        if (infoType === 'Sortie :') {
            const infoValue = releaseInfo.querySelector('td:nth-of-type(2)').textContent.trim();
            const releaseRegexp =
                /\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*([\d?]{4})?\s*(?:chez)?\s*((?:\S+\s?)*)\s*\(?([^)]*)?\)?/;
            const m = infoValue.match(releaseRegexp);
            if (m[1] !== undefined) {
                release.month = MONTHS[m[1]];
            }
            release.year = m[2];
            const labels = m[3];
            if (labels !== undefined) {
                labels.split('/').forEach(label => release.labels.push({ name: label.trim(), catno: m[4] }));
            } else {
                release.labels.push({ catno: m[4] });
            }
        } else if (infoType.match(/^Face [A-Z]/) || (infoType === '' && lastInfoType !== undefined && lastInfoType.match(/^Face [A-Z]/))) {
            // Tracks
            let track = {};

            // First part of tracknumber (A, B, ...)
            let mediumSide;
            let m = infoType.match(/^Face ([A-Z])/);
            if (m != null) {
                lastMediumSide = m[1];
                mediumSide = m[1];
            } else {
                mediumSide = lastMediumSide;
            }

            // Track title
            if (releaseInfo.querySelector('td:nth-of-type(2) em') == null) {
                return;
            }
            let title = releaseInfo.querySelector('td:nth-of-type(2) em').textContent.trim();

            // 2nd part of tracknumber (1, 2, ...)
            let trackNumber = '';
            m = infoType.match(/^Face [A-Z](\d+)/);
            if (m !== null) {
                trackNumber = m[1];
            } else {
                m = title.match(/^(\d+)\.\s+(.*)$/);
                if (m !== null) {
                    trackNumber = m[1];
                    title = m[2];
                }
            }

            // Track length
            m = releaseInfo
                .querySelector('td:nth-of-type(2)')
                .textContent.trim()
                .match(/- (\d+)’(\d+)$/);
            if (m !== null) {
                track.duration = `${m[1]}:${m[2]}`;
            }

            track.number = mediumSide + trackNumber;
            track.title = title;
            disc.tracks.push(track);
        } else if (infoType === 'Format :') {
            // Format => medium format, release-group type, release status
            const infoValue = releaseInfo.querySelector('td:nth-of-type(2)').textContent.trim();
            const values = infoValue.split(' / ');
            values.forEach(function (value) {
                if (value.indexOf('45 tours') > -1) {
                    disc.format = '7" Vinyl';
                }
                if (value.indexOf('33 tours') > -1) {
                    disc.format = '12" Vinyl';
                }
                if (value.indexOf('LP') > -1) {
                    release.type = 'album';
                }
                if (value.indexOf('EP') > -1) {
                    release.type = 'ep';
                }
                if (value.indexOf('SP') > -1) {
                    release.type = 'single';
                }
                if (value.indexOf('tirage promo') > -1) {
                    release.status = 'promotion';
                }
            });
        } else if (infoType === 'Pays :') {
            // Country
            const infoValue = releaseInfo.querySelector('td:nth-of-type(2)').textContent.trim();
            if (infoValue === 'France') {
                release.country = 'FR';
            } else if (infoValue === 'Royaume-uni') {
                release.country = 'UK';
            } else if (infoValue === 'Allemagne') {
                release.country = 'DE';
            } else if (infoValue === 'Belgique') {
                release.country = 'BE';
            }
        }

        if (infoType !== '') {
            lastInfoType = infoType;
        }
    });

    // Barcode ?
    if (parseInt(release.year, 10) <= 1982) {
        // FIXME: not working
        release.no_barcode = '1';
    }

    LOGGER.info('Parsed release: ', release);

    return release;
}

const MONTHS = {
    janvier: 1,
    février: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    août: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    décembre: 12,
};

/* === Entry point === */

function init() {
    MBImportStyle();

    if (window.location.href.match(/encyclopedisque\.fr\/disque\/(\d+)/)) {
        let release = parseEncyclopedisquePage();
        setupImportUI(release);
    }

    insertMBLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
