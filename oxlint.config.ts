import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['eslint', 'typescript', 'node', 'oxc', 'import'],
    options: {
        typeAware: true,
    },
    categories: {
        correctness: 'off',
        suspicious: 'off',
        style: 'off',
        perf: 'off',
        pedantic: 'off',
        restriction: 'off',
        nursery: 'off',
    },
    env: {
        browser: true,
        greasemonkey: true,
        jquery: true,
        es6: true,
        node: true,
    },
    globals: {
        unsafeWindow: 'writable',
    },
    overrides: [
        {
            files: ['**/*.user.js'],
            globals: {
                LOGGER: 'readonly',
                MBImportStyle: 'readonly',
                MBImport: 'readonly',
                MBLinks: 'readonly',
                MBSearchItStyle: 'readonly',
            },
        },
    ],
    rules: {
        'prefer-template': 'error',
        'no-inner-declarations': 'warn',
        'no-global-assign': 'warn',
        'no-redeclare': 'warn',
        'no-self-assign': 'warn',
        // 'no-undef': 'warn', // TODO: Too many odd issues to fix, will be addressed later
        'no-useless-concat': 'warn',
        'no-useless-escape': 'warn',
        'no-var': 'warn',
    },
    ignorePatterns: ['node_modules/**', '.git/**'],
});
