// ==UserScript==
// @name         Import Bandcamp releases to MusicBrainz
// @description  Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.06.07.1
// @namespace    http://userscripts.org/users/22504
// @downloadURL  https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include      /^https:\/\/[^/]+\/(?:(?:(?:album|track))\/[^/]+|music)$/
// @include      /^https:\/\/([^.]+)\.bandcamp\.com((?:\/(?:(?:album|track))\/[^/]+|\/|\/music)?)$/
// @include      /^https:\/\/bandcamp\.com\/private\//
// @include      /^https:\/\/([^.]+)\.bandcamp\.com\/private\//
// @include      /^https?:\/\/web\.archive\.org\/web\/\d+\/https?:\/\/[^/]+(?:\/(?:album|track)\/[^/]+\/?|\/music\/?|\/?)$/
// @require      lib/mbimport.js?version=v2026.05.30.1
// @require      lib/logger.js
// @require      lib/mblinks.js?version=v2026.05.31.1
// @require      lib/mbimportstyle.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

// eslint-disable-next-line no-global-assign
if (!unsafeWindow) unsafeWindow = window;

String.prototype.fix_bandcamp_url = function () {
    let url = this;
    const archiveRegex = /^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(https?:\/\/.*)$/i;
    const match = url.match(archiveRegex);
    if (match) {
        url = match[1];
    }
    return url.replace('http://', 'https://');
};

const isPrivateStreamPage = () => !!unsafeWindow.TralbumData?.is_private_stream || /^\/private\//.test(unsafeWindow.location.pathname);

const getBandRootUrl = () => {
    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
    if (ogUrl) {
        const match = ogUrl.match(/^(https?:\/\/[^/]+\.bandcamp\.com)/);
        if (match) return match[1];
    }
    const host = unsafeWindow.location.hostname;
    if (host.endsWith('.bandcamp.com') && host !== 'bandcamp.com') {
        return `${unsafeWindow.location.protocol}//${host}`;
    }
    const bandLink = document.querySelector('a[href*=".bandcamp.com"]:not([href*="bandcamp.com/discover"])');
    if (bandLink) {
        const match = bandLink.href.match(/^(https?:\/\/[^/]+\.bandcamp\.com)/);
        if (match) return match[1];
    }
    return null;
};

const normalizeBandcampUrl = url => {
    if (!url) return '';
    url = url.fix_bandcamp_url();
    if (url.startsWith('http')) return url.split('?')[0].split('#')[0];
    const root = getBandRootUrl();
    if (root && url.startsWith('/')) return root + url.split('?')[0].split('#')[0];
    return url;
};

const normalizeUrlForComparison = url => {
    const normalized = normalizeBandcampUrl(url);
    if (!normalized) return '';
    try {
        const parsed = new URL(normalized);
        const path = parsed.pathname.replace(/\/$/, '') || '/';
        return `${parsed.protocol}//${parsed.hostname}${path}`;
    } catch {
        return normalized.replace(/\/$/, '');
    }
};

/**
 * Resolve the canonical release URL from the page location, cross-checking TralbumData.url.
 * When TralbumData points elsewhere (e.g. a custom shop domain), the page URL wins and the
 * TralbumData URL is returned as an alternate for release.urls.
 */
const resolveBandcampReleaseUrl = tralbumUrl => {
    const pageUrl = normalizeBandcampUrl(`${window.location.origin}${window.location.pathname}`);
    const tralbumDataUrl = tralbumUrl ? normalizeBandcampUrl(tralbumUrl) : '';

    const result = { url: pageUrl, alternateUrls: [] };

    if (tralbumDataUrl && normalizeUrlForComparison(tralbumDataUrl) !== normalizeUrlForComparison(pageUrl)) {
        LOGGER.info('TralbumData URL differs from page URL; using page URL', { pageUrl, tralbumDataUrl });
        result.alternateUrls.push(tralbumDataUrl);
    }

    return result;
};

/**
 * Resolve hostnames for discography page lookups from the page location and TralbumData.url.
 */
