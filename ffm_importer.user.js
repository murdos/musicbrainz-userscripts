// ==UserScript==
// @name         Import FFM releases to MusicBrainz
// @description  Deprecated: install the unified Smartlink importer, then remove this script.
// @version      2026.09.12.1
// @author       Raman Sinclair
// @namespace    https://github.com/murdos/musicbrainz-userscripts/
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/ffm_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/ffm_importer.user.js
// @match        https://ffm.to/*
// @match        https://*.ffm.to/*
// @match        https://orcd.co/*
// @match        https://*.orcd.co/*
// @run-at       document-idle
// @icon         https://metabrainz.org/static/img/projects/musicbrainz.svg
// ==/UserScript==

(function () {
    'use strict';

    /** Temporary migration support for the legacy per-site userscripts. */
    const UNIFIED_INSTALL_URL = 'https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/smartlink_importer.user.js';
    function warnDeprecatedSmartLinkImporter(legacyName) {
      console.warn(`${legacyName} has been replaced by the unified Smartlink importer. Install it manually, then remove this deprecated script: ${UNIFIED_INSTALL_URL}`);
    }

    warnDeprecatedSmartLinkImporter('The FFM importer');

})();
