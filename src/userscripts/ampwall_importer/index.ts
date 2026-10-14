import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';
import type { ArtistCredit, Disc, Label, Release, Track, URL } from '~/types/importers';

import type { AmpwallReleaseData } from './types';

const LOGGER = new Logger('ampwall_importer', LogLevel.INFO);

function onLoad(): void {
    MBImportStyle();
    const release = retrieveReleaseInfo();
    if (release) {
        insertLink(release);
    }
}

function getArtistCredit(json: AmpwallReleaseData): ArtistCredit[] {
    return MBImport.makeArtistCredits([json.byArtist.name]);
}

function getFormat(): string {
    // We only support digital downloads right now.
    return 'Digital Media';
}

function getPackaging(): string {
    // We only support digital downloads right now.
    return 'None';
}

function getReleaseType(): string {
    // It appears that Ampwall treats all releases as albums so just
    // return nothing for now and let the user decide.
    return '';
}

function getTitle(json: AmpwallReleaseData): string {
    const albumRelease = json.albumRelease[0];
    return albumRelease ? albumRelease.name : '';
}

function getLabels(): Label[] {
    // TODO this will probably explode on releases with multiple labels.
    const labels = document.querySelector('div[data-testid=labels-links] a');
    if (labels === null) {
        return [];
    }
    return [
        {
            name: labels.textContent ?? '',
            catno: '',
        },
    ];
}

function getDiscs(json: AmpwallReleaseData): Disc[] {
    const tracks: Track[] = json.track.itemListElement.map(track => ({
        artist_credit: MBImport.makeArtistCredits([json.byArtist.name]),
        title: track.name,
        duration: parseDuration(track.duration),
    }));
    return [
        {
            tracks,
            format: getFormat(),
        },
    ];
}

function getURLs(json: AmpwallReleaseData): URL[] {
    return [
        {
            url: json.url,
            link_type: MBImport.URL_TYPES.purchase_for_download,
        },
    ];
}

function parseDuration(s: string): string {
    // Durations are returned in the format "PT0H0M7S". Strip out the
    // leading/trailing characters and convert the rest to colons.
    return s.replace(/(^PT)|(S$)/g, '').replace(/[HM]/g, ':');
}

function retrieveReleaseInfo(): Release | undefined {
    const script = document.querySelector("script[type='application/ld+json']");
    if (!script?.textContent) {
        return undefined;
    }
    const json = JSON.parse(script.textContent) as AmpwallReleaseData;
    const releaseDate = new Date(json.datePublished);
    const release: Release = {
        artist_credit: getArtistCredit(json),
        title: getTitle(json),
        year: releaseDate.getUTCFullYear(),
        month: releaseDate.getUTCMonth() + 1,
        day: releaseDate.getUTCDate(),
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: getReleaseType(),
        urls: getURLs(json),
        labels: getLabels(),
        discs: getDiscs(json),
        packaging: getPackaging(),
        format: getFormat(),
    };
    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page
function insertLink(release: Release): void {
    const editNote = MBImport.makeEditNote(window.location.href, 'Ampwall');
    const div = document.createElement('div');

    const formButton = document.createElement('span');
    formButton.className = 'tab-title musicbrainz-import';
    formButton.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, editNote));
    formButton.style.display = 'inline-block';

    const searchButton = document.createElement('span');
    searchButton.className = 'tab-title musicbrainz-import';
    searchButton.innerHTML = MBImport.buildSearchButton(release);
    searchButton.style.display = 'inline-block';

    div.appendChild(formButton);
    div.appendChild(searchButton);

    // Set a slight delay to stop breaking React/Next.
    window.setTimeout(() => {
        const container = document.querySelector('div.d_flex.ai_center.flex-wrap_wrap.gap_space1');
        if (container) {
            container.appendChild(formButton);
            container.appendChild(searchButton);
        }
    }, 2000);
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
