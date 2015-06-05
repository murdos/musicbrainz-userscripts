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

  this.ajax_requests = [];
  this.cache = {};
  this.expirationMinutes = parseInt(expiration);
  this.cache_key = cachekey;
  this.mb_server = '//musicbrainz.org';

  this.initAjaxEngine = function () {
    var ajax_requests = this.ajax_requests;
    setInterval(function () {
      if (ajax_requests.length > 0) {
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
  };

  this.saveCache = function () {
    if (!this.supports_local_storage) return;
    try {
      localStorage.setItem(this.cache_key, JSON.stringify(this.cache));
    } catch (e) {
      alert(e);
    }
  },

  this.createMusicBrainzLink = function (mb_url, _type) {
    var title = 'Link to MB ' + _type;
    var img_url = this.mb_server + '/static/images/entity/' + _type + '.png';
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
      mblinks.ajax_requests.push($.proxy(function () {
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
