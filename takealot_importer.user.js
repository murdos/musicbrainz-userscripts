// ==UserScript==
// @name           Import Takealot releases to MusicBrainz
// @description    Add a button to import https://www.takealot.com/ releases to MusicBrainz via API
// @version        2019.1.5.1
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/takealot_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/takealot_importer.user.js
// @include        http*://www.takealot.com/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Test cases:
 * - https://www.takealot.com/theuns-jordaan-roeper-cd/PLID17284867 - working (Single artist release) [v1_type2]
 * - https://www.takealot.com/now-71-various-artists-cd/PLID40688034 - [v1_type1]
 * - https://www.takealot.com/du-plessis-juanita-vlieg-hoog-gospel-album-vol-2-cd/PLID15072701 [v2_type1]
 */

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

var DEBUG = false; // true | false

if (DEBUG) {
    LOGGER.setLevel('debug');
}

// promise to ensure all api calls are done before we parse the release
var tracks_deferred = $.Deferred();
var retrieve_tracks_promise = tracks_deferred.promise();

// object to store all global attributes collected for the release
var release_attributes = {}; // albumid, total_pages, artist_name, label

// arrays to store the data retrieved from API to parse for MB release
var album_api_array = []; // album information [0]
var tracks_api_array = []; // track information [0,1,2,..] one element for each pagination in FMA tracks API

$(document).ready(function() {
    LOGGER.info('Document Ready & Takealot Userscript Executing');

    let fmaPage = parseFMApage();
    let mblinks = new MBLinks('FMA_CACHE', 7 * 24 * 60);

    if (DEBUG) {
        insertAPISection();
        updateAPISection.AlbumId(release_attributes.albumid);
    }

    if ($('span.crumb:nth-child(1)').text() == 'Music') {
        // To make sure API and release only build on Album page.

        // Album detail
        let retrieve_album_detail = new album_api();

        $.when(retrieve_album_detail).done(function() {
            LOGGER.info('All the AJAX API calls are done continue to build the release object ...');
            LOGGER.debug(`ALBUM Object > ${album_api_array[0]}`);
            // LOGGER.debug("TRACK Object > " + tracks_api_array);

            let FreeMusicArchiveRelease = new Parsefmarelease(album_api_array[0], tracks_api_array);
            insertMBSection(FreeMusicArchiveRelease);

            let album_link = window.location.href;

            mblinks.searchAndDisplayMbLink(album_link, 'release', function(link) {
                $('div.product-title').after(link);
            });
        });
    }
});

// Determine the location on page to add MusicBrainz Section
function insertMbUI(mbUI) {
    let e;
    if ((e = $('.search-nav-wrap')) && e.length) {
        e.after(mbUI);
    } else if ((e = $('div.panel.pdp-main-panel')) && e.length) {
        e.after(mbUI);
    } else if ((e = $('.breadcrumbs ')) && e.length) {
        e.append(mbUI);
    }
}

// Insert links to high res image in Takealot page
function insertIMGlinks() {
    let imghref = $('div.image-box.main-gallery-photo img.image-loaded').attr('src');
    //LOGGER.debug('insertIMGlinks 1:: ', imghref);
    let imgnewhref = imghref.substring(0, imghref.lastIndexOf('-'));
    //LOGGER.debug('insertIMGlinks 2:: ', imgnewhref);
    let imgnewtype = imghref.substring(imghref.lastIndexOf('.'));
    //LOGGER.debug('insertIMGlinks 3:: ', imgnewtype);
    imgnewhref = `${imgnewhref}-full${imgnewtype}`;
    //LOGGER.debug('insertIMGlinks 4:: ', imgnewhref);
    $('div.panel.pdp-main-panel').append(
        `<p><img src="http://musicbrainz.org/favicon.ico" /><a href="${imgnewhref}">MB High Res Image</a></p>`
    );
}

