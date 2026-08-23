import { describe, expect, it } from 'vitest';

import {
    chooseHarmonyLink,
    canonicalServiceUrlKey,
    decodeFfmDestination,
    expandLegacyBoomplayResources,
    extractReleaseUrlResources,
    findCanonicallyMatchedLinkUrls,
    findMissingLinks,
    findReleaseMatches,
    isIgnoredService,
    isPhysicalMediaLink,
    normalizeServiceUrl,
    relationshipTypeFor,
    URL_RELATIONSHIP_TYPES,
    type ServiceLink,
} from '../../src/lib/smart-link-importer/logic';

function serviceLink(service: string, url = `https://example.com/${service}`, action = 'Play'): ServiceLink {
    return { service, label: service, action, sourceUrl: 'https://api.ffm.to/link', url };
}

describe('FFM importer logic', () => {
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

    it('maps service actions to MusicBrainz URL relationship types', () => {
        expect(relationshipTypeFor(serviceLink('amazon'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
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
                    relations: [{ release: { id: releaseA } }, { release: { id: releaseB } }],
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
                matchedUrls: ['https://example.com/spotify', 'https://example.com/deezer'],
            },
            {
                releaseId: releaseB,
                matchedUrls: ['https://example.com/spotify'],
            },
        ]);
    });
});
