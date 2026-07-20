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

function sortJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJsonValue);
    }

    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, sortJsonValue(child)]),
        );
    }

    return value;
}

function stableStringify(value: unknown): string {
    return `${JSON.stringify(sortJsonValue(JSON.parse(JSON.stringify(value))), null, 4)}\n`;
}

// These tests compare parsed JSON structurally, so mirror Vitest's snapshot update flags explicitly.
function shouldUpdateSnapshots(): boolean {
    return process.argv.some(arg => arg === '-u' || arg === '--update' || arg === '--updateSnapshot');
}

const releases = RELEASES.map(({ url, description }) => ({
    id: path.basename(new URL(url).pathname),
    description,
}));

test.each(releases)('$id: $description', ({ id }) => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;
    const snapshotPath = path.join(SNAPSHOTS_DIR, `${id}.json`);
    const result = parseDiscogsRelease(fixture);
    const serializedResult = stableStringify(result);

    if (shouldUpdateSnapshots() || !fs.existsSync(snapshotPath)) {
        fs.writeFileSync(snapshotPath, serializedResult, 'utf8');
        return;
    }

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Record<string, unknown>;
    expect(JSON.parse(serializedResult)).toEqual(snapshot);
});
