// ==UserScript==
// @name         Musicbrainz UI enhancements
// @description  Various UI enhancements for Musicbrainz
// @version      2026.11.28.1
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/mb_ui_enhancements.user.js
// @icon         https://metabrainz.org/static/img/projects/musicbrainz.svg
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
// @resource     harmonyIcon https://harmony.pulsewidth.org.uk/favicon.svg?v=2026.8.25.3
// @grant        GM_getResourceURL
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      bandcamp.com
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

// Bandcamp’s embedded JSON is parsed as data; fetched scripts are never executed.
function getBandcampLinkTypes(data, description = '') {
    if (!data.current || !Array.isArray(data.trackinfo)) throw new Error('Missing Bandcamp release data');

    if (data.is_private_stream) throw new Error('Private Bandcamp streams are not supported');

    const types = [];
    const current = data.current;

    if (current.download_pref != null) {
        if (current.minimum_price > 0 || current.download_pref === 2) types.push('74');

        if (data.freeDownloadPage || current.download_pref === 1 || (current.minimum_price === 0 && !current.is_set_price)) {
            types.push('75');
        }
    }

    const tracks = data.trackinfo;
    const advertisedTracks = Number(description.match(/(\d+) track/i)?.[1] || 0);

    if (
        !data.tralbum_subscriber_only &&
        tracks.length > 0 &&
        advertisedTracks <= tracks.length &&
        tracks.every(track => track.streaming === 1 && track.file && Object.keys(track.file).length > 0)
    ) {
        types.push('85');
    }

    return types;
}

function normalizeBandcampReleaseUrl(value) {
    try {
        const url = new URL(value);

        if (!/^https?:$/.test(url.protocol) || !/^[a-z0-9-]+\.bandcamp\.com$/i.test(url.hostname)) return null;

        if (!/^\/(album|track)\/[^/]+\/?$/.test(url.pathname) || url.username || url.password || url.port) return null;

        return `https://${url.hostname}${url.pathname.replace(/\/$/, '')}`;
    } catch {
        return null;
    }
}

function fetchBandcampLinkTypes(url) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            anonymous: true,
            timeout: 20000,
            onload(response) {
                try {
                    if (response.status !== 200) throw new Error(`Bandcamp returned HTTP ${response.status}`);

                    const page = new DOMParser().parseFromString(response.responseText, 'text/html');
                    const json = page.querySelector('[data-tralbum]')?.getAttribute('data-tralbum');

                    if (!json) throw new Error('Bandcamp release data was not found');

                    resolve(getBandcampLinkTypes(JSON.parse(json), page.querySelector('meta[property="og:description"]')?.content));
                } catch (error) {
                    reject(error);
                }
            },
            onerror: () => reject(new Error('Could not load Bandcamp')),
            ontimeout: () => reject(new Error('Bandcamp request timed out')),
        });
    });
}

function getExternalLinkRows(row) {
    const rows = [];

    for (let next = row.nextElementSibling; next && !next.matches('.external-link-item'); next = next.nextElementSibling) {
        rows.push(next);
    }

    return rows;
}

