import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { DeezerAlbum, DeezerTracksResponse } from '../../src/userscripts/deezer_importer/types';

const ALBUM_IDS = [
    '629506181', // Lady Gaga & Bruno Mars - Die With A Smile (Single, 2 Main contributors)
    '302127', // Daft Punk - Discovery (Album, 14 tracks)
    '11591214', // Led Zeppelin - Led Zeppelin IV (Remaster)
    '115882092', // Grease (The Original Motion Picture Soundtrack) - Various Artists compilation
];

async function fetchDeezerAlbumFixture(albumId: string): Promise<void> {
    console.log(`Fetching Deezer album ${albumId}...`);
    const albumRes = await fetch(`https://api.deezer.com/album/${albumId}?limit=1`);
    if (!albumRes.ok) {
        throw new Error(`Failed to fetch album ${albumId}: ${albumRes.status}`);
    }

    const album = (await albumRes.json()) as DeezerAlbum;
    album.tracks = { data: [] };

    let nextUrl: string | undefined = `https://api.deezer.com/album/${albumId}/tracks?limit=100`;
    while (nextUrl) {
        const tracksRes = await fetch(nextUrl);
        if (!tracksRes.ok) {
            break;
        }
        const tracksData = (await tracksRes.json()) as DeezerTracksResponse;
        album.tracks.data.push(...tracksData.data);
        nextUrl = tracksData.next;
    }

    const fixturesDir = path.resolve('tests/deezer_importer/fixtures');
    await fs.mkdir(fixturesDir, { recursive: true });
    const targetFile = path.join(fixturesDir, `${albumId}.json`);
    await fs.writeFile(targetFile, `${JSON.stringify(album, null, 2)}\n`, 'utf8');
    console.log(`Saved fixture: ${targetFile} (${album.title}, ${album.tracks.data.length} tracks)`);
}

async function main(): Promise<void> {
    for (const albumId of ALBUM_IDS) {
        await fetchDeezerAlbumFixture(albumId);
    }
    console.log('All Deezer fixtures fetched successfully.');
}

await main();
