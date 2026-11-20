import { afterEach, expect, it, vi } from 'vitest';

import { MBImport } from '~/lib/mbimport';
import type { MBLinks, MBLinkQuery } from '~/lib/mblinks';
import type { Release } from '~/types/importers';
import { linkBeatportRelease } from '~/userscripts/beatport_importer/linking';
import type { BeatportReleaseData } from '~/userscripts/beatport_importer/types';

class ElementStub {
    attributes = new Map<string, string>();
    isConnected = true;
    classList = { add: vi.fn() };
    style = {};
    title = '';
    textContent = '';
    href = '';
    name = '';
    value = '';
    type = '';
    children: ElementStub[] = [];
    indicator?: ElementStub;
    hasAttribute(name: string) {
        return this.attributes.has(name);
    }
    setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
    }
    removeAttribute(name: string) {
        this.attributes.delete(name);
    }
    before(element: ElementStub) {
        this.indicator = element;
    }
    prepend(element: ElementStub) {
        this.indicator = element;
    }
    append(element: ElementStub) {
        this.children.push(element);
    }
    addEventListener() {}
    replaceChildren = vi.fn();
    insertAdjacentHTML = vi.fn();
    remove() {
        this.isConnected = false;
    }
    querySelectorAll() {
        return this.children;
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup() {
    const title = new ElementStub();
    const artist = Object.assign(new ElementStub(), { href: '/artist/germind/300027', title: 'Germind' });
    const label = Object.assign(new ElementStub(), { href: '/label/plexus-music/30978', title: 'Plexus Music' });
    const secondary = Object.assign(new ElementStub(), { href: '/artist/other/99', title: 'Other' });
    const links = [artist, label, secondary];
    const form = new ElementStub();
    const header = { querySelector: () => title, contains: (element: ElementStub) => element === artist || element === label };
    const documentStub = {
        body: {},
        querySelector: (selector: string) => (selector.includes('form') ? form : header),
        querySelectorAll: (selector: string) =>
            selector.includes('a[href]')
                ? links
                : selector.startsWith('.')
                  ? [title, ...links].flatMap(target => (target.indicator ? [target.indicator] : []))
                  : [title, ...links],
        createElement: () => new ElementStub(),
    };
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', { location: new URL('https://www.beatport.com/release/space-chiller/7575414?test=1') });
    let scan = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
        'MutationObserver',
        class {
            constructor(callback: () => void) {
                scan = callback;
            }
            observe() {}
            disconnect = disconnect;
        },
    );
    vi.spyOn(MBImport, 'createEntityLookupIndicator').mockImplementation(() => new ElementStub() as unknown as HTMLSpanElement);
    const setState = vi.spyOn(MBImport, 'setEntityLookupState').mockImplementation(() => {});
    const queries: MBLinkQuery[] = [];
    const resolveMBID = vi.fn((): string | undefined => 'matched-mbid');
    const mblinks = { searchAndDisplayMbLinks: (batch: MBLinkQuery[]) => queries.push(...batch), resolveMBID } as unknown as MBLinks;
    const release: Release = { title: 'Space Chiller', artist_credit: [{ artist_name: 'Germind' }, { artist_name: 'Other' }], discs: [] };
    const data = {
        artists: [
            { id: 300027, name: 'Germind' },
            { id: 99, name: 'Other' },
        ],
        label: { id: 30978 },
    } as BeatportReleaseData;
    const stop = linkBeatportRelease(mblinks, release, data);
    const finish = (query: MBLinkQuery) => {
        query.insert_func('<a href="https://musicbrainz.org/artist/matched-mbid">icon</a>');
        query.complete_func?.({ found: true, status: 'success' });
    };
    return { queries, artist, label, secondary, title, form, finish, resolveMBID, setState, scan: () => scan(), links, stop, disconnect };
}

it('links the release header and table entities and seeds only header artist and label matches', () => {
    const { queries, form, finish } = setup();
    expect(queries.map(query => query.url)).toEqual(
        expect.arrayContaining([
            'https://www.beatport.com/release/space-chiller/7575414',
            'https://www.beatport.com/artist/germind/300027',
            'https://www.beatport.com/label/plexus-music/30978',
            'https://www.beatport.com/artist/other/99',
        ]),
    );
    queries.forEach(finish);
    expect(form.children.map(input => [input.name, input.value])).toEqual([
        ['artist_credit.names.0.mbid', 'matched-mbid'],
        ['artist_credit.names.0.name', 'Germind'],
        ['labels.0.mbid', 'matched-mbid'],
    ]);
});

it('keeps search placeholders for missing entities and does not seed ambiguous matches', () => {
    const { queries, form, resolveMBID, setState, artist, finish } = setup();
    const query = queries.find(query => query.mb_type === 'artist')!;
    query.complete_func?.({ found: false, status: 'success' });
    expect(setState).toHaveBeenCalledWith(artist.indicator, 'search');
    resolveMBID.mockReturnValue(undefined);
    finish(query);
    expect(form.children).toEqual([]);
});

it('links newly paginated rows once and ignores callbacks after cleanup', () => {
    const { queries, links, scan, stop, finish, form, disconnect } = setup();
    scan();
    expect(queries).toHaveLength(4);
    links.push(Object.assign(new ElementStub(), { href: '/label/new/123', title: 'New' }));
    scan();
    expect(queries).toHaveLength(5);
    stop();
    queries.forEach(finish);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(form.children).toEqual([]);
});

it('ignores results from the previous page during SPA navigation', () => {
    const { queries, finish, form } = setup();
    window.location.href = 'https://www.beatport.com/release/another/123';
    queries.forEach(finish);
    expect(form.children).toEqual([]);
});
