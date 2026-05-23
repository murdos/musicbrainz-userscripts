import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier/recommended';
import userscripts from 'eslint-plugin-userscripts';
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
    prettier,
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
            'prettier/prettier': 'error',
            'prefer-template': 'error',
            'no-inner-declarations': 'warn',
            'no-global-assign': 'warn',
            'no-redeclare': 'warn',
            'no-self-assign': 'warn',
            'no-undef': 'warn',
            'no-useless-concat': 'warn',
            'no-useless-escape': 'warn',
            'no-var': 'warn',
        },
    },
]);
