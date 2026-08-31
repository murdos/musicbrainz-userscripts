import { specialArtist } from '~/lib/mbimport/specialArtist';
import { URL_TYPES } from '~/lib/mbimport/urlTypes';
import type { ArtistCredit, Disc, Label, Release, Track, URL } from '~/types/importers';

import type { DeezerAlbum, ParsedDeezerRelease } from '../types';

export function parseDeezerRelease(releaseUrl: string, data: DeezerAlbum): ParsedDeezerRelease {
    const releaseDate = (data.release_date || '').split('-');
    const year = parseInt(releaseDate[0] || '', 10);
    const month = parseInt(releaseDate[1] || '', 10);
    const day = parseInt(releaseDate[2] || '', 10);

    const artist_credit: ArtistCredit[] = [];
    const urls: URL[] = [
        {
            link_type: URL_TYPES.stream_for_free,
            url: releaseUrl,
        },
    ];
    const labels: Label[] = data.label ? [{ name: data.label }] : [];
    const discs: Disc[] = [];

    const release: Release = {
        artist_credit,
        title: data.title,
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: data.record_type,
        urls,
        labels,
        discs,
    };

    if (!Number.isNaN(year)) {
        release.year = year;
    }
    if (!Number.isNaN(month)) {
        release.month = month;
    }
    if (!Number.isNaN(day)) {
        release.day = day;
    }
    if (data.upc) {
        release.barcode = data.upc;
    }

    const isrcs: (string | null)[] = [];

    const contributors = data.contributors || [];
    contributors.forEach((contributor, index) => {
        if (contributor.role !== 'Main') return;

        let ac: ArtistCredit = {
            artist_name: contributor.name,
            joinphrase: index === contributors.length - 1 ? '' : ', ',
        };

        if (contributor.name === 'Various Artists') {
            ac = specialArtist('various_artists', ac);
        }

        artist_credit.push(ac);
    });

    for (const track of data.tracks.data) {
        const mbTrack: Track = {
            number: track.track_position,
            title: track.title_short,
            duration: track.duration * 1000,
            artist_credit: [{ artist_name: track.artist.name }],
        };

        if (track.isrc) isrcs.push(track.isrc);
        else isrcs.push(null);

        // ignore pointless "(Original Mix)" in title version
        if (track.title_version && !/^\s*\(Original Mix\)\s*$/i.test(track.title_version)) {
            mbTrack.title += ` ${track.title_version}`;
        }

        const diskNumber = track.disk_number || 1;
        while (discs.length < diskNumber) {
            discs.push({
                format: 'Digital Media',
                title: '',
                tracks: [],
            });
        }

        const currentDisc = discs[diskNumber - 1];
        if (currentDisc) {
            currentDisc.tracks.push(mbTrack);
        }
    }

    return { release, isrcs };
}
