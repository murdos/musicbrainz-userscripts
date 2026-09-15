// Class MBLinks : query MusicBrainz for urls and display links for matching urls
// The main method is searchAndDisplayMbLinks()

// Example:
// document.addEventListener('DOMContentLoaded', function () {
//
//  const mblinks = new MBLinks('EXAMPLE_MBLINKS_CACHE', undefined, 7*24*60); // force refresh of cached links once a week
//
//  const album_link = 'http://' + window.location.href.match( /^https?:\/\/(.*\/album\/.+)$/i)[1];
//  mblinks.searchAndDisplayMbLinks([{ url: album_link, mb_type: 'release', insert_func: function (link) {
//      document.querySelector('div#there').insertAdjacentHTML('afterend', link);
//  } }]);
// });

import { getGmApi } from './userscript-api';

export interface MBLinkQuery {
    url: string;
    mb_type: string;
    insert_func: (link: string) => void;
    complete_func?: (result: MBLinkQueryResult) => void;
    key?: string;
    /** Lucene-compatible regular expression used to match URL search results. */
    url_regex?: string;
}

interface MBLinkQueryResult {
    found: boolean;
    status: 'error' | 'success';
}

interface CacheUrl {
    url: string;
    ended?: boolean;
}

interface CacheEntry {
    timestamp: number;
    urls?: (string | CacheUrl)[];
}

interface Relation {
    ended?: boolean;
    [type: string]: unknown;
}

interface UrlResponse {
    resource: string;
    relations?: Relation[];
}

interface BatchResponse extends Partial<UrlResponse> {
    urls?: UrlResponse[];
    count?: number;
    offset?: number;
}

interface LinkInfo {
    title?: string;
    img_url?: string;
    img_src?: string;
}

interface AjaxRequestContext {
    failureHandlers: (() => void)[];
    handlers: ((data: BatchResponse) => void)[];
    query: string;
    mblinks: MBLinks;
}

interface AjaxRequest {
    handler: (this: AjaxRequestContext) => void;
    next: string;
    context: AjaxRequestContext;
}

interface RegexLookup {
    batch: MBLinkQuery[];
    discoveredResources: Set<string>;
    outcomes: Map<MBLinkQuery, { failed: boolean; found: boolean }>;
    pending: number;
}

interface JsonHttpResponse {
    ok: boolean;
    status: number;
    getHeader: (name: string) => string | null;
    json: () => Promise<BatchResponse>;
}

type ScheduledRequest = () => Promise<void>;

function getRawHeader(rawHeaders: string, name: string): string | null {
    const expectedName = name.toLowerCase();
    for (const line of rawHeaders.split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator >= 0 && line.slice(0, separator).trim().toLowerCase() === expectedName) {
            return line.slice(separator + 1).trim();
        }
    }
    return null;
}

function requestJSON(url: string): Promise<JsonHttpResponse> {
    const gmRequest = getGmApi('xmlHttpRequest');
    if (!gmRequest) {
        return fetch(url, { headers: { Accept: 'application/json' } }).then(response => ({
            ok: response.ok,
            status: response.status,
            getHeader: name => response.headers?.get(name) ?? null,
            json: () => response.json() as Promise<BatchResponse>,
        }));
    }

    return new Promise((resolve, reject) => {
        gmRequest({
            method: 'GET',
            url,
            headers: { Accept: 'application/json' },
            responseType: 'json',
            onload: response => {
                resolve({
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    getHeader: name => getRawHeader(response.responseHeaders, name),
                    json: () => Promise.resolve((response.response ?? JSON.parse(response.responseText)) as BatchResponse),
                });
            },
            onerror: () => reject(new Error('Network request failed')),
        });
    });
}

function getRetryDelayMs(response: JsonHttpResponse): number | undefined {
    const retryAfter = response.getHeader('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(delay) && delay >= 0) return delay;
    }

    const resetSeconds = Number(response.getHeader('x-ratelimit-reset'));
    if (!Number.isFinite(resetSeconds) || resetSeconds <= 0) return undefined;

    const serverDate = Date.parse(response.getHeader('date') ?? '');
    const referenceTime = Number.isFinite(serverDate) ? serverDate : Date.now();
    return Math.max(0, resetSeconds * 1000 - referenceTime);
}

