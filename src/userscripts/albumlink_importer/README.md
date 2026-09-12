# album.link importer

This userscript connects an `album.link` smart-link page to its MusicBrainz release. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

Provider destinations are read directly from album.link's rendered links. Tracking parameters are removed from the smart-link page URL, and track smart links are ignored. The shared smart-link importer normalizes provider destinations, checks MusicBrainz, highlights relationships already present, and prepares any missing URL relationships.

Example:

`https://album.link/StartOver`
