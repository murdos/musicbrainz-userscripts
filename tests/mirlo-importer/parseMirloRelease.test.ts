import { describe, expect, it } from 'vitest';

import { parseMirloRelease } from '~/userscripts/mirlo_importer/parseMirloRelease';
import type { MirloTrackGroup } from '~/userscripts/mirlo_importer/types';

const trackGroup: MirloTrackGroup = {
    id: 1183,
    title: 'Outside, Vol. 3',
    about: 'Music created with and inspired by field recordings.  ',
    credits: 'Written, recorded, produced, & mastered by Michael Southard\nArtwork by Michael Southard',
    type: null,
    releaseDate: '2024-09-06T13:51:53.584Z',
    publishedAt: '2024-09-06T13:51:53.584Z',
    isGettable: true,
    catalogNumber: null,
    artist: { name: 'Time Rival' },
    tracks: [
        {
            id: 2,
            order: 2,
            title: 'Evening Heat + Crickets',
            isrc: 'US-ABC-24-00002',
            audio: { duration: 301 },
            trackArtists: [],
            license: null,
        },
        {
            id: 1,
            order: 1,
            title: 'Campground + Timestretch Artifact Groove',
            isrc: null,
            audio: { duration: 410.4 },
            trackArtists: [
                { artistName: 'Guest B', isCoAuthor: true, order: 2 },
                { artistName: 'Guest A', isCoAuthor: true, order: 1 },
                { artistName: 'Producer', isCoAuthor: false, order: 0 },
            ],
            license: null,
        },
    ],
};

describe('parseMirloRelease', () => {
    it('maps and orders Mirlo release data', () => {
        const { release, isrcs } = parseMirloRelease('https://mirlo.space/timerival/release/outside-vol-3', trackGroup);

        expect(release).toMatchObject({
            title: 'Outside, Vol. 3',
            artist_credit: [{ artist_name: 'Time Rival' }],
            year: 2024,
            month: 9,
            day: 6,
            annotation:
                '=== Credits from Mirlo ===\n\nWritten, recorded, produced, & mastered by Michael Southard\nArtwork by Michael Southard\n\n=== About from Mirlo ===\n\nMusic created with and inspired by field recordings.',
            type: 'EP',
            packaging: 'None',
            country: 'XW',
            status: 'official',
            urls: [
                {
                    url: 'https://mirlo.space/timerival/release/outside-vol-3',
                    link_type: 74,
                },
            ],
        });
        expect(release.discs).toEqual([
            {
                format: 'Digital Media',
                tracks: [
                    {
                        artist_credit: [{ artist_name: 'Guest A', joinphrase: ' & ' }, { artist_name: 'Guest B' }],
                        title: 'Campground + Timestretch Artifact Groove',
                        number: 1,
                        duration: 410400,
                    },
                    {
                        artist_credit: [{ artist_name: 'Time Rival' }],
                        title: 'Evening Heat + Crickets',
                        number: 2,
                        duration: 301000,
                    },
                ],
            },
        ]);
        expect(isrcs).toEqual([null, 'US-ABC-24-00002']);
    });

    it('prefers an explicit type and only imports a common release-wide license', () => {
        const licensed: MirloTrackGroup = {
            ...trackGroup,
            type: 'LP',
            tracks: trackGroup.tracks.map(track => ({
                ...track,
                license: { link: 'https://creativecommons.org/licenses/by/4.0/' },
            })),
        };
        const { release } = parseMirloRelease('https://mirlo.space/artist/release/release', licensed);

        expect(release.type).toBe('album');
        expect(release.urls).toContainEqual({
            url: 'https://creativecommons.org/licenses/by/4.0/',
            link_type: 301,
        });
    });

    it('escapes square brackets in annotations', () => {
        const { release } = parseMirloRelease('https://mirlo.space/artist/release/release', {
            ...trackGroup,
            credits: null,
            about: 'Released as [name your price].',
        });

        expect(release.annotation).toBe('=== About from Mirlo ===\n\nReleased as &#91;name your price&#93;.');
    });

    it('captures Mirlo genres in the annotation', () => {
        const { release } = parseMirloRelease('https://mirlo.space/timerival/release/cooked', {
            ...trackGroup,
            credits: null,
            about: null,
            tags: ['idm', 'ambient-electronic', 'experimental-electronic', 'leftfield', 'idm', '  '],
        });

        expect(release.annotation).toBe('=== Genres from Mirlo ===\n\nidm, ambient-electronic, experimental-electronic, leftfield');
    });
});
