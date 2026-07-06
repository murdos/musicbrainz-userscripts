// ==UserScript==
// @name         Import Internet Archive releases to Musicbrainz
// @description  Add a button to Internet Archive pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.07.06.0
// @downloadURL  https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/internetarchive_importer.user.js
// @updateURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/internetarchive_importer.user.js
// @namespace    https://github.com/murdos/musicbrainz-userscripts
// @match        https://archive.org/details/*
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

// eslint-disable-next-line no-global-assign
if (!unsafeWindow) unsafeWindow = window;

async function onLoad() {
    MBImportStyle();

    const release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let releaseInfo = getReleaseInfo(release_url);
    insertLink(releaseInfo, release_url);

}

function isAudioFile(file) {
    if (file.match(/mp3|flac|wave|ogg|audio|aiff|shorten|weba/i)) {
        return true;
    }
    return false;
}

function stripHTMLTags(textContent) {
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = textContent.replaceAll('<br />', '\n').replaceAll('<br>','\n');
    return tempDiv.innerText.trim();
}

function createAnnotation(metadata) {
    let annotation = "=== Credits from Internet Archive ===\n";
    annotation += stripHTMLTags(metadata.description);

    let notes = "";
    if ("date" in metadata) notes += "\nPublication date: " + metadata.date;
    if ("subject" in metadata) {
        let tags = metadata.subject;
        if (typeof(tags) == "string") {
            tags = tags.replaceAll(";", ",").split(",").map(e => e.trim());
        }
        notes += "\nTags: " + tags.join(", ");
    }
    if (notes.length > 0) annotation += "\n==== metadata ====" + notes;
    return annotation;
}

function getMultiArtist(artist) {
    let artists = [];
    // Split release style.
    if (artist.includes("/")) {
        artists = artist.split("/").map(e => e.trim()).map(function (item) {
            return {artist_name: item, joinphrase: " / "};
        });
        artists[artists.length-1].joinphrase = '';
    } else {
    // Removing trailing chars.
    // Splitting only with ';' as ',' is used in sortnames and '&' may belong to artist name.
       artists = MBImport.makeArtistCredits(artist.replace(/[,;&]*$/, '').split(";").map(e => e.trim()));
    }
    // return various if over 5 artists
    if (artists.length > 5) artists = [MBImport.specialArtist('various_artists')];
    return artists;
}

function filesToDisc(files, artist) {
    let disc = {
        tracks: [],
        format: 'Digital Media',
    };

    files.forEach(file => {
        if (file.source == "original" && isAudioFile(file.format)) {
            disc.tracks.push({
                title: file.title,
                duration: Math.round(file.length * 1000),
                artist_credit: MBImport.makeArtistCredits([file.artist ?? artist]),
            });
        };
    });

    return disc;
}

function isVariousDisc(disc) {
    if (disc.tracks.length <= 5) return false;
    let unique_artists = new Set();
    disc.tracks.map(function(item) {
        unique_artists.add(item.artist_credit.artist_name);
    });
    return unique_artists.size > 5;
}

function getReleaseInfo(release_url) {

    const files = JSON.parse(document.querySelector('input[class="js-ia-metadata"]').value).files;
    const metadata = JSON.parse(document.querySelector('input[class="js-ia-metadata"]').value).metadata;

    let artist = metadata.creator ?? metadata.md_music_artist;
    if (artist === undefined) {
         artist = "artist key not found";
         LOGGER.info(
            'No known artist key found.\n'
            + 'Please inspect the metadata in console and submit a bug report.\n'
            + 'JSON.parse(document.querySelector(\'input[class="js-ia-metadata"]\').value).metadata'
            );
    }
    const identifier = metadata.identifier;

    let releaseDate = new Date(metadata.publicdate + "Z");
    let month = releaseDate.getUTCMonth() + 1;
    let day = releaseDate.getUTCDate();
    let releaseYear = releaseDate.getUTCFullYear();

    let title = metadata.title.replace(artist + " - ", "").replace("[" + releaseYear + "]", "").trim();
    if ("date" in metadata) {
        title = title.replace("[" + metadata.date + "]", "").trim();
    }

    let disc = filesToDisc(files, artist);
    let artists = [];

    if (isVariousDisc(disc)) {
        artists = [MBImport.specialArtist('various_artists')];
    } else {
        artists = getMultiArtist(artist);
    }

    let release = {
        media_type: metadata.mediatype,
        title: title,
        artist_credit: artists,
        status: 'official',
        language: 'eng',
        script: 'Latn',
        packaging: 'None',
        country: 'XW',
        labels: [],
        barcode: '',
        annotation: createAnnotation(metadata),
        year: releaseYear,
        month: month,
        day: day,
        urls: [],
        discs: [disc],
    };

    // Download & stream urls
    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.download_for_free,
    });
    release.urls.push({
        url: release_url,
        link_type: MBImport.URL_TYPES.stream_for_free,
    });
    // License url
    if ('licenseurl' in metadata) {
        release.urls.push({
            url: metadata.licenseurl,
            link_type: MBImport.URL_TYPES.license,
        });
    }
    // Labels
    metadata.collection.forEach(collection => {
        release.labels.push({
            name: document.querySelector('a[data-event-click-tracking*="CollectionList|' + collection + '"]').textContent.trim(),
            catno: metadata.identifier
        });
    });

    return release;
}

// Insert button into page
function insertLink(release, release_url) {

    if (release.media_type !== 'audio') {
        // only import audio
        return false;
    }

    const edit_note = MBImport.makeEditNote(release_url, 'Internet Archive');
    const parameters = MBImport.buildFormParameters(release, edit_note);

    const importButton = MBImport.buildFormHTML(parameters);
    const searchButton = MBImport.buildSearchButton(release);

    const mbUI = document.createElement('div');
    mbUI.id = 'mb_buttons';
    mbUI.innerHTML = `${importButton}${searchButton}`;
    document.querySelector('h1.item-title').appendChild(mbUI);
    mbUI.style.float = 'right';
    mbUI.style.marginLeft = '1em';
}

if (document.readyState !== 'loading') {
    onLoad();
} else {
    document.addEventListener('DOMContentLoaded', onLoad);
}
