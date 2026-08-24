import { describe, expect, it } from 'vitest';

import { extractBfanServiceData } from '../../src/userscripts/bfan_importer/logic';

describe('bfan.link importer logic', () => {
    it('extracts displayed release URLs in CTA order and skips empty search fallbacks', () => {
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

    it('returns no links for unrelated or malformed payloads', () => {
        expect(extractBfanServiceData(null)).toEqual([]);
        expect(extractBfanServiceData({ props: { pageProps: {} } })).toEqual([]);
    });
});
