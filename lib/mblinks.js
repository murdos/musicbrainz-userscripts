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

// cachekey = textual key used to store cached data in local storage
// expiration = time in minutes before an entry is refreshed, value <= 0 disables cache reads
var MBLinks = function (cachekey, expiration) {
  this.supports_local_storage = function () {
    try {
      return !!localStorage.getItem;
    } catch (e) {
      return false;
    }
  }();

  this.ajax_requests = {
    // properties: "key": {handlers: [], next: property}
    first: "",
    last: "",
    empty: function() {return this.first == "";},
    push: function(key, handler) {
        if (key in this) {
            this[key].handlers.push(handler);
        }
        else {
            this[key] = {handlers: [handler], next: ""};
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
        var key = this.first;
        var handlers = this[key].handlers;
        this.first = this[key].next;
        delete this[key]; // delete this property
        return handlers;
    },
    size: function() {
      return Object.keys(this).length;
    }
  };
  this.cache = {};
  this.expirationMinutes = parseInt(expiration);
  this.cache_key = cachekey;
  this.mb_server = '//musicbrainz.org';
  // overrides link title and img src url (per type), see createMusicBrainzLink()
  this.type_link_info = {
      release_group: {
        title: 'See this release group on MusicBrainz',
      },
    }

  this.initAjaxEngine = function () {
    var ajax_requests = this.ajax_requests;
    setInterval(function () {
      if (ajax_requests.size() > 0) {
        var requests = ajax_requests.shift();
        if (typeof requests === "function") {
          requests();
        } else if (requests instanceof Array) {
          $.each(requests, function(i, request) {
            if (typeof request === "function") {
              request();
            }
          })
        }
      }
    }, 1000);
  };

  this.initCache = function () {
    if (!this.supports_local_storage) return;
    // Check if we already added links for this content
    this.cache = JSON.parse(localStorage.getItem(this.cache_key) || '{}');
  };

  this.saveCache = function () {
    if (!this.supports_local_storage) return;
    try {
      localStorage.setItem(this.cache_key, JSON.stringify(this.cache));
    } catch (e) {
      alert(e);
    }
  },

  // Search for ressource 'url' in local cache, and return the matching MBID if there's only matching MB entity.
  // If the url is not known by the cache, no attempt will be made to request the MusicBrainz webservice, in order to keep this method synchronous.
  this.resolveMBID = function (url) {
    if (mblinks.cache[url]
        && mblinks.expirationMinutes > 0
        && new Date().getTime() < mblinks.cache[url].timestamp
        && mblinks.cache[url].urls.length == 1) {
      return mblinks.cache[url].urls[0].slice(-36);
    }
  };

  this.createMusicBrainzLink = function (mb_url, _type) {
    var title = 'See this ' + _type + ' on MusicBrainz';
    var img_url = this.mb_server + '/static/images/entity/' + _type + '.png';
    // handle overrides
    var ti = this.type_link_info[_type];
    if (ti) {
      if (ti.title) title = ti.title;
      if (ti.img_url) img_url = ti.img_url;
    }
    return '<a href="' + mb_url + '" title="' + title + '"><img src="' + img_url + '"/></a> ';
  };

  // Search for ressource 'url' on MB, for relation of type 'mb_type' (artist, release, label, release-group, ...)
  // and call 'insert_func' function with matching MB links (a tag built in createMusicBrainzLink) for each
  // entry found
  this.searchAndDisplayMbLink = function (url, mb_type, insert_func) {
    var mblinks = this;
    var _type = mb_type.replace('-', '_'); // underscored type

    if (mblinks.cache[url]
        && mblinks.expirationMinutes > 0
        && new Date().getTime() < mblinks.cache[url].timestamp) {
      $.each(mblinks.cache[url].urls, function (idx, mb_url) {
        insert_func(mblinks.createMusicBrainzLink(mb_url, _type));
      });
    } else {
      mblinks.ajax_requests.push(url, $.proxy(function () {
        var context = this;
        $.getJSON(mblinks.mb_server + '/ws/2/url?resource=' + encodeURIComponent(context.url)
                  + '&inc=' + context.mb_type + '-rels',
          function (data) {
            if ('relations' in data) {
              var expires = new Date().getTime() + (mblinks.expirationMinutes * 60 * 1000);
              mblinks.cache[context.url] = {
                timestamp: expires,
                urls: []
              };
              $.each(data['relations'], function (idx, relation) {
                if (_type in relation) {
                  var mb_url = mblinks.mb_server + '/' + context.mb_type + '/' + relation[_type]['id'];
                  if ($.inArray(mb_url, mblinks.cache[context.url].urls) == -1) { // prevent dupes
                    mblinks.cache[context.url].urls.push(mb_url);
                    context.insert_func(mblinks.createMusicBrainzLink(mb_url, _type));
                  }
                }
              });
              mblinks.saveCache();
            }
          });
      }, {
        'url': url,
        'insert_func': insert_func,
        'mb_type': mb_type
      }));
    }
  };

  this.initCache();
  this.initAjaxEngine();

  return this;
};
