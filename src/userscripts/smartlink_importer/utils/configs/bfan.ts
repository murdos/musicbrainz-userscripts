import { collectBfanServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/bfan';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createBfanConfig(): SmartLinkImporterConfig {
    return {
        id: 'bfan',
        siteName: 'bfan.link',
        collectServiceElements: collectBfanServiceElements,
        resolveDestination: element => element.sourceUrl,
    };
}
