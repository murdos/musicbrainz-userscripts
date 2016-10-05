// ==UserScript==
// @name           Import FMA releases to MusicBrainz
// @description    Add a button to import https://freemusicarchive.org/ releases to MusicBrainz via API
// @version        2016.08.29.0
// @namespace      https://github.com/murdos/musicbrainz-userscripts
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/fma_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/fma_importer.user.js
// @include        http*://freemusicarchive.org/music/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mblinks.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          none
// ==/UserScript==

/*
 * Test cases:
 * http://freemusicarchive.org/music/Various_Artists/Of_Men_And_Machines/
 * http://freemusicarchive.org/music/cloud_mouth/songs_from_the_sewer/
 * http://freemusicarchive.org/music/Podington_Bear/Springtime/
 * http://freemusicarchive.org/music/Broke_For_Free/Directionless_EP/
 * http://freemusicarchive.org/music/Various_Artists_Evergreens_n_Odditunes/Evergreens_n_Odditunes/
 * Radio program: http://freemusicarchive.org/music/Kyle_Eyre_Clyd/Live_on_WFMUs_Strength_Through_Failure_with_Fabio_Roberti_8132015/
 */


// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

// API Key assigned to registered user on FMA
var FMA_API = "FMA API KEY Missing";


if (!unsafeWindow) unsafeWindow = window;

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

	// if we have something on local storage place that
	if (localStorage.getItem('FMA_API_KEY')) {
		FMA_API = localStorage.getItem('FMA_API_KEY'); // -> YOURAPIKEY
	} else {
		insertAPIKEYSection();
		$("#api_key_submit").click(function() {
			var myval = $("#apikey_input").val();
			localStorage.setItem('FMA_API_KEY', myval);
			$("#musicbrainz_apikey").hide();
			FMA_API = localStorage.getItem('FMA_API_KEY'); // -> YOURAPIKEY
			LOGGER.debug("FMA API Key set: " + FMA_API);
			location.reload(true); //as document loaded and FMA_API was set out of scope
		});
	}

	// window.localStorage.clear()  hint: to clear the localStorage if needed

	LOGGER.info("Document Ready & FMA Userscript Executing");

	var fmaPage = parseFMApage();
	var mblinks = new MBLinks('FMA_CACHE', 7 * 24 * 60);

	if (DEBUG) {
		insertAPISection();
		updateAPISection.AlbumId(release_attributes.albumid);
		updateAPISection.ApiKey(FMA_API);
	}


	if ($(".minitag-album").length && FMA_API !== "FMA API KEY Missing") { // To make sure API and release only build on Album page.


		// Track parameters: total number of pages / api calls limit hardcoded to max of 20
		var retrieve_track_info = new track_api_parameters();
		// Album detail
		var retrieve_album_detail = new album_api();

		// Track detail
		$.when(retrieve_track_info) // ensure the track info is retrieved first (total_pages counter)
			.then(function() { // loop and deferred promise for multiple ajax calls
				updateAPISection.TrackAjaxStatus('busy');
				var track_api_calls = [];
				for (var i = 1; i <= release_attributes.total_pages; i++) {
					track_api_calls.push(track_api(i));
				}

				$.when.apply(this, track_api_calls).done(function() {
					LOGGER.debug("Tracks loaded and done in DONE lets use it");
					//console.log("total_pages " + release_attributes.total_pages);
					tracks_deferred.resolve();

				});
			})
			.done(function() {
				LOGGER.debug("Deferred for: Track info > track detail > resolved");
			});

		$.when(retrieve_tracks_promise)
			.done(function() {
				updateAPISection.TrackAjaxStatus('completed');
			})
			.fail(function() {
				updateAPISection.TrackAjaxStatus('fail');
			});

		$.when(retrieve_track_info, retrieve_tracks_promise, retrieve_album_detail).done(function() {
			LOGGER.info("All the AJAX API calls are done continue to build the release object ...");
			// LOGGER.debug("ALBUM Object > " + album_api_array[0]);
			// LOGGER.debug("TRACK Object > " + tracks_api_array);

			var FreeMusicArchiveRelease = new Parsefmarelease(album_api_array[0], tracks_api_array);
			insertMBSection(FreeMusicArchiveRelease);

			var album_link = window.location.href;

			var url = $(location).attr('href').split('/');
			var artist_url = url[url.length - 3];
			var base_url = 'http://freemusicarchive.org/music/';
			var artist_link = base_url + artist_url + '/';

			mblinks.searchAndDisplayMbLink(album_link, 'release', function(link) {
				$('.subh1').before(link);
			});
			mblinks.searchAndDisplayMbLink(artist_link, 'artist', function(link) {
				$('.subh1').after(link);
			});

		});
	}



});



