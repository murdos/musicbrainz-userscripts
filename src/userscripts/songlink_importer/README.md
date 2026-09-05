# song.link importer

This userscript connects a `song.link` smart-link page to its MusicBrainz release. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

Provider destinations are read directly from Songlink's rendered service links. For track pages, the source provider's parent album ID is read from Songlink's page data and used to construct its release URL. Other known track-only destinations are excluded rather than being sent to Harmony or attached to a MusicBrainz release.

The shared smart-link importer removes tracking and track-selection parameters, normalizes the remaining destinations, checks MusicBrainz, highlights relationships already present, and prepares any missing URL relationships. Tracking parameters on the Songlink page URL are also omitted from edit notes and cache keys.

Example:

`https://song.link/Ttu`