class AjaxRequests {
    // properties: "key": {handler: function, next: property, context: {}}
    first = '';
    last = '';
    [key: string]: string | AjaxRequest | ((...args: never[]) => unknown);

    empty(): boolean {
        return this.first == '';
    }

    push(key: string, handler: AjaxRequest['handler'], context: AjaxRequestContext): void {
        const request = this[key];
        if (typeof request === 'object') {
            request.handler = handler;
            request.context = context;
        } else {
            this[key] = { handler: handler, next: '', context: context };
            if (this.first == '') {
                this.first = this.last = key;
            } else {
                const lastRequest = this[this.last];
                if (typeof lastRequest === 'object') {
                    lastRequest.next = key;
                }
                this.last = key;
            }
        }
    }

    shift(): (() => void) | undefined {
        if (this.empty()) {
            return;
        }
        const key = this.first;
        const request = this[key];
        if (typeof request !== 'object') {
            return;
        }
        const handler = request.handler;
        const context = request.context;
        this.first = request.next;
        // oxlint-disable-next-line typescript/no-dynamic-delete -- Kept in line with the original request queue.
        delete this[key]; // delete this property
        return handler.bind(context);
    }
}

/**
 * Processes a URL match from the MusicBrainz API response: updates cache and inserts
 * MusicBrainz links into all batch entries that reference this resource.
 *
 * @private
 * @param options - Options for processing the URL match.
 * @param options.mblinks - The MBLinks instance (for cache and link creation).
 * @param options.batch - Batch of URL data entries for this request.
 * @param options.resource - The resource URL from the API response.
 * @param options.relations - Relations array from the API response.
 */
function processUrlMatch({
    mblinks,
    batch,
    resource,
    relations,
    foundQueries,
}: {
    mblinks: MBLinks;
    batch: MBLinkQuery[];
    resource: string;
    relations: Relation[] | undefined;
    foundQueries?: Set<MBLinkQuery>;
}): void {
    const matching_urls_data = batch.filter(query => queryMatchesResource(query, resource));
    if (matching_urls_data.length === 0) return;

    if (!relations) return;

    matching_urls_data.forEach(reference => {
        const key = reference.key || reference.url;
        const _type = reference.mb_type.replace('-', '_');

        if (!mblinks.cache[key]) {
            mblinks.cache[key] = {
                timestamp: new Date().getTime(),
                urls: [],
            };
        }

        // Build map of mb_url -> ended (true only if every relation for that URL+entity is ended).
        const urlData: Record<string, { ended: boolean }> = {};
        relations.forEach(relation => {
            if (_type in relation) {
                const entity = relation[_type] as { id: string };
                const mb_url = `${mblinks.mb_server}/${reference.mb_type}/${entity.id}`;
                if (!(mb_url in urlData)) urlData[mb_url] = { ended: true };
                if (!relation.ended) urlData[mb_url]!.ended = false;
            }
        });

        const cacheUrls = mblinks.cache[key].urls!;
        const getUrl = (entry: string | CacheUrl) => (typeof entry === 'string' ? entry : entry.url);
        Object.keys(urlData).forEach(mb_url => {
            foundQueries?.add(reference);
            const ended = urlData[mb_url]!.ended;
            const alreadyCached = cacheUrls.some(e => getUrl(e) === mb_url);
            if (!alreadyCached) {
                cacheUrls.push({ url: mb_url, ended: _type === 'release' ? ended : false });
            }
            const link = mblinks.createMusicBrainzLink(mb_url, _type, _type === 'release' ? { ended } : {});
            reference.insert_func(link);
        });
    });
}

function queryMatchesResource(query: MBLinkQuery, resource: string): boolean {
    if (!query.url_regex) return query.url === resource;
    try {
        return new RegExp(`^(?:${query.url_regex})$`).test(resource);
    } catch {
        return false;
    }
}

// user_cache_key = textual key used to store cached data in local storage
// version = optionnal version,  to force creation of a cache (ie. when format of keys changes)
// expiration = time in minutes before an entry is refreshed, value <= 0 disables cache reads, if undefined or false, use defaults
export class MBLinks {
    supports_local_storage: boolean;
    ajax_requests = new AjaxRequests();
    private pendingRequests: ScheduledRequest[] = [];
    private requestTimer: ReturnType<typeof setTimeout> | undefined;
    private requestInFlight = false;
    private nextRequestAt = 0;
    private rateLimitResetAt = 0;
    private consecutiveRequestFailures = 0;
    cache: Record<string, CacheEntry> = {};
    expirationMinutes: number;
    user_cache_key: string;
    cache_key: string;
    mb_server = 'https://musicbrainz.org';
    type_link_info: Record<string, LinkInfo>;

