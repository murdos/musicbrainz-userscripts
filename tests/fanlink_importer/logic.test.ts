import { describe, expect, it } from 'vitest';

import { extractFanlinkServiceData, extractFanlinkServiceDataFromScript } from '~/userscripts/fanlink_importer/logic';

describe('fanlink.tv importer logic', () => {
    it('extracts active provider destinations from the preload payload', () => {
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

    it('skips malformed services and unrelated payloads', () => {
        expect(extractFanlinkServiceData(null)).toEqual([]);
        expect(extractFanlinkServiceData({ services: [{ active: true, service_name: 'spotify' }] })).toEqual([]);
        expect(extractFanlinkServiceData({ services: 'not-an-array' })).toEqual([]);
    });

    it('reads the preload assignment from Fanlink page source', () => {
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
