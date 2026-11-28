import fs from 'node:fs';
import vm from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

type ReleaseData = {
    current: { download_pref: number | null; minimum_price: number; is_set_price?: number | null };
    freeDownloadPage?: string | null;
    trackinfo: { streaming: number | null; file: Record<string, string> | null }[];
    tralbum_subscriber_only?: boolean;
    is_private_stream?: boolean;
};

type Helpers = {
    getBandcampLinkTypes: (data: ReleaseData, description?: string) => string[];
    normalizeBandcampReleaseUrl: (url: string) => string | null;
    isBandcampDetectionAllowed: () => boolean;
    installBandcampLinkDetection: () => void;
    populateBandcampLinkTypes: (row: unknown, url: string, types: string[]) => Promise<void>;
};

function loadHelpers(overrides: Record<string, unknown> = {}): Helpers {
    const source = fs.readFileSync(new URL('../../mb_ui_enhancements.user.js', import.meta.url), 'utf8');
    const jquery = Object.assign(() => ({ ready() {} }), { noConflict: () => jquery });
    const context = vm.createContext({
        jQuery: jquery,
        document: { querySelectorAll: () => [] },
        URL,
        Event,
        setTimeout,
        clearTimeout,
        Date,
        ...overrides,
    });

    vm.runInContext(source, context);

    return vm.runInContext(
        '({ getBandcampLinkTypes, normalizeBandcampReleaseUrl, populateBandcampLinkTypes, isBandcampDetectionAllowed, installBandcampLinkDetection })',
        context,
    ) as Helpers;
}

const helpers = loadHelpers();
const url = 'https://artist.bandcamp.com/album/release';
const track = { streaming: 1, file: { 'mp3-128': 'https://audio.example/track.mp3' } };
const release = (current: ReleaseData['current']): ReleaseData => ({ current, trackinfo: [track, track] });

describe('Bandcamp availability', () => {
    it.each([
        ['paid', { download_pref: 2, minimum_price: 5, is_set_price: 1 }, ['74', '85']],
        ['name your price', { download_pref: 2, minimum_price: 0, is_set_price: null }, ['74', '75', '85']],
        ['free', { download_pref: 1, minimum_price: 0 }, ['75', '85']],
        ['streaming only', { download_pref: null, minimum_price: 0 }, ['85']],
        ['fixed price', { download_pref: 2, minimum_price: 0, is_set_price: 1 }, ['74', '85']],
    ] as const)('detects %s releases', (_name, current, expected) => {
        expect(helpers.getBandcampLinkTypes(release(current))).toEqual(expected);
    });

    it('uses the explicit free download page', () => {
        const data = release({ download_pref: 2, minimum_price: 5, is_set_price: 1 });
        data.freeDownloadPage = 'https://artist.bandcamp.com/download';

        expect(helpers.getBandcampLinkTypes(data)).toEqual(['74', '75', '85']);
    });

    it('does not mark partial albums, hidden tracks or subscriber audio as full streaming', () => {
        const data = release({ download_pref: 2, minimum_price: 5 });

        expect(helpers.getBandcampLinkTypes(data, '3 track album')).toEqual(['74']);
        expect(helpers.getBandcampLinkTypes({ ...data, tralbum_subscriber_only: true })).toEqual(['74']);

        for (const unavailable of [
            { streaming: 1, file: null },
            { streaming: null, file: track.file },
            { streaming: 1, file: {} },
        ]) {
            expect(helpers.getBandcampLinkTypes({ ...data, trackinfo: [track, unavailable] })).toEqual(['74']);
        }

        expect(helpers.getBandcampLinkTypes({ ...data, trackinfo: [] })).toEqual(['74']);
    });

    it('rejects missing release data and private streams', () => {
        expect(() => helpers.getBandcampLinkTypes({} as ReleaseData)).toThrow('Missing Bandcamp release data');
        expect(() => helpers.getBandcampLinkTypes({ ...release({ download_pref: 1, minimum_price: 0 }), is_private_stream: true })).toThrow(
            'Private',
        );
    });
});

describe('Bandcamp release URLs', () => {
    it('normalizes tracking parameters, HTTP and trailing slashes', () => {
        expect(helpers.normalizeBandcampReleaseUrl('http://artist.bandcamp.com/album/release/?from=discover#play')).toBe(url);
        expect(helpers.normalizeBandcampReleaseUrl('https://artist.bandcamp.com/track/song')).toBe(
            'https://artist.bandcamp.com/track/song',
        );
    });

    it.each([
        'https://artist.bandcamp.com.evil.example/album/release',
        'https://bandcamp.com/album/release',
        'https://artist.bandcamp.com/music',
        'https://artist.bandcamp.com/private/secret',
        'https://user:password@artist.bandcamp.com/album/release',
        'https://artist.bandcamp.com:123/album/release',
        'file:///album/release',
        'invalid',
    ])('ignores %s', value => {
        expect(helpers.normalizeBandcampReleaseUrl(value)).toBeNull();
    });
});

