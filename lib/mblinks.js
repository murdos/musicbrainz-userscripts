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
var MBLinks = function (user_cache_key, version, expiration) {
  this.supports_local_storage = function () {
    try {
      return !!localStorage.getItem;
    } catch (e) {
      return false;
    }
  }();

  this.ajax_requests = {
    // properties: "key": {handler: function, next: property, context: {}}
    first: "",
    last: "",
    empty: function() {return this.first == "";},
    push: function(key, handler, context) {
        if (key in this) {
            this[key].handler = handler;
            this[key].context = context;
        }
        else {
            this[key] = {handler: handler, next: "", context: context};
            if (this.first == "") {
                this.first = this.last = key;
            }
            else {
                this[this.last].next = key;
                this.last = key;
            }
        }
    },
    shift: function() {
        if (this.empty()) { return; }
        var key = this.first;
        var handler = this[key].handler;
        var context = this[key].context;
        this.first = this[key].next;
        delete this[key]; // delete this property
        return $.proxy(handler, context);
    }
  };
  this.cache = {};
  this.expirationMinutes = ((typeof expiration != 'undefined' && expiration !== false) ? parseInt(expiration, 10) : 90*24*60); // default to 90 days
  var cache_version = 2;
  this.user_cache_key = user_cache_key;
  this.cache_key = this.user_cache_key + '-v' + cache_version + (typeof version != 'undefined' ? '.' + version : '');
  this.mb_server = '//musicbrainz.org';
  // overrides link title and img src url (per type), see createMusicBrainzLink()
  this.type_link_info = {
      release_group: {
        title: 'See this release group on MusicBrainz',
      },
      place: {
        img_src: '<img src="'+ this.mb_server + '/static/images/entity/place.svg" height=16 width=16 />'
      }
    }

  this.initAjaxEngine = function () {
    var ajax_requests = this.ajax_requests;
    setInterval(function () {
      if (!ajax_requests.empty()) {
        var request = ajax_requests.shift();
        if (typeof request === "function") {
          request();
        }
      }
    }, 1000);
  };

  this.initCache = function () {
    if (!this.supports_local_storage) return;
    // Check if we already added links for this content
    this.cache = JSON.parse(localStorage.getItem(this.cache_key) || '{}');
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
    var to_remove = [];
    for (var i = 0, len = localStorage.length; i < len; ++i) {
      var key = localStorage.key(i);
      if (key.indexOf(this.user_cache_key) === 0) {
        if (key != this.cache_key) { // we don't want to remove current cache
          to_remove.push(key);
        }
      }
    }
    // remove old cache keys
    for (var i = 0; i < to_remove.length; i++) {
      localStorage.removeItem(to_remove[i]);
    }
  };

  this.clearCacheExpired = function() {
    //var old_cache_entries = Object.keys(this.cache).length;
    //console.log("clearCacheExpired " + old_cache_entries);
    var now = new Date().getTime();
    var new_cache = {};
    var that = this;
    $.each(this.cache, function (key, value) {
      if (that.is_cached(key)) {
        new_cache[key] = that.cache[key];
      }
    });
    //var new_cache_entries = Object.keys(new_cache).length;
    //console.log("Cleared cache entries: " + old_cache_entries + ' -> ' + new_cache_entries);
    this.cache = new_cache;
  };

  this.is_cached = function (key) {
    return (this.cache[key] && this.expirationMinutes > 0 && new Date().getTime() < this.cache[key].timestamp + this.expirationMinutes*60*1000);
  };

  // Search for ressource 'url' in local cache, and return the matching MBID if there's only matching MB entity.
  // If the url is not known by the cache, no attempt will be made to request the MusicBrainz webservice, in order to keep this method synchronous.
  this.resolveMBID = function (key) {
    if (this.is_cached(key) && this.cache[key].urls.length == 1) {
      return this.cache[key].urls[0].slice(-36);
    }
  };

  this.createMusicBrainzLink = function (mb_url, _type) {
    var title = 'See this ' + _type + ' on MusicBrainz';
    var img_url = this.mb_server + '/static/images/entity/' + _type + '.svg';
    var img_src = '<img src="' + img_url + '" height=16 width=16 />';
    // handle overrides
    var ti = this.type_link_info[_type];
    if (ti) {
      if (ti.title) title = ti.title;
      if (ti.img_url) img_url = ti.img_url;
      if (ti.img_src) img_src = ti.img_src;
    }
    return '<a href="' + mb_url + '" title="' + title + '">' + img_src + '</a> ';
  };

  // Search for ressource 'url' on MB, for relation of type 'mb_type' (artist, release, label, release-group, ...)
  // and call 'insert_func' function with matching MB links (a tag built in createMusicBrainzLink) for each
  // entry found
  this.searchAndDisplayMbLink = function (url, mb_type, insert_func, key) {
    var mblinks = this;
    var _type = mb_type.replace('-', '_'); // underscored type

    if (!key) key = url;
    if (this.is_cached(key)) {
      $.each(mblinks.cache[key].urls, function (idx, mb_url) {
        insert_func(mblinks.createMusicBrainzLink(mb_url, _type));
      });
    } else {

      // webservice query url
      var query = mblinks.mb_server + '/ws/2/url?resource=' + encodeURIComponent(url) + '&inc=' + mb_type + '-rels';

      // Merge with previous context if there's already a pending ajax request
      var handlers = [];
      if (query in mblinks.ajax_requests) {
        handlers = mblinks.ajax_requests[query].context.handlers;
      }
      handlers.push(insert_func);

      mblinks.ajax_requests.push(
        // key
        query,

        // handler
        function () {
          var ctx = this; // context from $.proxy()
          var mbl = ctx.mblinks;
          $.getJSON(ctx.query,
            function (data) {
              if ('relations' in data) {
                mbl.cache[ctx.key] = {
                  timestamp: new Date().getTime(),
                  urls: []
                };
                $.each(data['relations'], function (idx, relation) {
                  if (ctx._type in relation) {
                    var mb_url = mbl.mb_server + '/' + ctx.mb_type + '/' + relation[ctx._type]['id'];
                    if ($.inArray(mb_url, mbl.cache[ctx.key].urls) == -1) { // prevent dupes
                      mbl.cache[ctx.key].urls.push(mb_url);
                      $.each(ctx.handlers, function(i, handler) {
                        handler(mbl.createMusicBrainzLink(mb_url, ctx._type))
                      })
                    }
                  }
                });
                mbl.saveCache();
              }
            }
          );
        },

        // context
        {
          'key': key,           // cache key
          'handlers': handlers, // list of handlers
          'mb_type': mb_type,   // musicbrainz type ie. release-group
          '_type': _type,       // musicbrainz type '-' replaced, ie. release_group
          'query': query,       // json request url
          'mblinks': mblinks    // MBLinks object
        }
      );
    }
  };

  this.initCache();
  this.initAjaxEngine();

  return this;
};
