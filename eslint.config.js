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

        // Disabled rules are migrated to oxlint
        rules: {
            'for-direction': 'off',
            'getter-return': 'off',
            'no-async-promise-executor': 'off',
            'no-case-declarations': 'off',
            'no-class-assign': 'off',
            'no-compare-neg-zero': 'off',
            'no-cond-assign': 'off',
            'no-const-assign': 'off',
            'no-constant-binary-expression': 'off',
            'no-constant-condition': 'off',
            'no-control-regex': 'off',
            'no-debugger': 'off',
            'no-delete-var': 'off',
            'no-dupe-class-members': 'off',
            'no-dupe-else-if': 'off',
            'no-dupe-keys': 'off',
            'no-duplicate-case': 'off',
            'no-empty': 'off',
            'no-empty-character-class': 'off',
            'no-empty-pattern': 'off',
            'no-empty-static-block': 'off',
            'no-ex-assign': 'off',
            'no-extra-boolean-cast': 'off',
            'no-fallthrough': 'off',
            'no-func-assign': 'off',
            'no-import-assign': 'off',
            'no-invalid-regexp': 'off',
            'no-irregular-whitespace': 'off',
            'no-loss-of-precision': 'off',
            'no-misleading-character-class': 'off',
            'no-new-native-nonconstructor': 'off',
            'no-nonoctal-decimal-escape': 'off',
            'no-obj-calls': 'off',
            'no-prototype-builtins': 'off',
            'no-regex-spaces': 'off',
            'no-setter-return': 'off',
            'no-shadow-restricted-names': 'off',
            'no-sparse-arrays': 'off',
            'no-this-before-super': 'off',
            'no-unexpected-multiline': 'off',
            'no-unreachable': 'off',
            'no-unsafe-finally': 'off',
            'no-unsafe-negation': 'off',
            'no-unsafe-optional-chaining': 'off',
            'no-unused-labels': 'off',
            'no-unused-private-class-members': 'off',
            'no-unused-vars': 'off',
            'no-useless-backreference': 'off',
            'no-useless-catch': 'off',
            'no-with': 'off',
            'require-yield': 'off',
            'use-isnan': 'off',
            'valid-typeof': 'off',
            'constructor-super': 'off',
            'prefer-template': 'off',
            'no-inner-declarations': 'off',
            'no-global-assign': 'off',
            'no-redeclare': 'off',
            'no-self-assign': 'off',
            'no-undef': 'off',
            'no-useless-concat': 'off',
            'no-useless-escape': 'off',
            'no-var': 'off',

            // Unmigrated rules (not supported by oxlint yet)
            // - 'no-dupe-args'
            // - 'no-octal'
            // - 'userscripts/filename-user'
            // - 'userscripts/no-invalid-metadata'
            // - 'userscripts/require-name'
            // - 'userscripts/require-description'
            // - 'userscripts/require-version'
            // - 'userscripts/require-attribute-space-prefix'
            // - 'userscripts/use-homepage-and-url'
            // - 'userscripts/require-download-url'
            // - 'userscripts/align-attributes'
            // - 'userscripts/metadata-spacing'
            // - 'userscripts/no-invalid-headers'
            // - 'userscripts/no-invalid-grant'
            // - 'userscripts/better-use-match'
        },
    },
]);