// Use React’s normal change/click handlers so relationships reach edit generation.
async function populateBandcampLinkTypes(row, url, types) {
    const managedTypes = new Set(['74', '75', '85']);

    const nextRender = () => new Promise(resolve => setTimeout(resolve, 0));

    const isCurrent = () =>
        row.isConnected && normalizeBandcampReleaseUrl(row.querySelector('a.url')?.href) === url && isBandcampDetectionAllowed();

    const getSelects = () => getExternalLinkRows(row).flatMap(item => [...item.querySelectorAll('select.link-type')]);

    const setType = (select, value) => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Retain unrelated types (e.g. mail order) and reuse the automatically guessed type.
    const missing = types.filter(type => !getSelects().some(select => select.value === type));

    for (const type of missing) {
        if (!isCurrent()) return;

        let select = getSelects().find(item => !item.value || (managedTypes.has(item.value) && !types.includes(item.value)));

        if (!select) {
            const button = getExternalLinkRows(row)
                .find(item => item.matches('.add-relationship'))
                ?.querySelector('button');

            if (!button) throw new Error('Could not add a Bandcamp relationship');

            button.click();
            await nextRender();

            if (!isCurrent()) return;

            select = getSelects().find(item => !item.value);
        }

        if (!select || ![...select.options].some(option => option.value === type)) {
            throw new Error('Bandcamp relationship type is unavailable');
        }

        setType(select, type);
        await nextRender();
    }

    // Clear guesses that Bandcamp does not support. Never remove the URL itself.
    for (const select of getSelects()) {
        if (!isCurrent()) return;

        if (managedTypes.has(select.value) && !types.includes(select.value)) {
            const remove = select.closest('tr').querySelector('button.remove-item');

            if (remove) remove.click();
            else setType(select, '');

            await nextRender();
        }
    }
}

function isBandcampDetectionAllowed() {
    // Digital Media is format 12. Leave unknown formats eligible while adding a release.
    return [...document.querySelectorAll('select[id^="medium-format-"]')].every(select => !select.value || select.value === '12');
}

