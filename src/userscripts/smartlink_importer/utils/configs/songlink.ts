import { collectSonglinkServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/songlink';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createSonglinkConfig(): SmartLinkImporterConfig {
    return {
        id: 'songlink',
        siteName: 'Songlink',
        collectServiceElements: collectSonglinkServiceElements,
        resolveDestination: element => element.sourceUrl,
    };
}
