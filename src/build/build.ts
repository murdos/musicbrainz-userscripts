import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { rollup } from 'rollup';
import { babel, type RollupBabelInputPluginOptions } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias, { type Alias } from '@rollup/plugin-alias';
import { z } from 'zod';

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

const MetadataSchema = z
    .strictObject({
        name: z.string(),
        description: z.string(),
        version: z.string(),
        author: z.string(),
        namespace: z.string(),
        downloadURL: z.string(),
        updateURL: z.string(),
        match: z.array(z.string()).optional(),
        include: z.array(z.string()).optional(),
        require: z.array(z.string()).optional(),
        icon: z.string().optional(),
    })
    .refine(data => (data.match && !data.include) || (!data.match && data.include), {
        message: 'Either `match` or `include` must be provided, not both.',
        path: ['match', 'include'],
    });
type UserscriptMetadata = z.infer<typeof MetadataSchema>;

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
    const metadataPath = path.resolve('./src/userscripts', userscriptName, 'meta.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as unknown;
    const typedMetadata = MetadataSchema.parse(metadata);

    // Generate userscript header
    const header = generateUserscriptHeader(typedMetadata);

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

    lines.push(`@name         ${metadata.name}`);
    lines.push(`@description  ${metadata.description}`);
    lines.push(`@version      ${metadata.version}`);
    lines.push(`@author       ${metadata.author}`);
    lines.push(`@namespace    ${metadata.namespace}`);
    lines.push(`@downloadURL  ${metadata.downloadURL}`);
    lines.push(`@updateURL    ${metadata.updateURL}`);

    if (metadata.match) {
        metadata.match.forEach(pattern => {
            lines.push(`@match        ${pattern}`);
        });
    } else if (metadata.include) {
        metadata.include.forEach(pattern => {
            lines.push(`@include      ${pattern}`);
        });
    }

    if (metadata.require) {
        metadata.require.forEach(url => {
            lines.push(`@require      ${url}`);
        });
    }

    if (metadata.icon) {
        lines.push(`@icon         ${metadata.icon}`);
    }

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

await main();
