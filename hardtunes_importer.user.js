// ==UserScript==
// @name           Import HardTunes releases to MusicBrainz
// @author         basxto
// @namespace      https://github.com/basxto/musicbrainz-userscripts/
// @description    One-click importing of releases from https://www.hardtunes.com/albums pages into MusicBrainz (based on beatport importer)
// @version        2020.10.06.1
// @downloadURL    https://raw.githubusercontent.com/basxto/musicbrainz-userscripts/master/hardtunes_importer.user.js
// @updateURL      https://raw.githubusercontent.com/basxto/musicbrainz-userscripts/master/hardtunes_importer.user.js
// @include        http://www.hardtunes.com/albums/*
// @include        https://www.hardtunes.com/albums/*
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/basxto/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// ==/UserScript==


if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    MBImportStyle();

    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
});

function translateArtist(name, joinphrase) {
    let track = {credited_name: name, joinphrase: joinphrase};
    // src: https://www.hardstyle.com/artists
    switch(name.toLowerCase()) {
        case 'various artists':
            track.artist_name = 'Various Artists';
            track.artist_mbid = '89ad4ac3-39f7-470e-963a-56509c546377';
            break;
    }
    return track;
}

function retrieveReleaseInfo(release_url) {
    console.log('url:', release_url);
    let tracks = [];
    let release_heading = unsafeWindow.document.getElementsByClassName('release-heading')[0];
    let catno = '';
    let release = {
        artist_credit: [translateArtist(release_heading.childNodes[1].innerText)],
        title: release_heading.childNodes[0].innerText,
        format: 'Digital Media',
        packaging: 'None',
        country: 'XW',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: 'album',
        urls: [],
        labels: [],
        discs: [],
    };

    for (form of document.getElementsByClassName('form-group')) {
        if (!form.childNodes[1])
            continue;
        var name = form.childNodes[0].innerText;
        var value = form.childNodes[1].innerText;
        switch (name) {
            case 'Style':
                style = value;
                break;
            case 'Code':
                if (isNaN(value)) 
                    catno = value;
                else
                    release.code = value;
                break;
            case 'Release date':
                release.day = value.split('.')[0];
                release.month = value.split('.')[1];
                release.year = value.split('.')[2];
                break;
        }
    }

    // URLs
    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.purchase_for_download,
    });

    // tracks

    for (item of window.document.getElementsByClassName('release-list-item')) {
        if (!item.getElementsByClassName('release-list-item-number')[0])
            continue;

        let track = {
            number: item.getElementsByClassName('release-list-item-number')[0].innerText,
            title: item.getElementsByClassName('release-list-item-title')[0].innerText,
            //duration: "0:00",
            artist_credit: []
        };
        track.artist_credit.push(translateArtist(item.getElementsByClassName('release-list-item-artist')[0].innerText));
        tracks.push(track);
      }

    release.discs.push({
        tracks: tracks,
        format: release.format,
    });

    // define releasing label
    release.labels.push({
        name: release_heading.childNodes[2].innerText,
        catno: catno,
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'HardTunes.com');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    /*let mbUI = $(
        `<li class="interior-release-chart-content-item musicbrainz-import">${MBImport.buildFormHTML(
            parameters
        )}${MBImport.buildSearchButton(release)}</li>`
    ).hide();

    $('.interior-release-chart-content-list').append(mbUI);
    $('form.musicbrainz_import').css({ display: 'inline-block', 'margin-left': '5px' });
    $('form.musicbrainz_import button').css({ width: '120px' });
    mbUI.slideDown();*/
}
