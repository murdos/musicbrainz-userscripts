import { describe, expect, it } from 'vitest';

import {
    canonicalServiceUrlKey,
    chooseHarmonyLink,
    decodeFfmDestination,
    expandLegacyBoomplayResources,
    extractReleaseUrlResources,
    findCanonicallyMatchedLinkUrls,
    findMissingLinks,
    findReleaseMatches,
    isIgnoredService,
    isPhysicalMediaLink,
    isSearchFallbackServiceUrl,
    isTrackOnlyServiceUrl,
    normalizeServiceUrl,
    relationshipTypeFor,
    skipReasonForServiceLink,
    URL_RELATIONSHIP_TYPES,
    type ServiceLink,
} from '~/userscripts/smartlink_importer/utils/logic';

function serviceLink(service: string, url = `https://example.com/${service}`, action = 'Play'): ServiceLink {
    return { service, label: service, action, sourceUrl: 'https://api.ffm.to/link', url };
}

describe('Smartlink importer shared logic', () => {
    it('decodes the destination from an FFM cd payload', () => {
        const payload = Buffer.from(JSON.stringify({ product: 'smartlink', destUrl: 'https://open.spotify.com/album/abc123' })).toString(
            'base64url',
        );
        expect(decodeFfmDestination(`https://api.ffm.to/sl/e/c/example?cd=${payload}`)).toBe('https://open.spotify.com/album/abc123');
    });

    it('normalizes provider URLs and removes FFM tracking', () => {
        expect(
            normalizeServiceUrl('https://geo.music.apple.com/au/album/buried-memories-single/6791224822?app=music&ls=1&ct=FFM', 'apple'),
        ).toBe('https://music.apple.com/au/album/buried-memories-single/6791224822');
        expect(normalizeServiceUrl('https://geo.itunes.apple.com/at/album/id6766895394?at=1l3v9Tx&ct=BL', 'appleMusic')).toBe(
            'https://music.apple.com/at/album/6766895394',
        );
        expect(normalizeServiceUrl('https://www.youtube.com/playlist?list=OLAK5uy_example&src=FFM&lid=tracking', 'youtube')).toBe(
            'https://www.youtube.com/playlist?list=OLAK5uy_example',
        );
        expect(normalizeServiceUrl('http://www.tidal.com/album/543361480', 'tidal')).toBe('https://tidal.com/album/543361480');
        expect(
            normalizeServiceUrl(
                'https://www.boomplay.com/albums/EQUABbK_Gy8KOODzT4ow4hGX?srModel=openapi_featurefm&ffm=FFM_example',
                'boomplay',
            ),
        ).toBe('https://www.boomplay.com/albums/EQUABbK_Gy8KOODzT4ow4hGX');
        expect(
            normalizeServiceUrl(
                'https://www.qobuz.com/us-en/album/salvaging-the-future-dean-de-benedictis/ki3mxj3oly9vd?qbzs=partner&qbzc=feature-fm',
                'qobuz',
            ),
        ).toBe('https://www.qobuz.com/us-en/album/salvaging-the-future-dean-de-benedictis/ki3mxj3oly9vd');
        expect(normalizeServiceUrl('https://example.com/release?si=share-id&utm_source=clipboard', 'other')).toBe(
            'https://example.com/release',
        );
        expect(normalizeServiceUrl('https://music.amazon.com/albums/B0H5WFWC1L?trackAsin=B0H5W9VBSZ', 'amazonMusic')).toBe(
            'https://music.amazon.com/albums/B0H5WFWC1L',
        );
    });

    it('matches regional Apple URLs by album ID', () => {
        const ffmAppleUrl = 'https://music.apple.com/pl/album/marine-single/6793254042';
        const musicBrainzAppleUrl = 'https://music.apple.com/us/album/6793254042';
        expect(canonicalServiceUrlKey(ffmAppleUrl, 'apple')).toBe('apple:album:6793254042');
        expect(canonicalServiceUrlKey(musicBrainzAppleUrl, 'itunes')).toBe('apple:album:6793254042');

        const links = [serviceLink('apple', ffmAppleUrl), serviceLink('itunes', ffmAppleUrl, 'Download')];
        expect(findCanonicallyMatchedLinkUrls(links, [musicBrainzAppleUrl])).toEqual([ffmAppleUrl, ffmAppleUrl]);
    });

    it('matches equivalent Amazon product URLs by ASIN', () => {
        expect(canonicalServiceUrlKey('https://www.amazon.com/gp/product/B0H47BDZJR', 'amazonstore')).toBe(
            canonicalServiceUrlKey('https://amazon.com/dp/B0H47BDZJR', 'amazonstore'),
        );
    });

    it('matches current Boomplay links to legacy numeric MusicBrainz URLs through redirects', async () => {
        const legacyUrl = 'https://www.boomplay.com/albums/134155234';
        const currentUrl = 'https://www.boomplay.com/albums/EQUABbK_Gy8KOODzT4ow4hGX';
        const unrelatedUrl = 'https://open.spotify.com/album/example';
        const resources = await expandLegacyBoomplayResources([legacyUrl, unrelatedUrl], url => {
            expect(url).toBe(legacyUrl);
            return Promise.resolve(currentUrl);
        });

        expect(resources).toEqual([legacyUrl, unrelatedUrl, currentUrl]);
        expect(findCanonicallyMatchedLinkUrls([serviceLink('boomplay', legacyUrl)], resources)).toEqual([legacyUrl]);
        expect(findCanonicallyMatchedLinkUrls([serviceLink('boomplay', `${currentUrl}?ffm=tracking`)], resources)).toEqual([
            `${currentUrl}?ffm=tracking`,
        ]);
    });

    it('extracts URL resources from a release lookup', () => {
        expect(
            extractReleaseUrlResources({
                relations: [
                    { targetType: 'url', url: { resource: 'https://music.apple.com/us/album/6793254042' } },
                    { targetType: 'artist', artist: { id: 'example' } },
                ],
            }),
        ).toEqual(['https://music.apple.com/us/album/6793254042']);
    });

    it('includes missing Harmony-supported services in links to add', () => {
        const spotify = serviceLink('spotify', 'https://open.spotify.com/album/example');
        const bandcamp = serviceLink('bandcamp', 'https://example.bandcamp.com/album/example', 'Buy');

        expect(findMissingLinks([spotify, bandcamp], new Set([spotify.url]))).toEqual([bandcamp]);
    });

    it('unwraps Pandora desktop destinations', () => {
        const desktopUrl = 'https://www.pandora.com/artist/example/album/AL:123';
        const branchUrl = `https://pandora.app.link/?$desktop_url=${encodeURIComponent(desktopUrl)}`;
        expect(normalizeServiceUrl(branchUrl, 'pandora')).toBe(desktopUrl);
    });

    it('selects Harmony providers in the requested order', () => {
        const links = [serviceLink('apple'), serviceLink('tidal'), serviceLink('spotify')];
        expect(chooseHarmonyLink(links)?.service).toBe('spotify');
        expect(chooseHarmonyLink(links.slice(0, 2))?.service).toBe('tidal');
    });

    it('ignores sunset Juno Download services', () => {
        expect(isIgnoredService('junodownload')).toBe(true);
        expect(isIgnoredService('beatport')).toBe(false);
    });

    it('identifies physical-media retailer links that may represent a different release', () => {
        expect(isPhysicalMediaLink('amazoncdvinyl', 'CD')).toBe(true);
        expect(isPhysicalMediaLink('unknown-store', 'CD (Europe)')).toBe(true);
        expect(isPhysicalMediaLink('unknown-store', 'Buy Vinyl')).toBe(true);
        expect(isPhysicalMediaLink('bandcamp', 'Buy Now')).toBe(false);
        expect(isPhysicalMediaLink('tidal', 'Play (Hi-Res)')).toBe(false);
    });

    it('identifies provider search fallbacks', () => {
        expect(isSearchFallbackServiceUrl('https://listen.tidal.com/search?q=Artist%20Title')).toBe(true);
        expect(isSearchFallbackServiceUrl('https://soundcloud.com/search/sounds?q=Artist%20Title')).toBe(true);
        expect(isSearchFallbackServiceUrl('https://music.amazon.com/search/Artist%20Title')).toBe(true);
        expect(isSearchFallbackServiceUrl('https://www.pandora.com/search/Artist%20Title/tracks')).toBe(true);
        expect(
            isSearchFallbackServiceUrl('https://www.youtube.com/results?search_query=Antarctic%20Wastelands%20all%20that%20is%20unseen'),
        ).toBe(true);
        expect(isSearchFallbackServiceUrl('https://open.spotify.com/album/example')).toBe(false);
        expect(isSearchFallbackServiceUrl('https://example.com/results?search_query=Artist%20Title')).toBe(false);
    });

    it.each([
        ['spotify', 'https://open.spotify.com/track/example'],
        ['deezer', 'https://www.deezer.com/track/example'],
        ['bandcamp', 'https://artist.bandcamp.com/track/example'],
        ['tidal', 'https://tidal.com/track/example'],
        ['youtube', 'https://www.youtube.com/watch?v=example'],
        ['youtube', 'https://youtu.be/example'],
        ['youtubemusic', 'https://music.youtube.com/watch?v=TV8SXzJcBF0'],
        ['pandora', 'https://www.pandora.com/TR:207636456'],
        ['soundcloud', 'https://soundcloud.com/artist/example-track'],
    ])('identifies %s track-only URLs', (service, url) => {
        expect(isTrackOnlyServiceUrl(url, service)).toBe(true);
    });

    it.each([
        ['spotify', 'https://open.spotify.com/album/example'],
        ['deezer', 'https://www.deezer.com/album/example'],
        ['apple', 'https://music.apple.com/us/album/example/123?i=456'],
        ['youtube', 'https://www.youtube.com/watch?v=example&list=release-playlist'],
        ['soundcloud', 'https://soundcloud.com/artist/sets/example-release'],
    ])('retains %s release URLs', (service, url) => {
        expect(isTrackOnlyServiceUrl(url, service)).toBe(false);
    });

    it('provides a shared reason for links that should be skipped', () => {
        expect(skipReasonForServiceLink('junodownload', 'Buy', 'https://example.com/release')).toBe('Ignored service');
        expect(skipReasonForServiceLink('unknown-store', 'Buy Vinyl', 'https://example.com/release')).toBe('Physical-media link');
        expect(skipReasonForServiceLink('tidal', 'Play', 'https://tidal.com/search?q=example')).toBe('Search fallback');
        expect(skipReasonForServiceLink('youtube', 'Play', 'https://www.youtube.com/results?search_query=example')).toBe('Search fallback');
        expect(skipReasonForServiceLink('spotify', 'Play', 'https://open.spotify.com/track/example')).toBe('Track-only link');
        expect(skipReasonForServiceLink('spotify', 'Play', 'https://open.spotify.com/album/example')).toBeUndefined();
    });

    it('maps service actions to MusicBrainz URL relationship types', () => {
        expect(relationshipTypeFor(serviceLink('amazon'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
        expect(relationshipTypeFor(serviceLink('tidal', 'https://tidal.com/album/534550860', 'Listen'))).toBe(
            URL_RELATIONSHIP_TYPES.streaming,
        );
        expect(relationshipTypeFor(serviceLink('youtubemusic'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
        expect(relationshipTypeFor(serviceLink('qobuz'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
        expect(relationshipTypeFor(serviceLink('qobuz', undefined, 'Buy'))).toBe(URL_RELATIONSHIP_TYPES.purchaseForDownload);
        expect(relationshipTypeFor(serviceLink('archive', undefined, 'Free download'))).toBe(URL_RELATIONSHIP_TYPES.downloadForFree);
        expect(relationshipTypeFor(serviceLink('officialsite', 'https://spottedpeccary.com/shop/example', 'Go To'))).toBe(
            URL_RELATIONSHIP_TYPES.discographyEntry,
        );
        expect(relationshipTypeFor(serviceLink('amazonstore', 'https://www.amazon.com/gp/product/B0H47BDZJR', 'Buy'))).toBe(
            URL_RELATIONSHIP_TYPES.asin,
        );
    });

    it('maps SoundCloud links without CTA text to streaming pages', () => {
        const link = serviceLink('soundcloud', 'https://soundcloud.com/ndnlmusic/requies-ft-rita-kolesnikova', '');
        expect(relationshipTypeFor(link)).toBe(URL_RELATIONSHIP_TYPES.streaming);
    });

    it.each([
        ['youtube', 'https://www.youtube.com/playlist?list=OLAK5uy_nr0dk1Se2buX6pUFiN_aQ-T_T4mXwZLkY'],
        ['deezer', 'https://www.deezer.com/album/1011676351'],
        ['boomplay', 'https://www.boomplay.com/albums/134155234'],
        ['spotify', 'https://open.spotify.com/album/6Gg9AE43TMWRM8iXBjj5CB'],
    ])('maps %s links without CTA text to free streaming pages', (service, url) => {
        expect(relationshipTypeFor(serviceLink(service, url, ''))).toBe(URL_RELATIONSHIP_TYPES.streamForFree);
    });

    it('keeps YouTube Music as a subscription streaming page', () => {
        const link = serviceLink('youtubemusic', 'https://music.youtube.com/playlist?list=OLAK5uy_example', '');
        expect(relationshipTypeFor(link)).toBe(URL_RELATIONSHIP_TYPES.streaming);
    });

    it('collects every release matched by the provider URLs so ambiguity is visible', () => {
        const releaseA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const releaseB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        const response = {
            urls: [
                {
                    resource: 'https://example.com/spotify',
                    relations: [
                        { release: { id: releaseA, title: 'Release A', date: '2025-01-02', country: 'XW' } },
                        { release: { id: releaseB, title: 'Release B', disambiguation: 'digital edition' } },
                    ],
                },
                {
                    resource: 'https://example.com/deezer',
                    relations: [{ release: { id: releaseA } }],
                },
            ],
        };
        expect(findReleaseMatches(response)).toEqual([
            {
                releaseId: releaseA,
                title: 'Release A',
                disambiguation: undefined,
                date: '2025-01-02',
                country: 'XW',
                matchedUrls: ['https://example.com/spotify', 'https://example.com/deezer'],
            },
            {
                releaseId: releaseB,
                title: 'Release B',
                disambiguation: 'digital edition',
                date: undefined,
                country: undefined,
                matchedUrls: ['https://example.com/spotify'],
            },
        ]);
    });
});
