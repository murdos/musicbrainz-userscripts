import { collectBandLinkServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/bandlink';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createBandLinkConfig(): SmartLinkImporterConfig {
    return {
        id: 'bandlink',
        siteName: 'BandLink',
        collectServiceElements: collectBandLinkServiceElements,
        resolveDestination: element => element.sourceUrl,
    };
}
