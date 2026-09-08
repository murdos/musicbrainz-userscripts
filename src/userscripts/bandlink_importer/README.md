# BandLink importer

This userscript connects a `band.link` smart-link page to its MusicBrainz release. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

Provider destinations are read directly from BandLink's rendered music-service links. The shared smart-link importer normalizes them, checks MusicBrainz, highlights relationships already present, and prepares any missing URL relationships.

Example:

`https://band.link/VXPNw`
