import { describe, expect, it } from 'vitest';

import {
    actionFromAriaLabel,
    cleanAlbumLinkPageUrl,
    extractAlbumLinkPageData,
    serviceLabelFromAriaLabel,
} from '~/userscripts/albumlink_importer/logic';

describe('album.link importer logic', () => {
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
});
