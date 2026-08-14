import { Logger, LogLevel } from '../../lib/logger';
import { MBImport } from '../../lib/mbimport';
import { MBImportStyle } from '../../lib/mbimportstyle';
import type { DeezerAlbum } from './types';
import { getDeezerReleaseData } from './utils/getDeezerReleaseData';
import { parseDeezerRelease } from './utils/parseDeezerRelease';

const LOGGER = new Logger('deezer_importer', LogLevel.INFO);

const MB_CONTAINER_ID = 'mb-script-button-container';
const MB_BARCODE_ID = 'mb-import-barcode';

function extractAlbumIdFromPath(pathname: string): string | null {
    const match = /(?:^|\/)(?:[a-z]{2}(?:-[a-z]{2})?\/)?album\/(\d+)/i.exec(pathname);
    return match?.[1] ?? null;
}

function waitForElement(selector: string, timeout = 10000): Promise<HTMLElement | null> {
    return new Promise(resolve => {
        const immediate = document.querySelector<HTMLElement>(selector);
        if (immediate) {
            resolve(immediate);
            return;
        }

        const observer = new MutationObserver(() => {
            const el = document.querySelector<HTMLElement>(selector);
            if (el) {
                observer.disconnect();
                clearTimeout(timer);
                resolve(el);
            }
        });

        const timer = setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

function buildUI(releaseUrl: string, data: DeezerAlbum): HTMLElement {
    const { release, isrcs, barcode } = parseDeezerRelease(releaseUrl, data);
    const editNote = MBImport.makeEditNote(releaseUrl, 'Deezer');
    const parameters = MBImport.buildFormParameters(release, editNote);

    const container = document.createElement('div');
    container.id = MB_CONTAINER_ID;
    container.className = 'musicbrainz-import toolbar-item-musicbrainz';
    container.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0;';

    container.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release);

    const harmonyHTML = MBImport.buildHarmonyButton({
        barcode,
        release_url: releaseUrl,
        variant: 'full',
    });
    container.insertAdjacentHTML('beforeend', harmonyHTML);

    const isrcForm = document.createElement('form');
    isrcForm.className = 'musicbrainz_import';
    isrcForm.innerHTML = `<button type="submit" title="Submit ISRCs to MusicBrainz with kepstin’s MagicISRC">
        <img src="https://magicisrc.kepstin.ca/favicon.svg" alt="MagicISRC icon" width="14" height="14" style="margin-right: 4px;" />
        Submit ISRCs
    </button>`;
    isrcForm.addEventListener('click', (event: Event) => {
        event.preventDefault();
        const queryParts = [`edit-note=${encodeURIComponent(editNote)}`];
        isrcs.forEach((isrc, index) => {
            queryParts.push(isrc == null ? `isrc${index + 1}=` : `isrc${index + 1}=${isrc}`);
        });
        window.open(`https://magicisrc.kepstin.ca?${queryParts.join('&')}`);
    });
    container.appendChild(isrcForm);

    if (barcode) {
        const barcodeBadge = document.createElement('span');
        barcodeBadge.id = MB_BARCODE_ID;
        barcodeBadge.style.cssText =
            'font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(120, 120, 120, 0.15); color: inherit; font-family: monospace; align-self: center;';
        barcodeBadge.textContent = `Barcode: ${barcode}`;
        container.appendChild(barcodeBadge);
    }

    return container;
}

async function init(): Promise<void> {
    const albumId = extractAlbumIdFromPath(window.location.pathname);
    if (!albumId) {
        return;
    }

    MBImportStyle();
    const releaseUrl = window.location.href.split('?')[0]?.split('#')[0] ?? window.location.href;

    try {
        const data = await getDeezerReleaseData(albumId, LOGGER);
        if (!data) {
            return;
        }
        const container = buildUI(releaseUrl, data);

        const desktopToolbar = await waitForElement(
            '[data-testid="toolbar"], #page_content [data-testid="masthead"] ~ div [role="group"]',
            5000,
        );
        if (desktopToolbar) {
            desktopToolbar.style.alignItems = 'center';
            desktopToolbar.appendChild(container);
            return;
        }

        const mobileContainer = await waitForElement('[data-tracking-label="main-CTA"]', 3000);
        if (mobileContainer) {
            const mobileWrapper = document.createElement('div');
            mobileWrapper.style.cssText = 'display: flex; justify-content: center; width: 100%; margin-top: 8px;';
            mobileWrapper.appendChild(container);
            mobileContainer.insertAdjacentElement('afterend', mobileWrapper);
        }
    } catch (err) {
        LOGGER.error('Failed to load Deezer release data:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => void init(), 1000);
    });
} else {
    setTimeout(() => void init(), 1000);
}
