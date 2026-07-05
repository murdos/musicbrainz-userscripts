// ==UserScript==
// @name         Musicbrainz UI enhancements
// @description  Various UI enhancements for Musicbrainz
// @version      2026.7.5.4
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @icon         http://wiki.musicbrainz.org/-/images/3/3d/Musicbrainz_logo.png
// @namespace    http://userscripts.org/users/22504
// @match        https://*musicbrainz.org/*
// @match        http://*musicbrainz.org/*
// @run-at       document-start
// @require      http://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.js
// @require      https://raw.github.com/murdos/mbediting.js/master/mbediting.js
// @resource     copyIcon https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/icons/copy.svg?v=2026.2.12.3
// @resource     checkIcon https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/icons/check.svg?v=2026.2.12.3
// @resource     errorIcon https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/icons/error.svg?v=2026.2.12.3
// @resource     searchIcon https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/icons/search.svg?v=2026.2.12.3
// @resource     searchArtistIcon https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/icons/search-artist.svg?v=2026.2.12.3
// @grant        GM_getResourceURL
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addElement
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

// Runs in page context (via GM_addElement) where globalThis.MB is defined.
const REL_EDITOR_PAGE_LISTENER = `(function () {
    if (window.__mbUiRelEditorShortcutsInstalled) return;
    window.__mbUiRelEditorShortcutsInstalled = true;

    function createBatchSourcePlaceholder(entityType) {
        if (entityType === 'recording') {
            return {
                entityType: 'recording',
                name: '',
                id: 0,
                gid: '',
                comment: '',
                editsPending: false,
                last_updated: null,
                artistCredit: { names: [] },
                isrcs: [],
                length: 0,
                related_works: [],
                video: false,
            };
        }
        return {
            entityType: 'work',
            name: '',
            id: 0,
            gid: '',
            comment: '',
            editsPending: false,
            last_updated: null,
            artists: [],
            attributes: [],
            authors: [],
            iswcs: [],
            languages: [],
            typeID: null,
        };
    }

    function resolveSourceEntity(re, sourceType) {
        if (sourceType === 'release_group') {
            return re.state.entity.releaseGroup;
        }
        if (sourceType === 'release') {
            return re.state.entity;
        }
        if (sourceType === 'recording' || sourceType === 'work') {
            return createBatchSourcePlaceholder(sourceType);
        }
        return null;
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('.mb-ui-rel-shortcut-btn');
        if (!button || button.disabled) return;

        event.preventDefault();

        var MB = globalThis.MB;
        var re = MB && MB.relationshipEditor;
        if (!re || !re.dispatch) return;

        var sourceType = button.getAttribute('data-source-type');
        var targetType = button.getAttribute('data-target-type');
        var source = resolveSourceEntity(re, sourceType);
        if (!source) return;

        var isBatch = sourceType === 'recording' || sourceType === 'work';
        re.dispatch({
            type: 'update-dialog-location',
            location: isBatch
                ? { batchSelection: true, source: source, track: null }
                : { source: source, track: null },
        });

        if (!targetType) return;

        var waitForDialog = function () {
            if (re.relationshipDialogDispatch) {
                re.relationshipDialogDispatch({
                    type: 'update-target-type',
                    source: source,
                    targetType: targetType,
                });
            } else {
                requestAnimationFrame(waitForDialog);
            }
        };
        requestAnimationFrame(waitForDialog);
    }, true);
})();`;

let relEditorPageBridgeInstalled = false;

function installRelEditorPageBridge() {
    if (relEditorPageBridgeInstalled) return;
    relEditorPageBridgeInstalled = true;

    if (typeof GM_addElement === 'function') {
        GM_addElement('script', { textContent: REL_EDITOR_PAGE_LISTENER });
        return;
    }

    const script = document.createElement('script');
    script.textContent = REL_EDITOR_PAGE_LISTENER;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}

