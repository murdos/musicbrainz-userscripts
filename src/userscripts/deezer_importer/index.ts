import { Logger, LogLevel } from '../../lib/logger';
import { MBImport } from '../../lib/mbimport';
import { MBImportStyle } from '../../lib/mbimportstyle';
import { getDeezerReleaseData } from './utils/getDeezerReleaseData';
import { parseDeezerRelease } from './utils/parseDeezerRelease';

const LOGGER = new Logger('deezer_importer', LogLevel.INFO);

function extractAlbumIdFromPath(pathname: string): string | null {
    const match = /(?:^|\/)(?:[a-z]{2}(?:-[a-z]{2})?\/)?album\/(\d+)/i.exec(pathname);
    return match?.[1] ?? null;
}

function waitForEl(selector: string, callback: () => void): void {
    if (document.querySelector(selector)) {
        callback();
    } else {
        setTimeout(() => {
            waitForEl(selector, callback);
        }, 100);
    }
}

function insertLink(releaseUrl: string, data: Parameters<typeof parseDeezerRelease>[1]): void {
    const { release, isrcs } = parseDeezerRelease(releaseUrl, data);
    const editNote = MBImport.makeEditNote(releaseUrl, 'Deezer');
    const parameters = MBImport.buildFormParameters(release, editNote);

    const mbUIContainer = document.createElement('div');
    mbUIContainer.style.display = 'none';
    mbUIContainer.style.flexDirection = 'row';
    mbUIContainer.style.alignItems = 'center';

    const formHTML = MBImport.buildFormHTML(parameters);
    const searchHTML = MBImport.buildSearchButton(release);

    mbUIContainer.innerHTML = `
        <div class="toolbar-item">${formHTML}</div>
        <div class="toolbar-item">${searchHTML}</div>
    `;

    const isrcItem = document.createElement('div');
    isrcItem.className = 'toolbar-item';

    const isrcForm = document.createElement('form');
    isrcForm.className = 'musicbrainz_import';

    const isrcButton = document.createElement('button');
    isrcButton.type = 'button';
    isrcButton.title = 'Submit ISRCs to MusicBrainz with kepstin’s MagicISRC';
    isrcButton.innerHTML = '<span>Submit ISRCs</span>';
    isrcButton.addEventListener('click', (event: Event) => {
        event.preventDefault();
        const queryParts = [`edit-note=${encodeURIComponent(editNote)}`];
        isrcs.forEach((isrc, index) => {
            queryParts.push(isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`);
        });
        window.open(`https://magicisrc.kepstin.ca?${queryParts.join('&')}`);
    });

    isrcForm.appendChild(isrcButton);
    isrcItem.appendChild(isrcForm);
    mbUIContainer.appendChild(isrcItem);

    waitForEl('[data-testid="toolbar"]', () => {
        const toolbar = document.querySelector<HTMLElement>('[data-testid="toolbar"]');
        if (toolbar) {
            toolbar.style.alignItems = 'center';
            toolbar.appendChild(mbUIContainer);
            mbUIContainer.style.display = 'flex';
        }
    });

    waitForEl('[data-tracking-label="main-CTA"]', () => {
        const cta = document.querySelector<HTMLElement>('[data-tracking-label="main-CTA"]');
        if (cta) {
            const mobileWrapper = document.createElement('div');
            mobileWrapper.style.cssText =
                'display: flex; flex-direction: row; flex-wrap: wrap; justify-content: center; width: 100%; gap: 4px;';
            mobileWrapper.appendChild(mbUIContainer);
            cta.insertAdjacentElement('afterend', mobileWrapper);
            mbUIContainer.style.display = 'flex';
        }
    });
}

function init(): void {
    const albumId = extractAlbumIdFromPath(window.location.pathname);
    if (!albumId) {
        return;
    }

    setTimeout(() => {
        MBImportStyle();
        const releaseUrl = window.location.href.split('?')[0]?.split('#')[0] ?? window.location.href;

        void getDeezerReleaseData(albumId, LOGGER)
            .then(data => {
                if (data) {
                    insertLink(releaseUrl, data);
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
