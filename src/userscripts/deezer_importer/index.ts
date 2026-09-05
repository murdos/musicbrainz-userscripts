import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';
import { subscribeToSPANavigation } from '~/lib/shared/spa-navigation';

import { getDeezerReleaseData } from './utils/getDeezerReleaseData';
import { parseDeezerRelease } from './utils/parseDeezerRelease';

const LOGGER = new Logger('deezer_importer', LogLevel.INFO);

let currentRunId = 0;
let mountedElements: HTMLElement[] = [];

function cleanup(): void {
    mountedElements.forEach(el => {
        el.remove();
    });
    mountedElements = [];
}

function waitForEl(selector: string, runId: number, callback: (el: HTMLElement) => void): void {
    if (runId !== currentRunId) {
        return;
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
        callback(el);
    } else {
        setTimeout(() => {
            waitForEl(selector, runId, callback);
        }, 100);
    }
}

function insertLink(
    release: Parameters<typeof MBImport.buildFormParameters>[0],
    releaseUrl: string,
    isrcs: (string | null)[],
    runId: number,
): void {
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

    waitForEl('[data-testid="toolbar"]', runId, toolbar => {
        if (runId === currentRunId) {
            toolbar.style.alignItems = 'center';
            toolbar.append(...toolbarItems);
            mountedElements.push(...toolbarItems);
        }
    });

    // Deezer Mobile is a completely different App, so we need to mount differently
    waitForEl('[data-tracking-label="main-CTA"]', runId, cta => {
        if (runId === currentRunId) {
            const mbUIContainer = document.createElement('div');
            mbUIContainer.style.cssText =
                'display: flex; flex-direction: row; flex-wrap: wrap; justify-content: center; width: 100%; gap: 4px;';
            mbUIContainer.append(...toolbarItems);
            cta.insertAdjacentElement('afterend', mbUIContainer);
            mountedElements.push(mbUIContainer);
        }
    });
}

function processPage(): Promise<void> {
    const runId = ++currentRunId;
    cleanup();

    const releaseUrl = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
    const releaseId = releaseUrl.replace(/^https?:\/\/www\.deezer\.com\/[^/]+\/album\//i, '');

    if (!releaseId || !/^\d+$/.test(releaseId)) {
        return Promise.resolve();
    }

    return getDeezerReleaseData(releaseId, LOGGER)
        .then(data => {
            if (runId !== currentRunId) {
                return;
            }
            if (data) {
                const { release, isrcs } = parseDeezerRelease(releaseUrl, data);
                insertLink(release, releaseUrl, isrcs, runId);
            }
        })
        .catch((err: unknown) => {
            LOGGER.error('Failed to parse release: ', err);
        });
}

function init(): void {
    MBImportStyle();

    // allow 1 second for Deezer SPA to initialize
    setTimeout(() => {
        void processPage();
    }, 1000);

    subscribeToSPANavigation({
        onNavigate: () => processPage(),
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
