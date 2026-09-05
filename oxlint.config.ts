import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['eslint', 'typescript', 'node', 'oxc', 'import'],
    jsPlugins: ['eslint-plugin-userscripts'], // Oxlint has no native userscripts rules, so run eslint-plugin-userscripts through its ESLint-compatible JavaScript plugin API.
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
    overrides: [
        {
            files: ['**/*.user.js'],
            globals: {
                LOGGER: 'readonly',
                MB: 'readonly',
                MBImportStyle: 'readonly',
                MBImport: 'readonly',
                MBLinks: 'readonly',
                MBSearchItStyle: 'readonly',
            },
            rules: {
                'userscripts/filename-user': ['error', 'always'],
                'userscripts/no-invalid-metadata': ['error', { top: 'required' }],
                'userscripts/require-name': ['error', 'required'],
                'userscripts/require-description': ['error', 'required'],
                'userscripts/require-version': ['error', 'required'],
                'userscripts/require-attribute-space-prefix': 'error',
                'userscripts/use-homepage-and-url': 'error',
                'userscripts/require-download-url': 'error',
                'userscripts/align-attributes': ['error', 2],
                'userscripts/metadata-spacing': 'error',
                'userscripts/no-invalid-headers': ['error', { allowed: ['licence'] }],
                'userscripts/no-invalid-grant': 'error',
                'userscripts/better-use-match': 'warn',
            },
        },
    ],
    rules: {
        'prefer-template': 'error',
        'no-inner-declarations': 'warn',
        'no-global-assign': 'warn',
        'no-redeclare': 'warn',
        'no-self-assign': 'warn',
        'no-undef': 'warn',
        'no-useless-concat': 'warn',
        'no-useless-escape': 'warn',
        'no-var': 'warn',
        'for-direction': 'error',
        'getter-return': ['error', { allowImplicit: false }],
        'no-async-promise-executor': 'error',
        'no-case-declarations': 'error',
        'no-class-assign': 'error',
        'no-compare-neg-zero': 'error',
        'no-cond-assign': ['error', 'except-parens'],
        'no-const-assign': 'error',
        'no-constant-binary-expression': 'error',
        'no-constant-condition': [
            'error',
            {
                checkLoops: 'allExceptWhileTrue',
            },
        ],
        'no-control-regex': 'error',
        'no-debugger': 'error',
        'no-delete-var': 'error',
        'no-dupe-class-members': 'error',
        'no-dupe-else-if': 'error',
        'no-dupe-keys': 'error',
        'no-duplicate-case': 'error',
        'no-empty': [
            'error',
            {
                allowEmptyCatch: false,
            },
        ],
        'no-empty-character-class': 'error',
        'no-empty-pattern': [
            'error',
            {
                allowObjectPatternsAsParameters: false,
            },
        ],
        'no-empty-static-block': 'error',
        'no-ex-assign': 'error',
        'no-extra-boolean-cast': ['error', {}],
        'no-fallthrough': [
            'error',
            {
                allowEmptyCase: false,
                reportUnusedFallthroughComment: false,
            },
        ],
        'no-func-assign': 'error',
        'no-import-assign': 'error',
        'no-invalid-regexp': ['error', {}],
        'no-irregular-whitespace': [
            'error',
            {
                skipComments: false,
                skipJSXText: false,
                skipRegExps: false,
                skipStrings: true,
                skipTemplates: false,
            },
        ],
        'no-loss-of-precision': 'error',
        'no-misleading-character-class': [
            'error',
            {
                allowEscape: false,
            },
        ],
        'no-new-native-nonconstructor': 'error',
        'no-nonoctal-decimal-escape': 'error',
        'no-obj-calls': 'error',
        'no-prototype-builtins': 'error',
        'no-regex-spaces': 'error',
        'no-setter-return': 'error',
        'no-shadow-restricted-names': [
            'error',
            {
                reportGlobalThis: false,
            },
        ],
        'no-sparse-arrays': 'error',
        'no-this-before-super': 'error',
        'no-unexpected-multiline': 'error',
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-unsafe-negation': [
            'error',
            {
                enforceForOrderingRelations: false,
            },
        ],
        'no-unsafe-optional-chaining': [
            'error',
            {
                disallowArithmeticOperators: false,
            },
        ],
        'no-unused-labels': 'error',
        'no-unused-private-class-members': 'error',
        'no-unused-vars': 'warn',
        'no-useless-backreference': 'error',
        'no-useless-catch': 'error',
        'no-with': 'error',
        'require-yield': 'error',
        'use-isnan': [
            'error',
            {
                enforceForIndexOf: false,
                enforceForSwitchCase: true,
            },
        ],
        'valid-typeof': [
            'error',
            {
                requireStringLiterals: false,
            },
        ],
    },
});
