// Class MBLinks : query MusicBrainz for urls and display links for matching urls
// The main method is searchAndDisplayMbLink()

// Example:
// $(document).ready(function () {
//
//  var mblinks = new MBLinks('EXAMPLE_MBLINKS_CACHE', 7*24*60); // force refresh of cached links once a week
//
//  var artist_link = 'http://' + window.location.href.match( /^https?:\/\/(.*)\/album\/.+$/i)[1];
//  mblinks.searchAndDisplayMbLink(artist_link, 'artist', function (link) { $('div#there').before(link); } );
//
//  var album_link = 'http://' + window.location.href.match( /^https?:\/\/(.*\/album\/.+)$/i)[1];
//  mblinks.searchAndDisplayMbLink(album_link, 'release', function (link) { $('div#there').after(link); } );
// }

// user_cache_key = textual key used to store cached data in local storage
// version = optionnal version,  to force creation of a cache (ie. when format of keys changes)
// expiration = time in minutes before an entry is refreshed, value <= 0 disables cache reads, if undefined or false, use defaults
const MBLinks = function (user_cache_key, version, expiration) {
    this.supports_local_storage = (function () {
        try {
            return !!localStorage.getItem;
        } catch (e) {
            return false;
        }
    })();

    this.ajax_requests = {
        // properties: "key": {handler: function, next: property, context: {}}
        first: '',
        last: '',
        empty: function () {
            return this.first == '';
        },
        push: function (key, handler, context) {
            if (key in this) {
                this[key].handler = handler;
                this[key].context = context;
            } else {
                this[key] = { handler: handler, next: '', context: context };
                if (this.first == '') {
                    this.first = this.last = key;
                } else {
                    this[this.last].next = key;
                    this.last = key;
                }
            }
        },
        shift: function () {
            if (this.empty()) {
                return;
            }
            let key = this.first;
            let handler = this[key].handler;
            let context = this[key].context;
            this.first = this[key].next;
            delete this[key]; // delete this property
            return $.proxy(handler, context);
        },
    };
    this.cache = {};
    this.expirationMinutes = typeof expiration != 'undefined' && expiration !== false ? parseInt(expiration, 10) : 90 * 24 * 60; // default to 90 days
    let cache_version = 2;
    this.user_cache_key = user_cache_key;
    this.cache_key = `${this.user_cache_key}-v${cache_version}${typeof version != 'undefined' ? `.${version}` : ''}`;
    this.mb_server = 'https://musicbrainz.org';
    // overrides link title and img src url (per type), see createMusicBrainzLink()
    this.type_link_info = {
        release_group: {
            title: 'See this release group on MusicBrainz',
        },
        place: {
            img_src: `<img src="${this.mb_server}/static/images/entity/place.svg" height=16 width=16 />`,
        },
    };

    this.initAjaxEngine = function () {
        let ajax_requests = this.ajax_requests;
        setInterval(function () {
            if (!ajax_requests.empty()) {
                let request = ajax_requests.shift();
                if (typeof request === 'function') {
                    request();
                }
            }
        }, 1000);
    };

    this.initCache = function () {
        if (!this.supports_local_storage) return;
        // Check if we already added links for this content
        this.cache = JSON.parse(localStorage.getItem(this.cache_key) || '{}');
        // remove old entries
        this.clearCacheExpired();
        // remove old cache versions
        this.removeOldCacheVersions();
    };

    this.saveCache = function () {
        if (!this.supports_local_storage) return;
        try {
            localStorage.setItem(this.cache_key, JSON.stringify(this.cache));
        } catch (e) {
            alert(e);
        }
    };

    this.removeOldCacheVersions = function () {
        let to_remove = [];
        for (let i = 0, len = localStorage.length; i < len; ++i) {
            let key = localStorage.key(i);
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
    };

    this.clearCacheExpired = function () {
        let new_cache = {};
        let that = this;
        $.each(this.cache, function (key) {
            if (that.is_cached(key)) {
                new_cache[key] = that.cache[key];
            }
        });
        this.cache = new_cache;
    };

    this.is_cached = function (key) {
        return (
            this.cache[key] &&
            this.expirationMinutes > 0 &&
            new Date().getTime() < this.cache[key].timestamp + this.expirationMinutes * 60 * 1000
        );
    };

    // Search for ressource 'url' in local cache, and return the matching MBID if there's only matching MB entity.
    // If the url is not known by the cache, no attempt will be made to request the MusicBrainz webservice, in order to keep this method synchronous.
    this.resolveMBID = function (key) {
        if (this.is_cached(key) && this.cache[key].urls.length == 1) {
            return this.cache[key].urls[0].slice(-36);
        }
    };

    /**
     * Create an HTML element for a MusicBrainz link with the given type and URL.
     * @param {string} mb_url - The URL of the MusicBrainz entity.
     * @param {string} _type - The type of the MusicBrainz entity.
     * @returns {string} The HTML for the MusicBrainz link.
     */
    this.createMusicBrainzLink = function (mb_url, _type) {
        let title = `See this ${_type} on MusicBrainz`;
        let img_url = `${this.mb_server}/static/images/entity/${_type}.svg`;
        let img_src = `<img src="${img_url}" height=16 width=16 />`;
        // handle overrides
        let ti = this.type_link_info[_type];
        if (ti) {
            if (ti.title) title = ti.title;
            if (ti.img_url) img_url = ti.img_url;
            if (ti.img_src) img_src = ti.img_src;
        }
        return `<a href="${mb_url}" title="${title}">${img_src}</a> `;
    };

    /**
     * Searches for resource 'url' on MB, for relation of type 'mb_type' (artist, release, label, release-group, ...) and calls 'insert_func' function with matching MB links (a tag built in createMusicBrainzLink) for each entry found.
     * @param {string} url - The URL of the resource to search for.
     * @param {string} mb_type - The type of the MusicBrainz entity.
     * @param {function} insert_func - The function to call with the matching MB links.
     * @param {string} [key] - The optional key to use for the cache.
     */
    this.searchAndDisplayMbLink = function (url, mb_type, insert_func, key) {
        let mblinks = this;
        let _type = mb_type.replace('-', '_'); // underscored type

        if (!key) key = url;
        if (this.is_cached(key)) {
            $.each(mblinks.cache[key].urls, function (idx, mb_url) {
                insert_func(mblinks.createMusicBrainzLink(mb_url, _type));
            });
        } else {
            // webservice query url
            let query = `${mblinks.mb_server}/ws/2/url?resource=${encodeURIComponent(url)}&inc=${mb_type}-rels`;

            // Merge with previous context if there's already a pending ajax request
            let handlers = [];
            if (query in mblinks.ajax_requests) {
                handlers = mblinks.ajax_requests[query].context.handlers;
            }
            handlers.push(insert_func);

            mblinks.ajax_requests.push(
                // key
                query,

                // handler
                function () {
                    let ctx = this; // context from $.proxy()
                    let mbl = ctx.mblinks;
                    $.getJSON(ctx.query, function (data) {
                        if ('relations' in data) {
                            mbl.cache[ctx.key] = {
                                timestamp: new Date().getTime(),
                                urls: [],
                            };
                            $.each(data['relations'], function (idx, relation) {
                                if (ctx._type in relation) {
                                    let mb_url = `${mbl.mb_server}/${ctx.mb_type}/${relation[ctx._type]['id']}`;
                                    if ($.inArray(mb_url, mbl.cache[ctx.key].urls) == -1) {
                                        // prevent dupes
                                        mbl.cache[ctx.key].urls.push(mb_url);
                                        $.each(ctx.handlers, function (i, handler) {
                                            handler(mbl.createMusicBrainzLink(mb_url, ctx._type));
                                        });
                                    }
                                }
                            });
                            mbl.saveCache();
                        }
                    });
                },

                // context
                {
                    key: key, // cache key
                    handlers: handlers, // list of handlers
                    mb_type: mb_type, // musicbrainz type ie. release-group
                    _type: _type, // musicbrainz type '-' replaced, ie. release_group
                    query: query, // json request url
                    mblinks: mblinks, // MBLinks object
                },
            );
        }
    };

    // Batch process multiple URLs in a single request
    // urls_data should be an array of objects with the following structure:
    // { url: string, mb_type: string, insert_func: function, key: string }
    this.searchAndDisplayMbLinks = function (urls_data) {
        let mblinks = this;

        // Filter out URLs that are already cached
        let uncached_urls = [];

        urls_data.forEach(data => {
            const key = data.key || data.url;
            if (this.is_cached(key)) {
                // Handle cached results immediately
                $.each(mblinks.cache[key].urls, function (idx, mb_url) {
                    data.insert_func(mblinks.createMusicBrainzLink(mb_url, data.mb_type.replace('-', '_')));
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
            const mb_type = batch[0].mb_type;
            const query = `${mblinks.mb_server}/ws/2/url?resource=${resources}&inc=${mb_type}-rels`;

            // Merge with previous context if there's already a pending ajax request
            let handlers = [];
            if (query in mblinks.ajax_requests) {
                handlers = mblinks.ajax_requests[query].context.handlers;
            }
            handlers.push(function (data) {
                if ('urls' in data) {
                    data.urls.forEach(url_data => {
                        const matching_url_data = batch.find(u => u.url === url_data.resource);
                        if (matching_url_data) {
                            const key = matching_url_data.key || matching_url_data.url;
                            const _type = matching_url_data.mb_type.replace('-', '_');

                            if (!mblinks.cache[key]) {
                                mblinks.cache[key] = {
                                    timestamp: new Date().getTime(),
                                    urls: [],
                                };
                            }

                            if ('relations' in url_data) {
                                url_data.relations.forEach(relation => {
                                    if (_type in relation) {
                                        const mb_url = `${mblinks.mb_server}/${matching_url_data.mb_type}/${relation[_type].id}`;
                                        if ($.inArray(mb_url, mblinks.cache[key].urls) === -1) {
                                            mblinks.cache[key].urls.push(mb_url);
                                            matching_url_data.insert_func(mblinks.createMusicBrainzLink(mb_url, _type));
                                        }
                                    }
                                });
                            }
                        }
                    });
                    mblinks.saveCache();
                }
            });

            mblinks.ajax_requests.push(
                query,
                function () {
                    let ctx = this;
                    $.getJSON(ctx.query, function (data) {
                        ctx.handlers.forEach(handler => handler(data));
                    });
                },
                {
                    handlers: handlers,
                    query: query,
                    mblinks: mblinks,
                },
            );
        }
    };

    this.initCache();
    this.initAjaxEngine();

    return this;
};
