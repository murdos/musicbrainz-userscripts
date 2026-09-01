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

export interface MBLinkQuery {
    url: string;
    mb_type: string;
    insert_func: (link: string) => void;
    key?: string;
    /** Lucene-compatible regular expression used to match URL search results. */
    url_regex?: string;
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
    'relation-list'?: { relations?: Relation[] }[];
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
    handlers: ((data: BatchResponse) => void)[];
    query: string;
    mblinks: MBLinks;
}

interface AjaxRequest {
    handler: (this: AjaxRequestContext) => void;
    next: string;
    context: AjaxRequestContext;
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
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Kept in line with the original request queue.
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
}: {
    mblinks: MBLinks;
    batch: MBLinkQuery[];
    resource: string;
    relations: Relation[] | undefined;
}): void {
    const matching_urls_data = batch.filter(query => {
        if (!query.url_regex) return query.url === resource;
        try {
            return new RegExp(`^(?:${query.url_regex})$`).test(resource);
        } catch {
            return false;
        }
    });
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

function searchRelations(url: UrlResponse): Relation[] | undefined {
    if (url.relations) return url.relations;
    const relationLists = url['relation-list'];
    if (!relationLists) return undefined;
    return relationLists.flatMap(relationList => relationList.relations ?? []);
}

// user_cache_key = textual key used to store cached data in local storage
// version = optionnal version,  to force creation of a cache (ie. when format of keys changes)
// expiration = time in minutes before an entry is refreshed, value <= 0 disables cache reads, if undefined or false, use defaults
export class MBLinks {
    supports_local_storage: boolean;
    ajax_requests = new AjaxRequests();
    private nextRequestAt = 0;
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
     * GET JSON with retry on 5xx errors (e.g. 503), using exponential backoff capped at 30 seconds
     * and a five-minute retry budget.
     * @param url - The URL to request.
     * @param successCallback - Called with response data on success.
     * @param alwaysCallback - Called when the request is finally done (success or after giving up retries).
     */
    getJSONWithRetry(url: string, successCallback: (data: BatchResponse) => void, alwaysCallback?: () => void): void {
        const retryDeadline = Date.now() + 5 * 60 * 1000;
        let attempt = 0;

        const doRequest = () => {
            attempt += 1;
            fetch(url, { headers: { Accept: 'application/json' } })
                .then(function (response) {
                    if (!response.ok) {
                        const error = new Error(`HTTP ${response.status}`) as Error & { status: number };
                        error.status = response.status;
                        throw error;
                    }
                    return response.json() as Promise<BatchResponse>;
                })
                .then(function (data) {
                    successCallback(data);
                    if (typeof alwaysCallback === 'function') {
                        alwaysCallback();
                    }
                })
                .catch((error: unknown) => {
                    const status = isErrorWithStatus(error) ? error.status : 0;
                    const is5xx = status >= 500 && status < 600;
                    if (is5xx) {
                        const retryDelayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
                        if (Date.now() + retryDelayMs <= retryDeadline) {
                            setTimeout(() => {
                                this.scheduleRequest(doRequest);
                            }, retryDelayMs);
                        } else if (typeof alwaysCallback === 'function') {
                            alwaysCallback();
                        }
                    } else if (typeof alwaysCallback === 'function') {
                        alwaysCallback();
                    }
                });
        };
        this.scheduleRequest(doRequest);
    }

    private scheduleRequest(request: () => void): void {
        const now = Date.now();
        const runAt = Math.max(now, this.nextRequestAt);
        this.nextRequestAt = runAt + 1000;
        const delay = runAt - now;
        if (delay === 0) request();
        else setTimeout(request, delay);
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
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the original callback contexts.
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
            const request = mblinks.ajax_requests[query];
            if (typeof request === 'object') {
                handlers = request.context.handlers;
            }
            handlers.push(function (data) {
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
                    });
                }
                mblinks.saveCache();
            });

            mblinks.ajax_requests.push(
                query,
                function () {
                    // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the original callback context.
                    const ctx = this;
                    ctx.mblinks.getJSONWithRetry(ctx.query, function (data) {
                        ctx.handlers.forEach(handler => {
                            handler(data);
                        });
                    });
                },
                {
                    handlers: handlers,
                    query: query,
                    mblinks: mblinks,
                },
            );
        }
    }

    /**
     * Search MusicBrainz's indexed URL field with Lucene regular expressions.
     */
    searchAndDisplayMbLinksByRegex(urls_data: MBLinkQuery[]): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the callback contexts above.
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
            } else if (data.url_regex) {
                uncachedQueries.push(data);
            }
        });

        const batchSize = 20;
        for (let i = 0; i < uncachedQueries.length; i += batchSize) {
            const batch = uncachedQueries.slice(i, i + batchSize);
            const regex = batch.map(data => `(${data.url_regex})`).join('|');
            this.enqueueRegexSearchPage(batch, regex, 0);
        }
    }

    private enqueueRegexSearchPage(batch: MBLinkQuery[], regex: string, offset: number): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the callback contexts above.
        const mblinks = this;
        const search = `url:/(${regex})/`;
        const query = `${mblinks.mb_server}/ws/2/url?query=${encodeURIComponent(search)}&fmt=json&limit=100&offset=${offset}`;
        let handlers: ((data: BatchResponse) => void)[] = [];
        const request = mblinks.ajax_requests[query];
        if (typeof request === 'object') handlers = request.context.handlers;

        handlers.push(function (data) {
            const urls = data.urls ?? [];
            urls.forEach(urlData => {
                processUrlMatch({
                    mblinks,
                    batch,
                    resource: urlData.resource,
                    relations: searchRelations(urlData),
                });
            });
            mblinks.saveCache();

            const responseOffset = data.offset ?? offset;
            const nextOffset = responseOffset + urls.length;
            if (typeof data.count === 'number' && urls.length > 0 && nextOffset < data.count) {
                mblinks.enqueueRegexSearchPage(batch, regex, nextOffset);
            }
        });

        mblinks.ajax_requests.push(
            query,
            function () {
                // eslint-disable-next-line @typescript-eslint/no-this-alias -- Kept in line with the original callback context.
                const ctx = this;
                ctx.mblinks.getJSONWithRetry(ctx.query, function (data) {
                    ctx.handlers.forEach(handler => {
                        handler(data);
                    });
                });
            },
            { handlers, query, mblinks },
        );
    }
}

function isErrorWithStatus(error: unknown): error is { status: number } {
    return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number';
}