// Model the public editor controls, recording changes as the React handlers do.
function editor(initial: string[]) {
    const changes: string[] = [];
    const relationships: ReturnType<typeof relationship>[] = [];

    function relationship(value: string) {
        const select = {
            value,
            options: ['', '74', '75', '79', '85'].map(value => ({ value })),
            dispatchEvent(event: Event) {
                expect(event.type).toBe('change');
                expect(event.bubbles).toBe(true);
                changes.push(this.value);
            },
            closest: () => item,
        };

        const item = {
            nextElementSibling: null as unknown,
            matches: () => false,
            querySelectorAll: () => [select],
            querySelector: () =>
                relationships.length > 1
                    ? {
                          click() {
                              relationships.splice(relationships.indexOf(item), 1);
                              connect();
                          },
                      }
                    : null,
        };

        return item;
    }

    const add = {
        nextElementSibling: null,
        matches: (selector: string) => selector === '.add-relationship',
        querySelectorAll: () => [],
        querySelector: () => ({
            click() {
                relationships.push(relationship(''));
                connect();
            },
        }),
    };

    const row = {
        isConnected: true,
        nextElementSibling: null as unknown,
        querySelector: () => ({ href: url }),
    };

    function connect() {
        row.nextElementSibling = relationships[0] || add;
        relationships.forEach((item, index) => {
            item.nextElementSibling = relationships[index + 1] || add;
        });
    }

    relationships.push(...initial.map(relationship));
    connect();

    return { row, changes, values: () => relationships.map(item => item.querySelectorAll()[0]!.value) };
}

describe('External links editor controls', () => {
    it('adds all name-your-price relationships while retaining mail order', async () => {
        const form = editor(['74', '79']);
        await helpers.populateBandcampLinkTypes(form.row, url, ['74', '75', '85']);

        expect(form.values()).toEqual(['74', '79', '75', '85']);
        expect(form.changes).toEqual(['75', '85']);
    });

    it('replaces an incorrect default purchase guess', async () => {
        const form = editor(['74']);
        await helpers.populateBandcampLinkTypes(form.row, url, ['75', '85']);

        expect(form.values()).toEqual(['75', '85']);
    });

    it('removes unsupported guesses and keeps the link when no types apply', async () => {
        const form = editor(['74', '85']);
        await helpers.populateBandcampLinkTypes(form.row, url, []);

        expect(form.values()).toEqual(['']);
        expect(form.row.isConnected).toBe(true);
    });

    it('does not duplicate existing matching relationships', async () => {
        const form = editor(['74', '75', '85']);
        await helpers.populateBandcampLinkTypes(form.row, url, ['74', '75', '85']);

        expect(form.changes).toEqual([]);
        expect(form.values()).toEqual(['74', '75', '85']);
    });

    it('stops when the link is removed or changed', async () => {
        const form = editor(['74']);
        form.row.isConnected = false;
        await helpers.populateBandcampLinkTypes(form.row, url, ['75', '85']);

        expect(form.changes).toEqual([]);

        form.row.isConnected = true;
        form.row.querySelector = vi.fn(() => ({ href: 'https://artist.bandcamp.com/album/other' }));
        await helpers.populateBandcampLinkTypes(form.row, url, ['75', '85']);

        expect(form.changes).toEqual([]);
    });
});

