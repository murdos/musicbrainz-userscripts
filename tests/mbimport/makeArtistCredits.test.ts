import { describe, expect, it } from 'vitest';

import { makeArtistCredits } from '~/lib/mbimport/makeArtistCredits';

const VARIOUS_ARTISTS_MBID = '89ad4ac3-39f7-470e-963a-56509c546377';

describe('makeArtistCredits', () => {
    it('splits and normalizes featured artists', () => {
        expect(makeArtistCredits(['shelovesmolly feat grimslilreaper'])).toEqual([
            { artist_name: 'shelovesmolly', joinphrase: ' feat. ' },
            { artist_name: 'grimslilreaper', joinphrase: '' },
        ]);
    });

    it.each([
        ['Artist 1 / Artist 2', ' / '],
        ['Artist 1 & Artist 2', ' & '],
    ])('splits %j using its original join phrase', (artist, joinphrase) => {
        expect(makeArtistCredits([artist])).toEqual([
            { artist_name: 'Artist 1', joinphrase },
            { artist_name: 'Artist 2', joinphrase: '' },
        ]);
    });

    it('handles multiple kinds of join phrase in one credit', () => {
        expect(makeArtistCredits(['Artist 1 / Artist 2 feat. Artist 3 & Artist 4'])).toEqual([
            { artist_name: 'Artist 1', joinphrase: ' / ' },
            { artist_name: 'Artist 2', joinphrase: ' feat. ' },
            { artist_name: 'Artist 3', joinphrase: ' & ' },
            { artist_name: 'Artist 4', joinphrase: '' },
        ]);
    });

    it.each(['Various', 'VA', 'V.A', 'V.A.', 'Various Artist', 'Various Artists', 'various artists'])(
        'maps %j to the canonical Various Artists entity',
        artist => {
            expect(makeArtistCredits([artist])).toEqual([
                {
                    artist_name: 'Various Artists',
                    credited_name: '',
                    joinphrase: '',
                    mbid: VARIOUS_ARTISTS_MBID,
                },
            ]);
        },
    );

    it('retains the join phrase when a Various Artists alias is one part of a credit', () => {
        expect(makeArtistCredits(['VA / Artist 2'])).toEqual([
            {
                artist_name: 'Various Artists',
                credited_name: '',
                joinphrase: ' / ',
                mbid: VARIOUS_ARTISTS_MBID,
            },
            { artist_name: 'Artist 2', joinphrase: '' },
        ]);
    });

    it('does not split slash or ampersand characters without surrounding spaces', () => {
        expect(makeArtistCredits(['AC/DC', 'R&B'])).toEqual([{ artist_name: 'AC/DC', joinphrase: ' & ' }, { artist_name: 'R&B' }]);
    });
});