    constructor(user_cache_key: string, version?: string | number, expiration?: string | number | false) {
        this.supports_local_storage = (() => {
            try {
                return !!localStorage.getItem;
            } catch {
                return false;
            }
        })();

        this.expirationMinutes = typeof expiration != 'undefined' && expiration !== false ? parseInt(String(expiration), 10) : 90 * 24 * 60; // default to 90 days
        const cache_version = 3;
        this.user_cache_key = user_cache_key;
        this.cache_key = `${this.user_cache_key}-v${cache_version}${typeof version != 'undefined' ? `.${version}` : ''}`;
        // overrides link title and img src url (per type), see createMusicBrainzLink()
        this.type_link_info = {
            release_group: {
                title: 'See this release group on MusicBrainz',
            },
            place: {
                img_src: `<img src="${this.mb_server}/static/images/entity/place.svg" height=16 width=16 />`,
            },
        };

        this.initCache();
        this.initAjaxEngine();
    }

    initAjaxEngine(): void {
        const ajax_requests = this.ajax_requests;
        setInterval(function () {
            if (!ajax_requests.empty()) {
                const request = ajax_requests.shift();
                if (typeof request === 'function') {
                    request();
                }
            }
        }, 1000);
    }

    /**
     * GET JSON with retry on 5xx and status-less network errors, using server-provided rate-limit headers when available, with queue-wide exponential backoff capped at 30 seconds and a five-minute retry budget.
     * @param url - The URL to request.
     * @param successCallback - Called with response data on success.
     * @param alwaysCallback - Called when the request is finally done (success or after giving up retries).
     */
    getJSONWithRetry(url: string, successCallback: (data: BatchResponse) => void, alwaysCallback?: (succeeded: boolean) => void): void {
        const retryDeadline = Date.now() + 5 * 60 * 1000;
        const retry = (serverDelayMs = 0): void => {
            const retryDelayMs = this.recordRequestFailure(serverDelayMs);
            if (Date.now() + retryDelayMs <= retryDeadline) {
                setTimeout(() => this.scheduleRequest(doRequest, true), retryDelayMs);
            } else {
                alwaysCallback?.(false);
            }
        };

        const doRequest = async (): Promise<void> => {
            let response: JsonHttpResponse;
            try {
                response = await requestJSON(url);
            } catch {
                // Extension throttling and ordinary network failures both arrive without an HTTP status.
                retry();
                return;
            }

            const serverDelayMs = getRetryDelayMs(response) ?? 0;
            if (!response.ok) {
                if (response.status >= 500 && response.status < 600) {
                    retry(serverDelayMs);
                } else if (response.status === 404) {
                    // The URL endpoint uses 404 to report a resource with no relationships.
                    this.consecutiveRequestFailures = 0;
                    try {
                        successCallback({});
                        alwaysCallback?.(true);
                    } catch {
                        alwaysCallback?.(false);
                    }
                } else {
                    this.consecutiveRequestFailures = 0;
                    alwaysCallback?.(false);
                }
                return;
            }

            this.consecutiveRequestFailures = 0;
            if (response.getHeader('x-ratelimit-remaining') === '0') this.pauseRequests(serverDelayMs);
            try {
                successCallback(await response.json());
                alwaysCallback?.(true);
            } catch {
                alwaysCallback?.(false);
            }
        };
        this.scheduleRequest(doRequest);
    }

    private scheduleRequest(request: ScheduledRequest, priority = false): void {
        if (priority) this.pendingRequests.unshift(request);
        else this.pendingRequests.push(request);
        this.runNextRequest();
    }

    private recordRequestFailure(serverDelayMs: number): number {
        this.consecutiveRequestFailures += 1;
        const retryDelayMs = Math.max(serverDelayMs, Math.min(30_000, 1000 * 2 ** (this.consecutiveRequestFailures - 1)));
        this.pauseRequests(retryDelayMs);
        return retryDelayMs;
    }

