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

function retrieveReleaseInfo(release_url) {
    let tracks = [];
    let release_heading = unsafeWindow.document.getElementsByClassName('release-heading')[0];
    let catno = '';
    let release = {
        artist_credit: [translateArtist(release_heading.childNodes[1].innerText.replace(/\s/g,' '))],
        title: release_heading.childNodes[0].innerText.replace(/\s/g,' '),
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
        var name = form.childNodes[0].innerText.replace(/\s/g,' ');
        var value = form.childNodes[1].innerText.replace(/\s/g,' ');
        switch (name) {
            case 'Style':
                style = value;
                break;
            case 'Code':
                if (isNaN(value)) 
                    catno = value;
                else
                    release.barcode = value;
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
            number: item.getElementsByClassName('release-list-item-number')[0].innerText.replace(/\s/g,' '),
            title: item.getElementsByClassName('release-list-item-title')[0].innerText.replace(/\s/g,' '),
            //duration: "0:00",
            artist_credit: []
        };
        let artists = item.getElementsByClassName('release-list-item-artist')[0].childNodes;
        // artist name and connecting strings alternate
        for (let i = 0; i < artists.length; i+=2)
            track.artist_credit.push(translateArtist(artists[i].innerText.replace(/\s/g,' '), (!(artists[i+1])?'':artists[i+1].textContent.replace(/\s/g,' '))));
        tracks.push(track);
    }

    release.discs.push({
        tracks: tracks,
        format: release.format,
    });

    // define releasing label
    release.labels.push(translateLabel(release_heading.childNodes[2].innerText.replace(/\s/g,' '), catno));

    LOGGER.info('Parsed release: ', release);
    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'HardTunes.com');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    document.getElementsByClassName('social-media')[0].innerHTML += MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release);
}

// Fixed mappings for some popular labels
function translateLabel(name, catno) {
    let label = {name: name, catno: catno};
    switch(name.toLowerCase()) {
        case 'partyraiser records':
        case 'partyraiser recordings':
            label.name = 'Partyraiser Recordings';
            label.mbid = '5f9b04f8-db9b-4ee6-97cf-529e7cdf8b53';
            break;
        case 'offensive rage':
            label.mbid = '841c4476-3d48-4a1b-9a59-800f838110bb';
            break;
        case 'offensive records':
                label.mbid = '06aa3e51-7cbd-48d2-a471-0ee5dcbd923a';
                break;
        case 'footworxx recordings':
        case 'footworxx':
            label.name = 'Footworxx';
            label.mbid = '32420075-ed6d-4178-8509-d2993823803c';
            break;
        case 'masters of hardcore':
            label.mbid = '5ee9577e-7ab3-4dba-a9a9-9952a620f430';
            break;
        case 'darkside unleashed':
            label.mbid = 'b89db39-4675-4398-a514-df9ce8a75eab';
            break;
        case 'dogfight records':
            label.mbid = '122b50ac-1e21-4587-8afb-4d87e7517275';
            break;
        case 'neophyte':
        case 'neophyte records':
            label.name = 'Neophyte Records';
            label.mbid = 'ce92e488-0a4d-4c9c-a103-3ff5f8d973d6';
            break;
        case 'triple six records':
            label.name = 'Triple Six Records';
            label.mbid = '79130387-b985-4921-90a4-1fdd5e7d5499';
            break;
        case 'industrial strength':
            label.mbid = '7c550e36-07bf-4f11-845a-7acf04527095';
            break;
        case 'this is terror':
            label.name = 'T.I.T. Records';
            label.mbid = 'a81a42f3-cb26-4843-972d-75d92eb08523';
            break;
        case 'cloud 9 music':
            label.mbid = '52afcd24-0bb6-47ae-8ecb-26d9a9e63565';
            break;
        case 'cloud 9 dance':
            label.mbid = '72720f91-b3d5-48a0-b85a-72675bf4cc2d';
            break;
        case 'peacock records':
            label.mbid = 'b6274f90-697a-4e92-8851-ed5ca52beb7d';
            break;
        case 'prspct recordings':
            label.mbid = 'e71795cb-afb3-4c46-af1c-77f25e0e58ff';
            break;
        case 'dna':
        case 'dna tracks':
            label.name = 'DNA Tracks';
            label.mbid = '34523963-79ea-4afb-9718-ac66b7c484ab';
            break;
        case 'enzyme records':
            label.mbid = '2b8edffb-fa7e-4dad-920f-37b77e184825';
            break;
        case 'q-dance compilations':
            label.mbid = 'a9d8ec1f-3753-4d01-9428-db55af832d85';
            break;
        case 'q-dance records':
        case 'q-dance':
            label.name = 'Q-Dance';
            label.mbid = '4843ef9a-f60c-47f0-af4a-4c433f365145';
    }
    return label;
}