// Insert FreeMusicArchive API Status section on FMA page
function insertAPISection() {
    LOGGER.debug('FMA insertAPISection Function Executing');

    let fmaUI = $('<div id="fmaapistatus" class="sbar-stat"><h4 class="wlinepad"><span class="hd">Takealot API</span></h4></div>').hide();

    if (DEBUG)
        fmaUI.css({
            border: '1px dotted red'
        });

    let fmaStatusBlock = $(
        '<a class="lbut-lt" id="lbut-lt-fma-api-album-id">»</a> <a class="lbut-lt" id="lbut-lt-fma-api-key-id">»</a> <a id="lbut-lt-fma-api-album" class="lbut-lt">Album info retrieved</a>'
    );
    fmaUI.append(fmaStatusBlock);

    insertMbUI(fmaUI); // Insert the FMA API Status UI

    $('#fmaapistatus').css({
        display: 'inline-block',
        float: 'left',
        height: '120px',
        width: '49%'
    });

    fmaUI.slideDown();
}

// Update FreeMusicArchive API Status section on FMA page
var updateAPISection = {
    AlbumId: function(albumid) {
        this.albumid = albumid;
        $('#lbut-lt-fma-api-album-id').text(this.albumid);
        return 'complete';
    },
    ApiKey: function(apikey) {
        this.apikey = apikey;
        $('#lbut-lt-fma-api-key-id').text(FMA_API);
        return 'complete';
    },
    AlbumAjaxStatus: function(ajaxstatus) {
        if (ajaxstatus === null) {
            this.ajaxstatus = 'notcalled';
        } else {
            this.ajaxstatus = ajaxstatus;
        }

        switch (this.ajaxstatus) {
            case 'completed': // Definition is that api call was successfull hence busy retrieving data
                //test chaging status of album api to error retrieving data after 2 seconds
                $('#lbut-lt-fma-api-album').css({
                    'background-color': 'green'
                });
                break;
            case 'busy': // Definition is that api call was successfull hence busy retrieving data
                //test chaging status of album api to error retrieving data after 2 seconds
                $('#lbut-lt-fma-api-album').css({
                    'background-color': 'orange'
                });
                break;
            case 'fail': // Definition is that api call was successfull hence busy retrieving data
                //test chaging status of album api to error retrieving data after 2 seconds
                $('#lbut-lt-fma-api-album').css({
                    'background-color': 'red'
                });
                break;
        }
    }
};

// function to determine if JSON or sub objects exist
// hasProp(albumobject, 'meta.Artists'); return true | false
function hasProp(obj, propPath, i) {
    if (typeof i === 'undefined' && !(i = 0)) {
        propPath = propPath.split('.');
    }
    if (typeof obj[propPath[i]] !== 'undefined' && obj[propPath[i]] != null) {
        //added null check as some JSON set to null
        return ++i && i !== propPath.length ? hasProp(obj[propPath[i - 1]], propPath, i) : true;
    }
    return false;
}

