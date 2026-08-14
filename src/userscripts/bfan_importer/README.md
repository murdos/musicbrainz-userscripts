# bfan.link importer

This userscript connects a `bfan.link` smart-link page to its MusicBrainz release. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

Provider destinations are read from the page's Next.js data. Search fallbacks for unavailable stores are ignored. The shared smart-link importer normalizes the destinations, checks MusicBrainz, highlights relationships already present, and prepares any missing URL relationships.

Example:

`https://bfan.link/elan`
