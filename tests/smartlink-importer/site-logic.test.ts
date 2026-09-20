import { describe, expect, it } from 'vitest';

import {
    actionFromAriaLabel,
    cleanAlbumLinkPageUrl,
    extractAlbumLinkPageData,
    serviceLabelFromAriaLabel,
} from '~/userscripts/smartlink_importer/utils/extractors/albumlink';
import { extractBfanServiceData } from '~/userscripts/smartlink_importer/utils/extractors/bfan';
import { extractFanlinkServiceData, extractFanlinkServiceDataFromScript } from '~/userscripts/smartlink_importer/utils/extractors/fanlink';
import { extractPromoLinksServiceData } from '~/userscripts/smartlink_importer/utils/extractors/promolinks';
import { extractSonglinkSourceRelease, parseSonglinkAriaLabel } from '~/userscripts/smartlink_importer/utils/extractors/songlink';
import { smartLinkSiteForHostname } from '~/userscripts/smartlink_importer/utils/site-routing';

describe('Smartlink importer site adapters', () => {
    it('extracts album entity data from the Next.js payload', () => {
        const payload = {
            props: {
                pageProps: {
                    pageData: {
                        pageUrl: 'https://album.link/StartOver',
                        entityData: { provider: 'spotify', type: 'album', id: 'example' },
                    },
                },
            },
        };

        expect(extractAlbumLinkPageData(payload)).toEqual({
            canonicalUrl: 'https://album.link/StartOver',
            entityType: 'album',
        });
    });

    it('exposes track entities so the importer can skip them', () => {
        const payload = {
            props: {
                pageProps: {
                    pageData: {
                        pageUrl: 'https://album.link/example-track',
                        entityData: { type: 'song' },
                    },
                },
            },
        };

        expect(extractAlbumLinkPageData(payload)?.entityType).toBe('song');
        expect(extractAlbumLinkPageData(null)).toBeUndefined();
        expect(extractAlbumLinkPageData({ props: { pageProps: { pageData: { entityData: { type: 'album' } } } } })).toBeUndefined();
    });

    it('cleans tracking from the page URL and prefers its canonical spelling', () => {
        expect(
            cleanAlbumLinkPageUrl(
                'https://album.link/startover?utm_campaign=newsletter&utm_source=example.test#listen',
                'https://album.link/StartOver',
            ),
        ).toBe('https://album.link/StartOver');
        expect(cleanAlbumLinkPageUrl('https://album.link/StartOver?utm_medium=newsletter')).toBe('https://album.link/StartOver');
    });

    it('reads the provider action from accessible link labels', () => {
        expect(actionFromAriaLabel('Listen to Start over by My second guess on Spotify')).toBe('Listen');
        expect(actionFromAriaLabel('Purchase and download Start over by My second guess on Bandcamp')).toBe('Purchase and download');
        expect(actionFromAriaLabel('Spotify')).toBe('');
    });

    it('reads provider names without SVG text contaminating them', () => {
        expect(serviceLabelFromAriaLabel('Listen to Start over by My second guess on TIDAL')).toBe('TIDAL');
        expect(serviceLabelFromAriaLabel('Purchase and download Start over by My second guess on Bandcamp')).toBe('Bandcamp');
        expect(serviceLabelFromAriaLabel('Listen')).toBe('');
    });

    it.each([
        ['album.link', 'albumlink'],
        ['listen.album.link', 'albumlink'],
        ['band.link', 'bandlink'],
        ['artist.band.link', 'bandlink'],
        ['bfan.link', 'bfan'],
        ['fanlink.tv', 'fanlink'],
        ['ffm.to', 'ffm'],
        ['label-caster.ffm.to', 'ffm'],
        ['idm.fm', 'ffm'],
        ['listen.idm.fm', 'ffm'],
        ['orcd.co', 'ffm'],
        ['promolinks.me', 'promolinks'],
        ['slowecho.promolinks.me', 'promolinks'],
        ['song.link', 'songlink'],
        ['listen.song.link', 'songlink'],
    ] as const)('routes %s to its site adapter', (hostname, adapter) => {
        expect(smartLinkSiteForHostname(hostname)).toBe(adapter);
    });

    it('does not route lookalike hostnames', () => {
        expect(smartLinkSiteForHostname('notalbum.link.example')).toBeUndefined();
        expect(smartLinkSiteForHostname('evilffm.to.example')).toBeUndefined();
        expect(smartLinkSiteForHostname('idm.fm.example')).toBeUndefined();
        expect(smartLinkSiteForHostname('promolinks.me.example')).toBeUndefined();
        expect(smartLinkSiteForHostname('song.link.example')).toBeUndefined();
    });

    it('reads Songlink provider names and actions from rendered link labels', () => {
        expect(parseSonglinkAriaLabel('Listen to The tone used by My second guess on Apple Music')).toEqual({
            label: 'Apple Music',
            action: 'Listen',
        });
        expect(parseSonglinkAriaLabel('Purchase and download The tone used by My second guess on Bandcamp')).toEqual({
            label: 'Bandcamp',
            action: 'Purchase and download',
        });
        expect(parseSonglinkAriaLabel('', ' TIDAL ')).toEqual({ label: 'TIDAL', action: '' });
    });

    it('builds the source provider’s album URL from Songlink track metadata', () => {
        const payload = {
            props: {
                pageProps: {
                    pageData: {
                        entityData: {
                            provider: 'spotify',
                            type: 'song',
                            id: '3ATFXOSiY7xsOwwS3ymNzf',
                            albumId: '4h6YzqwjL7RNhHGIld2rhS',
                        },
                    },
                },
            },
        };

        expect(extractSonglinkSourceRelease(payload)).toEqual({
            service: 'spotify',
            url: 'https://open.spotify.com/album/4h6YzqwjL7RNhHGIld2rhS',
        });
        expect(extractSonglinkSourceRelease({ props: { pageProps: { pageData: { entityData: { type: 'album' } } } } })).toBeUndefined();
    });

    it('extracts PromoLinks providers from MusicRelease JSON-LD for later applicability checks', () => {
        const payload = {
            '@context': 'https://schema.org',
            '@type': 'MusicRelease',
            sameAs: [
                'https://open.spotify.com/track/example',
                'https://open.spotify.com/album/release-example',
                'https://slowechospace.bandcamp.com/album/from-dust',
                'https://music.apple.com/us/album/from-dust/123?i=456&uo=4',
                'https://music.youtube.com/watch?v=example',
                'https://www.youtube.com/watch?v=example&list=release-playlist',
                'https://www.deezer.com/track/example',
                'https://listen.tidal.com/search?q=Artist%20Title',
            ],
        };

        expect(extractPromoLinksServiceData(payload)).toEqual([
            { service: 'spotify', label: 'Spotify', sourceUrl: 'https://open.spotify.com/track/example' },
            { service: 'spotify', label: 'Spotify', sourceUrl: 'https://open.spotify.com/album/release-example' },
            {
                service: 'bandcamp',
                label: 'Bandcamp',
                sourceUrl: 'https://slowechospace.bandcamp.com/album/from-dust',
            },
            {
                service: 'apple',
                label: 'Apple Music',
                sourceUrl: 'https://music.apple.com/us/album/from-dust/123?i=456&uo=4',
            },
            { service: 'youtubemusic', label: 'YouTube Music', sourceUrl: 'https://music.youtube.com/watch?v=example' },
            {
                service: 'youtube',
                label: 'YouTube',
                sourceUrl: 'https://www.youtube.com/watch?v=example&list=release-playlist',
            },
            { service: 'deezer', label: 'Deezer', sourceUrl: 'https://www.deezer.com/track/example' },
            { service: 'tidal', label: 'Tidal', sourceUrl: 'https://listen.tidal.com/search?q=Artist%20Title' },
        ]);
    });

    it('finds PromoLinks MusicRelease data inside a JSON-LD graph', () => {
        expect(
            extractPromoLinksServiceData({
                '@graph': [
                    { '@type': 'Organization', sameAs: ['https://open.spotify.com/user/not-a-release'] },
                    { '@type': ['CreativeWork', 'MusicRelease'], sameAs: ['https://www.deezer.com/album/example'] },
                ],
            }),
        ).toEqual([{ service: 'deezer', label: 'Deezer', sourceUrl: 'https://www.deezer.com/album/example' }]);
        expect(extractPromoLinksServiceData(null)).toEqual([]);
        expect(extractPromoLinksServiceData({ '@type': 'Organization' })).toEqual([]);
    });

    it('extracts PromoLinks providers from MusicAlbum JSON-LD', () => {
        expect(
            extractPromoLinksServiceData({
                '@context': 'https://schema.org',
                '@type': 'MusicAlbum',
                sameAs: [
                    'https://open.spotify.com/album/0OcobWxBbatAcL1aazq07e',
                    'https://firstsnowoftheyear.bandcamp.com/album/the-sun-rose-a-breeze',
                    'https://listen.tidal.com/album/495828845',
                ],
            }),
        ).toEqual([
            {
                service: 'spotify',
                label: 'Spotify',
                sourceUrl: 'https://open.spotify.com/album/0OcobWxBbatAcL1aazq07e',
            },
            {
                service: 'bandcamp',
                label: 'Bandcamp',
                sourceUrl: 'https://firstsnowoftheyear.bandcamp.com/album/the-sun-rose-a-breeze',
            },
            { service: 'tidal', label: 'Tidal', sourceUrl: 'https://listen.tidal.com/album/495828845' },
        ]);
    });

    it('extracts displayed bfan.link URLs in CTA order and skips empty search fallbacks', () => {
        const payload = {
            props: {
                pageProps: {
                    backlinkStaticData: {
                        mode: 'postrelease',
                        stores: {
                            spotify: { displayName: 'Spotify', urls: { default: 'http://open.spotify.com/album/example' } },
                            appleMusic: { displayName: 'Apple Music', urls: { default: 'https://geo.itunes.apple.com/at/album/id123' } },
                            tidal: { displayName: 'Tidal', urls: { default: '' }, searchFallbackUrlDesktop: 'https://tidal.com/search' },
                            deezer: { displayName: 'Deezer', urls: { default: 'https://www.deezer.com/album/456' } },
                        },
                        postreleaseLandingCTAs: {
                            displayOrder: ['appleMusic', 'spotify', 'tidal', 'deezer'],
                            options: {
                                appleMusic: { label: 'Play', isDisplayed: true },
                                spotify: { label: 'Listen', isDisplayed: true },
                                tidal: { label: 'Play', isDisplayed: true },
                                deezer: { label: 'Play', isDisplayed: false },
                            },
                        },
                    },
                },
            },
        };

        expect(extractBfanServiceData(payload)).toEqual([
            {
                service: 'apple',
                label: 'Apple Music',
                action: 'Play',
                sourceUrl: 'https://geo.itunes.apple.com/at/album/id123',
            },
            {
                service: 'spotify',
                label: 'Spotify',
                action: 'Listen',
                sourceUrl: 'http://open.spotify.com/album/example',
            },
        ]);
    });

    it('returns no bfan.link URLs for unrelated or malformed payloads', () => {
        expect(extractBfanServiceData(null)).toEqual([]);
        expect(extractBfanServiceData({ props: { pageProps: {} } })).toEqual([]);
    });

    it('extracts active fanlink.tv destinations from the preload payload', () => {
        const payload = {
            services: [
                {
                    id: 21718,
                    url: 'https://mounika.bandcamp.com/track/crave-you-ft-racoon-racoon',
                    active: true,
                    service_name: 'bandcamp',
                },
                {
                    id: 91222,
                    url: 'https://music.apple.com/fr/album/crave-you-single/6766943288?at=1001lbRT',
                    active: true,
                    service_name: 'apple-music',
                },
                {
                    id: 1,
                    url: 'https://example.com/unavailable',
                    active: false,
                    service_name: 'Unavailable Store',
                },
            ],
        };

        expect(extractFanlinkServiceData(payload)).toEqual([
            {
                service: 'bandcamp',
                label: 'Bandcamp',
                sourceUrl: 'https://mounika.bandcamp.com/track/crave-you-ft-racoon-racoon',
            },
            {
                service: 'apple',
                label: 'Apple Music',
                sourceUrl: 'https://music.apple.com/fr/album/crave-you-single/6766943288?at=1001lbRT',
            },
        ]);
    });

    it('skips malformed fanlink.tv services and unrelated payloads', () => {
        expect(extractFanlinkServiceData(null)).toEqual([]);
        expect(extractFanlinkServiceData({ services: [{ active: true, service_name: 'spotify' }] })).toEqual([]);
        expect(extractFanlinkServiceData({ services: 'not-an-array' })).toEqual([]);
    });

    it('reads the preload assignment from fanlink.tv page source', () => {
        const source = `
            window.preloadLink = {"services":[{"url":"https://open.spotify.com/album/example","active":true,"service_name":"spotify"}]};
            window.preloadCustomDomain = null;
        `;

        expect(extractFanlinkServiceDataFromScript(source)).toEqual([
            {
                service: 'spotify',
                label: 'Spotify',
                sourceUrl: 'https://open.spotify.com/album/example',
            },
        ]);
        expect(extractFanlinkServiceDataFromScript('window.preloadLink = invalid;')).toEqual([]);
    });
});
