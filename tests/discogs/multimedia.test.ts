import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadParseDiscogsRelease } from './load-parser.ts';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const baseRelease = JSON.parse(fs.readFileSync(path.join(fixtures, '15771199.json'), 'utf8')) as Record<string, unknown>;
const parseRelease = loadParseDiscogsRelease();

type Medium = { format: string; tracks: { title: string }[] };

function parsePositions(positions: string[], formats: { name: string; qty: string; descriptions?: string[] }[]) {
    const input = {
        ...baseRelease,
        formats,
        tracklist: positions.map((position, index) => ({
            position,
            type_: 'track',
            title: `Track ${index + 1}`,
            duration: '',
        })),
    };

    return parseRelease(input)['discs'] as Medium[];
}

describe('Discogs medium splitting regression tests', () => {
    it('keeps 2 CDs and a DVD in tracklist order, not format-list order (release 38698680)', () => {
        // The API lists formats as 2xCD + 1xDVD, but tracks appear as CD1, DVD, CD2.
        const positions = [
            ...Array.from({ length: 16 }, (_, i) => `CD1-${i + 1}`),
            ...Array.from({ length: 17 }, (_, i) => `DVD-${i + 1}`),
            ...Array.from({ length: 11 }, (_, i) => `CD2-${i + 1}`),
        ];
        const discs = parsePositions(positions, [
            { name: 'CD', qty: '2', descriptions: ['Album'] },
            { name: 'DVD', qty: '1', descriptions: ['DVD-Video'] },
        ]);

        expect(discs.map(disc => disc.format)).toEqual(['CD', 'DVD-Video', 'CD']);
        expect(discs.map(disc => disc.tracks.length)).toEqual([16, 17, 11]);
        expect(discs[0]?.tracks[0]?.title).toBe('Track 1');
        expect(discs[1]?.tracks[0]?.title).toBe('Track 17');
        expect(discs[2]?.tracks[0]?.title).toBe('Track 34');
    });

    it.each([
        {
            name: 'two explicitly numbered CDs',
            positions: ['CD1-1', 'CD1-2', 'CD2-1'],
            formats: [{ name: 'CD', qty: '2' }],
            counts: [2, 1],
            mediaFormats: ['CD', 'CD'],
        },
        {
            name: 'two explicitly numbered DVDs',
            positions: ['DVD-1', 'DVD-2', 'DVD2-1'],
            formats: [{ name: 'DVD', qty: '2', descriptions: ['DVD-Video'] }],
            counts: [2, 1],
            mediaFormats: ['DVD-Video', 'DVD-Video'],
        },
        {
            name: 'numeric medium prefixes',
            positions: ['1-1', '1-2', '2-1'],
            formats: [{ name: 'CD', qty: '2' }],
            counts: [2, 1],
            mediaFormats: ['CD', 'CD'],
        },
        {
            name: 'sequential numbering reset',
            positions: ['1', '2', '3', '1', '2'],
            formats: [{ name: 'CD', qty: '2' }],
            counts: [3, 2],
            mediaFormats: ['CD', 'CD'],
        },
        {
            name: 'vinyl side numbering',
            positions: ['A1', 'B1', 'C1', 'D1'],
            formats: [{ name: 'Vinyl', qty: '2', descriptions: ['LP'] }],
            counts: [2, 2],
            mediaFormats: ['12" Vinyl', '12" Vinyl'],
        },
        {
            name: 'non-contiguous prefixed medium tracks',
            positions: ['CD1-1', 'DVD-1', 'CD2-1', 'DVD-2'],
            formats: [
                { name: 'CD', qty: '2' },
                { name: 'DVD', qty: '1', descriptions: ['DVD-Video'] },
            ],
            counts: [1, 2, 1],
            mediaFormats: ['CD', 'DVD-Video', 'CD'],
        },
    ])('$name', ({ positions, formats, counts, mediaFormats }) => {
        const discs = parsePositions(positions, formats);
        expect(discs.map(disc => disc.tracks.length)).toEqual(counts);
        expect(discs.map(disc => disc.format)).toEqual(mediaFormats);
    });
});
