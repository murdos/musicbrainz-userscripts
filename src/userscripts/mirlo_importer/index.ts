import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';
import type { MBLinks } from '~/lib/mblinks';
import { subscribeToSPANavigation } from '~/lib/shared/spa-navigation';

import { initMirloLinking } from './linking';
import { parseMirloRelease } from './parseMirloRelease';
import type { MirloTrackGroupResponse } from './types';

const LOGGER = new Logger('mirlo_importer', LogLevel.INFO);
const CONTAINER_ID = 'musicbrainz-mirlo-import';
const STYLE_ID = 'musicbrainz-mirlo-import-style';

let currentRunId = 0;
let mirloLinks: MBLinks | undefined;

function releaseRoute(): { artistSlug: string; releaseSlug: string } | undefined {
    const match = /^\/([^/]+)\/release\/([^/]+)\/?$/.exec(window.location.pathname);
    if (!match?.[1] || !match[2]) return undefined;
    return { artistSlug: decodeURIComponent(match[1]), releaseSlug: decodeURIComponent(match[2]) };
}

function canonicalReleaseUrl(): string {
    return `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
}

function canonicalArtistUrl(): string | undefined {
    const artistSlug = /^\/([^/]+)/.exec(window.location.pathname)?.[1];
    return artistSlug ? `${window.location.origin}/${artistSlug}` : undefined;
}

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${CONTAINER_ID} {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px 10px;
            max-width: 100%;
            box-sizing: border-box;
            margin-block-start: 10px;
            color: inherit;
            font: 12px Arial, sans-serif;
        }
        #${CONTAINER_ID} .mb-mirlo-title { font-weight: bold; }
        #${CONTAINER_ID} .mb-mirlo-status,
        #${CONTAINER_ID} .mb-mirlo-meta { color: var(--mi-secondary-text-color, #888); }
        #${CONTAINER_ID} .mb-mirlo-status.mb-mirlo-error { color: #a33; }
        #${CONTAINER_ID} .mb-mirlo-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
        #${CONTAINER_ID} .mb-mirlo-buttons form { margin: 0; }
        .mb-mirlo-link.mb_valign {
            margin-inline-end: 4px;
            vertical-align: middle;
        }
        .mb-mirlo-link a.mb_search_link { color: #888; }
        .mb-mirlo-link.mb_searchit a.mb_search_link:hover { color: darkblue; }
        .mb-mirlo-card-entity {
            display: flex;
            flex-direction: row;
            align-items: center;
            min-width: 0;
        }
        .mb-mirlo-card-entity > .mb-mirlo-link { flex: none; }
        .mb-mirlo-card-entity > a { min-width: 0; }
        #${CONTAINER_ID}.mb-mirlo-floating {
            position: absolute;
            top: 76px;
            right: 16px;
            z-index: 2147483646;
            max-width: min(360px, calc(100vw - 32px));
            padding: 10px 12px;
            border: 1px solid rgba(120, 120, 120, 0.6);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.97);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            color: #222;
        }
    `;
    document.head.appendChild(style);
}

function findMountPoint(releaseTitle?: string): HTMLElement | undefined {
    const headings = document.querySelectorAll<HTMLElement>('#main-content h1');
    const heading = [...headings].find(candidate => {
        if (!releaseTitle) return true;
        const copy = candidate.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('.mb-mirlo-link').forEach(link => link.remove());
        return copy.textContent.trim() === releaseTitle;
    });
    return heading?.parentElement?.parentElement ?? undefined;
}

const wait = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForMountPoint(releaseTitle: string, runId: number): Promise<HTMLElement | undefined> {
    for (let attempt = 0; attempt < 40 && runId === currentRunId; attempt++) {
        const mountPoint = findMountPoint(releaseTitle);
        if (mountPoint) return mountPoint;
        await wait(100);
    }
    return undefined;
}

function createContainer(mountPoint?: HTMLElement): HTMLElement {
    document.getElementById(CONTAINER_ID)?.remove();
    const container = document.createElement('aside');
    container.id = CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.innerHTML = '<div class="mb-mirlo-title">MusicBrainz</div><div class="mb-mirlo-status">Loading Mirlo release data…</div>';
    if (mountPoint) {
        mountPoint.appendChild(container);
    } else {
        container.classList.add('mb-mirlo-floating');
        document.body.appendChild(container);
    }
    return container;
}

function renderError(container: HTMLElement, message: string): void {
    const status = container.querySelector<HTMLElement>('.mb-mirlo-status');
    if (status) {
        status.classList.add('mb-mirlo-error');
        status.textContent = message;
    }
}

function isTrackGroupResponse(value: unknown): value is MirloTrackGroupResponse {
    if (!value || typeof value !== 'object') return false;
    const result = (value as Record<string, unknown>)['result'];
    if (!result || typeof result !== 'object') return false;
    const release = result as Record<string, unknown>;
    const artist = release['artist'];
    return (
        typeof release['title'] === 'string' &&
        Array.isArray(release['tracks']) &&
        typeof artist === 'object' &&
        artist !== null &&
        typeof (artist as Record<string, unknown>)['name'] === 'string'
    );
}

