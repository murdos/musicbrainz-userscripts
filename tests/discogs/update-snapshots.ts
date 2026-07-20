import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASES } from './config.ts';
import { loadParseDiscogsRelease } from './load-parser.ts';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(DIR, 'fixtures');
const SNAPSHOTS_DIR = path.join(DIR, 'snapshots');

const parseDiscogsRelease = loadParseDiscogsRelease();

fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

for (const { url } of RELEASES) {
    const id = path.basename(new URL(url).pathname);
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;
    const result = parseDiscogsRelease(fixture);

    fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${id}.json`), `${JSON.stringify(result, null, 4)}\n`);
}
