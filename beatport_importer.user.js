// ==UserScript==
// @name           Import Beatport releases to MusicBrainz
// @author         VxJasonxV
// @namespace      https://github.com/murdos/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2016.11.15.0
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/beatport_importer.user.js
// @include        http://www.beatport.com/release/*
// @include        https://www.beatport.com/release/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){
	MBImportStyle();

	var release_url = window.location.href.replace('/\?.*$/', '').replace(/#.*$/, '');
	var release = retrieveReleaseInfo(release_url);
	insertLink(release, release_url);
});

function retrieveReleaseInfo(release_url) {
	function contains_or(selector, list) {
		selectors = [];
		$.each(list, function(ind, value) {
			selectors.push(selector + ':contains("' + value.replace('"', '\\"') + '")');
		});
		return selectors.join(',');
	}
	var release_date_strings = [
		'Release Date', 'Fecha de lanzamiento', 'Date de sortie', 'Veröffentlichungsdatum', 'Data de lançamento', 'Releasedatum'
	];
	var release_strings = [
		'Release', 'Lanzamiento', 'Sortie', 'Album', 'Lançamento'
	];
	var labels_strings = [
		'Labels', 'Compañías discográficas', 'Gravadoras'
	];
	var catalog_strings = [
		'Catalog', 'Catálogo', 'Catalogue', 'Katalog', 'Catalogus'
	];
	var releaseDate = $(contains_or(".category", release_date_strings)).next().text().split("-");

	// Release information global to all Beatport releases
	var release = {
		artist_credit: [],
		title: $(contains_or("h3.interior-type", release_strings)).next().text().trim(),
		year: releaseDate[0],
		month: releaseDate[1],
		day: releaseDate[2],
		format: 'Digital Media',
		packaging: 'None',
		country: 'XW',
		status: 'official',
		language: 'eng',
		script: 'Latn',
		type: '',
		urls: [],
		labels: [],
		discs: [],
	};

	var release_id = $( "span.playable-play-all[data-release]" ).attr('data-release');

	// URLs
	release.urls.push({
		'url': release_url,
		'link_type': MBImport.URL_TYPES.purchase_for_download
	});

	release.labels.push(
			{
				name: $(contains_or(".category", labels_strings)).next().text().trim(),
				catno: $(contains_or(".category", catalog_strings)).next().text().trim()
			}
			);

	// Tracks
	var tracks = [];
	var the_tracks = unsafeWindow.Playables.tracks;
	var seen_tracks = {}; // to shoot duplicates ...
	var release_artists = [];
	$.each(the_tracks,
			function (idx, track) {
				if (track.release.id != release_id) {
					return;
				}
				if (seen_tracks[track.id]) {
					return;
				}
				seen_tracks[track.id] = true;

				var artists = [];
				$.each(track.artists,
						function (idx2,  artist) {
							artists.push(artist.name);
							release_artists.push(artist.name);
						}
						);

				var title = track.name;
				if (track.mix && track.mix != 'Original Mix') {
					title += ' (' + track.mix + ')';
							}
							tracks.push({
								'artist_credit': MBImport.makeArtistCredits(artists),
								'title': title,
								'duration': track.duration.minutes
							});
							}
							);

	var unique_artists = [];
	$.each(release_artists, function(i, el){
		if ($.inArray(el, unique_artists) === -1) {
			unique_artists.push(el);
		}
	});

	if (unique_artists.length > 4) {
		release.artist_credit = [ MBImport.specialArtist('various_artists') ];
	} else {
		release.artist_credit = MBImport.makeArtistCredits(unique_artists);
	}
	release.discs.push( {
		'tracks': tracks,
		'format': release.format
	} );

	LOGGER.info("Parsed release: ", release);
	return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
	var edit_note = MBImport.makeEditNote(release_url, 'BeatPort Pro');
	var parameters = MBImport.buildFormParameters(release, edit_note);

	var mbUI = $('<li class="interior-release-chart-content-item musicbrainz-import">'
			+ MBImport.buildFormHTML(parameters)
			+ MBImport.buildSearchButton(release)
			+ '</li>').hide();

	$(".interior-release-chart-content-list").append(mbUI);
	$('form.musicbrainz_import').css({'display': 'inline-block', 'margin-left': '5px'});
	$('form.musicbrainz_import button').css({'width': '120px'});
	mbUI.slideDown();
}