// Insert MusicBrainz section on FMA page
function insertMBSection(release) {
    //LOGGER.debug(release);

    let mbUI = $(
        '<div class="search-nav-wrap-2"></div>'
        //'<div id="musicbrainz" class="section musicbrainz"><h4 class="wlinepad"><span class="hd">MusicBrainz</span></h4></div>'
    ).hide();
    if (DEBUG)
        mbUI.css({
            border: '1px dotted red'
        });

    let mbContentBlock = $(
        '<div class="trim"><div class="cat-navigation left"><a href="https://www.musicbrainz.com">MusicBrainz</a></div></div>'
    );
    mbUI.append(mbContentBlock);

    if (release.maybe_buggy) {
        let warning_buggy = $('<p><small><b>Warning</b>: this release is buggy, please check twice the data you import.</small><p').css({
            color: 'red',
            float: 'left',
            'margin-top': '4px',
            'margin-bottom': '4px'
        });
        mbContentBlock.prepend(warning_buggy);
    }

    // Form parameters
    let edit_note = `Takealot_Album_Id: ${release_attributes.albumid} `; // temp add album id here untill we can add easy way to schema
    edit_note = edit_note + MBImport.makeEditNote(window.location.href, 'Takealot');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    // Build form + search button
    //let innerHTML = `<div id="mb_buttons">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`;
    //<button class="button add-to-mb-button async-button"><i class="plus-icon"></i><i class="add-to-mb-icon"></i></button>
    let innerHTML = `<div class="search-wrap right">${MBImport.buildFormHTML(parameters)}   ${MBImport.buildSearchButton(release)}</div>`;
    mbContentBlock.append(innerHTML);

    insertMbUI(mbUI); // Insert the MusicBrainzUI
    insertIMGlinks(); // Insert the link to high res image

    $('.search-nav-wrap-2').css({
        'background-color': '#eb743b',
        position: 'absolute',
        top: '150px',
        width: '100%'
    });

    $('form.musicbrainz_import').css({
        display: 'inline-block',
        'vertical-align': 'middle',
        margin: '0 0 1rem 0',
        'margin-bottom': '1rem',
        'font-family': 'inherit',
        padding: '0.85em 1em',
        '-webkit-appearance': 'none',
        border: '1px solid transparent',
        'border-radius': '0',
        '-webkit-transition': 'background-color 0.25s ease-out, color 0.25s ease-out',
        '-o-transition': 'background-color 0.25s ease-out, color 0.25s ease-out',
        transition: 'background-color 0.25s ease-out, color 0.25s ease-out',
        'font-size': '0.9rem',
        'line-height': '1',
        'text-align': 'center',
        cursor: 'pointer',
        'background-color': '#0b79bf',
        color: '#fefefe'
    });

    $('form.musicbrainz_import_search').css({
        display: 'inline-block',
        'vertical-align': 'middle',
        margin: '0 0 1rem 0',
        'margin-bottom': '1rem',
        'font-family': 'inherit',
        padding: '0.85em 1em',
        '-webkit-appearance': 'none',
        border: '1px solid transparent',
        'border-radius': '0',
        '-webkit-transition': 'background-color 0.25s ease-out, color 0.25s ease-out',
        '-o-transition': 'background-color 0.25s ease-out, color 0.25s ease-out',
        transition: 'background-color 0.25s ease-out, color 0.25s ease-out',
        'font-size': '0.9rem',
        'line-height': '1',
        'text-align': 'center',
        cursor: 'pointer',
        'background-color': '#0b79bf',
        color: '#fefefe'
    });

    /*    $('#mb_buttons').css({
            display: 'inline-block',
            float: 'right',
            height: '80px'
        });
        $('form.musicbrainz_import').css({
            width: '49%',
            display: 'inline-block'
        });
        $('form.musicbrainz_import_search').css({
            float: 'right'
        });
        $('form.musicbrainz_import > button').css({
            width: '63px',
            height: '80px',
            'box-sizing': 'border-box'
        });*/

    mbUI.slideDown();
}

