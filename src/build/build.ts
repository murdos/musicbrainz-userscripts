import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { rollup } from 'rollup';
import { babel, type RollupBabelInputPluginOptions } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias, { type Alias } from '@rollup/plugin-alias';

const EXTENSIONS = ['.js', '.ts'];
const BABEL_OPTIONS = {
    babelHelpers: 'bundled',
    exclude: 'node_modules/**',
    include: ['**/*'],
    extensions: EXTENSIONS,
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    browsers: ['> 1%', 'last 2 versions', 'not ie <= 8'],
                },
            },
        ],
        '@babel/preset-typescript',
    ],
} satisfies RollupBabelInputPluginOptions;

interface UserscriptMetadata {
    name: string;
    description: string;
    version: string;
    author: string;
    namespace: string;
    match: string[];
    require?: string[];
    grant?: string[];
    exclude?: string[];
    [key: string]: any;
}

async function buildUserscript(userscriptName: string): Promise<void> {
    console.log(`Building ${userscriptName}`);

    const inputPath = path.resolve('./src/userscripts', userscriptName, 'index.ts');

    // Check if the input file exists
    try {
        await fs.access(inputPath);
    } catch {
        throw new Error(`No index.ts found in src/userscripts/${userscriptName}/`);
    }

    const bundle = await rollup({
        input: inputPath,
        plugins: [
            alias({
                entries: [
                    {
                        find: '~',
                        replacement: path.resolve('./src'),
                    },
                ] satisfies Alias[],
            }),
            nodeResolve({
                extensions: EXTENSIONS,
            }),
            commonjs(),
            babel(BABEL_OPTIONS),
        ],
    });

    const { output } = await bundle.generate({
        format: 'iife',
        name: 'Userscript',
    });

    // Load metadata
    const metadataPath = path.resolve('./src/userscripts', userscriptName, 'meta.ts');
    const metadataModule = await import(metadataPath);
    const metadata: UserscriptMetadata = metadataModule.default;

    // Generate userscript header
    const header = generateUserscriptHeader(metadata);

    // Combine header and code
    const finalCode = `${header}\n\n${output[0].code}`;

    // Write the userscript file
    const outputPath = path.resolve('./dist', `${userscriptName}.user.js`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, finalCode, 'utf8');

    console.log(`Built ${userscriptName}.user.js`);
}

function generateUserscriptHeader(metadata: UserscriptMetadata): string {
    const lines = ['==UserScript=='];

    // Required fields
    lines.push(`@name         ${metadata.name}`);
    lines.push(`@description  ${metadata.description}`);
    lines.push(`@version      ${metadata.version}`);
    lines.push(`@author       ${metadata.author}`);
    lines.push(`@namespace    ${metadata.namespace}`);

    // Match patterns
    if (metadata.match) {
        metadata.match.forEach(pattern => {
            lines.push(`@match        ${pattern}`);
        });
    }

    // Exclude patterns
    if (metadata.exclude) {
        metadata.exclude.forEach(pattern => {
            lines.push(`@exclude      ${pattern}`);
        });
    }

    // Requires
    if (metadata.require) {
        metadata.require.forEach(url => {
            lines.push(`@require      ${url}`);
        });
    }

    // Grants
    if (metadata.grant) {
        metadata.grant.forEach(grant => {
            lines.push(`@grant        ${grant}`);
        });
    }

    // Other metadata
    Object.entries(metadata).forEach(([key, value]) => {
        if (!['name', 'description', 'version', 'author', 'namespace', 'match', 'exclude', 'require', 'grant'].includes(key)) {
            if (Array.isArray(value)) {
                value.forEach(v => lines.push(`@${key.padEnd(12)} ${v}`));
            } else {
                lines.push(`@${key.padEnd(12)} ${value}`);
            }
        }
    });

    lines.push('==/UserScript==');

    return lines.map(line => `// ${line}`).join('\n');
}

async function main(): Promise<void> {
    try {
        // Get all userscript directories
        const srcDir = './src/userscripts';
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        const userscriptDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

        if (userscriptDirs.length === 0) {
            console.log('No userscript directories found in src/userscripts/');
            return;
        }

        // Build each userscript
        for (const userscriptName of userscriptDirs) {
            await buildUserscript(userscriptName);
        }

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

main();
