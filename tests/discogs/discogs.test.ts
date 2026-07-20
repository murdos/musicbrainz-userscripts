import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { RELEASES } from './config.ts';
import { loadParseDiscogsRelease } from './load-parser.ts';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(DIR, 'fixtures');
const SNAPSHOTS_DIR = path.join(DIR, 'snapshots');

const parseDiscogsRelease = loadParseDiscogsRelease();

const releases = RELEASES.map(({ url, description }) => ({
    id: path.basename(new URL(url).pathname),
    description,
}));

test.each(releases)('$id: $description', ({ id }) => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;
    const snapshot = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;

    const result = JSON.parse(JSON.stringify(parseDiscogsRelease(fixture))) as Record<string, unknown>;

    expect(result).toEqual(snapshot);
});