// Determine the location on page to add MusicBrainz Section
function insertMbUI(mbUI) {
	var e;
	if ((e = $("#header")) && e.length) {
		e.after(mbUI);
	} else if ((e = $('#content')) && e.length) {
		e.before(mbUI);
	} else if ((e = $(".brumbs")) && e.length) {
		e.append(mbUI);
	}
}

// Insert link to high resolution image on FMA page
function insertIMGlinks() {
	//LOGGER.debug("FMA insertIMGlinks Function Executing");
	var imgsrc = $('#image-1 img.sbar-fullimg').attr('src');
	imgsrc = imgsrc.substring(0, imgsrc.indexOf('?'));
	//LOGGER.debug("    insertIMGlinks > imgsrc:", imgsrc);
	$('#album-images').append('<p><img src="http://musicbrainz.org/favicon.ico" /><a href="' + imgsrc + '">MB High Res Image</a></p>');
}

// Insert FreeMusicArchive API Status section on FMA page
function insertAPISection() {
	//LOGGER.debug("FMA insertAPISection Function Executing");

	var fmaUI = $('<div id="fmaapistatus" class="sbar-stat"><h4 class="wlinepad"><span class="hd">FMA API</span></h4></div>').hide();

	if (DEBUG) fmaUI.css({
		'border': '1px dotted red'
	});


	var fmaStatusBlock = $('<a class="lbut-lt" id="lbut-lt-fma-api-album-id">»</a> <a class="lbut-lt" id="lbut-lt-fma-api-key-id">»</a> <a id="lbut-lt-fma-api-album" class="lbut-lt">Album info retrieved</a><a class="lbut-lt" id="lbut-lt-fma-api-tracks">Track info retrieved</a>');
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
			this.ajaxstatus = "notcalled";
		} else {
			this.ajaxstatus = ajaxstatus;
		}

		switch (this.ajaxstatus) {
			case "completed": // Definition is that api call was successfull hence busy retrieving data
				//test chaging status of album api to error retrieving data after 2 seconds
				$('#lbut-lt-fma-api-album').css({
					'background-color': 'green'
				});
				break;
			case "busy": // Definition is that api call was successfull hence busy retrieving data
				//test chaging status of album api to error retrieving data after 2 seconds
				$('#lbut-lt-fma-api-album').css({
					'background-color': 'orange'
				});
				break;
			case "fail": // Definition is that api call was successfull hence busy retrieving data
				//test chaging status of album api to error retrieving data after 2 seconds
				$('#lbut-lt-fma-api-album').css({
					'background-color': 'red'
				});
				break;
		}
	},
	TrackAjaxStatus: function(ajaxstatus) {

		if (ajaxstatus === null) {
			this.ajaxstatus = "notcalled";
		} else {
			this.ajaxstatus = ajaxstatus;
		}

		switch (this.ajaxstatus) {
			case "completed": // Definition is that api call was successfull hence busy retrieving data
				//test chaging status of album api to error retrieving data after 2 seconds
				$('#lbut-lt-fma-api-tracks').css({
					'background-color': 'green'
				});
				break;
			case "busy": // Definition is that api call was successfull hence busy retrieving data
				//test chaging status of album api to error retrieving data after 2 seconds
				$('#lbut-lt-fma-api-tracks').css({
					'background-color': 'orange'
				});
				break;
			case "fail": // Definition is that api call was successfull hence busy retrieving data
				//test chaging status of album api to error retrieving data after 2 seconds
				$('#lbut-lt-fma-api-tracks').css({
					'background-color': 'red'
				});
				break;
		}
	}
};