async function fetchTrackGroup(artistSlug: string, releaseSlug: string): Promise<MirloTrackGroupResponse> {
    const endpoint = new URL(`/v1/trackGroups/${encodeURIComponent(releaseSlug)}/`, window.location.origin);
    endpoint.searchParams.set('artistId', artistSlug);
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Mirlo API returned HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!isTrackGroupResponse(data)) throw new Error('Mirlo API returned an unexpected response');
    return data;
}

function magicISRCForm(isrcs: (string | null)[], editNote: string): HTMLFormElement | undefined {
    if (!isrcs.some(Boolean)) return undefined;
    const form = document.createElement('form');
    form.className = 'musicbrainz_import';
    form.innerHTML = '<button type="submit" title="Submit ISRCs to MusicBrainz with MagicISRC">Submit ISRCs</button>';
    form.addEventListener('submit', event => {
        event.preventDefault();
        const query = new URLSearchParams({ 'edit-note': editNote });
        isrcs.forEach((isrc, index) => query.set(`isrc${index + 1}`, isrc ?? ''));
        window.open(`https://magicisrc.kepstin.ca?${query.toString()}`, '_blank', 'noopener');
    });
    return form;
}

function populateArtistMbid(mbid: string): void {
    const form = document.querySelector<HTMLFormElement>(`#${CONTAINER_ID} form.musicbrainz_import_add`);
    const releaseArtist = form?.querySelector<HTMLInputElement>('input[name="artist_credit.names.0.artist.name"]');
    if (!form || !releaseArtist) return;

    form.querySelectorAll<HTMLInputElement>('input[name$=".artist.name"]').forEach(artistNameInput => {
        if (artistNameInput.value !== releaseArtist.value) return;
        const mbidParameterName = artistNameInput.name.replace(/\.artist\.name$/, '.mbid');
        const existingInput = [...form.elements].find(
            element => element instanceof HTMLInputElement && element.name === mbidParameterName,
        ) as HTMLInputElement | undefined;
        const mbidInput = existingInput ?? document.createElement('input');
        mbidInput.type = 'hidden';
        mbidInput.name = mbidParameterName;
        mbidInput.value = mbid;
        if (!existingInput) form.appendChild(mbidInput);
    });
}

function handleEntityMatch(type: string, url: string, mbid: string): void {
    if (type === 'artist' && url === canonicalArtistUrl()) populateArtistMbid(mbid);
}

async function processPage(): Promise<void> {
    const runId = ++currentRunId;
    document.getElementById(CONTAINER_ID)?.remove();
    const route = releaseRoute();
    if (!route) return;

    try {
        const data = await fetchTrackGroup(route.artistSlug, route.releaseSlug);
        if (runId !== currentRunId) return;
        const mountPoint = await waitForMountPoint(data.result.title, runId);
        if (runId !== currentRunId) return;
        if (!mountPoint) LOGGER.error('Could not find the Mirlo release heading; using the floating fallback');
        const container = createContainer(mountPoint);

        const releaseUrl = canonicalReleaseUrl();
        const { release, isrcs } = parseMirloRelease(releaseUrl, data.result);
        const editNote = MBImport.makeEditNote(releaseUrl, 'Mirlo');
        const buttons = document.createElement('div');
        buttons.className = 'mb-mirlo-buttons';
        buttons.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, editNote)) + MBImport.buildSearchButton(release);
        const isrcForm = magicISRCForm(isrcs, editNote);
        if (isrcForm) buttons.appendChild(isrcForm);

        container.replaceChildren();
        const title = document.createElement('div');
        title.className = 'mb-mirlo-title';
        title.textContent = 'MusicBrainz';
        const meta = document.createElement('div');
        meta.className = 'mb-mirlo-meta';
        meta.textContent = `${release.discs[0]?.tracks.length ?? 0} tracks · Digital Media`;
        container.append(title, meta, buttons);

        const artistUrl = canonicalArtistUrl();
        const artistMbid = artistUrl ? mirloLinks?.resolveMBID(`artist:${artistUrl}`) : undefined;
        if (artistMbid) populateArtistMbid(artistMbid);
    } catch (error) {
        if (runId !== currentRunId) return;
        LOGGER.error('Failed to import Mirlo release:', error);
        const mountPoint = findMountPoint();
        renderError(createContainer(mountPoint), error instanceof Error ? error.message : 'Could not load this Mirlo release.');
    }
}

function init(): void {
    MBImportStyle();
    ensureStyles();
    mirloLinks = initMirloLinking(handleEntityMatch);
    void processPage();
    subscribeToSPANavigation({ onNavigate: processPage });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