    private pauseRequests(delayMs: number): void {
        this.rateLimitResetAt = Math.max(this.rateLimitResetAt, Date.now() + delayMs);
    }

    private runNextRequest(): void {
        if (this.requestTimer || this.requestInFlight || this.pendingRequests.length === 0) return;

        const now = Date.now();
        const runAt = Math.max(now, this.nextRequestAt, this.rateLimitResetAt);
        const delay = runAt - now;
        if (delay > 0) {
            this.requestTimer = setTimeout(() => {
                this.requestTimer = undefined;
                this.runNextRequest();
            }, delay);
            return;
        }

        const request = this.pendingRequests.shift()!;
        this.nextRequestAt = now + 1000;
        this.requestInFlight = true;
        void Promise.resolve()
            .then(request)
            .catch(() => undefined)
            .finally(() => {
                this.requestInFlight = false;
                this.runNextRequest();
            });
    }

    initCache(): void {
        if (!this.supports_local_storage) return;
        // Check if we already added links for this content
        this.cache = JSON.parse(localStorage.getItem(this.cache_key) || '{}') as Record<string, CacheEntry>;
        // remove old entries
        this.clearCacheExpired();
        // remove old cache versions
        this.removeOldCacheVersions();
    }

    saveCache(): void {
        if (!this.supports_local_storage) return;
        try {
            localStorage.setItem(this.cache_key, JSON.stringify(this.cache));
        } catch (e) {
            alert(e);
        }
    }

    removeOldCacheVersions(): void {
        const to_remove: string[] = [];
        for (let i = 0, len = localStorage.length; i < len; ++i) {
            const key = localStorage.key(i)!;
            if (key.startsWith(this.user_cache_key)) {
                if (key !== this.cache_key) {
                    // we don't want to remove current cache
                    to_remove.push(key);
                }
            }
        }
        // remove old cache keys
        for (const element of to_remove) {
            localStorage.removeItem(element);
        }
    }

    clearCacheExpired(): void {
        const new_cache: Record<string, CacheEntry> = {};
        Object.keys(this.cache).forEach(key => {
            if (this.is_cached(key)) {
                new_cache[key] = this.cache[key]!;
            }
        });
        this.cache = new_cache;
    }

    is_cached(key: string): boolean {
        const entry = this.cache[key];
        return Boolean(
            entry &&
            entry.urls &&
            entry.urls.length > 0 &&
            this.expirationMinutes > 0 &&
            new Date().getTime() < entry.timestamp + this.expirationMinutes * 60 * 1000,
        );
    }

    // Search for ressource 'url' in local cache, and return the matching MBID if there's only matching MB entity.
    // If the url is not known by the cache, no attempt will be made to request the MusicBrainz webservice, in order to keep this method synchronous.
    resolveMBID(key: string): string | undefined {
        if (this.is_cached(key) && this.cache[key]!.urls!.length == 1) {
            const entry = this.cache[key]!.urls![0]!;
            const mb_url = typeof entry === 'string' ? entry : entry.url;
            return mb_url.slice(-36);
        }
        return undefined;
    }

    /**
     * Create an HTML element for a MusicBrainz link with the given type and URL.
     * @param mb_url - The URL of the MusicBrainz entity.
     * @param _type - The type of the MusicBrainz entity.
     * @param options - Optional options.
     * @param options.ended - When true and type is release, applies grayscale to the icon.
     * @returns The HTML for the MusicBrainz link.
     */
    createMusicBrainzLink(mb_url: string, _type: string, options?: { ended?: boolean | undefined }): string {
        let title = `See this ${_type} on MusicBrainz`;
        let img_url = `${this.mb_server}/static/images/entity/${_type}.svg`;
        let img_src = `<img src="${img_url}" height=16 width=16 />`;
        // handle overrides
        const ti = this.type_link_info[_type];
        if (ti) {
            if (ti.title) title = ti.title;
            if (ti.img_url) img_url = ti.img_url;
            if (ti.img_src) img_src = ti.img_src;
        }
        if (_type === 'release' && options?.ended) {
            img_src = img_src.replace('/>', ' style="filter: grayscale(1)" />');
        }
        return `<a href="${mb_url}" title="${title}">${img_src}</a> `;
    }

