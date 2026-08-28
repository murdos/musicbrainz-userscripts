import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';

import { getDeezerReleaseData } from './utils/getDeezerReleaseData';
import { parseDeezerRelease } from './utils/parseDeezerRelease';

const LOGGER = new Logger('deezer_importer', LogLevel.INFO);

function waitForEl(selector: string, callback: () => void): void {
    if (document.querySelector(selector)) {
        callback();
    } else {
        setTimeout(() => {
            waitForEl(selector, callback);
        }, 100);
    }
}

function insertLink(release: Parameters<typeof MBImport.buildFormParameters>[0], releaseUrl: string, isrcs: (string | null)[]): void {
    const editNote = MBImport.makeEditNote(releaseUrl, 'Deezer');
    const parameters = MBImport.buildFormParameters(release, editNote);

    const importItem = document.createElement('div');
    importItem.className = 'toolbar-item';
    importItem.innerHTML = MBImport.buildFormHTML(parameters);

    const searchItem = document.createElement('div');
    searchItem.className = 'toolbar-item';
    searchItem.innerHTML = MBImport.buildSearchButton(release);

    const isrcItem = document.createElement('div');
    isrcItem.className = 'toolbar-item';

    const isrcForm = document.createElement('form');
    isrcForm.className = 'musicbrainz_import';

    const isrcButton = document.createElement('button');
    isrcButton.type = 'submit';
    isrcButton.title = "Submit ISRCs to MusicBrainz with kepstin's MagicISRC";
    isrcButton.innerHTML = '<span>Submit ISRCs</span>';

    isrcForm.appendChild(isrcButton);
    isrcForm.addEventListener('click', (event: Event) => {
        event.preventDefault();
        const query = [
            `edit-note=${encodeURIComponent(editNote)}`,
            ...isrcs.map((isrc, index) => (isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`)),
        ].join('&');
        window.open(`https://magicisrc.kepstin.ca?${query}`);
    });

    isrcItem.appendChild(isrcForm);

    const toolbarItems = [importItem, searchItem, isrcItem];

    waitForEl('[data-testid="toolbar"]', () => {
        const toolbar = document.querySelector<HTMLElement>('[data-testid="toolbar"]');
        if (toolbar) {
            toolbar.style.alignItems = 'center';
            toolbar.append(...toolbarItems);
        }
    });

    // Deezer Mobile is a completely different App, so we need to mount differently
    waitForEl('[data-tracking-label="main-CTA"]', () => {
        const cta = document.querySelector<HTMLElement>('[data-tracking-label="main-CTA"]');
        if (cta) {
            const mbUIContainer = document.createElement('div');
            mbUIContainer.style.cssText =
                'display: flex; flex-direction: row; flex-wrap: wrap; justify-content: center; width: 100%; gap: 4px;';
            mbUIContainer.append(...toolbarItems);
            cta.insertAdjacentElement('afterend', mbUIContainer);
        }
    });
}

function init(): void {
    // allow 1 second for Deezer SPA to initialize
    setTimeout(() => {
        MBImportStyle();
        const releaseUrl = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
        const releaseId = releaseUrl.replace(/^https?:\/\/www\.deezer\.com\/[^/]+\/album\//i, '');

        if (!releaseId || !/^\d+$/.test(releaseId)) {
            return;
        }

        void getDeezerReleaseData(releaseId, LOGGER)
            .then(data => {
                if (data) {
                    const { release, isrcs } = parseDeezerRelease(releaseUrl, data);
                    insertLink(release, releaseUrl, isrcs);
                }
            })
            .catch((err: unknown) => {
                LOGGER.error('Failed to parse release: ', err);
            });
    }, 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
