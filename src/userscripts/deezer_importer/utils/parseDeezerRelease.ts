import { specialArtist } from '../../../lib/mbimport/specialArtist';
import { URL_TYPES } from '../../../lib/mbimport/urlTypes';
import type { ArtistCredit, Release, Track } from '../../../types/importers';
import type { DeezerAlbum, ParsedDeezerRelease } from '../types';

/**
 * Formats track title matching legacy behavior: appends title_version (if present and not "(Original Mix)").
 */
export function formatTrackTitle(titleShort: string, titleVersion?: string): string {
    let title = titleShort;
    if (titleVersion && !/^\s*\(Original Mix\)\s*$/i.test(titleVersion)) {
        title += ` ${titleVersion}`;
    }
    return title;
}

/**
 * Extracts and maps Deezer album and track metadata into MusicBrainz release structure.
 */
export function parseDeezerRelease(releaseUrl: string, data: DeezerAlbum): ParsedDeezerRelease {
    const releaseDate = (data.release_date || '').split('-');
    const year = parseInt(releaseDate[0] || '0', 10) || undefined;
    const month = parseInt(releaseDate[1] || '0', 10) || undefined;
    const day = parseInt(releaseDate[2] || '0', 10) || undefined;

    const release: Release = {
        artist_credit: [],
        title: data.title,
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: data.record_type,
        urls: [
            {
                link_type: URL_TYPES.stream_for_free,
                url: releaseUrl,
            },
        ],
        labels: data.label ? [{ name: data.label }] : [],
        discs: [],
    };

    if (year !== undefined) {
        release.year = year;
    }
    if (month !== undefined) {
        release.month = month;
    }
    if (day !== undefined) {
        release.day = day;
    }
    if (data.upc) {
        release.barcode = data.upc;
    }

    const isrcs: (string | null)[] = [];

    // Map release contributors
    const contributors = (data.contributors || []).filter(c => c.role === 'Main');
    contributors.forEach((contributor, index) => {
        let ac: ArtistCredit = {
            artist_name: contributor.name,
            joinphrase: index === contributors.length - 1 ? '' : ', ',
        };

        if (contributor.name === 'Various Artists') {
            ac = specialArtist('various_artists', ac);
        }

        release.artist_credit.push(ac);
    });

    // Fallback if no main contributors found
    if (release.artist_credit.length === 0 && data.artist) {
        let ac: ArtistCredit = {
            artist_name: data.artist.name,
            joinphrase: '',
        };
        if (data.artist.name === 'Various Artists') {
            ac = specialArtist('various_artists', ac);
        }
        release.artist_credit.push(ac);
    }

    const tracksData = data.tracks.data;
    for (const track of tracksData) {
        isrcs.push(track.isrc || null);

        const trackTitle = formatTrackTitle(track.title_short, track.title_version);
        const mbTrack: Track = {
            number: track.track_position,
            title: trackTitle,
            duration: Math.round(track.duration * 1000),
            artist_credit: [{ artist_name: track.artist.name }],
        };

        const diskNumber = track.disk_number || 1;
        while (release.discs.length < diskNumber) {
            release.discs.push({
                format: 'Digital Media',
                title: '',
                tracks: [],
            });
        }

        const currentDisc = release.discs[diskNumber - 1];
        if (currentDisc) {
            currentDisc.tracks.push(mbTrack);
        }
    }

    return {
        release,
        isrcs,
        barcode: data.upc,
    };
}