    // Batch process multiple URLs in a single request
    // urls_data should be an array of objects with the following structure:
    // { url: string, mb_type: string, insert_func: function, key: string }
    searchAndDisplayMbLinks(urls_data: MBLinkQuery[]): void {
        // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the original callback contexts.
        const mblinks = this;

        // Filter out URLs that are already cached
        const uncached_urls: MBLinkQuery[] = [];

        urls_data.forEach(data => {
            const key = data.key || data.url;
            if (this.is_cached(key)) {
                // Handle cached results immediately
                const data_type = data.mb_type.replace('-', '_');
                mblinks.cache[key]!.urls!.forEach(cacheEntry => {
                    const mb_url = typeof cacheEntry === 'string' ? cacheEntry : cacheEntry.url;
                    const ended = typeof cacheEntry === 'string' ? false : cacheEntry.ended;
                    const options = data_type === 'release' ? { ended } : {};
                    data.insert_func(mblinks.createMusicBrainzLink(mb_url, data_type, options));
                });
                data.complete_func?.({ found: true, status: 'success' });
            } else {
                uncached_urls.push(data);
            }
        });

        if (uncached_urls.length === 0) {
            return; // All URLs were cached
        }

        // Process URLs in batches
        const BATCH_SIZE = 75;
        for (let i = 0; i < uncached_urls.length; i += BATCH_SIZE) {
            const batch = uncached_urls.slice(i, i + BATCH_SIZE);
            const resources = batch.map(data => encodeURIComponent(data.url)).join('&resource=');
            const mb_type = batch[0]!.mb_type;
            const query = `${mblinks.mb_server}/ws/2/url?resource=${resources}&inc=${mb_type}-rels`;

            // Merge with previous context if there's already a pending ajax request
            let handlers: ((data: BatchResponse) => void)[] = [];
            let failureHandlers: (() => void)[] = [];
            const request = mblinks.ajax_requests[query];
            if (typeof request === 'object') {
                handlers = request.context.handlers;
                failureHandlers = request.context.failureHandlers;
            }
            handlers.push(function (data) {
                const foundQueries = new Set<MBLinkQuery>();
                if ('urls' in data) {
                    const processedResources: Record<string, boolean> = {};
                    data.urls.forEach(url_data => {
                        if (processedResources[url_data.resource]) return;
                        processedResources[url_data.resource] = true;
                        processUrlMatch({
                            mblinks,
                            batch,
                            resource: url_data.resource,
                            relations: url_data.relations,
                            foundQueries,
                        });
                    });
                } else if ('relations' in data && 'resource' in data) {
                    /**
                     * For some reason, for a single entity request the API response has a different shape.
                     */
                    processUrlMatch({
                        mblinks,
                        batch,
                        resource: data.resource,
                        relations: data.relations,
                        foundQueries,
                    });
                }
                mblinks.saveCache();
                batch.forEach(queryData => {
                    queryData.complete_func?.({ found: foundQueries.has(queryData), status: 'success' });
                });
            });
            failureHandlers.push(() => {
                batch.forEach(queryData => queryData.complete_func?.({ found: false, status: 'error' }));
            });

            mblinks.ajax_requests.push(
                query,
                function () {
                    // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the original callback context.
                    const ctx = this;
                    ctx.mblinks.getJSONWithRetry(
                        ctx.query,
                        function (data) {
                            ctx.handlers.forEach(handler => {
                                handler(data);
                            });
                        },
                        function (succeeded) {
                            if (!succeeded) ctx.failureHandlers.forEach(handler => handler());
                        },
                    );
                },
                {
                    failureHandlers,
                    handlers: handlers,
                    query: query,
                    mblinks: mblinks,
                },
            );
        }
    }

