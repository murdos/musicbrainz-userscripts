import { collectPromoLinksServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/promolinks';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createPromoLinksConfig(): SmartLinkImporterConfig {
    return {
        id: 'promolinks',
        siteName: 'PromoLinks.me',
        collectServiceElements: collectPromoLinksServiceElements,
        resolveDestination: element => element.sourceUrl,
    };
}
