import { collectDistrokidServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/distrokid';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createDistrokidConfig(): SmartLinkImporterConfig {
    return {
        id: 'distrokid',
        siteName: 'DistroKid HyperFollow',
        collectServiceElements: collectDistrokidServiceElements,
        resolveDestination: element => element.sourceUrl,
        mountPanel: panel => {
            const firstService = document.querySelector('a[data-testid="hyperfollow-store-link"]');
            if (firstService?.parentElement) firstService.parentElement.insertBefore(panel, firstService);
            else document.body.appendChild(panel);
        },
    };
}
