import { describe, expect, it } from 'vitest';

import {
    chooseHarmonyLink,
    canonicalServiceUrlKey,
    decodeFfmDestination,
    extractReleaseUrlResources,
    findCanonicallyMatchedLinkUrls,
    findMissingLinks,
    findReleaseMatches,
    normalizeServiceUrl,
    relationshipTypeFor,
    URL_RELATIONSHIP_TYPES,
    type ServiceLink,
} from '../../src/userscripts/ffm_importer/logic';

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
        expect(normalizeServiceUrl('https://www.youtube.com/playlist?list=OLAK5uy_example&src=FFM&lid=tracking', 'youtube')).toBe(
            'https://www.youtube.com/playlist?list=OLAK5uy_example',
        );
        expect(normalizeServiceUrl('http://www.tidal.com/album/543361480', 'tidal')).toBe('https://tidal.com/album/543361480');
    });

    it('matches regional Apple URLs by album ID', () => {
        const ffmAppleUrl = 'https://music.apple.com/pl/album/marine-single/6793254042';
        const musicBrainzAppleUrl = 'https://music.apple.com/us/album/6793254042';
        expect(canonicalServiceUrlKey(ffmAppleUrl, 'apple')).toBe('apple:album:6793254042');
        expect(canonicalServiceUrlKey(musicBrainzAppleUrl, 'itunes')).toBe('apple:album:6793254042');

        const links = [serviceLink('apple', ffmAppleUrl), serviceLink('itunes', ffmAppleUrl, 'Download')];
        expect(findCanonicallyMatchedLinkUrls(links, [musicBrainzAppleUrl])).toEqual([ffmAppleUrl, ffmAppleUrl]);
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

    it('maps service actions to MusicBrainz URL relationship types', () => {
        expect(relationshipTypeFor(serviceLink('youtube'))).toBe(URL_RELATIONSHIP_TYPES.streamForFree);
        expect(relationshipTypeFor(serviceLink('amazon'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
        expect(relationshipTypeFor(serviceLink('youtubemusic'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
        expect(relationshipTypeFor(serviceLink('qobuz'))).toBe(URL_RELATIONSHIP_TYPES.streaming);
        expect(relationshipTypeFor(serviceLink('qobuz', undefined, 'Buy'))).toBe(URL_RELATIONSHIP_TYPES.purchaseForDownload);
        expect(relationshipTypeFor(serviceLink('archive', undefined, 'Free download'))).toBe(URL_RELATIONSHIP_TYPES.downloadForFree);
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
