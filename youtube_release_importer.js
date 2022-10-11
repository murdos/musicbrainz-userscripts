// ==UserScript==
// @name        MusicBrainz: Import videos from YouTube as Release
// @version     2014-09-07
// @author      -
// @namespace   df069240-fe79-11dc-95ff-0800200c9a66
// @require https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require     http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
//
// @include     *://www.youtube.com/watch?*
// ==/UserScript==
//**************************************************************************//
/* global waitForKeyElements */

// Adapted from https://bitbucket.org/Freso/nikki-userscripts/raw/2bafb61929ed2a4296029e7311bad8f357f44245/youtube-importer/youtube-importer.user.js

let google_api_key = 'AIzaSyC5syukuFyCSoRvMr42Geu_d_1c_cRYouU';

let myform = document.createElement('form');
myform.method = 'post';
myform.target = 'blank';
myform.action = '//musicbrainz.org/release/add';
myform.acceptCharset = 'UTF-8';
let mysubmit = document.createElement('input');
mysubmit.type = 'submit';
mysubmit.value = 'Add to MusicBrainz';
myform.appendChild(mysubmit);

let div = document.createElement('div');

let m = document.location.href.match(/\?v=([A-Za-z0-9_-]{11})/);
if (m && m[1]) {
    let yt_ws_url = `//www.googleapis.com/youtube/v3/videos?part=snippet,id,contentDetails&id=${m[1]}&key=${google_api_key}`;
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open('GET', yt_ws_url, true);
    xmlhttp.onreadystatechange = function () {
        yt_callback(xmlhttp);
    };
    xmlhttp.send(null);
}

function yt_callback(req) {
    if (req.readyState != 4) return;
    let r = eval(`(${req.responseText})`).items[0];

    let video_id = r.id;
    let title = r.snippet.title;
    let artist = r.snippet.channelTitle;
    let length = MBImport.ISO8601toMilliSeconds(r.contentDetails.duration);
    let date = new Date(r.snippet.publishedAt);

    add_field('name', title);
    add_field('events.0.date.year', date.getFullYear());
    add_field('events.0.date.month', date.getMonth());
    add_field('events.0.date.day', date.getDate());
    add_field('type', 'Single');
    add_field('artist_credit.names.0.artist.name', artist);
    add_field('mediums.0.format', 'Digital Media');
    add_field('mediums.0.track.0.name', title);
    add_field('mediums.0.track.0.length', length);
    add_field('status', 'Official');
    add_field('events.0.country', 'XW');
    add_field('edit_note', document.location.href);
    add_field('urls.0.link_type', 85);
    add_field('urls.0.url', document.location.href);

    let mb_ws_url = `https://musicbrainz.org/ws/2/url?fmt=json&query=https://www.youtube.com/watch?v=${video_id}`;
    let xmlhttp2 = new XMLHttpRequest();
    xmlhttp2.open('GET', mb_ws_url, true);
    xmlhttp2.onreadystatechange = function () {
        mb_callback(xmlhttp2);
    };
    xmlhttp2.send(null);
}

function mb_callback(req) {
    if (req.readyState != 4) {
        return;
    }
    let r = eval(`(${req.responseText})`);

    if (r.count >= 1) {
        div.innerHTML = `<a href='//musicbrainz.org/url/${r.urls[0].id}'>Already in Musicbrainz</a>`;
    } else {
        div.appendChild(myform);
    }
    waitForKeyElements('h1.title:last', add_button);
}

function add_button(title) {
    title[0].appendChild(div);
}

function add_field(name, value) {
    let field = document.createElement('input');
    field.type = 'hidden';
    field.name = name;
    field.value = value;
    myform.appendChild(field);
}