function installBandcampLinkDetection() {
    if (typeof GM_xmlhttpRequest !== 'function') return;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes mb-ui-bandcamp-spin { to { transform: rotate(360deg); } }
        .mb-ui-bandcamp-progress {
            display: inline-block;
            width: 0.8em;
            height: 0.8em;
            margin-left: 0.5em;
            vertical-align: -0.1em;
            border: 2px solid currentColor;
            border-right-color: transparent;
            border-radius: 50%;
            animation: mb-ui-bandcamp-spin 0.8s linear infinite;
        }
    `;
    document.head.appendChild(style);

    const pending = new Map();
    const cache = new Map();
    const active = new WeakMap();

    const scan = () => {
        for (const [row, request] of pending) {
            if (!row.isConnected || !isBandcampDetectionAllowed()) {
                pending.delete(row);

                continue;
            }

            if (row.querySelector('button[aria-controls="url-input-popover"]')) continue;

            const link = row.querySelector('a.url');

            if (!link || normalizeBandcampReleaseUrl(link.href) !== request.url) continue;

            pending.delete(row);

            const isCurrent = () =>
                active.get(row) === request &&
                row.isConnected &&
                normalizeBandcampReleaseUrl(row.querySelector('a.url')?.href) === request.url &&
                isBandcampDetectionAllowed();

            const rowsSnapshot = () =>
                getExternalLinkRows(row)
                    .map(item =>
                        [...item.querySelectorAll('select, input')].map(input => `${input.id}:${input.value}:${input.checked}`).join(','),
                    )
                    .join(';');

            const snapshot = rowsSnapshot();

            const status = document.createElement('span');
            status.className = 'mb-ui-bandcamp-progress';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-label', 'Checking Bandcamp…');
            status.title = 'Checking Bandcamp…';

            link.after(status);

            let failed = false;

            void request.result
                .then(async result => {
                    if (!isCurrent()) return;

                    if (result.error) throw result.error;

                    if (rowsSnapshot() !== snapshot) return;

                    await populateBandcampLinkTypes(row, request.url, result.types);
                })
                .catch(error => {
                    if (!isCurrent()) return;

                    failed = true;
                    status.className = '';
                    status.style.marginLeft = '0.5em';
                    status.removeAttribute('aria-label');
                    status.textContent = 'Bandcamp check failed.';
                    status.title = error.message;
                    link.after(status);
                    console.warn('Bandcamp link detection:', error);
                })
                .finally(() => {
                    if (!failed) status.remove();
                });
        }
    };

    document.addEventListener('paste', event => {
        const input = event.target;

        if (!(input instanceof HTMLInputElement) || !isBandcampDetectionAllowed()) return;

        let row;
        const isPopover = input.matches('#url-input-popover input.raw-url');

        if (input.matches('#external-links-editor input.value')) {
            row = input.closest('.external-link-item');
        } else if (isPopover) {
            row = document
                .querySelector('#external-links-editor button[aria-controls="url-input-popover"]')
                ?.closest('.external-link-item');
        }

        if (!row) return;

        setTimeout(() => {
            const url = normalizeBandcampReleaseUrl(input.value.trim());

            if (!url || !row.isConnected || !isBandcampDetectionAllowed()) return;

            if (!cache.has(url)) {
                cache.set(
                    url,
                    fetchBandcampLinkTypes(url).then(
                        types => ({ types }),
                        error => {
                            cache.delete(url);

                            return { error };
                        },
                    ),
                );
            }

            const request = { url, result: cache.get(url) };
            active.set(row, request);
            pending.set(row, request);

            // Accept the pasted URL through the editor’s handlers without waiting for blur.
            if (isPopover) input.closest('form').requestSubmit();
            else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

            scan();
        }, 0);
    });

    // Release editor tabs and URL submission render asynchronously.
    new MutationObserver(scan).observe(document.querySelector('#content') || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'aria-controls'],
    });
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

// Set [no label] button: menu command to enable/disable (default disabled)
function setNoLabelButtonMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(
        `${GM_getValue('noLabelButtonEnabled', false) ? '☑' : '☐'} Set [no label] button`,
        function () {
            GM_setValue('noLabelButtonEnabled', !GM_getValue('noLabelButtonEnabled', false));
            setNoLabelButtonMenu();
        },
        { autoClose: false, id: 'noLabelButton' },
    );
}
setNoLabelButtonMenu();

// ISRC column: menu command to enable/disable (default enabled)
function setIsrcColumnMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(
        `${GM_getValue('isrcColumnEnabled', true) ? '☑' : '☐'} ISRC column`,
        function () {
            GM_setValue('isrcColumnEnabled', !GM_getValue('isrcColumnEnabled', true));
            setIsrcColumnMenu();
        },
        { autoClose: false, id: 'isrcColumn' },
    );
}
setIsrcColumnMenu();

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

    // Set a release label row to the special [no label] entity and [none] cat. no.
    const releaseEditorPageRegex = /^\/release\/(?:add|[a-f0-9-]{36}\/edit)\/?$/i;

    if (releaseEditorPageRegex.test(window.location.pathname)) installBandcampLinkDetection();

    if (releaseEditorPageRegex.test(window.location.pathname) && GM_getValue('noLabelButtonEnabled', false)) {
        $('head').append(`<style>
.mb-ui-set-no-label {
    position: absolute;
    top: 50%;
    left: calc(100% + 16px);
    transform: translateY(-50%);
    padding: 2px 6px;
    border: 1px solid #bbb;
    border-radius: 4px;
    background: linear-gradient(#fff, #f1f1f1);
    color: #444;
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 1px 2px rgb(0 0 0 / 10%);
}
.mb-ui-set-no-label:hover,
.mb-ui-set-no-label:focus-visible {
    border-color: #888;
    background: linear-gradient(#fff, #e7e7e7);
}
.mb-ui-set-no-label:active {
    transform: translateY(calc(-50% + 1px));
    background: #e3e3e3;
    box-shadow: none;
}
.mb-ui-label-row {
    position: relative;
}
</style>`);

        const setInputValue = function (input, value) {
            input.value = value;
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertFromPaste' }));
        };

        const addNoLabelButtons = function () {
            document.querySelectorAll('input[id^="label-"]').forEach(function (labelInput) {
                const row = labelInput.closest('tr');
                const catnoInput = row && row.querySelector('input[id^="catno-"]');
                const removeButton = row && row.querySelector('.remove-release-label');
                if (!catnoInput || !removeButton || row.querySelector('.mb-ui-set-no-label')) return;
                row.classList.add('mb-ui-label-row');

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'mb-ui-set-no-label';
                button.textContent = '[no label]';
                button.title = 'Set label to [no label] and catalog number to [none]';
                button.addEventListener('click', function () {
                    setInputValue(labelInput, '157afde4-4bf5-4039-8ad2-5a15acc85176');
                    setInputValue(catnoInput, '[none]');
                });
                removeButton.insertAdjacentElement('beforebegin', button);
            });
        };

        addNoLabelButtons();
        new MutationObserver(addNoLabelButtons).observe(document.body, { childList: true, subtree: true });
    }

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
    if (window.location.href.match(releaseRegex)) {
        const mbid = window.location.href.match(releaseRegex)[1];
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
            const isrcColumnEnabled = GM_getValue('isrcColumnEnabled', true);
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
                if (isrcColumnEnabled) {
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
                }

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
                        if (isrcColumnEnabled && recording.isrcs.length != 0) {
                            let links = jQuery.map(recording.isrcs, function (isrc) {
                                return `<a href='/isrc/${isrc}'>${isrc}</a>`;
                            });
                            isrcsLinks = links.join(', ');
                        }
                    }
                    if (isrcColumnEnabled) {
                        $(`#${track_mbid}`)
                            .find(`td:nth-last-child(${ISRC_COLUMN_POSITION})`)
                            .before(`<td class='isrc c'><small>${isrcsLinks}</small></td>`);
                    }
                });
            };
        }
    }

    // Display a Harmony lookup link when the release has a supported provider URL
    const releaseMatch = window.location.href.match(releaseRegex);
    if (releaseMatch) {
        const harmonyProviderHostname =
            /^(?:[^.]+\.bandcamp\.com|www\.beatport\.com|music\.bugs\.co\.kr|(?:www\.)?deezer\.com|www\.discogs\.com|(?:geo\.)?(?:itunes|music)\.apple\.com|(?:www|m2)\.melon\.com|mora\.jp|ototoy\.jp|(?:play|www|open)\.qobuz\.com|open\.spotify\.com|(?:(?:www|listen)\.)?tidal\.com)$/i;
        const barcode = document.querySelector('#sidebar dd.barcode')?.textContent.trim();
        const validGtin =
            barcode && /^(?:\d{8}|\d{12,14})$/.test(barcode)
                ? barcode
                      .split('')
                      .reduce((checksum, digit, index) => checksum + Number(digit) * ((barcode.length - index) % 2 ? 1 : 3), 0) %
                      10 ===
                  0
                : false;
        const externalLinks = document.querySelector('#sidebar h2.external-links + ul.external_links');

        const supportedProviderUrls = Array.from(externalLinks?.querySelectorAll('li a[href]') ?? [])
            .map(link => new URL(link.href))
            .filter(url => harmonyProviderHostname.test(url.hostname));
        const lowerPriorityHostname =
            /^(?:[^.]+\.bandcamp\.com|www\.beatport\.com|www\.discogs\.com|(?:geo\.)?(?:itunes|music)\.apple\.com)$/i;
        const providerUrl = supportedProviderUrls.find(url => !lowerPriorityHostname.test(url.hostname)) ?? supportedProviderUrls[0];

        if (providerUrl) {
            const harmonyUrl = new URL('https://harmony.pulsewidth.org.uk/release');
            harmonyUrl.searchParams.set('url', providerUrl.href);
            harmonyUrl.searchParams.set('category', 'preferred');
            harmonyUrl.searchParams.set('musicbrainz', releaseMatch[1]);
            if (validGtin) harmonyUrl.searchParams.set('gtin', barcode);

            const harmonyLink = document.createElement('a');
            harmonyLink.href = harmonyUrl.href;
            harmonyLink.target = '_blank';
            harmonyLink.rel = 'noopener';
            harmonyLink.textContent = 'Lookup with Harmony';

            const harmonyItem = document.createElement('li');
            harmonyItem.style.backgroundImage = `url("${GM_getResourceURL('harmonyIcon')}")`;
            harmonyItem.style.backgroundSize = '16px 16px';
            harmonyItem.appendChild(harmonyLink);
            externalLinks.appendChild(harmonyItem);
        }
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
