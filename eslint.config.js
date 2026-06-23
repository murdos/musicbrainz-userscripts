import js from '@eslint/js';
import userscripts from 'eslint-plugin-userscripts';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        ignores: ['node_modules/**/*', 'dist/**/*'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.greasemonkey,
                ...globals.jquery,
            },
            parserOptions: {
                projectService: true,
            },
        },
        files: ['**/*.ts'],
        extends: [tseslint.configs.strictTypeChecked],
        rules: {
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
            '@typescript-eslint/no-non-null-assertion': 'off', // TODO: add correct guardrails and remove this in the future
        },
    },
    {
        files: ['*.user.js'],
        plugins: {
            userscripts: {
                rules: userscripts.rules,
            },
        },
        rules: {
            ...userscripts.configs.recommended.rules,
            'userscripts/no-invalid-headers': ['error', { allowed: ['licence'] }],
            'no-console': 'off',
        },
    },
    {
        files: ['**/*.js'],
        rules: {
            'no-unused-vars': 'warn',
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.greasemonkey,
                ...globals.jquery,
                LOGGER: true,
                MBImportStyle: true,
                MBImport: true,
                MBLinks: true,
                MBSearchItStyle: true,
            },
        },

        rules: {
            'prefer-template': 'off', // migrated to oxlint
            'no-inner-declarations': 'off', // migrated to oxlint
            'no-global-assign': 'off', // migrated to oxlint
            'no-redeclare': 'off', // migrated to oxlint
            'no-self-assign': 'off', // migrated to oxlint
            'no-undef': 'warn',
            'no-useless-concat': 'off', // migrated to oxlint
            'no-useless-escape': 'off', // migrated to oxlint
            'no-var': 'off', // migrated to oxlint
        },
    },
]);
