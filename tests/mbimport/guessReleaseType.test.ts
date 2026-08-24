import { describe, expect, it } from 'vitest';

import { buildFormParameters } from '~/lib/mbimport/buildFormParameters';
import { guessReleaseType, type MBReleaseType } from '~/lib/mbimport/guessReleaseType';
import type { Release, Track } from '~/types/importers';

const minutes = (value: number): number => value * 60_000;

describe('guessReleaseType implementation', () => {
    describe('input validation', () => {
        it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid track count (%s)', numTracks => {
            expect(guessReleaseType('Release EP', numTracks, minutes(10), ['Release'])).toBe('');
        });

        it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1])(
            'treats an invalid duration (%s) as missing',
            duration => {
                expect(guessReleaseType('Release', 2, duration)).toBe('');
                expect(guessReleaseType('Release', 3, duration)).toBe('EP');
            },
        );
    });

    describe('explicit release-title tokens', () => {
        it.each(['Example EP', 'Example ep', 'EP: Example'])('honors the EP token in %j', title => {
            expect(guessReleaseType(title, 1, minutes(2))).toBe('EP');
        });

        it('does not mistake EP inside another word for a token', () => {
            expect(guessReleaseType('Deeper', 1, minutes(2))).toBe('single');
        });

        it('gives EP precedence when both explicit tokens occur', () => {
            expect(guessReleaseType('Example Single EP', 2, minutes(4), ['Example', 'Example (Remix)'])).toBe('EP');
        });

        it.each([
            ['Example Single', 8, Number.NaN],
            ['Example single', 2, minutes(50)],
        ] as const)('honors a plausible Single token in %j', (title, tracks, duration) => {
            expect(guessReleaseType(title, tracks, duration)).toBe('single');
        });

        it.each([
            ['Single File', 9, minutes(20), 'album'],
            ['The Single Thing', 3, minutes(51), 'album'],
        ] as const)('applies sanity limits to the common word “single” in %j', (title, tracks, duration, expected) => {
            expect(guessReleaseType(title, tracks, duration)).toBe(expected);
        });
    });

    describe('multi-track singles', () => {
        it.each([
            [['Song', 'Song (Jane Doe Remix)'], 'bracketed remix'],
            [['Song (Original Mix)', 'Song [Radio Edit]'], 'different brackets'],
            [['Song - Extended Version', 'Song — Instrumental'], 'dash suffixes'],
            [['SÓNG!', 'sóng (Live)'], 'case, Unicode and punctuation'],
            [['Song (feat. Singer) (Club Mix)', 'Song (feat Singer) [Dub]'], 'multiple qualifiers'],
        ] as const)('detects versions of one work using %s titles (%s)', (titles, description) => {
            expect(guessReleaseType('Release', titles.length, minutes(12), titles), description).toBe('single');
        });

        it('detects large remix bundles before applying the album track-count rule', () => {
            const titles = Array.from({ length: 10 }, (_, index) => `Song (Remix ${index + 1})`);
            expect(guessReleaseType('Release', titles.length, minutes(55), titles)).toBe('single');
        });

        it.each([
            [['First Song', 'Second Song'], 2, 'different base titles'],
            [['Song', 'Song (Part 2)'], 2, 'non-version qualifiers'],
            [['Song', 'Song (Remix)'], 3, 'an incomplete title list'],
            [['(Remix)', '[Live]'], 2, 'empty normalized titles'],
            [['Song'], 1, 'a one-track release'],
        ] as const)('does not deduplicate %s (%s)', (titles, count, description) => {
            expect(guessReleaseType('Release', count, minutes(10), titles), description).not.toBe('single');
        });
    });

    describe('count and duration fallback', () => {
        it.each([
            [1, Number.NaN, 'single'],
            [2, Number.NaN, ''],
            [3, Number.NaN, 'EP'],
            [6, Number.NaN, 'EP'],
            [7, Number.NaN, 'album'],
            [8, Number.NaN, 'album'],
            [1, minutes(0.999), ''],
            [1, minutes(1), 'single'],
            [6, minutes(7), 'single'],
            [2, minutes(7.001), 'EP'],
            [6, minutes(30), 'EP'],
            [1, minutes(15), ''],
            [1, minutes(30.001), 'album'],
            [6, minutes(30.001), 'album'],
            [7, minutes(5), 'album'],
            [8, minutes(31), 'album'],
        ] satisfies [number, number, MBReleaseType][])('%i tracks at %s ms returns %s', (tracks, duration, expected) => {
            expect(guessReleaseType('Release', tracks, duration)).toBe(expected);
        });
    });
});

describe('buildFormParameters release-type guessing', () => {
    const track = (title: string, duration?: string): Track => ({
        title,
        ...(duration === undefined ? {} : { duration }),
        artist_credit: [{ artist_name: 'Artist' }],
    });

    const release = (tracks: Track[]): Release => ({
        title: 'Release',
        artist_credit: [{ artist_name: 'Artist' }],
        discs: [{ format: 'Digital Media', tracks }],
    });

    it('uses title deduplication when some durations are missing', () => {
        const input = release([track('Song', '3:00'), track('Song (Remix)')]);
        const parameters = buildFormParameters(input);

        expect(input.type).toBe('single');
        expect(parameters).toContainEqual({ name: 'type', value: 'single' });
    });

    it('uses the no-duration count fallback during normal form building', () => {
        const input = release([track('One'), track('Two'), track('Three')]);
        buildFormParameters(input);

        expect(input.type).toBe('EP');
    });

    it('does not overwrite a type supplied by an importer', () => {
        const input = { ...release([track('Song'), track('Song (Remix)')]), type: 'EP' };
        buildFormParameters(input);

        expect(input.type).toBe('EP');
    });
});