// Copy release title: menu command to enable/disable (default enabled)
function setCopyTitleMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(
        `${GM_getValue('copyTitleEnabled', true) ? '☑' : '☐'} Copy release title button`,
        function () {
            GM_setValue('copyTitleEnabled', !GM_getValue('copyTitleEnabled', true));
            setCopyTitleMenu();
        },
        { autoClose: false, id: 'copyTitle' },
    );
}
setCopyTitleMenu();

// Google search release title: menu command to enable/disable (default enabled)
function setGoogleSearchMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(
        `${GM_getValue('googleSearchEnabled', true) ? '☑' : '☐'} Google search release title buttons`,
        function () {
            GM_setValue('googleSearchEnabled', !GM_getValue('googleSearchEnabled', true));
            setGoogleSearchMenu();
        },
        { autoClose: false, id: 'googleSearch' },
    );
}
setGoogleSearchMenu();

// Relationship editor shortcut buttons: menu command to enable/disable (default enabled)
function setRelEditorShortcutsMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(
        `${GM_getValue('relEditorShortcutsEnabled', true) ? '☑' : '☐'} Relationship editor shortcut buttons`,
        function () {
            GM_setValue('relEditorShortcutsEnabled', !GM_getValue('relEditorShortcutsEnabled', true));
            setRelEditorShortcutsMenu();
        },
        { autoClose: false, id: 'relEditorShortcuts' },
    );
}
setRelEditorShortcutsMenu();