const resolveDiscographyHostnames = tralbumUrl => {
    const pageHostname = normalizeBandcampUrl(window.location.origin);
    const tralbumHostname = tralbumUrl ? normalizeBandcampUrl(tralbumUrl.replace(/\/music\/?$/, '').replace(/\/indexpage\/?$/, '')) : '';
    const hostnames = [pageHostname];
    if (tralbumHostname && normalizeUrlForComparison(tralbumHostname) !== normalizeUrlForComparison(pageHostname)) {
        LOGGER.info('TralbumData discography hostname differs from page hostname; looking up both', {
            pageHostname,
            tralbumHostname,
        });
        hostnames.push(tralbumHostname);
    }
    return hostnames;
};

const BandcampImport = {
    // Analyze Bandcamp data and return a release object
    retrieveReleaseInfo: function (isPrivateStream) {
        let bandcampAlbumData = unsafeWindow.TralbumData;
        let bandcampEmbedData = unsafeWindow.EmbedData;
        const bandcampMobileData = unsafeWindow.TralbumJSONLD;
        const { url: releaseUrl, alternateUrls } = resolveBandcampReleaseUrl(bandcampAlbumData.url);

        const artist = bandcampAlbumData.artist || bandcampMobileData?.byArtist?.name;

        let release = {
            discs: [],
            artist_credit: [],
            barcode: '',
            title: '',
            year: 0,
            month: 0,
            day: 0,
            parent_album_url: '',
            labels: [],
            format: 'Digital Media',
            country: 'XW',
            type: '',
            status: isPrivateStream ? 'promotion' : 'official',
            packaging: 'None',
            language: 'eng',
            script: 'Latn',
            urls: [],
            url: releaseUrl,
            alternateUrls,
        };

        // Grab release title
        release.title = bandcampAlbumData.current.title;

        // Grab release event information
        let date = this.convdate(bandcampAlbumData.current.release_date);
        if (date) {
            if (!(date.year > 2008 || (date.year == 2008 && date.month >= 9))) {
                // use publish date if release date is before Bandcamp launch (2008-09)
                let pdate = this.convdate(bandcampAlbumData.current.publish_date);
                if (pdate) {
                    date = pdate;
                }
            }
            release.year = date.year;
            release.month = date.month;
            release.day = date.day;
        }

        // FIXME: implement a mapping between bandcamp release types and MB ones
        if (bandcampAlbumData.current.type == 'track') {
            // map Bandcamp single tracks to singles
            release.type = 'single';
            // if track belongs to an album, get its url.
            if (bandcampEmbedData.album_embed_data) {
                release.parent_album_url = bandcampEmbedData.album_embed_data.linkback.fix_bandcamp_url();
                release.type = 'track'; // <-- no import
            }
        }

        // Tracks
        let disc = {
            tracks: [],
            format: release.format,
        };
        release.discs.push(disc);

        // attempt to detect multiple artists tracks
        // bandcamp formats them as 'artist - tracktitle'
        // only set to true if ALL tracks are formatted like this
        // and if string doesn't start with a number (ie. 02 - title)
        let various_artists = true;
        for (let i = 0; i < bandcampAlbumData.trackinfo.length; i++) {
            if (!bandcampAlbumData.trackinfo[i].title.match(/ - /) || bandcampAlbumData.trackinfo[i].title.match(/^\d+ - /)) {
                various_artists = false;
                break;
            }
        }

        // Release artist credit
        if (artist.match(/^various(?: artists)?$/i) && various_artists) {
            release.artist_credit = [MBImport.specialArtist('various_artists')];
        } else {
            release.artist_credit = MBImport.makeArtistCredits([artist]);
        }

        let tracks_streamable = 0;
        for (const bctrack of bandcampAlbumData.trackinfo) {
            let title = bctrack.title;
            let artist = [];
            if (various_artists) {
                let m = bctrack.title.match(/^(.+) - (.+)$/);
                if (m) {
                    title = m[2];
                    artist = [m[1]];
                }
            }
            if (bctrack.file) tracks_streamable++;
            let track = {
                title: title,
                duration: Math.round(bctrack.duration * 1000),
                artist_credit: MBImport.makeArtistCredits(artist),
            };
            disc.tracks.push(track);
        }

        // Check for hidden tracks (more tracks in the download than shown for streaming ie.)
        let showntracks = bandcampAlbumData.trackinfo.length;
        let numtracks = -1;
        let nostream = false;
        // album description indicates number of tracks in the download
        let match = /^\d+ track album$/.exec(document.querySelector('meta[property="og:description"]').getAttribute('content'));
        if (match) {
            numtracks = parseInt(match[0], 10);
        }
        if (numtracks > 0 && numtracks > showntracks) {
            // display a warning if tracks in download differs from tracks shown
            document.querySelectorAll('h2.trackTitle').forEach(trackTitle => {
                trackTitle.insertAdjacentHTML(
                    'beforeend',
                    `<p style="font-size: 70%; font-style: italic; margin: 0.1em 0;">Warning: ${numtracks} vs ${showntracks} tracks</p>`,
                );
            });

            // append unknown tracks to the release
            for (let i = 0; i < numtracks - showntracks; i++) {
                let track = {
                    title: '[unknown]',
                    duration: null,
                    artist_credit: [],
                };
                disc.tracks.push(track);
            }
            // disable stream link as only part of the album can be streamed
            nostream = true;
        }

        // URLs (private streams are intentionally omitted to avoid advertising them)
        if (!isPrivateStream) {
            let link_type = MBImport.URL_TYPES;
            // Download for free vs. for purchase
            if (bandcampAlbumData.current.download_pref !== null) {
                if (
                    bandcampAlbumData.freeDownloadPage !== null ||
                    bandcampAlbumData.current.download_pref === 1 ||
                    (bandcampAlbumData.current.download_pref === 2 && bandcampAlbumData.current.minimum_price === 0)
                ) {
                    release.urls.push({
                        url: release.url,
                        link_type: link_type.download_for_free,
                    });
                    release.alternateUrls.forEach(alternateUrl => {
                        release.urls.push({
                            url: alternateUrl,
                            link_type: link_type.download_for_free,
                        });
                    });
                }
                if (bandcampAlbumData.current.download_pref === 2) {
                    release.urls.push({
                        url: release.url,
                        link_type: link_type.purchase_for_download,
                    });
                    release.alternateUrls.forEach(alternateUrl => {
                        release.urls.push({
                            url: alternateUrl,
                            link_type: link_type.purchase_for_download,
                        });
                    });
                }
            }
            // Check if the release is streamable
            if (bandcampAlbumData.hasAudio && !nostream && disc.tracks.length > 0 && disc.tracks.length == tracks_streamable) {
                release.urls.push({
                    url: release.url,
                    link_type: link_type.stream_for_free,
                });
                release.alternateUrls.forEach(alternateUrl => {
                    release.urls.push({
                        url: alternateUrl,
                        link_type: link_type.stream_for_free,
                    });
                });
            }
            // Check if release is Creative Commons licensed
            const ccIcons = document.querySelector('div#license a.cc-icons');
            if (ccIcons) {
                release.urls.push({
                    url: ccIcons.getAttribute('href').fix_bandcamp_url(),
                    link_type: link_type.license,
                });
            }
        }
        // Check if album has a back link to a label
        let label = this.getlabelname();
        if (label) {
            release.labels.push({
                name: label,
                mbid: '',
                catno: 'none',
            });
        }

        // UPCs generally apply to physical releases so set the barcode when
        // digital download is the only available medium
        let mediums = bandcampAlbumData.packages;
        let upc = bandcampAlbumData.current.upc;
        if ((mediums === null || mediums.length === 0) && upc !== null) {
            release.barcode = upc;
        }

        return release;
    },

    // Insert links in page
    insertLink: function (release, isMobile, isPrivateStream) {
        if (release.type == 'track') {
            // only import album or single, tracks belong to an album
            return false;
        }
        // Form parameters
        const sourceUrl = isPrivateStream ? `${unsafeWindow.location.origin}${unsafeWindow.location.pathname}` : release.url;
        const edit_note = isPrivateStream
            ? MBImport.makeEditNote(sourceUrl, 'Bandcamp', 'private stream')
            : MBImport.makeEditNote(release.url, 'Bandcamp');
        const parameters = MBImport.buildFormParameters(release, edit_note);

        const importButton = MBImport.buildFormHTML(parameters);
        const searchButton = MBImport.buildSearchButton(release);
        const barcode = unsafeWindow.TralbumData?.current?.upc || undefined;
        const harmonyButton =
            isPrivateStream && !barcode
                ? ''
                : MBImport.buildHarmonyButton({
                      barcode,
                      release_url: isPrivateStream ? undefined : release.url,
                      variant: 'full',
                  });

        // Build form
        const mbUI = document.createElement('div');
        mbUI.id = 'mb_buttons';
        mbUI.innerHTML = `${importButton}${searchButton}${harmonyButton}`;

        // Append MB import link
        if (isMobile) {
            const bandNavbar = document.querySelector('#band-navbar');
            if (bandNavbar) {
                mbUI.style = 'margin: 8px; flex-wrap: wrap;';
                bandNavbar.insertAdjacentElement('afterend', mbUI);
            }
        } else {
            document.querySelector('#name-section')?.appendChild(mbUI);
            mbUI.style.marginTop = '6px';
        }

        document.querySelectorAll('form.musicbrainz_import').forEach(form => (form.style.display = 'inline-block'));
    },

    // helper to convert bandcamp date to MB date
    convdate: function (date) {
        if (typeof date != 'undefined' && date !== '') {
            let d = new Date(date);
            return {
                year: d.getUTCFullYear(),
                month: d.getUTCMonth() + 1,
                day: d.getUTCDate(),
            };
        }
        return false;
    },

    // get label name from back link if possible
    getlabelname: function () {
        const backLinkText = document.querySelector('a.back-to-label-link span.back-link-text');
        const label = backLinkText?.childNodes[2];
        if (!label) {
            return '';
        }
        return label.textContent;
    },
};

