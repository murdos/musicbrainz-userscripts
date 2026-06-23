/**
 * Output a human-readable list of scripts, using data from their headers.
 *
 * Includes both JavaScript and TypeScript scripts.
 *
 * If the script has the [DISCONTINUED] tag in its name, it is not included in the output.
 *
 * Example of usage:
 *     $> node --strip-types ./tools/generate_README.ts > README.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const TYPESCRIPT_ICON = '<img src="assets/icons/typescript.svg" alt="TypeScript" width="16" height="16">';

const regexStartHeader = /==UserScript==/i;
const regexStopHeader = /==\/UserScript==/i;
const regexKeyval = /^[\s\*/]+@(\S+)\s+(.+)\s*$/i; // oxlint-disable-line no-useless-escape

type ParsedHeader = Record<string, string[]>;

interface ScriptHeader {
    name: [string, ...string[]];
    description?: string[];
    downloadurl?: string[];
}

interface ScriptItem {
    jsfile: string;
    shortname: string;
    header: ScriptHeader;
}

function toScriptHeader(parsed: ParsedHeader): ScriptHeader | null {
    const name = parsed['name'];
    if (!name) {
        return null;
    }
    const firstName = name[0];
    if (firstName === undefined) {
        return null;
    }

    const header: ScriptHeader = { name: [firstName, ...name.slice(1)] };
    const description = parsed['description'];
    if (description?.[0]) {
        header.description = description;
    }
    const downloadurl = parsed['downloadurl'];
    if (downloadurl?.[0]) {
        header.downloadurl = downloadurl;
    }
    return header;
}

function parseUserScriptHeader(jsfilename: string): ScriptHeader | null {
    const content = fs.readFileSync(jsfilename, { encoding: 'utf-8' });
    const parsed: ParsedHeader = {};
    let inHeader = false;

    for (const line of content.split('\n')) {
        if (!inHeader && regexStartHeader.test(line)) {
            inHeader = true;
            continue;
        }
        if (inHeader && regexStopHeader.test(line)) {
            break;
        }
        if (!inHeader) {
            continue;
        }

        const match = regexKeyval.exec(line);
        if (!match) {
            continue;
        }
        const key = match[1]?.toLowerCase();
        const value = match[2];
        if (key === undefined || value === undefined) {
            continue;
        }
        if (!parsed[key]) {
            parsed[key] = [];
        }
        parsed[key].push(value);
    }

    return toScriptHeader(parsed);
}

const itemsByShortname: Record<string, ScriptItem> = {};

/** Collect items from root *.user.js files */

const jsfilenames = fs
    .readdirSync('.')
    .filter(name => name.endsWith('.user.js'))
    .sort();

for (const jsfilename of jsfilenames) {
    const header = parseUserScriptHeader(jsfilename);
    if (!header) {
        continue;
    }
    const shortname = jsfilename.replace('.user.js', '');
    itemsByShortname[shortname] = { jsfile: jsfilename, shortname, header };
}

/** Collect TypeScript items from src/userscripts/ */

const srcUserscripts = 'src/userscripts';
if (fs.statSync(srcUserscripts, { throwIfNoEntry: false })?.isDirectory()) {
    const srcUserscriptsFilenames = fs.readdirSync(srcUserscripts).sort();
    for (const name of srcUserscriptsFilenames) {
        const metaPath = path.join(srcUserscripts, name, 'meta.json');
        if (!fs.statSync(metaPath, { throwIfNoEntry: false })?.isFile()) {
            continue;
        }
        const meta = JSON.parse(fs.readFileSync(metaPath, { encoding: 'utf-8' })) as {
            name: string;
            description: string;
            downloadURL: string;
        };
        const header: ScriptHeader = {
            name: [meta.name],
            description: [meta.description],
            downloadurl: [meta.downloadURL],
        };
        itemsByShortname[name] = {
            jsfile: `dist/${name}.user.js`,
            shortname: name,
            header,
        };
    }
}

/**
 * Check if script has TypeScript source in src/userscripts/<shortname>/
 */
function isTypescript(shortname: string): boolean {
    const typescriptPath = path.join('src', 'userscripts', shortname, 'index.ts');
    const statEntry = fs.statSync(typescriptPath, { throwIfNoEntry: false });
    return statEntry?.isFile() ?? false;
}

let items = Object.values(itemsByShortname);
items = items.filter(item => !item.header.name[0].includes('[DISCONTINUED]'));
items.sort((a, b) => {
    const nameA = a.header.name[0];
    const nameB = b.header.name[0];
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
});

const lines: string[] = ['# MusicBrainz UserScripts', ''];

for (const item of items) {
    const name = item.header.name[0];
    const prefix = isTypescript(item.shortname) ? `${TYPESCRIPT_ICON} ` : '';
    lines.push(`- [${prefix}${name}](#${item.shortname})`);
}

const installButtonUrl = 'assets/buttons/button-install.svg';
const sourceButtonUrl = 'assets/buttons/button-source.svg';
const sourceBaseMaster = 'https://github.com/murdos/musicbrainz-userscripts/blob/master';
const sourceBaseDist = 'https://github.com/murdos/musicbrainz-userscripts/blob/dist';

for (const item of items) {
    lines.push('');
    const name = item.header.name[0];
    const prefix = isTypescript(item.shortname) ? `${TYPESCRIPT_ICON} ` : '';
    lines.push(`## <a name="${item.shortname}"></a> ${prefix}${name}`);
    lines.push('');

    if (item.header.description?.[0]) {
        lines.push(item.header.description[0]);
        lines.push('');
    }

    const sourceUrl = isTypescript(item.shortname) ? `${sourceBaseDist}/${item.shortname}.user.js` : `${sourceBaseMaster}/${item.jsfile}`;
    lines.push(`[![Source](${sourceButtonUrl})](${sourceUrl})`);
    const downloadUrl = item.header.downloadurl?.[0];
    if (downloadUrl) {
        lines.push(`[![Install](${installButtonUrl})](${downloadUrl})`);
    }
}

process.stdout.write(`${lines.join('\n')}\n`);
