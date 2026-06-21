import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_URLS } from './config';
import { loadParseDiscogsRelease } from './load-parser';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(DIR, 'fixtures');
const SNAPSHOTS_DIR = path.join(DIR, 'snapshots');

const parseDiscogsRelease = loadParseDiscogsRelease();

function releaseIdFromFixture(fixture: Record<string, unknown>, url: string): number {
    const id = fixture['id'];
    if (typeof id !== 'number') {
        throw new Error(`Fixture for ${url} has no numeric id`);
    }
    return id;
}

function stableStringify(value: unknown): string {
    return `${JSON.stringify(value, null, 4)}\n`;
}

function fixturePathForUrl(url: string): string {
    return path.join(FIXTURES_DIR, `${path.basename(new URL(url).pathname)}.json`);
}

function fixturePath(id: number): string {
    return path.join(FIXTURES_DIR, `${id}.json`);
}

function snapshotPath(id: number): string {
    return path.join(SNAPSHOTS_DIR, `${id}.json`);
}

function readJson(filePath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function diffSummary(expected: Record<string, unknown>, actual: Record<string, unknown>): string[] {
    const expectedKeys = new Set(Object.keys(expected));
    const actualKeys = new Set(Object.keys(actual));
    const lines: string[] = [];

    for (const key of [...expectedKeys].sort()) {
        if (!actualKeys.has(key)) {
            lines.push(`  - missing key: ${key}`);
        }
    }
    for (const key of [...actualKeys].sort()) {
        if (!expectedKeys.has(key)) {
            lines.push(`  + extra key: ${key}`);
        }
    }
    for (const key of [...expectedKeys].filter(k => actualKeys.has(k)).sort()) {
        if (stableStringify(expected[key]) !== stableStringify(actual[key])) {
            lines.push(`  ~ changed: ${key}`);
        }
    }

    return lines;
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

function writeFixture(id: number, data: Record<string, unknown>): void {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.writeFileSync(fixturePath(id), stableStringify(data));
}

function writeSnapshot(id: number, data: Record<string, unknown>): void {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    fs.writeFileSync(snapshotPath(id), stableStringify(data));
}

function parseFixture(id: number): Record<string, unknown> {
    return parseDiscogsRelease(readJson(fixturePath(id)));
}

function compareRelease(id: number): { ok: true } | { ok: false; summary: string[] } {
    const actual = parseFixture(id);
    const expected = readJson(snapshotPath(id));
    const actualJson = stableStringify(actual);
    const expectedJson = stableStringify(expected);

    if (actualJson === expectedJson) {
        return { ok: true };
    }

    return { ok: false, summary: diffSummary(expected, actual) };
}

async function updateRelease(url: string): Promise<void> {
    const fixture = await fetchFixture(url);
    const id = releaseIdFromFixture(fixture, url);
    writeFixture(id, fixture);
    writeSnapshot(id, parseDiscogsRelease(fixture));
    process.stdout.write(`updated ${id}\n`);
}

function testRelease(id: number): boolean {
    const fixture = fixturePath(id);
    const snapshot = snapshotPath(id);

    if (!fs.existsSync(fixture)) {
        process.stderr.write(`missing fixture for ${id}: ${fixture}\n`);
        process.stderr.write('run: pnpm test:discogs:update\n');
        return false;
    }
    if (!fs.existsSync(snapshot)) {
        process.stderr.write(`missing snapshot for ${id}: ${snapshot}\n`);
        process.stderr.write('run: pnpm test:discogs:update\n');
        return false;
    }

    const result = compareRelease(id);
    if (result.ok) {
        process.stdout.write(`ok ${id}\n`);
        return true;
    }

    process.stderr.write(`FAIL ${id}\n`);
    for (const line of result.summary) {
        process.stderr.write(`${line}\n`);
    }
    process.stderr.write('\nTo update snapshots: pnpm test:discogs:update\n');
    return false;
}

function usage(): never {
    process.stderr.write(`Usage:
  pnpm test:discogs              run snapshot tests for releases in config.ts
  pnpm test:discogs:update       fetch fixtures and refresh snapshots

Releases are configured in tests/discogs/config.ts
`);
    process.exit(1);
}

async function main(argv: string[]): Promise<void> {
    if (argv.includes('-h') || argv.includes('--help')) {
        usage();
    }

    const update = argv.includes('--update');

    if (update) {
        for (const url of RELEASE_URLS) {
            await updateRelease(url);
        }
        process.stdout.write(`\nupdated ${RELEASE_URLS.length} release(s)\n`);
        return;
    }

    if (argv.length > 0) {
        usage();
    }

    let failed = 0;
    for (const url of RELEASE_URLS) {
        const fixtureFile = fixturePathForUrl(url);
        if (!fs.existsSync(fixtureFile)) {
            process.stderr.write(`missing fixture for ${url}: ${fixtureFile}\n`);
            process.stderr.write('run: pnpm test:discogs:update\n');
            failed++;
            continue;
        }
        const id = Number(path.basename(new URL(url).pathname));
        if (!testRelease(id)) {
            failed++;
        }
    }

    if (failed > 0) {
        process.stderr.write(`\n${failed} test(s) failed\n`);
        process.exit(1);
    }

    process.stdout.write(`\n${RELEASE_URLS.length} test(s) passed\n`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
});
