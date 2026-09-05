import { describe, expect, it } from 'vitest';

import { normalizeServiceUrl } from '~/lib/smart-link-importer/logic';
import { extractSonglinkSourceRelease, isTrackLevelServiceUrl, parseSonglinkAriaLabel } from '~/userscripts/songlink_importer/logic';

describe('song.link importer logic', () => {
    it('extracts provider names and actions from rendered link labels', () => {
        expect(parseSonglinkAriaLabel('Listen to The tone used by My second guess on Apple Music')).toEqual({
            label: 'Apple Music',
            action: 'Listen',
        });
        expect(parseSonglinkAriaLabel('Purchase and download The tone used by My second guess on Bandcamp')).toEqual({
            label: 'Bandcamp',
            action: 'Purchase and download',
        });
    });

    it('uses the visible provider name when an accessible label is unavailable', () => {
        expect(parseSonglinkAriaLabel('', ' TIDAL ')).toEqual({ label: 'TIDAL', action: '' });
    });

    it('removes tracking parameters from provider URLs before insertion', () => {
        expect(normalizeServiceUrl('https://example.com/release?utm_source=songlink&utm_medium=smartlink&id=123', 'example')).toBe(
            'https://example.com/release?id=123',
        );
        expect(normalizeServiceUrl('https://music.amazon.com/albums/B0H5WFWC1L?trackAsin=B0H5W9VBSZ', 'amazonMusic')).toBe(
            'https://music.amazon.com/albums/B0H5WFWC1L',
        );
    });

    it('builds a Spotify album URL from the source track metadata', () => {
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

    it('identifies track-only destinations while retaining release and album-playlist links', () => {
        expect(isTrackLevelServiceUrl('https://open.spotify.com/track/3ATFXOSiY7xsOwwS3ymNzf', 'spotify')).toBe(true);
        expect(isTrackLevelServiceUrl('https://listen.tidal.com/track/534545657', 'tidal')).toBe(true);
        expect(isTrackLevelServiceUrl('https://www.pandora.com/TR:207636456', 'pandora')).toBe(true);
        expect(isTrackLevelServiceUrl('https://www.youtube.com/watch?v=example', 'youtube')).toBe(true);
        expect(isTrackLevelServiceUrl('https://open.spotify.com/album/4h6YzqwjL7RNhHGIld2rhS', 'spotify')).toBe(false);
        expect(isTrackLevelServiceUrl('https://www.youtube.com/watch?v=example&list=OLAK5uy_example', 'youtube')).toBe(false);
    });
});
