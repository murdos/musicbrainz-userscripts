# Discogs importer tests

Snapshot tests for `parseDiscogsRelease` in `discogs_importer.user.js`. Each test checks that a real Discogs release is converted into the expected MusicBrainz import format.

## Layout

```
tests/discogs/
  config.ts       release URLs to test
  load-parser.ts  loads parseDiscogsRelease in Node
  run.ts          test runner
  fixtures/       raw Discogs API responses
  snapshots/      expected parser output
```

## Fixtures and snapshots

A **fixture** is the JSON returned by the Discogs API for a release (e.g. `fixtures/1996829.json`). Fixtures are committed to the repo so tests do not need network access.

A **snapshot** is the JSON produced by running `parseDiscogsRelease` on that fixture (e.g. `snapshots/1996829.json`). It is the expected MusicBrainz import data: artist credits, labels, discs, tracks, durations, and so on.

When you change the parser, tests re-parse the fixtures and compare the result to the snapshots.

## How tests work

1. Read each URL listed in `config.ts`.
2. Load the matching fixture from `fixtures/<id>.json`.
3. Run `parseDiscogsRelease` on it (via `load-parser.ts`, which loads the userscript in a Node VM with the required mocks).
4. Compare the output to `snapshots/<id>.json`.

CI runs `pnpm test:discogs` on every pull request. No Discogs API calls are made during normal test runs.

## Adding a test case

1. Find a Discogs release that exercises the behaviour you care about.
2. Add its API URL to `RELEASE_URLS` in `config.ts`:

   ```ts
   export const RELEASE_URLS = [
       // ...
       'https://api.discogs.com/releases/1234567', // brief note on what this covers
   ] as const;
   ```

   Use the API URL (`https://api.discogs.com/releases/<id>`), not the website URL.

3. Fetch fixtures and generate snapshots (see below).
4. Commit the new fixture, snapshot, and config change.

Pick releases that cover distinct edge cases (multi-disc tracklists, unusual side numbering, nested sub-tracks, etc.) rather than many similar ones.

## Commands

Run all tests:

```bash
pnpm test:discogs
```

Fetch fixtures from the Discogs API and regenerate all snapshots (needed after adding a release or after an intentional parser change):

```bash
pnpm test:discogs:update
```

`pnpm test` currently is an alias for `pnpm test:discogs` since there are no other tests.

After adding a URL to `config.ts`, run `pnpm test:discogs:update` once to create its fixture and snapshot, then `pnpm test:discogs` to confirm everything passes.

If a test fails after a parser change you intended, review the diff, then run `pnpm test:discogs:update` to refresh the snapshots and commit the updated files.
