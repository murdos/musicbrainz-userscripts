# FFM importer

This userscript helps connect a Feature.fm smart-link page to its MusicBrainz release. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

It supports `ffm.to`, branded subdomains such as `label-caster.ffm.to`, and `orcd.co` links.

## How it works

The importer runs in a few stages:

1. It collects the music-service links rendered by FFM and resolves their final destinations. Destinations embedded in FFM's link data are decoded locally; other links are resolved by following their redirects.
   Physical-media retailer links (CD, vinyl, or cassette) are excluded because they can describe a different MusicBrainz release than the digital provider links.
2. It asks the MusicBrainz URL web service which releases are related to any of those destinations.
3. It continues only when exactly one release is found. No match leaves Harmony available for a new import, while multiple matches produce an ambiguity warning and disable the import actions.
4. For a single match, it fetches that release with `url-rels`, compares every FFM destination with the current MusicBrainz relationships, and marks links that are already present. This step was only added to handle the region-specific URLs that MB Search cannot support yet, e.g. `https://music.apple.com/us/album/...` vs `https://music.apple.com/gb/album/...`. (https://tickets.metabrainz.org/browse/SEARCH-748)
5. **Add Missing Links** opens the MusicBrainz release editor with all missing relationships prefilled. Harmony-supported services are included in this check because a previous Harmony import may not have added every URL.

Resolved FFM destinations are cached in local storage to avoid repeatedly following redirects. MusicBrainz release lookup and relationship data are fetched fresh.

### Example

`https://ffm.to/buried-memories`
→ resolve its Spotify, Bandcamp, and other provider URLs
→ look those URLs up in MusicBrainz
→ find `https://musicbrainz.org/release/c0a4bde9-8ec2-4ea8-aa9c-7d00c8aa6d30`
→ compare the release's URL relationships and offer the missing Bandcamp link.

If none of the provider URLs find a release, the page can instead be imported with Harmony. If the URLs point to different releases, the importer stops and reports the ambiguity.

Other examples:
`https://orcd.co/salvaging-the-future`

## Requests and modes

The script makes read-only JSON requests to the MusicBrainz `/ws/2/url` and `/ws/2/release/{mbid}` endpoints. Adding links is not automatic: it opens a normal MusicBrainz edit form for review and submission.

The panel can target either `musicbrainz.org` or `beta.musicbrainz.org`. The selected server is stored by the userscript manager, so it is remembered across `ffm.to`, branded subdomains, and `orcd.co`. Its two actions are:

- **Import with Harmony** — open Harmony using a preferred provider URL.
- **Add Missing Links** — update the uniquely matched MusicBrainz release with the URLs that are not present.
