import { afterEach, describe, expect, test, vi } from 'vitest';

import { readServerPreference, saveServerPreference } from '../../src/lib/smart-link-importer/server-preference';

const PREFERENCE_KEY = 'smartlink-mb-importer:server';
const PRODUCTION = 'https://musicbrainz.org';
const BETA = 'https://beta.musicbrainz.org';

function stubLocalStorage(stored: string | null = null): {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
} {
    const localStorage = {
        getItem: vi.fn(() => stored),
        setItem: vi.fn(),
    };
    vi.stubGlobal('window', { localStorage });
    return localStorage;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('MusicBrainz server preference', () => {
    test('reads the preference from userscript storage', async () => {
        const localStorage = stubLocalStorage(PRODUCTION);
        const getValue = vi.fn(() => Promise.resolve(BETA));
        vi.stubGlobal('GM', { getValue });

        await expect(readServerPreference()).resolves.toBe(BETA);
        expect(getValue).toHaveBeenCalledWith(PREFERENCE_KEY);
        expect(localStorage.getItem).not.toHaveBeenCalled();
    });

    test('migrates the old origin-scoped preference', async () => {
        stubLocalStorage(BETA);
        const getValue = vi.fn(() => Promise.resolve(undefined));
        const setValue = vi.fn(() => Promise.resolve(undefined));
        vi.stubGlobal('GM', { getValue, setValue });

        await expect(readServerPreference()).resolves.toBe(BETA);
        expect(setValue).toHaveBeenCalledWith(PREFERENCE_KEY, BETA);
    });

    test('supports the legacy synchronous userscript API', async () => {
        const localStorage = stubLocalStorage();
        const getValue = vi.fn(() => BETA);
        vi.stubGlobal('GM_getValue', getValue);

        await expect(readServerPreference()).resolves.toBe(BETA);
        expect(localStorage.getItem).not.toHaveBeenCalled();
    });

    test('falls back to page storage when userscript storage fails', async () => {
        stubLocalStorage(BETA);
        vi.stubGlobal('GM', {
            getValue: vi.fn(() => Promise.reject(new Error('unavailable'))),
        });

        await expect(readServerPreference()).resolves.toBe(BETA);
    });

    test('stores the preference with the userscript manager', async () => {
        const localStorage = stubLocalStorage();
        const setValue = vi.fn(() => Promise.resolve(undefined));
        vi.stubGlobal('GM', { setValue });

        await saveServerPreference(BETA);

        expect(setValue).toHaveBeenCalledWith(PREFERENCE_KEY, BETA);
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    test('defaults to the production server', async () => {
        stubLocalStorage('invalid');

        await expect(readServerPreference()).resolves.toBe(PRODUCTION);
    });
});
