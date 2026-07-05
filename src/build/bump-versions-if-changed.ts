import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const USERSCRIPTS_DIR = './src/userscripts';
const BUILD_OUTPUT_DIR = './dist';
const DEPLOY_BRANCH = 'dist';

function stripVersionLine(content: string): string {
    return content
        .split('\n')
        .filter(line => !/^\/\/ @version\s/.test(line))
        .join('\n');
}

function bumpVersion(version: string): string {
    const match = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/.exec(version);
    const now = new Date();
    const today = [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join(
        '.',
    );

    if (match) {
        const datePrefix = `${match[1]}.${match[2]}.${match[3]}`;
        if (datePrefix === today) {
            return `${today}.${Number(match[4]) + 1}`;
        }
    }

    return `${today}.1`;
}

function readDeployedUserscript(userscriptName: string): string | null {
    try {
        return execSync(`git show origin/${DEPLOY_BRANCH}:${userscriptName}.user.js`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    execSync(`git fetch origin ${DEPLOY_BRANCH}`, { stdio: 'inherit' });

    const entries = await fs.readdir(USERSCRIPTS_DIR, { withFileTypes: true });
    const userscriptNames = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

    const bumped: { name: string; version: string }[] = [];

    for (const userscriptName of userscriptNames) {
        const builtPath = path.join(BUILD_OUTPUT_DIR, `${userscriptName}.user.js`);
        const metaPath = path.join(USERSCRIPTS_DIR, userscriptName, 'meta.json');

        let built: string;
        try {
            built = await fs.readFile(builtPath, 'utf8');
        } catch {
            throw new Error(`Missing build output: ${builtPath}`);
        }

        const deployed = readDeployedUserscript(userscriptName);
        if (deployed === null) {
            continue;
        }

        if (stripVersionLine(built) === stripVersionLine(deployed)) {
            continue;
        }

        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as { version: string };
        meta.version = bumpVersion(meta.version);
        await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 4)}\n`, 'utf8');
        bumped.push({ name: userscriptName, version: meta.version });
        console.log(`Bumped ${userscriptName} to ${meta.version}`);
    }

    const githubOutput = process.env['GITHUB_OUTPUT'];
    if (githubOutput) {
        const lines = [`changed=${bumped.length > 0 ? 'true' : 'false'}`, `bumped=${JSON.stringify(bumped)}`];
        await fs.appendFile(githubOutput, `${lines.join('\n')}\n`);
    }
}

await main();
