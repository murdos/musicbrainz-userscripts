import fs from 'node:fs';
import vm from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MBLinks } from '../../src/lib/mblinks';

type QobuzHelpers = {
    getQobuzEntityId: (url: string, mbType: string) => string | null;
    getQobuzUrlRegex: (entityId: string, mbType: string) => string | null;
};

function loadQobuzHelpers(): QobuzHelpers {
    const source = fs.readFileSync(new URL('../../qobuz_importer.user.js', import.meta.url), 'utf8');
    const jquery = Object.assign(
        () => ({
            on() {},
            ready() {},
        }),
        {
            noConflict: () => jquery,
        },
    );
    const context = {
        URL,
        document: {},
        jQuery: jquery,
    };
    vm.runInNewContext(`${source}\nglobalThis.qobuzHelpers = { getQobuzEntityId, getQobuzUrlRegex };`, context);
    return (context as typeof context & { qobuzHelpers: QobuzHelpers }).qobuzHelpers;
}

const helpers = loadQobuzHelpers();

describe('Qobuz URL lookup regexes', () => {
    it.each([
        ['https://www.qobuz.com/nl-nl/interpreter/marcu-rares/8365719', 'artist', '8365719'],
        ['https://www.qobuz.com/interpreter/marcu-rares/8365719', 'artist', '8365719'],
        ['https://open.qobuz.com/artist/8365719', 'artist', '8365719'],
        ['https://play.qobuz.com/artist/8365719', 'artist', '8365719'],
        ['https://www.qobuz.com/us-en/album/salvaging-the-future-dean-de-benedictis/ki3mxj3oly9vd', 'release', 'ki3mxj3oly9vd'],
        ['https://www.qobuz.com/album/salvaging-the-future-dean-de-benedictis/ki3mxj3oly9vd', 'release', 'ki3mxj3oly9vd'],
        ['https://open.qobuz.com/album/ki3mxj3oly9vd', 'release', 'ki3mxj3oly9vd'],
        ['https://play.qobuz.com/album/ki3mxj3oly9vd', 'release', 'ki3mxj3oly9vd'],
        ['https://www.qobuz.com/nl-nl/label/london-records-because-ltd/download-streaming-albums/4899837', 'label', '4899837'],
        ['https://www.qobuz.com/label/london-records-because-ltd/download-streaming-albums/4899837', 'label', '4899837'],
        ['https://play.qobuz.com/label/4899837', 'label', '4899837'],
    ])('extracts %s', (url, mbType, expectedId) => {
        expect(helpers.getQobuzEntityId(url, mbType)).toBe(expectedId);
    });

    it.each([
        [
            'artist',
            '8365719',
            [
                'https://www.qobuz.com/nl-nl/interpreter/marcu-rares/8365719',
                'https://www.qobuz.com/interpreter/marcu-rares/8365719',
                'https://open.qobuz.com/artist/8365719',
                'https://play.qobuz.com/artist/8365719',
            ],
        ],
        [
            'release',
            'ki3mxj3oly9vd',
            [
                'https://www.qobuz.com/us-en/album/salvaging-the-future-dean-de-benedictis/ki3mxj3oly9vd',
                'https://www.qobuz.com/album/salvaging-the-future-dean-de-benedictis/ki3mxj3oly9vd',
                'https://open.qobuz.com/album/ki3mxj3oly9vd',
                'https://play.qobuz.com/album/ki3mxj3oly9vd',
            ],
        ],
        [
            'label',
            '4899837',
            [
                'https://www.qobuz.com/nl-nl/label/london-records-because-ltd/download-streaming-albums/4899837',
                'https://www.qobuz.com/label/london-records-because-ltd/download-streaming-albums/4899837',
                'https://play.qobuz.com/label/4899837',
            ],
        ],
    ])('matches all %s lookup forms in one expression', (mbType, id, urls) => {
        const source = helpers.getQobuzUrlRegex(id, mbType);
        expect(source).not.toBeNull();
        const regex = new RegExp(`^(?:${source})$`);
        urls.forEach(url => {
            expect(regex.test(url)).toBe(true);
        });
        expect(regex.test(`https://playqobuz.com/${mbType}/${id}`)).toBe(false);
    });
});

describe('MBLinks regex URL search', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            key: vi.fn(() => null),
            length: 0,
            removeItem: vi.fn(),
            setItem: vi.fn(),
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('maps relation-list search results back to the logical cache key', async () => {
        const requestedUrls: string[] = [];
        const fetchMock = vi.fn((input: string) => {
            requestedUrls.push(input);
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        count: 1,
                        offset: 0,
                        urls: [
                            {
                                resource: 'https://play.qobuz.com/artist/8365719',
                                'relation-list': [
                                    {
                                        relations: [
                                            {
                                                artist: { id: '12345678-1234-1234-1234-123456789abc' },
                                                ended: false,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }),
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const insert = vi.fn();
        const mblinks = new MBLinks('QOBUZ_TEST');
        const urlRegex = helpers.getQobuzUrlRegex('8365719', 'artist');

        mblinks.searchAndDisplayMbLinksByRegex([
            {
                url: 'https://www.qobuz.com/interpreter/marcu-rares/8365719',
                url_regex: urlRegex!,
                mb_type: 'artist',
                insert_func: insert,
                key: 'qobuz:artist:8365719',
            },
        ]);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(decodeURIComponent(requestedUrls[0]!)).toContain('query=url:/');
        expect(insert).toHaveBeenCalledWith(expect.stringContaining('/artist/12345678-1234-1234-1234-123456789abc'));
        expect(mblinks.resolveMBID('qobuz:artist:8365719')).toBe('12345678-1234-1234-1234-123456789abc');
    });
});
