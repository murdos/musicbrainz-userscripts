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

    it.each(['Andy Leech x Emiliano Secchi', 'Andy Leech × Emiliano Secchi'])(
        'splits %j using the multiplication sign as the join phrase',
        artist => {
            expect(makeArtistCredits([artist])).toEqual([
                { artist_name: 'Andy Leech', joinphrase: ' × ' },
                { artist_name: 'Emiliano Secchi', joinphrase: '' },
            ]);
        },
    );

    it('preserves surrounding join phrases when splitting multiple collaborations', () => {
        expect(makeArtistCredits(['Artist 1 x Artist 2 x Artist 3 feat. Artist 4', 'Artist 5'])).toEqual([
            { artist_name: 'Artist 1', joinphrase: ' × ' },
            { artist_name: 'Artist 2', joinphrase: ' × ' },
            { artist_name: 'Artist 3', joinphrase: ' feat. ' },
            { artist_name: 'Artist 4', joinphrase: ' & ' },
            { artist_name: 'Artist 5' },
        ]);
    });

    it.each(['Axwell', 'deadmau5xKaskade', 'Artist xName', 'Artistx Name', 'X Ambassadors'])(
        'preserves %j without a spaced lowercase x separator',
        artist => {
            expect(makeArtistCredits([artist])).toEqual([{ artist_name: artist }]);
        },
    );

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
