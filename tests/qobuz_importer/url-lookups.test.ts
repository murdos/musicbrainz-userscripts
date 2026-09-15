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

    it('resolves discovered resources to obtain relationships missing from search results', async () => {
        const requestedUrls: string[] = [];
        const fetchMock = vi
            .fn()
            .mockImplementationOnce((input: string) => {
                requestedUrls.push(input);
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            count: 1,
                            offset: 0,
                            urls: [
                                {
                                    resource: 'https://www.qobuz.com/us-en/label/supply-room-records/download-streaming-albums/2777001',
                                },
                            ],
                        }),
                });
            })
            .mockImplementationOnce((input: string) => {
                requestedUrls.push(input);
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            resource: 'https://www.qobuz.com/us-en/label/supply-room-records/download-streaming-albums/2777001',
                            relations: [
                                {
                                    label: { id: '42d8e9b8-e60e-4588-895a-ee80709bc6cc' },
                                    ended: false,
                                },
                            ],
                        }),
                });
            });
        vi.stubGlobal('fetch', fetchMock);
        const insert = vi.fn();
        const complete = vi.fn();
        const mblinks = new MBLinks('QOBUZ_TEST');
        const urlRegex = helpers.getQobuzUrlRegex('2777001', 'label');

        mblinks.searchAndDisplayMbLinksByRegex([
            {
                url: 'https://play.qobuz.com/label/2777001',
                url_regex: urlRegex!,
                mb_type: 'label',
                insert_func: insert,
                complete_func: complete,
                key: 'qobuz:label:2777001',
            },
        ]);
        await vi.advanceTimersByTimeAsync(2000);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(decodeURIComponent(requestedUrls[0]!)).toContain('query=url:/');
        expect(decodeURIComponent(requestedUrls[1]!)).toContain(
            'resource=https://www.qobuz.com/us-en/label/supply-room-records/download-streaming-albums/2777001&inc=label-rels',
        );
        expect(insert).toHaveBeenCalledWith(expect.stringContaining('/label/42d8e9b8-e60e-4588-895a-ee80709bc6cc'));
        expect(complete).toHaveBeenCalledWith({ found: true, status: 'success' });
        expect(mblinks.resolveMBID('qobuz:label:2777001')).toBe('42d8e9b8-e60e-4588-895a-ee80709bc6cc');
    });

    it('reports a successful lookup with no matching entity', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ resource: 'https://example.com/release', relations: [] }),
                }),
            ),
        );
        const complete = vi.fn();
        const mblinks = new MBLinks('NO_MATCH_TEST');

        mblinks.searchAndDisplayMbLinks([
            {
                url: 'https://example.com/release',
                mb_type: 'release',
                insert_func: vi.fn(),
                complete_func: complete,
            },
        ]);
        await vi.advanceTimersByTimeAsync(1000);

        expect(complete).toHaveBeenCalledWith({ found: false, status: 'success' });
    });

    it('reports a terminal lookup failure separately from no match', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve({ ok: false, status: 400 })),
        );
        const complete = vi.fn();
        const mblinks = new MBLinks('FAILED_LOOKUP_TEST');

        mblinks.searchAndDisplayMbLinks([
            {
                url: 'https://example.com/release',
                mb_type: 'release',
                insert_func: vi.fn(),
                complete_func: complete,
            },
        ]);
        await vi.advanceTimersByTimeAsync(1000);

        expect(complete).toHaveBeenCalledWith({ found: false, status: 'error' });
    });

    it('does not complete a lookup while a failed request is waiting to retry', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503 }))
            .mockImplementationOnce(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ resource: 'https://example.com/release', relations: [] }),
                }),
            );
        vi.stubGlobal('fetch', fetchMock);
        const complete = vi.fn();
        const mblinks = new MBLinks('RETRYING_LOOKUP_TEST');

        mblinks.searchAndDisplayMbLinks([
            {
                url: 'https://example.com/release',
                mb_type: 'release',
                insert_func: vi.fn(),
                complete_func: complete,
            },
        ]);
        await vi.advanceTimersByTimeAsync(1_999);

        expect(complete).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        expect(complete).toHaveBeenCalledWith({ found: false, status: 'success' });
    });

    it('reports a failure from the relationship stage of a regex lookup', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            count: 1,
                            offset: 0,
                            urls: [{ resource: 'https://example.com/release' }],
                        }),
                }),
            )
            .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 400 }));
        vi.stubGlobal('fetch', fetchMock);
        const complete = vi.fn();
        const mblinks = new MBLinks('FAILED_REGEX_LOOKUP_TEST');

        mblinks.searchAndDisplayMbLinksByRegex([
            {
                url: 'https://example.com/release',
                url_regex: String.raw`https:\/\/example\.com\/release`,
                mb_type: 'release',
                insert_func: vi.fn(),
                complete_func: complete,
            },
        ]);
        await vi.advanceTimersByTimeAsync(2000);

        expect(complete).toHaveBeenCalledWith({ found: false, status: 'error' });
    });

    it('keeps retries at least one second apart from other requests', async () => {
        const requestTimes: number[] = [];
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => {
                requestTimes.push(Date.now());
                return Promise.resolve({ ok: false, status: 503 });
            })
            .mockImplementation(() => {
                requestTimes.push(Date.now());
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
            });
        vi.stubGlobal('fetch', fetchMock);
        const mblinks = new MBLinks('QOBUZ_RETRY_TEST');

        mblinks.getJSONWithRetry('first', vi.fn());
        mblinks.getJSONWithRetry('second', vi.fn());
        await vi.advanceTimersByTimeAsync(3000);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(requestTimes[1]! - requestTimes[0]!).toBeGreaterThanOrEqual(1000);
        expect(requestTimes[2]! - requestTimes[1]!).toBeGreaterThanOrEqual(1000);
    });

    it('keeps retrying 503 responses with exponential backoff', async () => {
        const requestTimes: number[] = [];
        const fetchMock = vi.fn(() => {
            requestTimes.push(Date.now());
            const ok = requestTimes.length === 6;
            return Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve({}) });
        });
        vi.stubGlobal('fetch', fetchMock);
        const mblinks = new MBLinks('QOBUZ_BACKOFF_TEST');

        mblinks.getJSONWithRetry('request', vi.fn());
        await vi.advanceTimersByTimeAsync(32_000);

        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(requestTimes.map((time, index) => (index === 0 ? 0 : time - requestTimes[index - 1]!))).toEqual([
            0, 1000, 2000, 4000, 8000, 16_000,
        ]);
    });

    it('pauses queued requests until the server-provided rate-limit reset', async () => {
        vi.setSystemTime('2026-09-15T00:00:00Z');
        const requests: { time: number; url: string }[] = [];
        const xmlHttpRequest = vi.fn(
            (details: {
                onload: (response: {
                    response: Record<string, unknown>;
                    responseHeaders: string;
                    responseText: string;
                    status: number;
                }) => void;
                url: string;
            }) => {
                requests.push({ time: Date.now(), url: details.url });
                const isRateLimitedResponse = requests.length === 1;
                details.onload({
                    status: isRateLimitedResponse ? 503 : 200,
                    response: {},
                    responseText: '',
                    responseHeaders: isRateLimitedResponse
                        ? 'Date: Tue, 15 Sep 2026 00:00:00 GMT\r\nX-RateLimit-Reset: 1789430410\r\nX-RateLimit-Remaining: 12\r\n'
                        : '',
                });
            },
        );
        vi.stubGlobal('GM', { xmlHttpRequest });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const mblinks = new MBLinks('QOBUZ_RATE_LIMIT_RESET_TEST');

        mblinks.getJSONWithRetry('first', vi.fn());
        mblinks.getJSONWithRetry('second', vi.fn());
        await vi.advanceTimersByTimeAsync(9_999);

        expect(requests).toEqual([{ time: Date.parse('2026-09-15T00:00:00Z'), url: 'first' }]);

        await vi.advanceTimersByTimeAsync(1_001);

        expect(requests.map(request => [request.time - Date.parse('2026-09-15T00:00:00Z'), request.url])).toEqual([
            [0, 'first'],
            [10_000, 'second'],
            [11_000, 'first'],
        ]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stops retrying before the five-minute retry budget is exceeded', async () => {
        const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
        const done = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const mblinks = new MBLinks('QOBUZ_RETRY_BUDGET_TEST');

        mblinks.getJSONWithRetry('request', vi.fn(), done);
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        expect(fetchMock).toHaveBeenCalledTimes(14);
        expect(done).toHaveBeenCalledOnce();
    });
});
