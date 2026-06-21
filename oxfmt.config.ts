import { defineConfig } from "oxfmt";

export default defineConfig({
    semi: true,
    singleQuote: false,
    trailingComma: "none",
    tabWidth: 4,
    useTabs: false,
    bracketSpacing: true,
    arrowParens: "always",
    endOfLine: "lf",
    insertFinalNewline: true,
    proseWrap: "preserve",
    ignorePatterns: ["node_modules/**", ".git/**"],
    sortImports: true,
    overrides: [
        {
            files: ["**/*.yml", "**/*.yaml"],
            options: { tabWidth: 2 }
        }
    ]
});
