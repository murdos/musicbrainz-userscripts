import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DeezerAlbum } from '../../src/userscripts/deezer_importer/types';
import { formatTrackTitle, parseDeezerRelease } from '../../src/userscripts/deezer_importer/utils/parseDeezerRelease';

function loadFixture(albumId: string): DeezerAlbum {
    const fixturePath = path.resolve(__dirname, 'fixtures', `${albumId}.json`);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as DeezerAlbum;
}

describe('Deezer importer title formatting', () => {
    it('appends title_version unless it matches (Original Mix)', () => {
        expect(formatTrackTitle('Solaris', '(Original Mix)')).toBe('Solaris');
        expect(formatTrackTitle('Solaris', '  (original mix)  ')).toBe('Solaris');
        expect(formatTrackTitle('Solaris', 'Live at Wembley')).toBe('Solaris Live at Wembley');
        expect(formatTrackTitle('Solaris', '(Radio Edit)')).toBe('Solaris (Radio Edit)');
    });

    it('handles empty or missing version tags', () => {
        expect(formatTrackTitle('Solaris', undefined)).toBe('Solaris');
        expect(formatTrackTitle('Solaris', '')).toBe('Solaris');
    });
});

describe('Deezer release parser with real-world API fixtures', () => {
    it('parses real fixture 629506181 (Lady Gaga & Bruno Mars - Die With A Smile)', () => {
        const rawAlbum = loadFixture('629506181');
        const parsed = parseDeezerRelease('https://www.deezer.com/album/629506181', rawAlbum);

        expect(parsed.release.title).toBe('Die With A Smile');
        expect(parsed.release.type).toBe('single');
        expect(parsed.release.year).toBe(2024);
        expect(parsed.release.month).toBe(8);
        expect(parsed.release.day).toBe(16);
        expect(parsed.release.barcode).toBe('602475093060');
        expect(parsed.release.labels).toEqual([{ name: 'Interscope' }]);
        expect(parsed.release.artist_credit).toEqual([
            { artist_name: 'Lady Gaga', joinphrase: ', ' },
            { artist_name: 'Bruno Mars', joinphrase: '' },
        ]);
        expect(parsed.release.discs).toHaveLength(1);
        expect(parsed.release.discs[0]?.tracks).toHaveLength(1);
        expect(parsed.release.discs[0]?.tracks[0]?.title).toBe('Die With A Smile');
        expect(parsed.release.discs[0]?.tracks[0]?.duration).toBe(250000);
        expect(parsed.isrcs).toEqual(['USUM72409273']);
    });

    it('parses real fixture 302127 (Daft Punk - Discovery)', () => {
        const rawAlbum = loadFixture('302127');
        const parsed = parseDeezerRelease('https://www.deezer.com/album/302127', rawAlbum);

        expect(parsed.release.title).toBe('Discovery');
        expect(parsed.release.type).toBe('album');
        expect(parsed.release.year).toBe(2001);
        expect(parsed.release.month).toBe(3);
        expect(parsed.release.day).toBe(7);
        expect(parsed.release.labels).toEqual([{ name: 'Daft Life Ltd./ADA France' }]);
        expect(parsed.release.artist_credit).toEqual([{ artist_name: 'Daft Punk', joinphrase: '' }]);
        expect(parsed.release.discs).toHaveLength(1);
        expect(parsed.release.discs[0]?.tracks).toHaveLength(14);
        expect(parsed.release.discs[0]?.tracks[0]?.title).toBe('One More Time');
        expect(parsed.release.discs[0]?.tracks[1]?.title).toBe('Aerodynamic');
        expect(parsed.release.discs[0]?.tracks[2]?.title).toBe('Digital Love');
        expect(parsed.release.discs[0]?.tracks[3]?.title).toBe('Harder, Better, Faster, Stronger');
        expect(parsed.isrcs).toHaveLength(14);
        expect(parsed.isrcs[0]).toBe('GBDUW0000053');
    });

    it('parses real fixture 11591214 (Led Zeppelin - Led Zeppelin IV Remaster)', () => {
        const rawAlbum = loadFixture('11591214');
        const parsed = parseDeezerRelease('https://www.deezer.com/album/11591214', rawAlbum);

        expect(parsed.release.title).toBe('Led Zeppelin IV (Remaster)');
        expect(parsed.release.type).toBe('album');
        expect(parsed.release.year).toBe(1971);
        expect(parsed.release.barcode).toBe('603497898497');
        expect(parsed.release.labels).toEqual([{ name: 'Atlantic Records' }]);
        expect(parsed.release.artist_credit).toEqual([{ artist_name: 'Led Zeppelin', joinphrase: '' }]);
        expect(parsed.release.discs).toHaveLength(1);
        expect(parsed.release.discs[0]?.tracks).toHaveLength(8);
        expect(parsed.release.discs[0]?.tracks[0]?.title).toBe('Black Dog (Remaster)');
        expect(parsed.release.discs[0]?.tracks[3]?.title).toBe('Stairway to Heaven (Remaster)');
        expect(parsed.isrcs[0]).toBe('USAT21300956');
    });

    it('parses real fixture 115882092 (Grease Soundtrack - Various Artists compilation)', () => {
        const rawAlbum = loadFixture('115882092');
        const parsed = parseDeezerRelease('https://www.deezer.com/album/115882092', rawAlbum);

        expect(parsed.release.title).toBe('Grease (The Original Motion Picture Soundtrack)');
        expect(parsed.release.barcode).toBe('602508410161');
        expect(parsed.release.labels).toEqual([{ name: 'UMC (Universal Music Catalogue)' }]);
        expect(parsed.release.discs).toHaveLength(1);
        expect(parsed.release.discs[0]?.tracks).toHaveLength(24);
        expect(parsed.isrcs).toHaveLength(24);
    });
});