// Insert MusicBrainz section on FMA page
function insertMBSection(release) {

	//LOGGER.debug(release);

	var mbUI = $('<div id="musicbrainz" class="section musicbrainz"><h4 class="wlinepad"><span class="hd">MusicBrainz</span></h4></div>').hide();
	if (DEBUG) mbUI.css({
		'border': '1px dotted red'
	});

	var mbContentBlock = $('<div class="section_content"></div>');
	mbUI.append(mbContentBlock);

	if (release.maybe_buggy) {
		var warning_buggy = $('<p><small><b>Warning</b>: this release is buggy, please check twice the data you import.</small><p').css({
			'color': 'red',
			float: 'left',
			'margin-top': '4px',
			'margin-bottom': '4px'
		});
		mbContentBlock.prepend(warning_buggy);
	}

	// Form parameters
	var edit_note = "FMA_Album_Id: " + release_attributes.albumid + " "; // temp add album id here untill we can add easy way to schema
	edit_note = edit_note + MBImport.makeEditNote(window.location.href, 'FreeMusicArchive');
	var parameters = MBImport.buildFormParameters(release, edit_note);

	// Build form + search button
	var innerHTML = '<div id="mb_buttons">' + MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release) + '</div>';
	mbContentBlock.append(innerHTML);

	insertMbUI(mbUI); // Insert the MusicBrainzUI
	insertIMGlinks(); // Insert the link to high res image


	$('#musicbrainz').css({
		display: 'block',
		float: 'right',
		height: '120px',
		width: '49%'
	});

	$('#mb_buttons').css({
		display: 'inline-block',
		'float': 'right',
		height: '80px'
	});
	$('form.musicbrainz_import').css({
		width: '49%',
		display: 'inline-block'
	});
	$('form.musicbrainz_import_search').css({
		'float': 'right'
	});
	$('form.musicbrainz_import > button').css({
		width: '63px',
		height: '80px',
		'box-sizing': 'border-box'
	});

	mbUI.slideDown();
}


// Insert MusicBrainz API section on FMA page to enter API Key
function insertAPIKEYSection() {
	LOGGER.debug("FMA insertAPIKEYSection Function Executing");


	var mbUI = $('<div id="musicbrainz_apikey" class="section musicbrainz"><h4 class="wlinepad"><span class="hd">Import FMA API KEY for MusicBrainz</span></h4></div>').hide();
	if (DEBUG) mbUI.css({
		'border': '1px dotted red'
	});

	var mbContentBlock = $('<div class="section_content"></div>');
	mbUI.append(mbContentBlock);


	// Build section
	var innerHTML = '<span class="mhd-nosep">Please enter API Key found <a class="donate" href="https://freemusicarchive.org/member/api_key" target="_blank">here</a></span>';
	innerHTML = innerHTML + '<div id="mb_buttons"><input id="apikey_input" type="text" name="apikey_input" value=""><br><input id="api_key_submit" type="submit" value="Import API KEY"></div>';
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
		'float': 'right',
		height: '80px'
	});

	mbUI.slideDown();
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                       Retrieve data from FMA API                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Retrieve Album JSON from API and push into array
function album_api() {

	var fmaWsUrl = 'https://freemusicarchive.org/api/get/albums.json?api_key=' + FMA_API + '&album_id=' + release_attributes.albumid;

	var promise_variable = $.getJSON(fmaWsUrl, function() {
		updateAPISection.AlbumAjaxStatus('busy');
		LOGGER.debug("promise_variable [state] in [getJSON] " + promise_variable.state());
	}).done(function(albumjson) {
		LOGGER.debug(" >> Album > DONE");
		updateAPISection.AlbumAjaxStatus('completed');
		//LOGGER.debug(albumjson);
		release_attributes.artist_name = albumjson.dataset[0].artist_name;
		album_api_array.push(albumjson.dataset[0]);

	});

	return promise_variable.promise();
}

// Retrieve Album JSON from API and assign values to release object
function track_api_parameters() {

	var fmaWsUrl = 'https://freemusicarchive.org/api/get/tracks.json?api_key=' + FMA_API + '&album_id=' + release_attributes.albumid + '&limit=20';

	var promise_track_api_params = $.getJSON(fmaWsUrl, function() {
		LOGGER.debug("promise_track_api_params [state] in [getJSON] " + promise_track_api_params.state());
	}).done(function(trackinfojson) {
		LOGGER.debug(" >> Track INFO > DONE");
		release_attributes.total_pages = trackinfojson.total_pages;
		//LOGGER.debug(trackinfojson);
	});

	return promise_track_api_params.promise();
}

