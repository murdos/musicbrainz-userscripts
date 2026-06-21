import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASES } from './config.ts';
import { loadParseDiscogsRelease } from './load-parser.ts';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(DIR, 'fixtures');
const SNAPSHOTS_DIR = path.join(DIR, 'snapshots');

const parseDiscogsRelease = loadParseDiscogsRelease();

function stableStringify(value: unknown): string {
    return JSON.stringify(value, null, 4);
}

function fixturePath(id: number): string {
    return path.join(FIXTURES_DIR, `${id}.json`);
}

function snapshotPath(id: number): string {
    return path.join(SNAPSHOTS_DIR, `${id}.json`);
}

async function fetchFixture(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'musicbrainz-userscripts-tests/1.0 +https://github.com/murdos/musicbrainz-userscripts',
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Discogs API error ${response.status} for ${url}`);
    }

    return (await response.json()) as Record<string, unknown>;
}

function releaseIdFromFixture(fixture: Record<string, unknown>, url: string): number {
    const id = fixture['id'];
    if (typeof id !== 'number') {
        throw new Error(`Fixture for ${url} has no numeric id`);
    }
    return id;
}

async function updateRelease(url: string): Promise<void> {
    const fixture = await fetchFixture(url);
    const id = releaseIdFromFixture(fixture, url);

    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.writeFileSync(fixturePath(id), stableStringify(fixture));

    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    fs.writeFileSync(snapshotPath(id), stableStringify(parseDiscogsRelease(fixture)));

    process.stdout.write(`updated ${id}\n`);
}

async function main(): Promise<void> {
    for (const { url } of RELEASES) {
        await updateRelease(url);
    }
    process.stdout.write(`\nupdated ${RELEASES.length} release(s)\n`);
}

main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
});