describe('Bandcamp detection on paste', () => {
    afterEach(() => vi.useRealTimers());

    function setup(formats = ['12'], isPopover = false) {
        vi.useFakeTimers();
        const form = editor(['74']);
        let submitted = false;
        let popoverOpen = isPopover;
        const indicators: { textContent: string; className: string; removed: boolean }[] = [];
        const link = { href: url, after: (status: (typeof indicators)[number]) => indicators.push(status) };

        const row = {
            ...form.row,
            querySelector: (selector: string) =>
                selector === 'button[aria-controls="url-input-popover"]' && popoverOpen
                    ? {}
                    : selector === 'a.url' && submitted
                      ? link
                      : null,
        };
        let paste: (event: { target: Input }) => void = () => {};

        class Input {
            value = url;

            matches(selector: string) {
                return selector === (isPopover ? '#url-input-popover input.raw-url' : '#external-links-editor input.value');
            }

            closest(selector: string) {
                if (selector === 'form')
                    return {
                        requestSubmit() {
                            submitted = true;
                            popoverOpen = false;
                        },
                    };

                return row;
            }

            dispatchEvent(event: Event & { key?: string }) {
                expect(event.type).toBe('keydown');
                expect(event.key).toBe('Enter');

                submitted = true;
            }
        }

        const input = new Input();
        const request = vi.fn<(options: { onload: (response: unknown) => void; onerror: () => void }) => void>();
        const localHelpers = loadHelpers({
            document: {
                head: { appendChild() {} },
                body: {},
                querySelector: (selector: string) => (selector.includes('button[aria-controls=') ? { closest: () => row } : null),
                querySelectorAll: () => formats.map(value => ({ value })),
                addEventListener: (_name: string, listener: typeof paste) => {
                    paste = listener;
                },
                createElement: () => ({
                    style: {},
                    textContent: '',
                    className: '',
                    removed: false,
                    setAttribute() {},
                    removeAttribute() {},
                    remove() {
                        this.removed = true;
                    },
                }),
            },
            HTMLInputElement: Input,
            KeyboardEvent: class extends Event {
                key: string;

                constructor(type: string, options: KeyboardEventInit) {
                    super(type, options);
                    this.key = options.key || '';
                }
            },
            MutationObserver: class {
                observe() {}
            },
            GM_xmlhttpRequest: request,
            DOMParser: class {
                parseFromString() {
                    return {
                        querySelector: (selector: string) =>
                            selector === '[data-tralbum]'
                                ? {
                                      getAttribute: () => JSON.stringify(release({ download_pref: 2, minimum_price: 0 })),
                                  }
                                : { content: '2 track album' },
                    };
                }
            },
        });

        localHelpers.installBandcampLinkDetection();

        return {
            form,
            row,
            indicators,
            formats,
            request,
            submitted: () => submitted,
            paste: () => paste({ target: input }),
            succeed: () => request.mock.calls[0]![0].onload({ status: 200, responseText: '' }),
        };
    }

    it('accepts the URL and populates types immediately without clickout or success text', async () => {
        const state = setup();
        state.paste();
        await vi.advanceTimersByTimeAsync(0);

        expect(state.submitted()).toBe(true);
        expect(state.request).toHaveBeenCalledOnce();

        state.succeed();
        await vi.runAllTimersAsync();

        expect(state.form.values()).toEqual(['74', '75', '85']);
        expect(state.indicators.every(indicator => indicator.removed)).toBe(true);
    });

    it('accepts a pasted URL in the edit dialog without waiting for clickout', async () => {
        const state = setup(['12'], true);
        state.paste();
        await vi.advanceTimersByTimeAsync(0);

        expect(state.submitted()).toBe(true);
        expect(state.request).toHaveBeenCalledOnce();

        state.succeed();
        await vi.runAllTimersAsync();

        expect(state.form.values()).toEqual(['74', '75', '85']);
    });

    it('shows a ring immediately and removes it after completion', async () => {
        const state = setup();
        state.paste();
        await vi.advanceTimersByTimeAsync(0);

        expect(state.indicators).toHaveLength(1);
        expect(state.indicators[0]!.className).toBe('mb-ui-bandcamp-progress');
        expect(state.indicators[0]!.textContent).toBe('');

        state.succeed();
        await vi.runAllTimersAsync();

        expect(state.indicators[0]!.removed).toBe(true);
    });

    it.each([['1'], ['8'], ['12', '1']])('does not fetch or alter links for physical formats %j', async (...formats) => {
        const state = setup(formats);
        state.paste();
        await vi.runAllTimersAsync();

        expect(state.request).not.toHaveBeenCalled();
        expect(state.submitted()).toBe(false);
        expect(state.form.values()).toEqual(['74']);
    });

    it('allows unknown formats when adding a release', async () => {
        const state = setup(['']);
        state.paste();
        await vi.advanceTimersByTimeAsync(0);

        expect(state.request).toHaveBeenCalledOnce();

        state.succeed();
        await vi.runAllTimersAsync();

        expect(state.form.values()).toEqual(['74', '75', '85']);
    });

    it('does not apply a pending result after the medium changes to CD', async () => {
        const state = setup();
        state.paste();
        await vi.advanceTimersByTimeAsync(1000);
        state.formats[0] = '1';
        state.succeed();
        await vi.runAllTimersAsync();

        expect(state.form.values()).toEqual(['74']);
        expect(state.indicators[0]!.removed).toBe(true);
    });
});
