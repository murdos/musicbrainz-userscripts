# fanlink.tv importer

This userscript connects a `fanlink.tv` smart-link page to its MusicBrainz release. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

Provider destinations are read from Fanlink's `window.preloadLink` page data because its rendered service rows do not contain links. Redirecting destinations are resolved before the shared smart-link importer normalizes them, checks MusicBrainz, highlights relationships already present, and prepares any missing URL relationships.

Example:

`https://fanlink.tv/CraveYou`
