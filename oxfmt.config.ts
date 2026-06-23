import { defineConfig } from 'oxfmt';

export default defineConfig({
    printWidth: 140,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    tabWidth: 4,
    useTabs: false,
    bracketSpacing: true,
    arrowParens: 'avoid',
    endOfLine: 'lf',
    insertFinalNewline: true,
    proseWrap: 'preserve',
    ignorePatterns: ['node_modules/**', '.git/**', 'pnpm-lock.yaml'],
    sortImports: true,
    overrides: [
        {
            files: ['**/*.yml', '**/*.yaml'],
            options: { tabWidth: 2 },
        },
    ],
});
