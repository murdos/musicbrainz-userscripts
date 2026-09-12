import { collectFfmServiceElements } from '~/userscripts/smartlink_importer/utils/extractors/ffm';
import { followRedirect } from '~/userscripts/smartlink_importer/utils/follow-redirect';
import { decodeFfmDestination } from '~/userscripts/smartlink_importer/utils/logic';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

export function createFfmConfig(): SmartLinkImporterConfig {
    return {
        id: 'ffm',
        siteName: window.location.hostname.endsWith('orcd.co') ? 'ORCD' : 'FFM',
        collectServiceElements: collectFfmServiceElements,
        resolveDestination: element => decodeFfmDestination(element.sourceUrl) ?? followRedirect(element.sourceUrl),
        mountPanel: panel => {
            const musicServices = document.querySelector('.music-services-section');
            if (musicServices?.parentElement) musicServices.parentElement.insertBefore(panel, musicServices);
            else document.body.appendChild(panel);
        },
    };
}