if (window.location.hostname === 'web.archive.org') {
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    let _realWombat;

    Object.defineProperty(targetWindow, '_WBWombat', {
        configurable: true,
        enumerable: true,
        get: function () {
            return _realWombat;
        },
        set: function (originalWombatFunc) {
            _realWombat = function (wbwindow, wbinfo) {
                if (wbinfo && wbinfo.wombat_opts) {
                    if (!wbinfo.wombat_opts.no_rewrite_prefixes) {
                        wbinfo.wombat_opts.no_rewrite_prefixes = [];
                    }
                    wbinfo.wombat_opts.no_rewrite_prefixes.push('https://musicbrainz.org/');
                    wbinfo.wombat_opts.no_rewrite_prefixes.push('http://musicbrainz.org/');
                    wbinfo.wombat_opts.no_rewrite_prefixes.push('//musicbrainz.org/');
                }
                return originalWombatFunc(wbwindow, wbinfo);
            };
        },
    });
}

/**
 * Bandcamp URLs can be relative or absolute. This function normalizes them to always be relative to the hostname.
 */
const getPathName = url => {
    if (url.startsWith('/')) {
        return url.split('?')[0].split('#')[0];
    } else if (url.startsWith('http')) {
        const parsed = new URL(url);
        return parsed.pathname;
    }
    return null;
};

