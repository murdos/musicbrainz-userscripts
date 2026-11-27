import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle } from '~/lib/mbimportstyle';
import type { ArtistCredit, Disc, Label, Release, Track, URL } from '~/types/importers';

import type { SubvertNextData, SubvertPageProps } from './types';

const LOGGER = new Logger('subvert_importer', LogLevel.INFO);

function onLoad(): void {
    MBImportStyle();
    const release = retrieveReleaseInfo();
    if (release) {
        insertLink(release, window.location.href);
    }
}

function getArtistCredit(data: SubvertPageProps): ArtistCredit[] {
    const artists = data.release.artists.map(artist => artist.name);
    return MBImport.makeArtistCredits(artists);
}

function getFormat(): string {
    // We only support digital downloads right now.
    return 'Digital Media';
}

function getPackaging(): string {
    // We only support digital downloads right now.
    return 'None';
}

function getReleaseType(data: SubvertPageProps): string {
    return data.release.releaseType;
}

function getTitle(data: SubvertPageProps): string {
    return data.release.name;
}

function getLabels(data: SubvertPageProps): Label[] {
    return data.release.labelsOnReleases.map(label => ({
        name: label.label.name,
        catno: label.catalogNumber,
    }));
}

function getDiscs(data: SubvertPageProps): Disc[] {
    const tracks: Track[] = data.release.tracks.map(track => {
        const artists = track.track.artists.map(artist => artist.name);
        return {
            artist_credit: MBImport.makeArtistCredits(artists),
            title: track.track.name,
            duration: track.track.duration * 1000,
        };
    });
    return [
        {
            tracks,
            format: getFormat(),
        },
    ];
}

function getURLs(data: SubvertPageProps, url: string): URL[] {
    const urls: URL[] = [];
    if (data.release.isDownloadAllowed) {
        urls.push({
            url,
            link_type: MBImport.URL_TYPES.purchase_for_download,
        });
    }
    if (data.release.isStreamingAllowed) {
        urls.push({
            url,
            link_type: MBImport.URL_TYPES.stream_for_free,
        });
    }
    if (data.release.priceCents > 0) {
        urls.push({
            url,
            link_type: MBImport.URL_TYPES.download_for_free,
        });
    }
    return urls;
}

function retrieveReleaseInfo(): Release | undefined {
    const script = document.querySelector('script#__NEXT_DATA__');
    if (!script?.textContent) {
        return undefined;
    }
    const json = JSON.parse(script.textContent) as SubvertNextData;

    // Skip non-release pages
    if (json.page !== '/[artistSlug]/[releaseSlug]') {
        return undefined;
    }

    const data = json.props.pageProps;
    const releaseDate = new Date(data.release.releaseDate);
    const release: Release = {
        artist_credit: getArtistCredit(data),
        title: getTitle(data),
        year: releaseDate.getUTCFullYear(),
        month: releaseDate.getUTCMonth() + 1,
        day: releaseDate.getUTCDate(),
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: getReleaseType(data),
        urls: getURLs(data, window.location.href),
        labels: getLabels(data),
        discs: getDiscs(data),
        packaging: getPackaging(),
        format: getFormat(),
    };
    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page
function insertLink(release: Release, url: string): void {
    const editNote = MBImport.makeEditNote(url, 'Subvert');
    const container = document.querySelector('div.releaseRailMetaWrapper.leftRail.hideMobile');
    if (!container) {
        return;
    }
    const sourceNode = container.children[container.children.length - 3];
    if (!sourceNode) {
        return;
    }
    const importContainer = sourceNode.cloneNode(true) as Element;
    const formTarget = importContainer.children[0];
    const searchTarget = importContainer.children[1];
    if (formTarget) {
        formTarget.innerHTML = MBImport.buildFormHTML(MBImport.buildFormParameters(release, editNote));
    }
    if (searchTarget) {
        searchTarget.innerHTML = MBImport.buildSearchButton(release);
    }
    sourceNode.after(importContainer);
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
