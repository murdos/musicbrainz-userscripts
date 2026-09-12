/** Temporary migration support for the legacy per-site userscripts. */
const UNIFIED_INSTALL_URL = 'https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/smartlink_importer.user.js';

export function warnDeprecatedSmartLinkImporter(legacyName: string): void {
    console.warn(
        `${legacyName} has been replaced by the unified Smartlink importer. Install it manually, then remove this deprecated script: ${UNIFIED_INSTALL_URL}`,
    );
}
