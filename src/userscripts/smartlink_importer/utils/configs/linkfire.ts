import { collectLinkfireServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/linkfire';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createLinkfireConfig(): SmartLinkImporterConfig {
    return {
        id: 'linkfire',
        siteName: 'Linkfire',
        collectServiceElements: collectLinkfireServiceElements,
        resolveDestination: element => element.sourceUrl,
        mountPanel: panel => {
            const services = document.querySelector('#music-services');
            if (services?.parentElement) services.parentElement.insertBefore(panel, services);
            else document.body.appendChild(panel);
        },
    };
}