$(document).ready(function () {
    // Follow the instructions found at https://www.last.fm/api/authentication
    // then paste your API Key between the single quotes in the variable below.
    const LASTFM_APIKEY = '';

    // Highlight table rows
    $('head').append(
        '<style>table.tbl > tbody > tr:hover { background-color: #ffeea8 } table.tbl > tbody > tr:hover > td { background-color: rgba(0, 0, 0, 0) }</style>',
    );

    // Hover effects for release title action buttons
    $('head').append(
        '<style>.release-title-action-btn { opacity: 0.8; transition: transform 0.15s ease, opacity 0.15s ease; } .release-title-action-btn:hover { opacity: 1; transform: scale(1.15); } .release-title-action-btn:active { transform: scale(1.05); }</style>',
    );

    const artistRegex = new RegExp('musicbrainz.org/artist/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$', 'i');

    // Top tracks from Last.fm
    if (LASTFM_APIKEY && window.location.href.match(artistRegex)) {
        $('h2.discography').before('<h2 class="toptracks">Top Last.fm recordings</h2><ul class="toptracks" />');
        const mbid = window.location.href.match(artistRegex)[1];
        $.getJSON(
            `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&mbid=${mbid}&api_key=${LASTFM_APIKEY}&format=json`,
            function (data) {
                $.each(data.toptracks.track, function (index, track) {
                    if (index >= 5) return true;
                    let url = track.mbid ? `/recording/${track.mbid}` : track.url;
                    $('ul.toptracks').append(`<li><a href="${url}">${track.name}</a></li>`);
                });
            },
        );
    }

    // Fix for http://tickets.musicbrainz.org/browse/MBS-750
    const releaseRegex = new RegExp('musicbrainz.org/release/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', 'i');
    if (window.location.href.match(releaseRegex)) {
        if ($('table.medium thead').length == 1) {
            let text = $.trim($('table.medium thead').text());
            if (text.match(/ 1$/)) {
                $('table.medium thead a').text(text.replace(/ 1$/, ''));
            }
        }
    }

    // Better fix for http://tickets.musicbrainz.org/browse/MBS-1943
    const entityRegex = new RegExp(
        'musicbrainz.org/(artist|release-group|release|recording|work|label)/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})',
        'i',
    );
    if (window.location.href.match(entityRegex)) {
        $("#sidebar h2:contains('Rating')").before($("#sidebar h2:contains('External links')"));
        let pageHasRGLinks = $("#sidebar h2:contains('Release group external links')").length > 0;
        $("#sidebar h2:contains('Rating')").before(
            $("#sidebar h2:contains('External links')")
                .nextAll('ul.external_links')
                .filter(function () {
                    return !pageHasRGLinks || $(this).nextAll("h2:contains('Release group external links')").length > 0;
                }),
        );
        $("#sidebar h2:contains('Rating')").before($("#sidebar h2:contains('Release group external links')"));
        $("#sidebar h2:contains('Rating')").before($("#sidebar h2:contains('Release group external links')").nextAll('ul.external_links'));
    }

    // Remove the affiliate section
    const affiliateRegex = new RegExp(
        'musicbrainz.org/(artist|release-group|release|recording|work|label)/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})',
        'i',
    );
    if (window.location.href.match(affiliateRegex)) {
        $('#sidebar-affiliates').remove();
    }

    // Batch merge -> open in a new tab/windows
    const batchMergeRegex = new RegExp(
        'musicbrainz.org/artist/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/(recordings|releases|works)',
        'i',
    );
    if (window.location.href.match(batchMergeRegex)) {
        $('form')
            .filter(function () {
                return $(this).prop('action').match('merge_queue');
            })
            .attr('target', '_blank');
    }

    // Modify link to edits: remove " - <Edit type>" from the link "Edit XXXX - <Edit type>"
    const editsRegex = new RegExp('musicbrainz.org/.*/(open_)?edits', 'i');
    if (window.location.href.match(editsRegex)) {
        $('div.edit-description ~ h2').each(function () {
            let parts = $(this).find('a').text().split(' - ');
            $(this).find('a').text(parts[0]);
            $(this).append(` - ${parts[1]}`);
        });
    }

    // Add direct link to cover art tab for Add cover art edits
    const coverArtRegex = new RegExp('musicbrainz.org/(.*/(open_)?edits|edit/d+)', 'i');
    if (window.location.href.match(coverArtRegex)) {
        $("div.edit-description ~ h2:contains('cover art')").each(function () {
            const $editdetails = $(this).parents('.edit-header').siblings('.edit-details');
            const mbid = $editdetails
                .find("a[href*='musicbrainz.org/release/']")
                .attr('href')
                .match(/\/release\/(.{36})/)[1];
            $editdetails
                .find('tbody td.edit-cover-art')
                .after(`<tr><th span='2'><a href='/release/${mbid}/cover-art'>See all artworks for this release</a></th></tr>`);
        });
    }

    // Embed Youtube videos
    const recordingRegex = new RegExp('musicbrainz.org/recording/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', 'i');
    if (window.location.href.match(recordingRegex)) {
        let $youtube_link = $('#sidebar li.youtube-favicon a');
        if ($youtube_link.length > 0) {
            let youtube_id = $youtube_link.prop('href').match(/http:\/\/www\.youtube\.com\/watch\?v=(.*)/)[1];
            $('table.details').width('60%');
            $("h2:contains('Relationships')").after(
                `<iframe width="360" height="275" frameborder="0" style="float: right;" src="https://www.youtube.com/embed/${youtube_id}?rel=0" allowfullscreen=""></iframe>`,
            );
        }
    }

    // When attaching CDTOC, autoselect artist when there's only one result
    const cdtocRegex = new RegExp('musicbrainz.org/cdtoc/attach.*&filter-artist.query=.*', 'i');
    if (window.location.href.match(cdtocRegex)) {
        const $artists = $('ul.radio-list li');
        if ($artists.length == 1) {
            $artists.find('input:radio').attr('checked', true);
        }
    }

    // Highlight Year in ISRCs codes
    const artistRecordingsRegex = new RegExp(
        'musicbrainz.org/artist/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/recordings',
        'i',
    );
    if (window.location.href.match(artistRecordingsRegex)) {
        let isrcColNo; // = ($("#content table.tbl thead th:eq(2)").text() == "Artist") ? 3 : 2;
        $('#content table.tbl thead th').each(function (index, th) {
            if ($(th).text() == 'ISRCs') {
                isrcColNo = index;
                return false;
            }
        });
        $('#content table.tbl tbody tr').each(function () {
            $(this)
                .find(`td:eq(${isrcColNo})`)
                .find('li')
                .each(function () {
                    let newHTML = '';
                    const isrc = $(this).text();
                    newHTML += `<a href='/isrc/${isrc}'><bdi><code>`;
                    newHTML += `${isrc.substring(0, 5)}<b>${isrc.substring(5, 7)}</b>${isrc.substring(7)}`;
                    newHTML += '</code></bdi></a>';
                    $(this).html(newHTML);
                });
        });
    }

    // Release header buttons (search, copy) - on all release pages including sub-pages (cover-art, aliases, tags, etc.)
    const releaseHeaderRegex = new RegExp(
        'musicbrainz.org/release/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:/[^?#]*)?(?:#.*)?$',
        'i',
    );
    if (window.location.href.match(releaseHeaderRegex)) {
        const mbid = window.location.href.match(releaseHeaderRegex)[1];
        const $releaseHeader = $('div.wrap-anywhere.releaseheader, div.releaseheader').first();
        const $h1 = $releaseHeader.children('h1');
        const releaseTitle = $h1.length ? $h1.text().replace(/\s+/g, ' ').trim() : '';
        const shouldShowCopyButton =
            GM_getValue('copyTitleEnabled', true) &&
            navigator.clipboard &&
            navigator.clipboard.writeText &&
            typeof GM_getResourceURL === 'function';

        if (releaseTitle && $releaseHeader.length) {
            const iconCSS = { width: '18px', height: '18px', verticalAlign: 'top' };
            const $iconsContainer = $('<span class="release-title-actions" />').css({
                display: 'inline-block',
                marginLeft: '2px',
            });

            if (GM_getValue('googleSearchEnabled', true) && typeof GM_getResourceURL === 'function') {
                const $searchImg = $('<img />')
                    .attr({ src: GM_getResourceURL('searchIcon'), alt: 'Search', role: 'img' })
                    .css(iconCSS);

                const titleExactQuery = `"${releaseTitle.replace(/"/g, '')}"`;
                const googleTitleUrl = `https://www.google.com/search?q=${encodeURIComponent(titleExactQuery)}`;
                const $googleTitleLink = $('<a />')
                    .attr({
                        href: googleTitleUrl,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        title: 'Search release title on Google',
                    })
                    .addClass('release-title-action-btn')
                    .css({
                        ...iconCSS,
                        display: 'inline-block',
                        cursor: 'pointer',
                        marginLeft: '2px',
                    })
                    .append($searchImg.clone());
                $iconsContainer.append($googleTitleLink);

                const artists = [];
                $releaseHeader.find('p.subheader > bdi a[href*="/artist/"]').each(function () {
                    const name = $(this).text().replace(/\s+/g, ' ').trim();
                    if (name) artists.push(name);
                });
                const exactPhrases = artists.concat([releaseTitle]);
                const exactQuery = exactPhrases
                    .map(function (p) {
                        return `"${p.replace(/"/g, '')}"`;
                    })
                    .join(' ');
                const googleExactUrl = `https://www.google.com/search?q=${encodeURIComponent(exactQuery)}`;
                const $searchArtistImg = $('<img />')
                    .attr({
                        src: GM_getResourceURL('searchArtistIcon'),
                        alt: 'Search artist and title',
                        role: 'img',
                    })
                    .css(iconCSS);
                const $googleExactLink = $('<a />')
                    .attr({
                        href: googleExactUrl,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        title: 'Search Google for exact match (artist(s) + release title)',
                    })
                    .addClass('release-title-action-btn')
                    .css({
                        ...iconCSS,
                        display: 'inline-block',
                        cursor: 'pointer',
                        marginLeft: '2px',
                    })
                    .append($searchArtistImg);
                $iconsContainer.append($googleExactLink);
            }

            if (shouldShowCopyButton) {
                const $img = $('<img />')
                    .attr({
                        src: GM_getResourceURL('copyIcon'),
                        alt: 'Copy',
                        title: 'Copy release title',
                    })
                    .css({ ...iconCSS, cursor: 'pointer' });
                const $checkImg = $('<img />')
                    .attr({ src: GM_getResourceURL('checkIcon'), alt: 'Copied' })
                    .css(iconCSS);
                const $errorImg = $('<img />')
                    .attr({ src: GM_getResourceURL('errorIcon'), alt: 'Copy failed' })
                    .css(iconCSS);
                const $wrap = $('<span />').addClass('release-title-action-btn').css({ display: 'inline-block' }).append($img);
                $wrap.on('click', function () {
                    navigator.clipboard.writeText(releaseTitle).then(
                        function () {
                            $wrap.empty().append($checkImg);
                            setTimeout(function () {
                                $wrap.empty().append($img);
                            }, 3000);
                        },
                        function () {
                            $wrap.empty().append($errorImg);
                            setTimeout(function () {
                                $wrap.empty().append($img);
                            }, 3000);
                        },
                    );
                });
                $iconsContainer.append($wrap);
            }

            const $titleLine = $('<span class="release-title-line" />').css({
                display: 'flex',
                alignItems: 'flex-start',
                flexWrap: 'nowrap',
            });
            $h1.wrap($titleLine);
            $h1.parent().append($iconsContainer);
        }

        // ISRCs and recording comment - only on main release page (tracklisting exists there)
        const mainReleaseRe = /musicbrainz\.org\/release\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}#?$/i;
        if (mainReleaseRe.test(window.location.href)) {
            let ISRC_COLUMN_POSITION = 2;
            // Get tracks data from webservice
            let wsurl = `/ws/2/release/${mbid}?inc=isrcs+recordings`;
            $.getJSON(wsurl, function (data) {
                // Store tracks data from webservice in a hash table
                let tracks = {};
                $.each(data.media, function (index, medium) {
                    $.each(medium.tracks, function (i, track) {
                        tracks[track.id] = track;
                    });
                });
                // Different behavior depending on the number of mediums
                if ($('table.medium').length <= 10) {
                    // All mediums are already displayed: handle them now
                    $('table.medium').each(function () {
                        handleMedium($(this), tracks);
                    });
                } else {
                    // Each medium will be handled when it's loaded
                    let HANDLED_ATTRIBUTE = 'ui_enh_isrcs_handled';
                    $('table.medium').attr(HANDLED_ATTRIBUTE, 'no');
                    $('table.medium').bind('DOMNodeInserted', function (event) {
                        const $target = $(event.target);
                        if (
                            $target.prop('nodeName') === 'TBODY' &&
                            $target.parent().attr(HANDLED_ATTRIBUTE) === 'no' &&
                            $target.find('tr.subh').length > 0
                        ) {
                            const $medium = $target.parent();
                            $medium.attr(HANDLED_ATTRIBUTE, 'pending');
                            handleMedium($medium, tracks);
                            $medium.attr(HANDLED_ATTRIBUTE, 'done');
                        }
                    });
                }
            });

            const handleMedium = function ($medium, ws_tracks) {
                // Extend colspan for medium table header
                $medium.find('thead tr').each(function () {
                    $(this)
                        .find('th:eq(0)')
                        .attr('colspan', $(this).find('th:eq(0)').attr('colspan') * 1 + 1);
                });
                // Table sub-header
                $medium
                    .find(`tbody tr.subh th:nth-last-child(${ISRC_COLUMN_POSITION})`)
                    .before("<th style='width: 150px;' class='isrc c'> ISRC </th>");

                // Handle each track
                $medium.find('tbody tr[id]').each(function (index, medium_track) {
                    const track_mbid = $(medium_track).attr('id');
                    let isrcsLinks = '';
                    if (Object.prototype.hasOwnProperty.call(ws_tracks, track_mbid)) {
                        const track = ws_tracks[track_mbid];
                        let recording = track.recording;
                        // Recording comment
                        if (recording.disambiguation !== '') {
                            let td_title_index = $(`#${track_mbid}`).find('td:eq(1)').hasClass('video') ? 2 : 1;
                            $(`#${track_mbid}`)
                                .find(`td:eq(${td_title_index}) a:eq(0)`)
                                .after(` <span class="comment">(${recording.disambiguation})</span>`);
                        }
                        // ISRCS
                        if (recording.isrcs.length != 0) {
                            let links = jQuery.map(recording.isrcs, function (isrc) {
                                return `<a href='/isrc/${isrc}'>${isrc}</a>`;
                            });
                            isrcsLinks = links.join(', ');
                        }
                    }
                    $(`#${track_mbid}`)
                        .find(`td:nth-last-child(${ISRC_COLUMN_POSITION})`)
                        .before(`<td class='isrc c'><small>${isrcsLinks}</small></td>`);
                });
            };
        }
    }

    // Display a-tisket links next to Deezer, Spotify, iTunes and Apple Music links
    if (window.location.href.match(releaseRegex)) {
        document.querySelectorAll('div#bottom-credits a').forEach(function (link) {
            if (link.href.match(/deezer.com|(music|itunes).apple.com|spotify.com/)) {
                let id;
                let fragment;
                let country;
                if (link.href.match(/deezer.com/)) {
                    id = new URL(link.href).pathname.split('/').slice(-1)[0];
                    fragment = 'deez';
                    country = 'GB%2CUS%2CIN';
                } else if (link.href.match(/apple.com/)) {
                    id = new URL(link.href).pathname.split('/', 5).slice(-1)[0].replace('id', '');
                    fragment = 'itu';
                    country = new URL(link.href).pathname.split('/', 2)[1];
                } else if (link.href.match(/spotify.com/)) {
                    id = new URL(link.href).pathname.split('/', 5).slice(-1)[0];
                    fragment = 'spf';
                    country = 'GB%2CUS%2CIN';
                }

                let next = link.nextElementSibling.nextElementSibling;
                let newlink = document.createElement('a');
                newlink.href = `https://atisket.pulsewidth.org.uk/?preferred_countries=${country}&${fragment}_id=${id}&preferred_vendor=${fragment}`;
                newlink.text = 'a-tisket';

                next.before(document.createTextNode(' ['));
                next.before(newlink);
                next.before(document.createTextNode(']'));
            }
        });
    }

    // Discogs link rollover
    // TODO...

    // Add-relationship shortcuts on the release relationship editor
    const relationshipEditorRegex = new RegExp(
        'musicbrainz.org/release/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/edit-relationships',
        'i',
    );
    if (window.location.href.match(relationshipEditorRegex) && GM_getValue('relEditorShortcutsEnabled', true)) {
        const RELEASE_REL_TARGET_TYPES = ['area', 'artist', 'event', 'label', 'place', 'recording', 'release', 'series'];
        const RELEASE_GROUP_REL_TARGET_TYPES = ['artist', 'event', 'genre', 'label', 'release_group', 'series', 'work'];
        const RECORDING_REL_TARGET_TYPES = ['area', 'artist', 'event', 'label', 'place', 'recording', 'release', 'series', 'work'];
        const WORK_REL_TARGET_TYPES = ['area', 'artist', 'event', 'label', 'place', 'recording', 'release_group', 'series', 'work'];
        const REL_EDITOR_SECTIONS = [
            { containerId: 'release-rels', sourceType: 'release', targetTypes: RELEASE_REL_TARGET_TYPES },
            { containerId: 'release-group-rels', sourceType: 'release_group', targetTypes: RELEASE_GROUP_REL_TARGET_TYPES },
        ];
        const BATCH_REL_SECTIONS = [
            {
                batchButtonSelector: '.batch-add-recording-relationship',
                sourceType: 'recording',
                targetTypes: RECORDING_REL_TARGET_TYPES,
            },
            {
                batchButtonSelector: '.batch-add-work-relationship',
                sourceType: 'work',
                targetTypes: WORK_REL_TARGET_TYPES,
            },
        ];

        $('head').append(`<style>
h2.mb-ui-rel-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}
h2.mb-ui-rel-header .mb-ui-rel-shortcuts {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    margin-left: 4px;
    font-weight: normal;
    line-height: 1;
}
.mb-ui-rel-shortcuts {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 4px;
}
.mb-ui-rel-shortcut-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 4px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #f8f8f8;
    cursor: pointer;
    line-height: 1.2;
    font-size: 11px;
    vertical-align: middle;
}
.mb-ui-rel-shortcut-btn:hover:not(:disabled) {
    background: #ffeea8;
    border-color: #999;
}
.mb-ui-rel-shortcut-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #eee;
}
.mb-ui-rel-shortcut-btn img {
    width: 14px;
    height: 14px;
    display: block;
    flex-shrink: 0;
}
.mb-ui-rel-shortcut-label {
    line-height: 1;
}
</style>`);

        const entityTypeLabel = function (entityType) {
            return entityType.replace(/_/g, ' ').replace(/\b\w/g, function (c) {
                return c.toUpperCase();
            });
        };

        const createShortcutButtons = function ($container, sourceType, targetTypes, options) {
            options = options || {};
            if ($container.attr('data-mb-ui-rel-shortcuts') === 'yes') {
                return $container.find('.mb-ui-rel-shortcuts');
            }
            if (options.headerLayout) {
                $container.addClass('mb-ui-rel-header');
            }
            $container.attr('data-mb-ui-rel-shortcuts', 'yes');

            const $shortcuts = $('<span class="mb-ui-rel-shortcuts" />');
            const entityIconBase = `${window.location.origin}/static/images/entity`;

            targetTypes.forEach(function (targetType) {
                const $button = $('<button type="button" class="mb-ui-rel-shortcut-btn" />').attr({
                    title: `Add ${entityTypeLabel(targetType)} relationship`,
                    'data-source-type': sourceType,
                    'data-target-type': targetType,
                });
                $button.append(
                    $('<img />').attr({
                        src: `${entityIconBase}/${targetType}.svg`,
                        alt: '',
                    }),
                    $('<span class="mb-ui-rel-shortcut-label" />').text(entityTypeLabel(targetType)),
                );
                $shortcuts.append($button);
            });

            $container.append($shortcuts);
            return $shortcuts;
        };

        const syncBatchShortcutDisabled = function (batchButtonSelector, $shortcuts) {
            const batchBtn = document.querySelector(batchButtonSelector);
            if (!batchBtn || !$shortcuts.length) return;

            const sync = function () {
                $shortcuts.find('.mb-ui-rel-shortcut-btn').prop('disabled', batchBtn.disabled);
            };
            sync();

            const observer = new MutationObserver(sync);
            observer.observe(batchBtn, { attributes: true, attributeFilter: ['disabled'] });
        };

        const initBatchRelShortcuts = function () {
            const $batchTools = $('#batch-tools');
            if (!$batchTools.length) return false;
            if ($batchTools.attr('data-mb-ui-rel-shortcuts') === 'yes') return true;

            const $row = $('<tr class="mb-ui-rel-batch-shortcuts-row" />');
            $row.append($('<td />'));
            $row.append($('<td />'));
            $row.append($('<td />'));
            $batchTools.find('tbody').append($row);

            BATCH_REL_SECTIONS.forEach(function (section, index) {
                const $shortcuts = createShortcutButtons(
                    $row.children('td').eq(index === 0 ? 0 : 2),
                    section.sourceType,
                    section.targetTypes,
                );
                syncBatchShortcutDisabled(section.batchButtonSelector, $shortcuts);
            });

            $batchTools.attr('data-mb-ui-rel-shortcuts', 'yes');
            return true;
        };

        const initRelEditorShortcuts = function () {
            installRelEditorPageBridge();
            let allReady = true;
            REL_EDITOR_SECTIONS.forEach(function (section) {
                const $header = $(`#${section.containerId}`).prev('h2');
                if (!$header.length) {
                    allReady = false;
                    return;
                }
                createShortcutButtons($header, section.sourceType, section.targetTypes, { headerLayout: true });
            });
            if (!initBatchRelShortcuts()) {
                allReady = false;
            }
            return allReady;
        };

        if (!initRelEditorShortcuts()) {
            const relEditorObserver = new MutationObserver(function () {
                if (initRelEditorShortcuts()) {
                    relEditorObserver.disconnect();
                }
            });
            relEditorObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    // -------------- End of script ------------------------
});