// Insert MusicBrainz API section on FMA page to enter API Key
function insertAPIKEYSection() {
    LOGGER.debug('FMA insertAPIKEYSection Function Executing');

    let mbUI = $(
        '<div id="musicbrainz_apikey" class="section musicbrainz"><h4 class="wlinepad"><span class="hd">Import FMA API KEY for MusicBrainz</span></h4></div>'
    ).hide();
    if (DEBUG)
        mbUI.css({
            border: '1px dotted red'
        });

    let mbContentBlock = $('<div class="section_content"></div>');
    mbUI.append(mbContentBlock);

    // Build section
    let innerHTML =
        '<span class="mhd-nosep">Please enter API Key found <a class="donate" href="https://freemusicarchive.org/member/api_key" target="_blank">here</a></span>';
    innerHTML = `${innerHTML}<div id="mb_buttons"><input id="apikey_input" type="text" name="apikey_input" value=""><br><input id="api_key_submit" type="submit" value="Import API KEY"></div>`;
    mbContentBlock.append(innerHTML);

    insertMbUI(mbUI); // Insert the MusicBrainzUI

    $('#musicbrainz_apikey').css({
        display: 'block',
        float: 'right',
        height: '120px',
        width: '49%'
    });

    $('#mb_buttons').css({
        display: 'inline-block',
        float: 'right',
        height: '80px'
    });

    mbUI.slideDown();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                       Retrieve data from TAL API                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Retrieve Album JSON from API and push into array
function album_api() {
    let fmaWsUrl = `https://api.takealot.com/rest/v-1-6-0/productlines/lookup?idProduct=${release_attributes.albumid}`;

    var promise_variable = $.getJSON(fmaWsUrl, function() {
        updateAPISection.AlbumAjaxStatus('busy');
        LOGGER.debug(`promise_variable [state] in [getJSON] ${promise_variable.state()}`);
    }).done(function(albumjson) {
        LOGGER.debug(' >> Album > DONE');
        updateAPISection.AlbumAjaxStatus('completed');
        //LOGGER.debug('Takealot RAW album JSON: ',albumjson);
        // test for meta.Artists key
        if (hasProp(albumjson, 'response.meta.Artists')) {
            LOGGER.debug('response.meta.Artists > exist in JSON');
            release_attributes.artist_name = albumjson.response.meta.Artists[0];
        }

        album_api_array.push(albumjson.response);
    });

    return promise_variable.promise();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                 Parse information from FMA Page                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function parseFMApage() {
    // Check to see if it is an album class is minitag-album div#content div.bcrumb h1 span.minitag-album
    let FMAtype = 'album'; //manually set this on Takealot as I cant se where on page yet to define its a album
    // class inp-embed-code contain the album id
    if ($('.minitag-album').length) {
        FMAtype = 'album';
    } else if ($('.minitag-song').length) {
        FMAtype = 'track';
    } else if ($('.minitag-artist').length) {
        FMAtype = 'artist';
    }

    if (FMAtype == 'album') {
        //LOGGER.debug("FMA parseFMApage Function Executing on ", FMAtype);
        // <input type="hidden" id="idProduct" value="53513920">

        if (typeof $('#idProduct').attr('value') === 'undefined' && $('div.cell:nth-child(3) > a:nth-child(1)').length) {
            LOGGER.debug('Uhm I think the idProduct is missing folks and comments left ...');
            let FMAEmbedCode = $('div.cell:nth-child(3) > a:nth-child(1)').attr('href');
            LOGGER.debug('The album id for API: ', FMAEmbedCode);
            FMAEmbedCodeRegex = /product_id\=(\d*)/;
            let FMAAlbumIdMatch = FMAEmbedCode.match(FMAEmbedCodeRegex); // match the Id
            release_attributes.albumid = FMAAlbumIdMatch[1]; // assign the ID to a variable
        } else if (typeof $('#idProduct').attr('value') === 'undefined' && $('.reviews > a:nth-child(1)').length) {
            LOGGER.debug('Uhm I think the idProduct is missing folks ...');
            let FMAEmbedCode = $('.reviews > a:nth-child(1)').attr('href');
            LOGGER.debug('The album id for API: ', FMAEmbedCode);
            FMAEmbedCodeRegex = /product_id\=(\d*)/;
            let FMAAlbumIdMatch = FMAEmbedCode.match(FMAEmbedCodeRegex); // match the Id
            release_attributes.albumid = FMAAlbumIdMatch[1]; // assign the ID to a variable
        } else {
            LOGGER.debug('Aha got that idProduct value, Jipeeeee ...');
            let FMAEmbedCode = $('#idProduct').attr('value');
            FMAEmbedCodeRegex = /\d{8}/; // regex to match the value from the idProduct object
            let FMAAlbumIdMatch = FMAEmbedCode.match(FMAEmbedCodeRegex); // match the Id
            release_attributes.albumid = FMAAlbumIdMatch[0]; // assign the ID to a variable
        }

        LOGGER.info('Takealot Album identified as: ', release_attributes.albumid);
    } else {
        LOGGER.error('No unique album identified on page', window.location.href);
        release_attributes.albumid = '';
    }

    // Label parsed from webpage as it is not in API
    /*    $('div.sbar-stat span.lf105.stathd').each(function() {
            //var tester = $(this).eq(0).text().trim().toLowerCase(); // working
            let taglist = $(this)
                .eq(0)
                .text()
                .trim()
                .toLowerCase();
            if (taglist == 'label:') {
                release_attributes.label = $(this)
                    .next()
                    .text();
                // fmarelease.labels.push({
                //  name: FMAAlbumLabel
                // });
            } else {
                release_attributes.label = '';
            }
        });*/
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                            Analyze FMA data and return a release object                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Parse the date string and set object properties day, month, year
function parse_MM_DD_YYYY(date, obj) {
    if (!date) return;
    let m = date.split(/\D+/, 3).map(function(e) {
        return parseInt(e, 10);
    });
    if (m[0] !== undefined) {
        obj.month = m[0];
        if (m[1] !== undefined) {
            obj.day = m[1];
            if (m[2] !== undefined) {
                obj.year = m[2];
            }
        }
    }
}

function parse_YYYY_MM_DD(date, obj) {
    if (!date) return;
    let m = date.split(/\D+/, 3).map(function(e) {
        return parseInt(e, 10);
    });
    if (m[0] !== undefined) {
        obj.month = m[1];
        if (m[1] !== undefined) {
            obj.day = m[2];
            if (m[2] !== undefined) {
                obj.year = m[0];
            }
        }
    }
}

// parse the release from the album and track objects
function Parsefmarelease(albumobject, trackobject) {
    if (albumobject === undefined) {
        albumobject = [];
    } else {
        albumobject = albumobject;
    }

    let fmarelease = {};

    // Create an empty object required for MBImport
    fmarelease.title = '';
    fmarelease.artist_credit = [];
    fmarelease.type = '';
    fmarelease.status = '';
    fmarelease.language = '';
    fmarelease.script = '';
    fmarelease.packaging = '';
    fmarelease.country = '';
    fmarelease.year = '';
    fmarelease.month = '';
    fmarelease.day = '';
    fmarelease.labels = [];
    fmarelease.barcode = '';
    fmarelease.urls = [];
    fmarelease.discs = [];
    fmarelease.disc_format = '';

    LOGGER.debug('Album object for parsing', albumobject);

    // Title
    fmarelease.title = albumobject.title;
    LOGGER.debug('Title: ', fmarelease.title);

    // Artist Credit
    let VariousArtistsRegex = /(Various Artists)/; //found "Various Artists || Various Artists [album name]"

    // added a check to see if JSON proerty exist
    if (hasProp(albumobject, 'meta.Artists')) {
        //LOGGER.debug('Testing > hasOwnProperty > albumobject.meta.Artists = success');
        let various_artists = VariousArtistsRegex.test(albumobject.meta.Artists[0]);
        if (various_artists) {
            //LOGGER.debug('Testing > hasOwnProperty > value > Various Artists = success');
            fmarelease.artist_credit = [MBImport.specialArtist('various_artists')];
        } else {
            //LOGGER.debug('Testing > hasOwnProperty > value > Various Artists = false');

            fmarelease.artist_credit = MBImport.makeArtistCredits([albumobject.meta.Artists[0]]);
            //LOGGER.debug('Testing > hasOwnProperty > value > Various Artists = false : ', fmarelease.artist_credit);
        }
    }

    // Type
    // TODO: match all FMA types to MB types
    // currently if exist and music then its set to album
    if (hasProp(albumobject, 'type.slug')) {
        LOGGER.debug('Album type from albumobject: ', albumobject.type.slug);
        if (albumobject.type.slug == 'music') {
            fmarelease.type = 'album';
        }
    } else {
        // no type could be found, made it album as default
        fmarelease.type = 'album';
    }

    // Default status is official
    fmarelease.status = 'official';

    // Script
    fmarelease.script = 'Latn';

    // Barcode
    if (albumobject.meta.Barcode) {
        fmarelease.barcode = albumobject.meta.Barcode;
    } else {
        fmarelease.barcode = albumobject.meta.BarCode;
    }

    // Country
    fmarelease.country = Countries[albumobject.meta.Country];

    // Check to see if field is not empty
    if (albumobject.meta.Format) {
        //fmarelease.packaging = albumobject.meta.Format; // set Format to the JSON received
        // Release URL
        fmarelease.urls.push({
            url: albumobject.uri,
            link_type: MBImport.URL_TYPES.purchase_for_mail_order
        });
    } else {
        // Release URL
        fmarelease.urls.push({
            url: albumobject.uri,
            link_type: MBImport.URL_TYPES.purchase_for_mail_order
        });
    }

    // Release date
    if (albumobject.date_released) {
        //parse_YYYY_MM_DD(albumobject.date_released, fmarelease);
        parse_YYYY_MM_DD(albumobject.meta['Date Released'], fmarelease);
    }

    // @TODO: need to figure out to get packaging styles from page
    if (hasProp(albumobject, 'meta.Media')) {
        fmarelease.packaging = PackagingFormats[albumobject.meta.Media];
    }

    if (hasProp(albumobject, 'meta.Format')) {
        fmarelease.disc_format = albumobject.meta.Format;
    }

    //labels
    if (hasProp(albumobject, 'meta.Label')) {
        fmarelease.labels.push({
            name: albumobject.meta.Label
        });
    }

    // Language
    if (hasProp(albumobject, 'meta.Languages')) {
        fmarelease.language = Languages[albumobject.meta.Languages];
    }

    let alltracklist = [];

    let lastdiscnumber = 0;

    // copied logic from original TAL page as first try

    //var tracklistarray = []; // create the tracklist array to use later

    // Discs
    let disclistarray = []; // create the tracklist array to use later

    LOGGER.debug('Report on meta track type:', typeof albumobject.meta.Tracks);

    // to catch the first format type (1) - start of type 1 array tracks
    if (typeof albumobject.meta.Tracks === 'object') {
        alltracklist = albumobject.meta.Tracks;
        LOGGER.debug('The track array to work with: ', alltracklist);

        //release artist

        LOGGER.debug('alltracklist length', alltracklist.length);

        // Last track to find last disc number
        let lasttrack = alltracklist[alltracklist.length - 1];
        LOGGER.debug(`The last track:${lasttrack}`);

        // Define all te formats here
        takealot_format_1_1_regex = /\[ Disc (\d{2}) Track.(\b\d{2}) \] (.*) - (.*)/;
        takealot_format_1_2_regex = /\[ Disc (\d{2}) Track.(\b\d{2}) \] (.*)/;

        let takealot_format_1_1_test = takealot_format_1_1_regex.test(lasttrack);
        let takealot_format_1_2_test = takealot_format_1_2_regex.test(lasttrack);

        var takealot_format = '';

        if (takealot_format_1_1_test) {
            // set the disctracktitleregex to format 1.1
            takealot_format = 'v1_type1';
            LOGGER.info('Formatting: v1_type1');
            disctracktitleregex = takealot_format_1_1_regex;
        } else if (takealot_format_1_2_test) {
            // set the disctracktitleregex to format 1.2
            takealot_format = 'v1_type2';
            LOGGER.info('Formatting: v1_type2');
            disctracktitleregex = takealot_format_1_2_regex;
        } else {
            LOGGER.error('No REGEX matched the v1 pages');
            takealot_format = 'unmatched';
        }

        lastdiscnumberregex = /\[ Disc (.*) Track./; // regex to match disc number from last track
        let lastdiscnumbermatch = lasttrack.match(lastdiscnumberregex);
        lastdiscnumber = parseInt(lastdiscnumbermatch[1]);
        LOGGER.debug('Last Disc Number: ', lastdiscnumber);

        for (let k = 1; k < lastdiscnumber + 1; k++) {
            // start at 1 to keep array in sync with disc numbers
            LOGGER.debug('Disc iterate: ', k);

            // Tracks
            var tracklistarray = new Array(); // create the track list array

            for (let j = 0; j < alltracklist.length; j++) {
                // changed j to 0 and length-1 as Artist is at end
                // do regex here and if current disc listed in track = k then push the track into the array for that disc
                let trackdetails = alltracklist[j];
                // sample: [ Disc 01 Track 01 ] What Do You Mean? - Justin Bieber
                // do this up in regex tester now...
                //disctracktitleregex = /\[ Disc (\d{2}) Track.(\b\d{2}) \] (.*) - (.*)/;
                let disctracktitle = trackdetails.match(disctracktitleregex);

                let currentdiscnumber = parseInt(disctracktitle[1]);

                if (currentdiscnumber == k) {
                    var track = {};
                    let track_artist_credit = [];

                    track.number = parseInt(disctracktitle[2]);
                    track.title = disctracktitle[3];

                    //LOGGER.debug('TAL FORMAT *** ', takealot_format);

                    if (takealot_format === 'v1_type1') {
                        track.artist_credit = MBImport.makeArtistCredits([disctracktitle[4]]);
                    } else if (takealot_format === 'v1_type2') {
                        track.artist_credit = MBImport.makeArtistCredits([albumobject.meta.Artists[0]]);
                    } else {
                        fmarelease.maybe_buggy = true;
                        track.artist_credit = MBImport.makeArtistCredits(['']);
                    }

                    LOGGER.debug('The track object: ', `${currentdiscnumber} - ${track.number} - ${track.title}`);
                    tracklistarray.push(track);
                }
            }
            disclistarray.push(tracklistarray);
        }

        LOGGER.debug('** Disclist Array *** ', disclistarray);
    } // end of type 1 array tracks

    // to catch the first format type (2) - start of type 2 array tracks
    if (typeof albumobject.meta.Tracks === 'string') {
        LOGGER.debug('Version 2 parsing starting ...');
        alltracklist = albumobject.meta.Tracks;
        LOGGER.debug('The track array to work with: ', alltracklist);

        //var lines = alltracklist.value.split("\n");
        //var lines = alltracklist.val().split('\n');
        let lines = alltracklist.split(/\r?\n/);

        takealot_format = 'v2_type1';

        // Tracks
        var tracklistarray = new Array(); // create the track list array

        for (let j = 0; j < lines.length; j++) {
            //code here using lines[i] which will give you each line
            LOGGER.debug('Line: ', j, ' - ', lines[j]);

            // changed j to 0 and length-1 as Artist is at end
            // do regex here and if current disc listed in track = k then push the track into the array for that disc
            //let trackdetails = lines[j];
            // sample: [ Disc 01 Track 01 ] What Do You Mean? - Justin Bieber
            // do this up in regex tester now...
            //disctracktitleregex = /\[ Disc (\d{2}) Track.(\b\d{2}) \] (.*) - (.*)/;
            //let disctracktitle = trackdetails.match(disctracktitleregex);

            let currentdiscnumber = 1;
            lastdiscnumber = 1;

            if (currentdiscnumber == 1) {
                var track = {};
                let track_artist_credit = [];

                track.number = j + 1;
                track.title = lines[j];

                //LOGGER.debug('TAL FORMAT *** ', takealot_format);

                if (takealot_format === 'v2_type2') {
                    track.artist_credit = MBImport.makeArtistCredits([disctracktitle[4]]);
                } else if (takealot_format === 'v2_type1') {
                    track.artist_credit = MBImport.makeArtistCredits([albumobject.meta.Artists[0].trim()]);
                } else {
                    fmarelease.maybe_buggy = true;
                    track.artist_credit = MBImport.makeArtistCredits(['']);
                }

                LOGGER.debug('The track object: ', `${currentdiscnumber} - ${track.number} - ${track.title}`);
                tracklistarray.push(track);
            }
        }
        disclistarray.push(tracklistarray);
        LOGGER.debug('** Disclist Array *** ', disclistarray);
    } // end of type 2 array tracks

    fmarelease.discs = [];
    for (let l = 0; l < lastdiscnumber; l++) {
        LOGGER.debug('Disc position:', l + 1);
        LOGGER.debug('Tracklist for the selected disc: ', disclistarray[l]);
        let disc = {
            position: l + 1,
            format: DiscFormats[fmarelease.disc_format],
            tracks: disclistarray[l]
        };
        fmarelease.discs.push(disc);
    }

    LOGGER.info('Release:', fmarelease);
    return fmarelease;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Takealot -> MusicBrainz mapping                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var DiscFormats = [];
DiscFormats['CD'] = 'CD';
DiscFormats['DVD'] = 'DVD';
DiscFormats['Audio CD'] = 'CD';

var Languages = [];
Languages['Afrikaans'] = 'afr';
Languages['afrikaans'] = 'afr';

var Countries = [];
Countries['South Africa'] = 'ZA';
Countries['SA'] = 'ZA';

var PackagingFormats = [];
PackagingFormats['CD'] = 'jewel case';