    /**
     * Search MusicBrainz's indexed URL field with Lucene regular expressions,
     * then resolve the discovered resources to load their relationships.
     */
    searchAndDisplayMbLinksByRegex(urls_data: MBLinkQuery[]): void {
        // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the callback contexts above.
        const mblinks = this;
        const uncachedQueries: MBLinkQuery[] = [];

        urls_data.forEach(data => {
            const key = data.key || data.url;
            if (this.is_cached(key)) {
                const dataType = data.mb_type.replace('-', '_');
                mblinks.cache[key]!.urls!.forEach(cacheEntry => {
                    const mbUrl = typeof cacheEntry === 'string' ? cacheEntry : cacheEntry.url;
                    const ended = typeof cacheEntry === 'string' ? false : cacheEntry.ended;
                    data.insert_func(mblinks.createMusicBrainzLink(mbUrl, dataType, dataType === 'release' ? { ended } : {}));
                });
                data.complete_func?.({ found: true, status: 'success' });
            } else if (data.url_regex) {
                uncachedQueries.push(data);
            }
        });

        const batchSize = 20;
        for (let i = 0; i < uncachedQueries.length; i += batchSize) {
            const batch = uncachedQueries.slice(i, i + batchSize);
            const regex = batch.map(data => `(${data.url_regex})`).join('|');
            const lookup: RegexLookup = {
                batch,
                discoveredResources: new Set(),
                outcomes: new Map(batch.map(query => [query, { failed: false, found: false }])),
                pending: 0,
            };
            this.enqueueRegexSearchPage(batch, regex, 0, lookup);
        }
    }

    private enqueueRegexSearchPage(batch: MBLinkQuery[], regex: string, offset: number, lookup: RegexLookup): void {
        lookup.pending += 1;
        // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the callback contexts above.
        const mblinks = this;
        const search = `url:/(${regex})/`;
        const query = `${mblinks.mb_server}/ws/2/url?query=${encodeURIComponent(search)}&fmt=json&limit=100&offset=${offset}`;
        let handlers: ((data: BatchResponse) => void)[] = [];
        let failureHandlers: (() => void)[] = [];
        const request = mblinks.ajax_requests[query];
        if (typeof request === 'object') {
            handlers = request.context.handlers;
            failureHandlers = request.context.failureHandlers;
        }

        handlers.push(function (data) {
            const urls = data.urls ?? [];
            const discoveredQueries: MBLinkQuery[] = [];
            const discoveredResources = new Set<string>();
            urls.forEach(urlData => {
                if (discoveredResources.has(urlData.resource)) return;
                discoveredResources.add(urlData.resource);
                batch.forEach(queryData => {
                    if (!queryMatchesResource(queryData, urlData.resource)) return;
                    const resourceKey = `${queryData.key ?? queryData.url}\0${urlData.resource}`;
                    if (lookup.discoveredResources.has(resourceKey)) return;
                    lookup.discoveredResources.add(resourceKey);
                    lookup.pending += 1;
                    discoveredQueries.push({
                        url: urlData.resource,
                        mb_type: queryData.mb_type,
                        insert_func: queryData.insert_func,
                        key: queryData.key || queryData.url,
                        complete_func: result => {
                            const outcome = lookup.outcomes.get(queryData)!;
                            outcome.found ||= result.found;
                            outcome.failed ||= result.status === 'error';
                            mblinks.finishRegexOperation(lookup);
                        },
                    });
                });
            });
            mblinks.searchAndDisplayMbLinks(discoveredQueries);

            const responseOffset = data.offset ?? offset;
            const nextOffset = responseOffset + urls.length;
            if (typeof data.count === 'number' && urls.length > 0 && nextOffset < data.count) {
                mblinks.enqueueRegexSearchPage(batch, regex, nextOffset, lookup);
            }
            mblinks.finishRegexOperation(lookup);
        });
        failureHandlers.push(() => {
            lookup.outcomes.forEach(outcome => {
                outcome.failed = true;
            });
            mblinks.finishRegexOperation(lookup);
        });

        mblinks.ajax_requests.push(
            query,
            function () {
                // oxlint-disable-next-line typescript/no-this-alias -- Kept in line with the original callback context.
                const ctx = this;
                ctx.mblinks.getJSONWithRetry(
                    ctx.query,
                    function (data) {
                        ctx.handlers.forEach(handler => {
                            handler(data);
                        });
                    },
                    function (succeeded) {
                        if (!succeeded) ctx.failureHandlers.forEach(handler => handler());
                    },
                );
            },
            { failureHandlers, handlers, query, mblinks },
        );
    }

    private finishRegexOperation(lookup: RegexLookup): void {
        lookup.pending -= 1;
        if (lookup.pending !== 0) return;
        lookup.batch.forEach(query => {
            const outcome = lookup.outcomes.get(query)!;
            query.complete_func?.({ found: outcome.found, status: outcome.failed ? 'error' : 'success' });
        });
    }
}
