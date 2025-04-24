import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier/recommended';

export default defineConfig([
    js.configs.recommended,
    prettier,
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
            'no-console': 'off',
            'no-inner-declarations': 'warn',
            'no-global-assign': 'warn',
            'no-redeclare': 'warn',
            'no-self-assign': 'warn',
            'no-undef': 'warn',
            'no-useless-concat': 'warn',
            'no-useless-escape': 'warn',
            'no-unused-vars': 'warn',
            'no-var': 'warn',
        },
    },
]);
