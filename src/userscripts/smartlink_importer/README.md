# Smartlink importer

This userscript connects supported release smart-link pages to their MusicBrainz releases. It can start a release import through Harmony and add provider URLs that are missing from an existing release.

Each smart-link service has its own page adapter while sharing URL normalization, MusicBrainz lookup, caching, and import behavior.

## Supported sites and test links

### album.link

Provider destinations are read directly from album.link’s rendered links. Tracking parameters are removed from the smart-link page URL, and track smart links are ignored.

Test link: [album.link/StartOver](https://album.link/StartOver)

### BandLink

Provider destinations are read directly from BandLink’s rendered music-service links.

Test link: [band.link/VXPNw](https://band.link/VXPNw)

### bfan.link

Bfan is Believe Digital’s link aggregator service. Provider destinations are read from the page’s Next.js hydration data, and search fallbacks for unavailable stores are ignored.

Test link: [bfan.link/elan](https://bfan.link/elan)

### fanlink.tv

Provider destinations are read from Fanlink’s `window.preloadLink` page data because its rendered service rows do not contain the links. Redirecting destinations are resolved before they are normalized.

Test link: [fanlink.tv/CraveYou](https://fanlink.tv/CraveYou)

### Feature.fm (`ffm.to` and `orcd.co`)

The Feature.fm adapter supports `ffm.to`, branded subdomains such as `label-caster.ffm.to`, and `orcd.co`. Destinations embedded in Feature.fm’s tracking data are decoded locally; other links are resolved by following their redirects.

Test links:

- [ffm.to/buried-memories](https://ffm.to/buried-memories)
- [orcd.co/salvaging-the-future](https://orcd.co/salvaging-the-future)

## How it works

1. The importer collects the page’s music-service links and resolves their final destinations. Physical-media retailer links for CDs, vinyl, or cassettes are excluded because they may describe a different MusicBrainz release from the digital provider links.
2. It asks the MusicBrainz URL web service which releases are related to those destinations.
3. It continues only when exactly one release is found. If no release is found, Harmony remains available for a new import. If the provider URLs point to multiple releases, the importer reports the ambiguity and disables its actions.
4. For a single match, it fetches the release’s URL relationships, compares them with every smart-link destination, and highlights the links already present. Canonical comparison handles region-specific URLs that MusicBrainz search cannot currently match, such as Apple Music URLs for different storefronts ([SEARCH-748](https://tickets.metabrainz.org/browse/SEARCH-748)).
5. **Add Missing Links** opens the MusicBrainz release editor with all missing relationships prefilled. Harmony-supported services are included in this comparison because a previous Harmony import may not have added every URL.

For example, the `ffm.to/buried-memories` page resolves its Spotify, Bandcamp, and other provider URLs to [this MusicBrainz release](https://musicbrainz.org/release/c0a4bde9-8ec2-4ea8-aa9c-7d00c8aa6d30), then offers any missing relationships such as Bandcamp.

Resolved provider destinations are cached in local storage to avoid repeatedly following redirects. MusicBrainz release lookup and relationship data are fetched fresh.

## Requests and modes

The script makes read-only JSON requests to the MusicBrainz `/ws/2/url` and `/ws/2/release/{mbid}` endpoints. Adding links is not automatic: it opens the normal MusicBrainz edit form for review and submission.

The panel can target `musicbrainz.org`, `beta.musicbrainz.org`, or `musicbrainz.eu`. The selected server is stored by the userscript manager and shared across supported sites. Its two actions are:

- **Import with Harmony** — open Harmony using a preferred provider URL.
- **Add Missing Links** — update the uniquely matched MusicBrainz release with the URLs that are not present.
