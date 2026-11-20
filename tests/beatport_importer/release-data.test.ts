import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Logger } from '~/lib/logger';
import type { BeatportPageData, BeatportReleaseData, BeatportTrackData } from '~/userscripts/beatport_importer/types';

const tracksURL = 'https://api.beatport.com/v4/catalog/releases/7518082/tracks/?page=1&per_page=100';
const logger = new Logger('beatport_test');
const track = { id: 30785933, release: { id: 7518082 } } as BeatportTrackData;

class MockXMLHttpRequest extends EventTarget {
    status = 200;
    responseType = '';
    response = { results: [track] };
    responseText = JSON.stringify(this.response);

    open(_method: string, _url: string | URL, _async = true, _username?: string | null, _password?: string | null) {}
    setRequestHeader(_name: string, _value: string) {}

    send() {
        const event = new Event('loadend');
        this.dispatchEvent(event);
    }
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const setup = async (embedded = false, trackCount = 1) => {
    const release = { id: 7518082, track_count: trackCount } as BeatportReleaseData;
    const data: BeatportPageData = { pageProps: { release, dehydratedState: { queries: [] } } };

    if (embedded) {
        const query = { queryKey: ['release-7518082-tracks'], state: { data: { results: [track] } } };
        data.pageProps.dehydratedState.queries.push(query);
    }

    const initialState = JSON.stringify({ props: data });
    const fetchMock = vi.fn<typeof fetch>();
    const browserWindow = { location: new URL('https://www.beatport.com/release/interchange/7518082'), fetch: fetchMock };
    const browserDocument = { getElementById: () => ({ innerHTML: initialState }) };
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', browserDocument);
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => window.fetch(input, init));

    // Each test gets an unpatched prototype.
    class TestXMLHttpRequest extends MockXMLHttpRequest {}
    vi.stubGlobal('XMLHttpRequest', TestXMLHttpRequest);

    const helpers = await import('~/userscripts/beatport_importer/utils/getBeatportReleaseData');
    helpers.installFetchInterceptor(logger);

    return { fetchMock, getRelease: helpers.getBeatportReleaseData };
};

it('waits for and reuses Beatport’s authenticated track response without consuming its body', async () => {
    const { fetchMock, getRelease } = await setup();
    const responseData = { results: [track] };
    const response = Response.json(responseData);
    fetchMock.mockResolvedValue(response);
    const pendingRelease = getRelease(logger);
    await vi.advanceTimersByTimeAsync(500);

    const headers = new Headers({ Authorization: 'Bearer test-only' });
    const originalResponse = await window.fetch(tracksURL, { headers });
    const originalData = await originalResponse.json();
    await vi.advanceTimersByTimeAsync(100);
    const release = await pendingRelease;
    const tracks = release?.pageProps.dehydratedState.queries[0]?.state?.data.results;

    expect(originalData).toEqual(responseData);
    expect(tracks).toEqual([track]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('fetches missing pages using authorization from a Request object', async () => {
    const { fetchMock, getRelease } = await setup(false, 101);
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ ...track, id: index + 1 }));
    const firstResponse = Response.json({ results: firstPage });
    const lastTrack = { ...track, id: 30785934 };
    const lastResponse = Response.json({ results: [lastTrack] });
    fetchMock.mockResolvedValueOnce(firstResponse);
    fetchMock.mockResolvedValueOnce(lastResponse);

    const request = new Request(tracksURL, { headers: { Authorization: 'Bearer test-only' } });
    await window.fetch(request);
    const release = await getRelease(logger);
    const tracks = release?.pageProps.dehydratedState.queries[0]?.state?.data.results;
    const secondPageURL = tracksURL.replace('page=1', 'page=2');
    const options: RequestInit = { headers: { Authorization: 'Bearer test-only' }, redirect: 'error' };

    expect(tracks).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(secondPageURL, options);
});

it('keeps using embedded track queries without API requests', async () => {
    const { fetchMock, getRelease } = await setup(true);
    const release = await getRelease(logger);
    const tracks = release?.pageProps.dehydratedState.queries[0]?.state?.data.results;

    expect(tracks).toEqual([track]);
    expect(fetchMock).not.toHaveBeenCalled();
});

it('does not reuse credentials from another origin', async () => {
    const { fetchMock, getRelease } = await setup();
    const response = Response.json({});
    fetchMock.mockResolvedValue(response);
    const errorSpy = vi.spyOn(logger, 'error');
    errorSpy.mockImplementation(() => {});

    await window.fetch('https://example.com/test', { headers: { Authorization: 'Bearer unrelated' } });
    const pendingRelease = getRelease(logger);
    await vi.advanceTimersByTimeAsync(10_000);
    const release = await pendingRelease;

    expect(release).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('stops on API failure without logging credentials', async () => {
    const { fetchMock, getRelease } = await setup();
    const response = new Response(null, { status: 401 });
    fetchMock.mockResolvedValue(response);
    const errorSpy = vi.spyOn(logger, 'error');
    errorSpy.mockImplementation(() => {});

    await window.fetch(tracksURL, { headers: { Authorization: 'Bearer test-only' } });
    const release = await getRelease(logger);
    const loggedErrors = JSON.stringify(errorSpy.mock.calls);

    expect(release).toBeNull();
    expect(loggedErrors).not.toContain('test-only');
});

it.each(['', 'json'])('captures XHR tracks with responseType “%s” without a duplicate fetch', async responseType => {
    const { fetchMock, getRelease } = await setup();
    const pendingRelease = getRelease(logger);
    await vi.advanceTimersByTimeAsync(500);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', tracksURL);
    xhr.responseType = responseType as XMLHttpRequestResponseType;
    xhr.setRequestHeader('Authorization', 'Bearer xhr-test-only');
    xhr.send();

    await vi.advanceTimersByTimeAsync(100);
    const release = await pendingRelease;
    const tracks = release?.pageProps.dehydratedState.queries[0]?.state?.data.results;

    expect(tracks).toEqual([track]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhr.responseText).toContain('30785933');
});

it('uses authorization captured from XHR to fetch a missing page', async () => {
    const { fetchMock, getRelease } = await setup(false, 101);
    const response = Response.json({ results: [track] });
    fetchMock.mockResolvedValue(response);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', tracksURL);
    xhr.setRequestHeader('Authorization', 'Bearer xhr-test-only');
    xhr.send();
    const release = await getRelease(logger);
    const secondPageURL = tracksURL.replace('page=1', 'page=2');
    const options: RequestInit = { headers: { Authorization: 'Bearer xhr-test-only' }, redirect: 'error' };

    expect(release).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(secondPageURL, options);
});

it('does not capture authorization from XHR sent to another origin', async () => {
    const { fetchMock, getRelease } = await setup();
    const errorSpy = vi.spyOn(logger, 'error');
    errorSpy.mockImplementation(() => {});

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://example.com/test');
    xhr.setRequestHeader('Authorization', 'Bearer unrelated');
    xhr.send();
    const pendingRelease = getRelease(logger);
    await vi.advanceTimersByTimeAsync(10_000);
    const release = await pendingRelease;

    expect(release).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
});