// Retrieve Track JSON from API and push into array, can handle page itteration
function track_api(page) {

	var fmaWsUrl = 'https://freemusicarchive.org/api/get/tracks.json?api_key=' + FMA_API + '&album_id=' + release_attributes.albumid + '&limit=20&page=' + parseInt(page);


	var promise_track_api = $.getJSON(fmaWsUrl, function() {
		LOGGER.debug("promise_track_api_params [state] in [getJSON] " + promise_track_api.state());

	}).done(function(tracksjson) {
		LOGGER.debug(" >> Track page " + page + " > DONE ");
		LOGGER.debug(tracksjson);
		tracks_api_array.push(tracksjson.dataset);
	});

	return promise_track_api.promise();
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                 Parse information from FMA Page                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function parseFMApage() {
	// Check to see if it is an album class is minitag-album div#content div.bcrumb h1 span.minitag-album
	var FMAtype = "";
	// class inp-embed-code contain the album id
	if ($(".minitag-album").length) {
		FMAtype = "album";
	} else if ($(".minitag-song").length) {
		FMAtype = "track";
	} else if ($(".minitag-artist").length) {
		FMAtype = "artist";
	}


	if (FMAtype == "album") {
		//LOGGER.debug("FMA parseFMApage Function Executing on ", FMAtype);
		var FMAEmbedCode = $(".inp-embed-code input").attr("value");
		FMAEmbedCodeRegex = /(\/embed\/album\/)(.+?(?=.xml))/; // regex to find the album id from the input object
		var FMAAlbumIdMatch = FMAEmbedCode.match(FMAEmbedCodeRegex); // match the Id
		release_attributes.albumid = FMAAlbumIdMatch[2].trim(); // assign the ID to a variable
		LOGGER.info("FreeMusicArchive Album identified as: ", release_attributes.albumid);
	} else {
		LOGGER.error("No unique album identified on page", window.location.href);
		release_attributes.albumid = "";
	}

	// Label parsed from webpage as it is not in API
	$("div.sbar-stat span.lf105.stathd").each(function() {
		//var tester = $(this).eq(0).text().trim().toLowerCase(); // working
		var taglist = $(this).eq(0).text().trim().toLowerCase();
		if (taglist == "label:") {
			release_attributes.label = $(this).next().text();
			// fmarelease.labels.push({
			// 	name: FMAAlbumLabel
			// });
		} else {
			release_attributes.label = "";
		}
	});
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                            Analyze FMA data and return a release object                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Parse the date string and set object properties day, month, year
function parse_MM_DD_YYYY(date, obj) {
	if (!date) return;
	var m = date.split(/\D+/, 3).map(function(e) {
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

// parse the release from the album and track objects
function Parsefmarelease(albumobject, trackobject) {
	if (albumobject === undefined) {
		albumobject = [];
	} else {
		albumobject = albumobject;
	}

	if (trackobject === undefined) {
		trackobject = [];
	} else {
		trackobject = trackobject;
	}

	var fmarelease = {};

	// Create an empty object required for MBImport
	fmarelease.title = "";
	fmarelease.artist_credit = [];
	fmarelease.type = "";
	fmarelease.status = "";
	fmarelease.language = "";
	fmarelease.script = "";
	fmarelease.packaging = "";
	fmarelease.country = "";
	fmarelease.year = "";
	fmarelease.month = "";
	fmarelease.day = "";
	fmarelease.labels = [];
	fmarelease.barcode = "";
	fmarelease.urls = [];
	fmarelease.discs = [];

	// LOGGER.debug("Album object for parsing", albumobject);
	// LOGGER.debug("Track object for parsing", trackobject);

	// Title
	fmarelease.title = albumobject.album_title;
	LOGGER.debug("Title: ", fmarelease.title);

	// Artist Credit
	var VariousArtistsRegex = /(Various Artists)/; //found "Various Artists || Various Artists [album name]"
	var various_artists = VariousArtistsRegex.test(albumobject.artist_name);

	if (various_artists) {
		fmarelease.artist_credit = [MBImport.specialArtist('various_artists')];
	} else {
		fmarelease.artist_credit = MBImport.makeArtistCredits([albumobject.artist_name]);
	}

	// Type
	// TODO: match all FMA types to MB types
	if (albumobject.album_type == "Radio Program") {
		fmarelease.type = "broadcast";
	} else {
		fmarelease.type = albumobject.album_type.toLowerCase();
	}
	
	// Default status is official
	fmarelease.status = 'official';

	// Script
	fmarelease.script = 'Latn';

	// Check to see if a download button is available
	if ($(".sqbtn-downloadalbum").length) {
		fmarelease.packaging = 'none'; // Default packaging for download is none
		// Release URL
		fmarelease.urls.push({
			'url': albumobject.album_url,
			'link_type': MBImport.URL_TYPES.download_for_free
		});
	} else {
		// Release URL
		fmarelease.urls.push({
			'url': albumobject.album_url,
			'link_type': MBImport.URL_TYPES.other_databases
		});
	}
	
	// Check to see if a play button is available
	if ($(".sqbtn-playpage").length) {
		// Release URL
		fmarelease.urls.push({
			'url': albumobject.album_url,
			'link_type': MBImport.URL_TYPES.stream_for_free
		});
	}

	// Release date
	if (albumobject.album_date_released) {
		parse_MM_DD_YYYY(albumobject.album_date_released, fmarelease);
	}

	// Label parsed from webpage as it is not in API
	fmarelease.labels.push({
		name: release_attributes.label
	});



	var discarray = [];
	var trackarray = [];


	// release_attributes.total_pages
	for (var track_page_in_array = 0; track_page_in_array < trackobject.length; track_page_in_array++) {

		//LOGGER.debug(" ** Looping through array set for page " + track_page_in_array);


		var track_count_in_array_page = trackobject[track_page_in_array].length;
		//LOGGER.debug(" ** Track count in: trackobject[" + track_page_in_array + "] = " + track_count_in_array_page);

		for (var tracknumber = 0; tracknumber < track_count_in_array_page; tracknumber++) {
			//LOGGER.debug(" **** Track number in: trackobject[" + track_page_in_array + "][" + tracknumber + "] = " + tracknumber);
			var track = {};
			track.disc_number = trackobject[track_page_in_array][tracknumber].track_disc_number;
			track.number = trackobject[track_page_in_array][tracknumber].track_number;
			track.title = trackobject[track_page_in_array][tracknumber].track_title;
			track.duration = trackobject[track_page_in_array][tracknumber].track_duration;
			track.artist_credit = MBImport.makeArtistCredits([trackobject[track_page_in_array][tracknumber].artist_name]);

			trackarray.push(track);
		}
	}


	// Could not find a example where disc_number != 1 yet but started teh check so long
	var largest_disc = Math.max.apply(Math, trackarray.map(function(o) {
		return o.disc_number;
	}));
	//LOGGER.debug("Highest number disc:" + largest_disc);


	for (var disccount = 1; disccount <= largest_disc; disccount++) {

		// use this to map all the objects from trackarray with disc_number value of disccount to a new object
		var tracklist_per_disc = $.map(trackarray, function(obj, index) {
			if (obj.disc_number == disccount) {
				return obj;
			}
		});

		// use this to sort the tracks per disc from low to high
		tracklist_per_disc = tracklist_per_disc.sort(function(a, b) {
			return parseInt(a.number) - parseInt(b.number);
		});


		// remove the disc_number from the tracklist - not working
		// tracklist_per_disc = tracklist_per_disc.filter(function( obj ) {
		//     return obj.field !== 'disc_number';
		// });

		// current solution to remove disc_number
		for (i = tracklist_per_disc.length - 1; i >= 0; i--) {
			delete tracklist_per_disc[i].disc_number;
		}


		//LOGGER.debug("Disc # " + disccount + " > " + JSON.stringify(tracklist_per_disc));

		var disc = {
			'position': disccount,
			'format': 'Digital Media',
			'tracks': tracklist_per_disc
		};
		fmarelease.discs.push(disc);

	}

	LOGGER.info("Release:", fmarelease);
	return fmarelease;
}