// Fixed artist mappings since we have the luxury of being limited to a few genres
function translateArtist(name, joinphrase) {
    let track = {credited_name: name, joinphrase: joinphrase};
    switch(name.toLowerCase()) {
        case 'various artists':
            track.artist_name = 'Various Artists';
            track.mbid = '89ad4ac3-39f7-470e-963a-56509c546377';
            break;
        case 'the stunned guys':
            track.artist_name = 'The Stunned Guys';
            track.mbid = 'd676ee2b-57dc-4f99-a949-5523620b0252';
            break;
        case 'delete':
            track.artist_name = 'Delete';
            track.mbid = 'ff73b026-61f2-47b8-83df-78d34a4c171c';
            break;
        case 'wildstylez':
            track.artist_name = 'Wildstylez';
            track.mbid = '43fca023-da2f-4cc8-baaa-648cac5323bd';
            break;
        case 'rob gee':
            track.artist_name = 'Rob Gee';
            track.mbid = '268be9ed-c3ab-465d-8d78-b817e208f471';
            break;
        case 'mc diesel':
        case 'diesel':
            track.artist_name = 'Diesel';
            track.mbid = '9b725a36-127d-4348-93bb-57621ae2d61b';
            break;
        case 'alee':
        case 'mc alee':
            track.artist_name = 'MC Alee';
            track.mbid = '650f939d-501e-43d6-aaaa-22f288a2f1c2';
            break;
        case 'the sickest squad':
            track.artist_name = 'The Sickest Squad';
            track.mbid = 'df24a060-71cf-4f4d-8e88-5208925f51d0';
            break;
        case 'bodyshock':
            track.artist_name = 'Bodyshock';
            track.mbid = '3799096b-de23-47d2-a8a3-88561d6a8f52';
            break;
        case 'regain':
            track.artist_name = 'Regain';
            track.mbid = '2c8eadb9-1f53-4692-abc6-d8dcc3627736';
            break;
        case 'tha playah':
            track.artist_name = 'Tha Playah';
            track.mbid = 'b5dc46fe-1d6e-41da-bc10-9ee63390512f';
            break;
        case 'promo':
            track.artist_name = 'Promo';
            track.mbid = 'c2f1c49a-1469-4d42-b0d5-f61bba9415ca';
            break;
        case 'evil activities':
            track.artist_name = 'Evil Activities';
            track.mbid = 'd5ee4dc0-b286-44d8-85d7-a796a7d35674';
            break;
        case 'anime':
            track.artist_name = 'AniMe';
            track.mbid = '135c3615-e3be-43c5-b128-96471db351b3';
            break;
        case 'neophyte':
        case 'dj neophyte':
            track.artist_name = 'DJ Neophyte';
            track.mbid = 'f4d54618-9f8a-492f-88ef-49007151b489';
            break;
        case 'nosferatu':
            track.artist_name = 'Nosferatu';
            track.mbid = '96b836fe-557d-4a19-9cf2-4aa21e5de0bf';
            break;
        case 'edub':
            track.artist_name = 'eDUB';
            track.mbid = '3ca79b89-089b-4bb2-8655-d171e0c0a0ce';
            break;
        case 'i:gor':
            track.artist_name = 'I:gor';
            track.mbid = '23b4a86b-7be7-439e-99b2-836f289d3a92';
            break;
        case 'tha watcher':
        case 'mc tha watcher':
            track.artist_name = 'MC tha Watcher';
            track.mbid = 'b760968f-9060-4cee-949d-33e33ee002c1';
            break;
        case 'destructive tendencies':
            track.artist_name = 'Destructive Tendencies';
            track.mbid = 'd64fc31b-5fac-4530-b732-7e7174faae4d';
            break;
        case 'furyan':
            track.artist_name = 'Furyan';
            track.mbid = 'f14806bf-30d8-4080-8e4a-a97be84c4a99';
            break;
        case 'noize suppressor':
            track.artist_name = 'Noize Suppressor';
            track.mbid = '499b8636-7381-4b42-886a-e84cdada1a1e';
            break;
        case 'srb':
        case 's.r.b.':
            track.artist_name = 'S.R.B.';
            track.mbid = '03608dd3-7a3a-43b4-9b11-593d081b25e2';
            break;
        case 'e-noid':
            track.artist_name = 'E-Noid';
            track.mbid = '8aeb6324-6326-4e99-aec8-25c2185cfddc';
            break;
        case 're-style':
            track.artist_name = 'Re-Style';
            track.mbid = '969292d5-1609-4f2c-b48a-b3955ffe636d';
            break;
        case 'catscan':
            track.artist_name = 'Catscan';
            track.mbid = '294c9453-dee9-4864-b1f8-c1235dd5ebf9';
            break;
        case 'nolz':
        case 'mc nolz':
            track.artist_name = 'MC Nolz';
            track.mbid = 'cee47fc7-cb63-46fc-94b3-f131dd9c8899';
            break;
        case 'miss k8':
            track.artist_name = 'Miss K8';
            track.mbid = '897be100-4719-4b8b-8e17-d373ae728e9b';
            break;
        case 'lenny dee':
            track.artist_name = 'Lenny Dee';
            track.mbid = '480652fe-5288-4205-b74a-dfe0bb193e15';
            break;
        case 'meccane twins':
            track.artist_name = 'Meccano Twins';
            track.mbid = 'f0fed498-9c9d-4f82-8e99-bab2e91a231f';
            break;
        case 'unexist':
            track.artist_name = 'Unexist';
            track.mbid = '599123c4-4286-40a9-8846-66565fbac303';
            break;
        case 'tieum':
            track.artist_name = 'Tieum';
            track.mbid = '8786aa6d-db0b-4957-b9fc-1b50b377a4cd';
            break;
        case 'angernoizer':
            track.artist_name = 'Angernoizer';
            track.mbid = 'c45d4f70-071c-4d53-b548-fdcf6cf4b66c';
            break;
        case 'partyraiser':
            track.artist_name = 'Partyraiser';
            track.mbid = '9c6a8a2d-918a-47b6-aa20-3e8b4c2aad2b';
            break;
        case 'ophidian':
            track.artist_name = 'Ophidian';
            track.mbid = 'dae93723-8362-4cdb-8906-d468807a2a2e';
            break;
        case 'mouth of madness':
        case 'da mouth of madness':
        case 'mc da mouth of madness':
        case 'mc mouth of madness':
            track.artist_name = 'MC Mouth of Madness';
            track.mbid = '16fa6991-0b89-4790-8949-66a9506e4adc';
            break;
        case 'delta 9':
            track.artist_name = 'Delta 9';
            track.mbid = '0b550e57-4ef5-4852-a1f7-d884c00bd635';
            break;
        case 'the viper':
            track.artist_name = 'The Viper';
            track.mbid = '81d554c7-51c0-4827-b236-b7571f0aac83';
            break;
        case 'the outside agency':
            track.artist_name = 'The Outside Agency';
            track.mbid = 'bc0875f7-016f-425d-a558-c19054a810dc';
            break;
        case 'goetia':
            track.artist_name = 'Goetia';
            track.mbid = 'b8ecc784-e33a-43ea-acf1-5207024410bc';
            break;
        case 'the demon dwarf':
            track.artist_name = 'The Demon Dwarf';
            track.mbid = '5c4e2a20-00bd-4a56-a8b2-22611e2a47a9';
            break;
        case 'chrono':
            track.artist_name = 'Chrono';
            track.mbid = 'b6299954-871f-4bc0-8666-08140c37de0d';
            break;
        case 'igneon system':
            track.artist_name = 'Igneon System';
            track.mbid = '42e0d195-1987-45b5-9229-5551ded0e643';
            break;
        case 'micromakine':
            track.artist_name = 'Micromakine';
            track.mbid = '68d62e5f-4fa5-4a21-bab2-148cf7df3302';
            break;
        case 'sandy warez':
            track.artist_name = 'Sandy Warez';
            track.mbid = '27774362-8823-42b5-a39f-8a2ebda3da9a';
            break;
        case 'hardbouncer':
            track.artist_name = 'Hardbouncer';
            track.mbid = 'de18bc40-6330-4492-93f6-b6f7d4fd0b4c';
            break;
        case 'vandalism':
        case 'vandal!sm':
            track.artist_name = 'Vandal!sm';
            track.mbid = '08669379-1ddd-4c02-91f9-96bb1c6aa9fb';
            break;
        case 'mutante':
        case 'dj mutante':
            track.artist_name = 'DJ Mutante';
            track.mbid = '9c47789b-c5c3-49d7-bb45-f2b93648be0d';
            break;
        case 'negative a':
            track.artist_name = 'Negative A';
            track.mbid = 'dd5b255f-64b2-413d-a018-00ff9bca1823';
            break;
        case 'tripped':
            track.artist_name = 'Tripped';
            track.mbid = '02fa1416-e5bf-4619-b49d-0d9bb05aebe8';
            break;
        case 'outblast':
        case 'dj outblast':
            track.artist_name = 'DJ Outblast';
            track.mbid = 'dfcd18bb-7687-4825-8b57-cb1e05e9380c';
            break;
        case 'drokz':
            track.artist_name = 'Drokz';
            track.mbid = '3d06e7ca-8d61-41cd-85a9-ddedbd773138';
            break;
        case 'darkcontroller':
            track.artist_name = 'Darkcontroller';
            track.mbid = '3cf0e8db-9f6c-40e6-92cc-9491ecb2a9cc';
            break;
        case 'kasparov':
            track.artist_name = 'Kasparov';
            track.mbid = '1ba985b5-c215-4bcc-89f1-2a66b6213bc9';
            break;
        case 'aof':
        case 'art of fighters':
            track.artist_name = 'Art of Fighters';
            track.mbid = '4578eca4-9ec5-42a4-a4f1-ed9d668e573c';
            break;
        case 'paranoizer':
            track.artist_name = 'Paranoizer';
            track.mbid = '9201aa12-2146-4baa-a65b-86ccf1b79f1e';
            break;
        case 'f.noize':
        case 'f. noize':
            track.artist_name = 'F. Noize';
            track.mbid = 'b4cf1d1c-eb66-4629-a298-f192e087a575';
            break;
        case 'sei2ure':
            track.artist_name = 'Sei2ure';
            track.mbid = '93271b93-c455-4a3c-8e44-6cac3fc28d6b';
            break;
        case 'joey riot':
            track.artist_name = 'Joey Riot';
            track.mbid = 'cb86f6e4-85a5-44c3-8ef8-40db287b91b0';
            break;
        case 'dirty bastards':
            track.artist_name = 'Dirty Bastards';
            track.mbid = '86fc8d2f-5f5f-47cd-a1f4-0d537307a9d0';
            break;
        case 'advanced dealer':
            track.artist_name = 'Advanced Dealer';
            track.mbid = '34ee1447-4f04-4e2a-9709-e6f3564d1b98';
            break;
        case 'djipe':
            track.artist_name = 'DJIPE';
            track.mbid = 'f105a484-f1cf-4cc4-acbd-5c0a018af4a8';
            break;
        case 'hyrule war':
            track.artist_name = 'Hyrule War';
            track.mbid = 'b8df0d37-6200-40da-b8e7-080960a91ef2';
            break;
        case 'the braindrillerz':
            track.artist_name = 'The Braindrillerz';
            track.mbid = '1096edf5-b37f-4353-b34d-33d5c7b4d3c4';
            break;
        case 'remzcore':
            track.artist_name = 'Remzcore';
            track.mbid = 'd1c94fa6-90b5-403f-97cc-c51a507fe682';
            break;
        case 'mc diesel':
        case 'diesel':
            track.artist_name = 'Diesel';
            track.mbid = '9b725a36-127d-4348-93bb-57621ae2d61b';
            break;
        case 'icha':
        case 'dj icha':
            track.artist_name = 'DJ Icha';
            track.mbid = '03323579-0540-4a90-b07c-f8908bd9a81b';
            break;
        case 'andy the core':
            track.artist_name = 'Andy The Core';
            track.mbid = '3003f38e-d3c1-45d7-9dec-e1bf493696ae';
            break;
        case 'amnesys':
            track.artist_name = 'Amnesys';
            track.mbid = '25b2b75e-c531-45ec-bc4c-0127ec2e9041';
            break;
        case 'tommyknocker':
            track.artist_name = 'Tommyknocker';
            track.mbid = 'c7b0dab2-b7db-49d7-a8eb-20590c9a98ed';
            break;
        case 'frankentek':
            track.artist_name = 'FrankenTek';
            track.mbid = 'dc27cb71-92a9-47be-9599-b9dcf9724048';
            break;
        // src: https://www.hardstyle.com/artists
        case 'act of rage':
            track.artist_name = 'Act of Rage';
            track.mbid = '67a8a552-e9b1-45e0-9c9f-de7d760eb021';
            break;
        case 'adaro':
            track.artist_name = 'Adaro';
            track.mbid = 'ef9e239e-b957-4321-b709-db232ca4ab30';
            break;
        case 'adrenalize':
            track.artist_name = 'Adrenalize';
            track.mbid = '183b3df1-9ded-4277-ab11-a6fcb9a7cf44';
            break;
        case 'alpha²':
        case 'AlphaÂ²':
        case 'alpha 2':
        case 'alpha2':
        case 'alphatwins':
        case 'alpha twins':
            track.artist_name = 'Alpha Twins';
            track.mbid = 'ffbc1fb3-5afa-4993-b721-8c9885644311';
            break;
        case 'andy svge':
            track.artist_name = 'Andy Svge';
            track.mbid = '5a4676db-8036-47ec-9d4b-7f0fba2fb646';
            break;
        case 'waverider':
            track.artist_name = 'Waverider';
            track.mbid = 'a170b0c7-5769-4f41-aae7-1c2092229348';
            break;
        case 'angerfist':
            track.artist_name = 'Angerfist';
            track.mbid = '91d8e441-73a6-48a6-aed1-2bef4da87799';
            break;
        case 'bloodcage':
            track.artist_name = 'Bloodcage';
            track.mbid = '3ae57ad6-2068-4b69-9746-81232ad1d01d';
            break;
        case 'denekamps gespuis':
            track.artist_name = 'Denekamps Gespuis';
            track.mbid = '77d57f4f-79d4-4411-941a-180e2d7f6b2c';
            break;
        case 'menace ii society':
        case 'menace 2 society':
            track.artist_name = 'Menace II Society';
            track.mbid = 'bb7e1e12-67c6-4795-8cfd-a3dde8588c12';
            break;
        case 'atmozfears':
            track.artist_name = 'Atmozfears';
            track.mbid = '415fd900-607c-477f-b6ae-d4a713cff083';
            break;
        case 'audiofreq':
            track.artist_name = 'Audiofreq';
            track.mbid = 'd4dee63b-645d-41cc-b9a5-ee8814d22ec4';
            break;
        case 'audiotricz':
            track.artist_name = 'Audiotricz';
            track.mbid = 'f64e16ff-6d21-4490-9997-34ec1aa5f210';
            break;
        case 'b-front':
            track.artist_name = 'B-Front';
            track.mbid = '793b8a4d-8f89-445e-a6da-f0ba42e20c8d';
            break;
        case 'bass chaserz':
            track.artist_name = 'Bass Chaserz';
            track.mbid = 'a8add513-c3c9-4490-ac0c-0226eaad55cc';
            break;
        case 'bass modulators':
            track.artist_name = 'Bass Modulators';
            track.mbid = 'a9a01b0e-4336-417b-bc9e-e16c20b26650';
            break;
        case 'brennan heart':
            track.artist_name = 'Brennan Heart';
            track.mbid = '6f95ac0e-728c-4b4c-b08e-e8519d2e6ab6';
            break;
        case 'blademasterz':
            track.artist_name = 'Blademasterz';
            track.mbid = '45a9966a-12bf-49f6-9016-8fc857e0f10d';
            break;
        case 'clockartz':
            track.artist_name = 'Clockartz';
            track.mbid = 'efd50036-700d-4e2b-baa2-3b6e82144d14';
            break;
        case 'code black':
            track.artist_name = 'Code Black';
            track.mbid = 'ee9e5422-ac16-41bf-95a7-c0174e84e89e';
            break;
        case 'inverse':
            track.artist_name = 'Inverse';
            track.mbid = '220bec97-de27-4282-9af4-672134d45290';
            break;
        case 'coone':
        case 'dj coone':
            track.artist_name = 'DJ Coone';
            track.mbid = '8ec5439a-ff50-4b0f-9e75-fc3e517e75ff';
            break;
        case 'cyrex':
            track.artist_name = 'cyrex';
            track.mbid = 'e39c1a2d-1f77-46f9-a523-3f002eaaba4f';
            break;
        case 'crypsis':
            track.artist_name = 'Crypsis';
            track.mbid = '075a1b78-d372-441f-be21-f6cbd2aa695f';
            break;
        case 'crucifier':
            track.artist_name = 'Crucifier';
            track.mbid = 'd14b0f18-462c-43b3-b945-b5736620123c';
            break;
        case 'd-block':
            track.artist_name = 'D-Block';
            track.mbid = '34483ca8-7f09-40b7-8f5a-52854d812386';
            break;
        case 'dbstf':
        case 'd-block & s-te-fan':
            track.artist_name = 'D-Block & S-te-Fan';
            track.mbid = 'c81fd471-e2bd-4c7e-9b0a-fd893e74e523';
            break;
        case 's-te-fan':
            track.artist_name = 'S-te-Fan';
            track.mbid = 'a6aac434-376a-4f26-b28f-4052d803387f';
            break;
        case 'd-fence':
            track.artist_name = 'D-Fence';
            track.mbid = '0f3a7327-c439-4333-8101-3c974ad26b70';
            break;
        case 'd-sturb':
            track.artist_name = 'D-Sturb';
            track.mbid = '91f1468d-ee66-4925-aa13-a7d830b5e6da';
            break;
        case 'da tweekaz':
            track.artist_name = 'Da Tweekaz';
            track.mbid = '1127158d-787a-4dbe-8180-b9e695c02504';
            break;
        case 'deadly guns':
            track.artist_name = 'Deadly Guns';
            track.mbid = 'b259dd6d-26e8-4ec2-a5e0-2a1b1814fbad';
            break;
        case 'deepack':
            track.artist_name = 'Deepack';
            track.mbid = '702d022f-afa6-4614-b13d-01ea1cb74e7d';
            break;
        case 'deetox':
            track.artist_name = 'Deetox';
            track.mbid = '703ac2a1-dec6-4373-8fa8-39d77e96e04f';
            break;
        case 'demi kanon':
            track.artist_name = 'Demi Kanon';
            track.mbid = '4398d553-e58b-4ef6-91a1-ce2fdd45fd77';
            break;
        case 'devin wild':
            track.artist_name = 'Devin Wild';
            track.mbid = '6ebaee7c-4e9b-410a-bba1-7a2d79ffce51';
            break;
        case 'digital punk':
            track.artist_name = 'Digital Punk';
            track.mbid = '939f461e-2777-4293-9317-5bd408956950';
            break;
        case 'mad dog':
        case 'dj mad dog':
            track.artist_name = 'DJ Mad Dog';
            track.mbid = 'afe076ee-9d64-48d4-9fa8-09a4a4e7d77c';
            break;
        case 'dj paul':
        case 'paul elstak':
        case 'paul roger elstak':
        case 'dj paul elstak':
        case 'd.j. paul elstak':
            track.artist_name = 'DJ Paul Elstak';
            track.mbid = '026c4d7c-8dfe-46e8-ab14-cf9304d6863d';
            break;
        case 'donkey rollers':
            track.artist_name = 'Donkey Rollers';
            track.mbid = 'f409ada9-f088-4d35-aba3-55ece19f2597';
            break;
        case 'dr phunk':
        case 'dr. phunk':
            track.artist_name = 'Dr. Phunk';
            track.mbid = '966c92f4-8b68-4b91-93ed-0eda86c9a158';
            break;
        case 'dr rude':
        case 'dr. rude':
            track.artist_name = 'Dr. Rude';
            track.mbid = 'c100a0db-6652-4052-97b9-41d67edb5e3b';
            break;
        case 'dr peacock':
        case 'dr. peacock':
            track.artist_name = 'Dr. Peacock';
            track.mbid = '6d138947-ffb5-4da2-874b-9d97577f8b6c';
            break;
        case 'e-force':
            track.artist_name = 'E-Force';
            track.mbid = 'fd38f7c4-0a52-470d-84f9-9101fc20a859';
            break;
        case 'endymion':
            track.artist_name = 'Endymion';
            track.mbid = '6c11d222-c84b-43c7-8646-b88d35c09268';
            break;
        case 'frequencerz':
            track.artist_name = 'Frequencerz';
            track.mbid = '498fa10e-8b19-4170-8ae3-6da8a53073f5';
            break;
        case 'frontliner':
            track.artist_name = 'Frontliner';
            track.mbid = '68a2c082-aa5a-4138-a445-506ed0790176';
            break;
        case 'galactixx':
            track.artist_name = 'Galactixx';
            track.mbid = 'cfae15c3-b5e8-4c2d-939d-9f1fab948c5a';
            break;
        case 'g4h':
        case 'gunz 4 hire':
        case 'gunz for hire':
            track.artist_name = 'Gunz for Hire';
            track.mbid = '372d5c17-2037-4c8d-8454-da8636138271';
            break;
        case 'hard driver':
            track.artist_name = 'Hard Driver';
            track.mbid = '33370efb-bb46-48a4-a939-28d409be8236';
            break;
        case 'heady':
        case 'headhunter':
        case 'headhunterz':
            track.artist_name = 'Headhunterz';
            track.mbid = '79dbc936-adf2-4a29-8e01-c1fbe5613b0a';
            break;
        case 'high voltage':
            track.artist_name = 'High Voltage';
            track.mbid = '3f61b7be-347b-40fd-a76d-531b1284ac64';
            break;
        case 'jack of sound':
            track.artist_name = 'Jack of Sound';
            track.mbid = '95102764-ca57-418d-aa77-eaa82fab910c';
            break;
        case 'jebroer':
            track.artist_name = 'Jebroer';
            track.mbid = '0fc3ed5c-eeb7-45b4-b222-132dae4834ef';
            break;
        case 'keltek':
            track.artist_name = 'Keltek';
            track.mbid = '9541eb69-9239-41bc-9693-7ac1d1a66671';
            break;
        case 'killshot':
            track.artist_name = 'Killshot';
            track.mbid = 'a1fcacb3-a0e3-4196-adbf-7599d36cb4f4';
            break;
        case 'kronos':
            track.artist_name = 'Kronos';
            track.mbid = 'e70439d2-0406-4378-8d96-4b1a1965cbf1';
            break;
        case 'krowdexx':
            track.artist_name = 'Krowdexx';
            track.mbid = '965fecee-bead-44d9-acd9-3dcfaef5e2c1';
            break;
        case 'luminite':
            track.artist_name = 'Luminite';
            track.mbid = '1ce7ee4f-4453-4d1e-9f4f-b5be3682608f';
            break;
        case 'luna':
        case 'dj luna':
            track.artist_name = 'DJ Luna';
            track.mbid = 'dd989708-7310-4f5d-99f0-8ac4c951b372';
            break;
        case 'malice':
            track.artist_name = 'Malice';
            track.mbid = '3cb027cb-a6f7-44be-8048-da77b92a5ec6';
            break;
        case 'dj mark with a k':
        case 'mark with a k':
            track.artist_name = 'Mark With a K';
            track.mbid = '9dbb7013-fe35-4d7e-80ff-e7663fe5e8d2';
            break;
        case 'max enforcer':
            track.artist_name = 'Max Enforcer';
            track.mbid = '43d3ae26-c609-4f15-a705-6fa470c1c042';
            break;
        case 'minus militia':
            track.artist_name = 'Minus Militia';
            track.mbid = '7228d1de-2a26-42c6-bf79-9666c6112e86';
            break;
        case 'myst':
            track.artist_name = 'MYST';
            track.mbid = '556dce36-211e-45ac-a6f3-6c5a49323be7';
            break;
        case 'n-vitral':
            track.artist_name = 'N-Vitral';
            track.mbid = '853fe829-eeb0-4163-a84c-76a0899c7395';
            break;
        case 'ncrypta':
            track.artist_name = 'Ncrypta';
            track.mbid = 'cb09fbf6-52e6-4c20-8179-a1542bcf4a86';
            break;
        case 'nc':
        case 'noisecontroller':
        case 'noisecontrollerz':
        case 'noisecontrollers':
            track.artist_name = 'Noisecontrollers';
            track.mbid = '6c4335db-e676-418f-98e2-f8037ac88576';
            break;
        case 'nsclt':
        case 'noisecult':
            track.artist_name = 'Noisecult';
            track.mbid = 'f7a7472c-7bdd-4b11-b628-017e9cea1d88';
            break;
        case 'outbreak':
            track.artist_name = 'Outbreak';
            track.mbid = '324a7af6-1910-4ceb-8d88-3143f81bbbf1';
            break;
        case 'phuture noize':
            track.artist_name = 'Phuture Noize';
            track.mbid = '5347c7dc-a8bd-4a05-8ae1-a17fb1e6a388';
            break;
        case 'potato':
            track.artist_name = 'Potato';
            track.mbid = '7a310b25-f51a-4e6d-9459-fa91cfb4421e';
            break;
        case 'project one':
        case 'project 1':
            track.artist_name = 'Project One';
            track.mbid = 'a31c42d5-ca7d-4ecf-a324-d04ad09ea0d2';
            break;
        case 'psyko punkz':
            track.artist_name = 'Psyko Punkz';
            track.mbid = '4d24ceaf-19e7-49de-9c9f-2727fae287de';
            break;
        case 'public enemies':
            track.artist_name = 'Public Enemies';
            track.mbid = 'dd1ea4c4-8f3f-40b9-bc1b-a7ff78c30b6f';
            break;
        case 'radical':
        case 'radical redemption':
            track.artist_name = 'Radical Redemption';
            track.mbid = '4cdd32b8-9889-46cd-8b86-6cf9311965b9';
            break;
        case 'rand':
        case 'ran-d':
            track.artist_name = 'Ran-D';
            track.mbid = 'aa901f16-b91a-476f-ad41-ad09348c2244';
            break;
        case 'ransom':
            track.artist_name = 'Ransom';
            track.mbid = 'a8102c2a-7b28-4409-b77f-36ea3747ef89';
            break;
        case 'rebelion':
            track.artist_name = 'Rebelion';
            track.mbid = '54de6001-656c-420e-ba90-d920965a6dfc';
            break;
        case 'rebourne':
            track.artist_name = 'Rebourne';
            track.mbid = 'c6c1963c-efc0-430b-8bf9-5382c14f39bd';
            break;
        case 'refuzion':
            track.artist_name = 'Refuzion';
            track.mbid = '858b3a91-2f3c-40ee-a60b-a7f5b2162220';
            break;
        case 'requiem':
            track.artist_name = 'Requiem';
            track.mbid = '9ac6e36c-3661-47e1-b603-f33dffc31c49';
            break;
        case 'ressurectz':
            track.artist_name = 'Ressurectz';
            track.mbid = 'f83c0dfa-932f-4b96-998c-fd7f5d8f6626';
            break;
        case 'rooler':
            track.artist_name = 'Rooler';
            track.mbid = '07b7e791-ccfa-4ec4-b2f9-e136d4cf0746';
            break;
        case 'rvage':
            track.artist_name = 'RVAGE';
            track.mbid = 'a919ce28-506c-482a-a9ab-2b672195eb38';
            break;
        case 'sephyx':
            track.artist_name = 'Sephyx';
            track.mbid = '2108a312-9b9c-4714-aa98-77a4dc030b13';
            break;
        case 'showtek':
            track.artist_name = 'Showtek';
            track.mbid = '5663c716-c38f-4454-99ce-5afb3c5af567';
            break;
        case 'sound rush':
            track.artist_name = 'Sound Rush';
            track.mbid = '72d65c02-1b1f-4458-9ab8-6544eea4bdf0';
            break;
        case 'stereotuners':
            track.artist_name = 'Stereotuners';
            track.mbid = '468b4977-b55e-41a0-bfa9-6b05dfa827f6';
            break;
        case 'sub sonik':
            track.artist_name = 'Sub Sonik';
            track.mbid = '28f0ecf1-b1fb-4421-ac64-ec5b26cbd490';
            break;
        case 'sub zero project':
            track.artist_name = 'Sub Zero Project';
            track.mbid = 'a4c4ba39-14e7-44a3-a121-e86244c13f95';
            break;
        case 'tat':
        case 't4t4nk4':
        case 'tatanka':
            track.artist_name = 'Tatanka';
            track.mbid = '0fa94adc-ecaf-4a49-b738-d61d5bf8fa9a';
            break;
        case 'technoboy':
            track.artist_name = 'Technoboy';
            track.mbid = '495b431d-c77d-462a-8018-e546106e4ac5';
            break;
        case 'the pitcher':
            track.artist_name = 'The Pitcher';
            track.mbid = '0fb633da-d3ad-41a5-ab45-959f8b1d932f';
            break;
        case 'dj the prophet':
        case 'the prophet':
            track.artist_name = 'The Prophet';
            track.mbid = 'f2c23719-9fc6-43c5-8ff4-d2460381d5cc';
            break;
        case 'thyron':
            track.artist_name = 'Thyron';
            track.mbid = 'ca9a78aa-1fdf-4c3a-b915-a41173984677';
            break;
        case 'titan':
            track.artist_name = 'Titan';
            track.mbid = 'f72fd39d-d621-4c35-ab3d-442c32219ea9';
            break;
        case 'tnt':
            track.artist_name = 'TNT';
            track.mbid = 'e0255228-30ff-4e2f-be50-23419f22dd7a';
            break;
        case 'toneshifterz':
            track.artist_name = 'Toneshifterz';
            track.mbid = '9997c206-394a-4a66-afa3-c2b9d58a016e';
            break;
        case 'tuneboy':
            track.artist_name = 'Tuneboy';
            track.mbid = 'b32cab25-4c6a-4f3b-a50f-5be611162f0b';
            break;
        case 'unresolved':
            track.artist_name = 'Unresolved';
            track.mbid = '87ac3999-9b43-4188-9abf-44e41f0e0751';
            break;
        case 'vasto':
            track.artist_name = 'Vasto';
            track.mbid = 'fd9c0dfb-e389-4426-9dbe-2f25655710f3';
            break;
        case 'war force':
            track.artist_name = 'War Force';
            track.mbid = '0be2ba01-4ee9-41cc-b2ec-751aa8ff96aa';
            break;
        case 'warface':
            track.artist_name = 'Warface';
            track.mbid = '9fae3758-c9e7-4645-8680-4247ef467401';
            break;
        case 'wasted penguinz':
            track.artist_name = 'Wasted Penguinz';
            track.mbid = '27fdb917-a773-4c35-afae-a375572155bc';
            break;
        case 'x-pander':
            track.artist_name = 'X-Pander';
            track.mbid = '1f753e65-8647-4cd0-9cc1-f06f1c2efd56';
            break;
        case 'zany':
        case 'dj zany':
            track.artist_name = 'DJ Zany';
            track.mbid = '2db7f5b2-b3f8-4784-b9e7-3506be2061d3';
            break;
        case 'zat':
        case 'zatox':
            track.artist_name = 'Zatox';
            track.mbid = 'b1141d0f-8e55-4b3d-a2b2-958b8d3d96ae';
            break;
    }
    return track;
}