const getHostname = url => {
    if (url.startsWith('http')) {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.hostname}`;
    }
    return null;
};

/**
 * Collects discography release link data from elements matching the given selector.
 * @param {Object} options
 * @param {string} options.linksMatcher - CSS selector for release/track links
 * @param {string[]} options.hostnames - Base hostnames for constructing full URLs
 * @param {string} [options.insertionLocationMatcher] - Optional selector for insertion point (e.g. 'p.title' for music format)
 * @returns {Array} Array of url_data objects for mblinks.searchAndDisplayMbLinks
 */
const collectDiscographyReleaseLinks = ({ linksMatcher, hostnames, insertionLocationMatcher }) => {
    const urls_data = [];
    document.querySelectorAll(linksMatcher).forEach(linkEl => {
        const bandcampReleaseUrl = linkEl.getAttribute('href');
        const pathName = getPathName(bandcampReleaseUrl);

        if (pathName && pathName.match(/^(\/album|\/track)/)) {
            const lookupUrls = [];
            if (bandcampReleaseUrl.startsWith('/')) {
                hostnames.forEach(hostname => {
                    const full_url = hostname + pathName;
                    if (!lookupUrls.some(url => normalizeUrlForComparison(url) === normalizeUrlForComparison(full_url))) {
                        lookupUrls.push(full_url);
                    }
                });
            } else {
                lookupUrls.push(getHostname(bandcampReleaseUrl) + pathName);
            }

            const seenReleaseMbids = new Set();
            const insertReleaseLink = link => {
                const mb_url = link.match(/href="([^"]+)"/)?.[1];
                if (!mb_url) return;
                const mbid = mb_url.slice(-36);
                if (seenReleaseMbids.has(mbid)) return;
                seenReleaseMbids.add(mbid);
                const target = insertionLocationMatcher ? linkEl.querySelector(insertionLocationMatcher) : linkEl;
                if (target) {
                    target.insertAdjacentHTML('afterbegin', link);
                } else {
                    linkEl.insertAdjacentHTML('afterbegin', link);
                }
            };

            lookupUrls.forEach(full_url => {
                urls_data.push({
                    url: full_url,
                    mb_type: 'release',
                    insert_func: insertReleaseLink,
                    key: `release:${full_url}`,
                });
            });
        }
    });
    return urls_data;
};

function init() {
    /* keep the following line as first, it is required to skip
     * pages which aren't actually a bandcamp page, since we support
     * bandcamp pages under third-party domains.
     * see @include
     */
    if (!unsafeWindow.TralbumData) return;
    /***/
    const isMobile = typeof unsafeWindow.TralbumJSONLD !== 'undefined';
    const isPrivateStream = isPrivateStreamPage();
    let mblinks = new MBLinks('BCI_MBLINKS_CACHE');
    const hasBandData = unsafeWindow.BandData && !!unsafeWindow.BandData.id;
    const hasAlbumData = unsafeWindow.TralbumData && 'current' in unsafeWindow.TralbumData; // Sometimes TralbumData is an empty object, see issue #676
    const isDiscographyPage =
        unsafeWindow.TralbumData.url &&
        (!!unsafeWindow.TralbumData.url.match(/\/music\/?$/) || !!unsafeWindow.TralbumData.url.match(/\/indexpage\/?$/));

    if (isDiscographyPage) {
        /**
         * Discography pages can be in two formats:
         * - music: /music/ (default)
         * - indexpage: /indexpage/ (new format) e.g. https://arbee.bandcamp.com
         */
        const discographyFormat = unsafeWindow.TralbumData.url.match(/\/music\/?$/)
            ? 'music'
            : unsafeWindow.TralbumData.url.match(/\/indexpage\/?$/)
              ? 'indexpage'
              : null;
        const hostnames = resolveDiscographyHostnames(unsafeWindow.TralbumData.url);
        const releaseLinksMatcher = discographyFormat === 'music' ? 'ol#music-grid > li > a' : 'span.indexpage_list div.ipCellLabel1 a';
        const insertionLocationMatcher = discographyFormat === 'music' ? 'p.title' : undefined;

        const urls_data = [
            ...collectDiscographyReleaseLinks({
                linksMatcher: 'ol.featured-grid > li.featured-item > a',
                hostnames,
                insertionLocationMatcher,
            }),
            ...collectDiscographyReleaseLinks({ linksMatcher: releaseLinksMatcher, hostnames, insertionLocationMatcher }),
        ];

        if (urls_data.length > 0) {
            mblinks.searchAndDisplayMbLinks(urls_data);
        }
    } else if (hasAlbumData) {
        MBImportStyle();

        let release = BandcampImport.retrieveReleaseInfo(isPrivateStream);

        // add MB artist link
        let root_url = getBandRootUrl();
        if (!root_url && /^https?:\/\//.test(release.url)) {
            root_url = release.url.match(/^(https?:\/\/[^/]+)/)[1].split('?')[0];
        }

        const nameSectionSpans = document.querySelectorAll('div#name-section h3 span');
        const firstNameSectionSpan = nameSectionSpans[0];
        const lastNameSectionSpan = nameSectionSpans[nameSectionSpans.length - 1];

        if (release.type == 'track') {
            mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) {
                lastNameSectionSpan?.insertAdjacentHTML('beforebegin', link);
            });
            // add MB links to parent album
            mblinks.searchAndDisplayMbLink(release.parent_album_url, 'release', function (link) {
                firstNameSectionSpan?.insertAdjacentHTML('beforebegin', link);
            });
        } else {
            mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) {
                firstNameSectionSpan?.insertAdjacentHTML('beforebegin', link);
            });
            // add MB release links to album or single (skip for private streams)
            if (!isPrivateStream) {
                const releaseLookupUrls = [release.url, ...release.alternateUrls];
                const seenReleaseMbids = new Set();
                const releaseLinksToInsert = [];
                let pendingReleaseLookups = releaseLookupUrls.length;
                releaseLookupUrls.forEach(lookupUrl => {
                    mblinks.searchAndDisplayMbLink(
                        lookupUrl,
                        'release',
                        link => {
                            const mb_url = link.match(/href="([^"]+)"/)?.[1];
                            if (!mb_url) return;
                            const mbid = mb_url.slice(-36);
                            if (!seenReleaseMbids.has(mbid)) {
                                seenReleaseMbids.add(mbid);
                                releaseLinksToInsert.push(link);
                            }
                        },
                        lookupUrl,
                        () => {
                            pendingReleaseLookups--;
                            if (pendingReleaseLookups === 0) {
                                releaseLinksToInsert.forEach(link => {
                                    firstNameSectionSpan?.insertAdjacentHTML('afterend', link);
                                });
                            }
                        },
                    );
                });
            }
        }

        let label_url = '';

        mblinks.searchAndDisplayMbLink(
            root_url,
            'label',
            function (link) {
                document.querySelector('p#band-name-location span.title')?.insertAdjacentHTML('beforeend', link);
            },
            `label:${root_url}`,
        );
        const labelback = document.querySelector('a.back-to-label-link');
        if (labelback) {
            const labelbacklink = labelback.getAttribute('href');
            if (labelbacklink) {
                let cleanLabelLink = labelbacklink.fix_bandcamp_url();
                label_url = cleanLabelLink.match(/^(https?:\/\/[^/]+)/)[1].split('?')[0];
                mblinks.searchAndDisplayMbLink(
                    label_url,
                    'label',
                    function (link) {
                        document.querySelector('a.back-to-label-link span.back-link-text')?.insertAdjacentHTML('beforeend', link);
                    },
                    `label:${label_url}`,
                );
            }
        }

        if (release.artist_credit.length == 1) {
            // try to get artist's mbid from cache
            let artist_mbid = mblinks.resolveMBID(root_url);
            if (artist_mbid) {
                release.artist_credit[0].mbid = artist_mbid;
            }
        }

        // try to get label mbid from cache
        let label_mbid = '';
        let label_name = '';
        if (label_url) {
            label_mbid = mblinks.resolveMBID(`label:${label_url}`);
            label_name = BandcampImport.getlabelname();
        } else {
            label_mbid = mblinks.resolveMBID(`label:${root_url}`);
            if (label_mbid) label_name = document.querySelector('p#band-name-location span.title')?.textContent.trim() ?? '';
        }
        if (label_mbid || label_name) {
            if (release.labels.length == 0) {
                release.labels.push({
                    name: '',
                    mbid: '',
                    catno: 'none',
                });
            }
            release.labels[0].name = label_name;
            release.labels[0].mbid = label_mbid;
        }

        BandcampImport.insertLink(release, isMobile, isPrivateStream);
        LOGGER.info('Parsed release: ', release);

        // append a comma after each tag to ease cut'n'paste to MB
        document.querySelectorAll('div.tralbum-tags a.tag').forEach(tag => {
            if (tag !== tag.parentElement?.lastElementChild) {
                tag.insertAdjacentText('afterend', ', ');
            }
        });

        // append a link to the full size image
        let coverArtElement;
        const fullsizeimageurl = document.querySelector('meta[property="og:image"]')?.getAttribute('content')?.replace('_5', '_0');
        if (isMobile) {
            coverArtElement = document.querySelector('section#tralbum-art-carousel');
        } else {
            coverArtElement = document.querySelector('div#tralbumArt');
        }

        if (fullsizeimageurl && coverArtElement) {
            coverArtElement.insertAdjacentHTML(
                'afterend',
                `<div id='bci_link'><a class='custom-color' href='${fullsizeimageurl}' title='Open original image in a new tab (Bandcamp importer)' target='_blank'>Original image</a></div>`,
            );
        }

        const bci_link = document.querySelector('div#bci_link');
        if (bci_link) {
            bci_link.style.paddingTop = '0.5em';
            bci_link.style.textAlign = 'right';
            bci_link.querySelector('a').style.fontWeight = 'bold';
            if (isMobile) {
                bci_link.style.paddingInline = '10px';
            }
        }
        const upc = unsafeWindow.TralbumData.current.upc;
        if (typeof upc != 'undefined' && upc !== null) {
            document
                .querySelector('div #trackInfoInner')
                ?.insertAdjacentHTML(
                    'beforeend',
                    `<div id="mbimport_upc" style="margin-bottom: 2em; font-size: smaller;">UPC: ${upc}</div>`,
                );
        }
    }

    if (hasBandData) {
        const cleanURL = `${unsafeWindow.location.protocol}//${unsafeWindow.location.hostname}`;

        let isLinkInserted = false;
        const linkStyle = {
            position: 'absolute',
            marginLeft: '3px',
        };

        const applyLinkStyle = element => {
            element.querySelectorAll('a').forEach(anchor => {
                Object.assign(anchor.style, linkStyle);
            });
        };

        const insertLinkCb = function (link) {
            if (!isLinkInserted) {
                // Append the artist/label link on Stub discography pages
                const stubPageHeading = document.querySelector('div.stub-page-content h1');
                if (stubPageHeading) {
                    stubPageHeading.insertAdjacentHTML('beforeend', link);
                    applyLinkStyle(stubPageHeading);
                }

                // Append the artist/label link on actual discography pages
                const bandNameTitle = document.querySelector('p#band-name-location span.title');
                if (bandNameTitle) {
                    bandNameTitle.insertAdjacentHTML('beforeend', link);
                    applyLinkStyle(bandNameTitle);
                }
                isLinkInserted = true;
            }
        };

        function showLookupButtonsIfNoLink() {
            if (!isLinkInserted) {
                MBSearchItStyle();
                const entityName = unsafeWindow.BandData.name;
                const artistSearchUrl = MBImport.searchUrlFor('artist', entityName);
                const labelSearchUrl = MBImport.searchUrlFor('label', entityName);

                document.querySelector('div.stub-page-content h1')?.insertAdjacentHTML(
                    'beforeend',
                    `<span class="mb_wrapper">
                        <span class="mb_valign mb_searchit">
                            <a class="mb_search_link"
                                class="musicbrainz_import"
                                target="_blank"
                                title="Search this artist on MusicBrainz (open in a new tab)" 
                                href="${artistSearchUrl}"
                            ><small>A</small>?</a>
                        </span>
                        <span class="mb_valign mb_searchit">
                            <a 
                                class="mb_search_link musicbrainz_import"
                                target="_blank"
                                title="Search this label on MusicBrainz (open in a new tab)"
                                href="${labelSearchUrl}"
                            ><small>L</small>?</a>
                        </span>
                    </span>`,
                );
            }
        }

        // The URL could either be a band or a label page, we don't know which, so we search for both.
        // Show lookup buttons only after both searches have completed and neither found a link.
        let pendingSearches = 2;
        const onSearchComplete = function () {
            pendingSearches -= 1;
            if (pendingSearches === 0) {
                showLookupButtonsIfNoLink();
            }
        };

        mblinks.searchAndDisplayMbLink(cleanURL, 'artist', insertLinkCb, undefined, onSearchComplete);
        mblinks.searchAndDisplayMbLink(cleanURL, 'label', insertLinkCb, undefined, onSearchComplete);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
