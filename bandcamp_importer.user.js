// ==UserScript==
// @name         Import Bandcamp releases to MusicBrainz
// @description  Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.02.08.1
// @namespace    http://userscripts.org/users/22504
// @downloadURL  https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @updateURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/bandcamp_importer.user.js
// @include      /^https:\/\/[^/]+\/(?:(?:(?:album|track))\/[^/]+|music)$/
// @include      /^https:\/\/([^.]+)\.bandcamp\.com((?:\/(?:(?:album|track))\/[^/]+|\/|\/music)?)$/
// @include      /^https?:\/\/web\.archive\.org\/web\/\d+\/https?:\/\/[^/]+(?:\/(?:album|track)\/[^/]+\/?|\/music\/?|\/?)$/
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js
// @require      lib/mbimport.js
// @require      lib/logger.js
// @require      lib/mblinks.js?version=v2026.02.08.1
// @require      lib/mbimportstyle.js
// @icon         https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

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

const BandcampImport = {
    // Analyze Bandcamp data and return a release object
    retrieveReleaseInfo: function () {
        let bandcampAlbumData = unsafeWindow.TralbumData;
        let bandcampEmbedData = unsafeWindow.EmbedData;

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
            status: 'official',
            packaging: 'None',
            language: 'eng',
            script: 'Latn',
            urls: [],
            url: bandcampAlbumData.url.fix_bandcamp_url(),
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
        if (bandcampAlbumData.artist.match(/^various(?: artists)?$/i) && various_artists) {
            release.artist_credit = [MBImport.specialArtist('various_artists')];
        } else {
            release.artist_credit = MBImport.makeArtistCredits([bandcampAlbumData.artist]);
        }

        let tracks_streamable = 0;
        $.each(bandcampAlbumData.trackinfo, function (index, bctrack) {
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
        });

        // Check for hidden tracks (more tracks in the download than shown for streaming ie.)
        let showntracks = bandcampAlbumData.trackinfo.length;
        let numtracks = -1;
        let nostream = false;
        // album description indicates number of tracks in the download
        let match = /^\d+ track album$/.exec(document.querySelector('meta[property="og:description"]').getAttribute('content'));
        if (match) {
            numtracks = parseInt(match, 10);
        }
        if (numtracks > 0 && numtracks > showntracks) {
            // display a warning if tracks in download differs from tracks shown
            $('h2.trackTitle').append(
                `<p style="font-size: 70%; font-style: italic; margin: 0.1em 0;">Warning: ${numtracks} vs ${showntracks} tracks</p>`,
            );

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

        // URLs
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
            }
            if (bandcampAlbumData.current.download_pref === 2) {
                release.urls.push({
                    url: release.url,
                    link_type: link_type.purchase_for_download,
                });
            }
        }
        // Check if the release is streamable
        if (bandcampAlbumData.hasAudio && !nostream && disc.tracks.length > 0 && disc.tracks.length == tracks_streamable) {
            release.urls.push({
                url: release.url,
                link_type: link_type.stream_for_free,
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
    insertLink: function (release) {
        if (release.type == 'track') {
            // only import album or single, tracks belong to an album
            return false;
        }
        // Form parameters
        let edit_note = MBImport.makeEditNote(release.url, 'Bandcamp');
        let parameters = MBImport.buildFormParameters(release, edit_note);
        // Build form
        let mbUI = $(`<div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`).hide();

        // Append MB import link
        $('#name-section').append(mbUI);
        document.querySelector('#mb_buttons').style.marginTop = '6px';
        document.querySelectorAll('form.musicbrainz_import').forEach(form => (form.style.display = 'inline-block'));
        mbUI.slideDown();
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
        let label = $('a.back-to-label-link span.back-link-text').contents().get(2);
        if (typeof label == 'undefined') {
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

$(document).ready(function () {
    /* keep the following line as first, it is required to skip
     * pages which aren't actually a bandcamp page, since we support
     * bandcamp pages under third-party domains.
     * see @include
     */
    if (!unsafeWindow.TralbumData) return;
    /***/
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
        const hostname = unsafeWindow.TralbumData.url.replace('/music', '').replace('/indexpage', '');
        const urls_data = [];

        const releaseLinksMatcher = discographyFormat === 'music' ? 'ol#music-grid > li > a' : 'span.indexpage_list div.ipCellLabel1 a';
        const insertionLocationMatcher = discographyFormat === 'music' ? 'p.title' : undefined;

        $(releaseLinksMatcher).each(function () {
            const $link = $(this);
            const bandcampReleaseUrl = $link.attr('href');
            const pathName = getPathName(bandcampReleaseUrl);

            if (pathName && pathName.match(/^(\/album|\/track)/)) {
                const isRelative = bandcampReleaseUrl.startsWith('/');
                const linkHostname = isRelative ? hostname : getHostname(bandcampReleaseUrl);
                const full_url = linkHostname + pathName;

                urls_data.push({
                    url: full_url,
                    mb_type: 'release',
                    insert_func: function (link) {
                        if (insertionLocationMatcher) {
                            $(insertionLocationMatcher, $link).prepend(link);
                        } else {
                            $link.prepend(link);
                        }
                    },
                    key: `release:${full_url}`,
                });
            }
        });

        if (urls_data.length > 0) {
            mblinks.searchAndDisplayMbLinks(urls_data);
        }
    } else if (hasAlbumData) {
        MBImportStyle();

        let release = BandcampImport.retrieveReleaseInfo();

        // add MB artist link
        let root_url = release.url.match(/^(https?:\/\/[^/]+)/)[1].split('?')[0];
        let label_url = '';

        mblinks.searchAndDisplayMbLink(
            root_url,
            'label',
            function (link) {
                $('p#band-name-location span.title').append(link);
            },
            `label:${root_url}`,
        );
        const labelback = document.querySelector('a.back-to-label-link');
        if (labelback) {
            const labelbacklink = labelback.getAttribute('href');
            if (labelbacklink) {
                let cleanLabelLink = labelbacklink.fix_bandcamp_url();
                label_url = cleanLabelLink
                    .match(/^(https?:\/\/[^/]+)/)[1]
                    .split('?')[0];
                mblinks.searchAndDisplayMbLink(
                    label_url,
                    'label',
                    function (link) {
                        $('a.back-to-label-link span.back-link-text').append(link);
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
            if (label_mbid) label_name = $('p#band-name-location span.title').text().trim();
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

        BandcampImport.insertLink(release);
        LOGGER.info('Parsed release: ', release);

        if (release.type == 'track') {
            mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) {
                $('div#name-section h3 span:last').before(link);
            });
            // add MB links to parent album
            mblinks.searchAndDisplayMbLink(release.parent_album_url, 'release', function (link) {
                $('div#name-section h3 span:first').before(link);
            });
        } else {
            mblinks.searchAndDisplayMbLink(root_url, 'artist', function (link) {
                $('div#name-section h3 span:first').before(link);
            });
            // add MB release links to album or single
            mblinks.searchAndDisplayMbLink(release.url, 'release', function (link) {
                $('div#name-section h3 span:first').after(link);
            });
        }

        // append a comma after each tag to ease cut'n'paste to MB
        $('div.tralbum-tags a:not(:last-child).tag').after(', ');

        // append a link to the full size image
        const tralbumArt = document.querySelector('div#tralbumArt');
        const fullsizeimageurl = tralbumArt.querySelector('a').getAttribute('href').replace('_10', '_0');
        tralbumArt.insertAdjacentHTML(
            'afterend',
            `<div id='bci_link'><a class='custom-color' href='${fullsizeimageurl}' title='Open original image in a new tab (Bandcamp importer)' target='_blank'>Original image</a></div>`,
        );

        const bci_link = document.querySelector('div#bci_link');
        bci_link.style.paddingTop = '0.5em';
        bci_link.style.textAlign = 'right';
        bci_link.querySelector('a').style.fontWeight = 'bold';
        const upc = unsafeWindow.TralbumData.current.upc;
        if (typeof upc != 'undefined' && upc !== null) {
            document.querySelector('div #trackInfoInner').insertAdjacentHTML(
                'beforeend',
                `<div id="mbimport_upc" style="margin-bottom: 2em; font-size: smaller;">UPC: ${upc}<br/>
            Import: <a href="https://harmony.pulsewidth.org.uk/release?url=${encodeURIComponent(release.url)}&category=default">Harmony</a>
            | <a href="https://atisket.pulsewidth.org.uk/?upc=${upc}">a-tisket</a></div>`,
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

        const insertLinkCb = function (link) {
            if (!isLinkInserted) {
                // Append the artist/label link on Stub discography pages
                $('div.stub-page-content h1').append(link);
                $('div.stub-page-content h1 a').css(linkStyle);

                // Append the artist/label link on actual discography pages
                $('p#band-name-location span.title').append(link);
                $('p#band-name-location span.title a').css(linkStyle);
                isLinkInserted = true;
            }
        };

        function showLookupButtonsIfNoLink() {
            if (!isLinkInserted) {
                MBSearchItStyle();
                const entityName = unsafeWindow.BandData.name;
                const artistSearchUrl = MBImport.searchUrlFor('artist', entityName);
                const labelSearchUrl = MBImport.searchUrlFor('label', entityName);

                $('div.stub-page-content h1').append(`
                    <span class="mb_wrapper">
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
                    </span>
                `);
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
});
