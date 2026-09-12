import { collectFanlinkServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/fanlink';
import { followRedirect } from '~/userscripts/smartlink_importer/utils/follow-redirect';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createFanlinkConfig(): SmartLinkImporterConfig {
    return {
        id: 'fanlink',
        siteName: 'Fanlink',
        collectServiceElements: collectFanlinkServiceElements,
        resolveDestination: element => followRedirect(element.sourceUrl).catch(() => element.sourceUrl),
    };
}
