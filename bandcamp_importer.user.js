// ==UserScript==
// @name         Import Bandcamp releases to MusicBrainz (Android Sync Fix)
// @description  Add a button on Bandcamp's album pages to open MusicBrainz release editor with pre-filled data for the selected release
// @version      2026.01.31.13
// @namespace    http://userscripts.org/users/22504
// @include      /^https:\/\/[^/]+\/(?:(?:(?:album|track))\/[^/]+|music)$/
// @include      /^https:\/\/([^.]+)\.bandcamp\.com((?:\/(?:(?:album|track))\/[^/]+|\/|\/music)?)$/
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimport.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/logger.js
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mblinks.js?version=v2025.12.22.1
// @require      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/lib/mbimportstyle.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function($) {
    'use strict';

    // --- STATUS BAR ---
    function updateStatus(color, text) {
        var $bar = $('#mb-status-bar');
        if (!$bar.length) {
            $bar = $('<div id="mb-status-bar" style="position:fixed; bottom:0; left:0; right:0; padding:8px; text-align:center; font-weight:bold; z-index:2147483647; font-size:14px; box-shadow:0 -2px 5px rgba(0,0,0,0.3);"></div>');
            $('body').append($bar);
        }
        $bar.css('background', color).css('color', color === 'yellow' ? 'black' : 'white').text(text);
        if (color === 'green') setTimeout(function() { $bar.fadeOut(); }, 4000);
    }

    updateStatus('yellow', 'MB Import: Initializing...');

    // --- PARSERS ---
    function parseDuration(duration) {
        if (!duration) return null;
        var match = duration.match(/P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)D)?T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?/);
        if (!match) return null;
        var hours = parseInt(match[4] || 0);
        var minutes = parseInt(match[5] || 0);
        var seconds = parseInt(match[6] || 0);
        return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
    }

    // --- DATA EXTRACTION ---
    function getDataFromJSONLD() {
        // Target the specific ID found in your uploaded files
        var $script = $('#tralbum-jsonld');
        if (!$script.length) $script = $('script[type="application/ld+json"]'); // Fallback
        
        if (!$script.length) return null;

        try {
            var json = JSON.parse($script.text());
            if (!json.albumRelease && json['@type'] !== 'MusicAlbum') return null;

            var release = {
                discs: [],
                artist_credit: [],
                barcode: '',
                title: json.name,
                year: 0, month: 0, day: 0,
                parent_album_url: '',
                labels: [],
                format: 'Digital Media',
                country: 'XW',
                type: 'album',
                status: 'official',
                packaging: 'None',
                language: 'eng',
                script: 'Latn',
                urls: [],
                url: json['@id'] || window.location.href
            };

            // Artist
            var artistName = "Unknown";
            if (json.byArtist && json.byArtist.name) {
                artistName = json.byArtist.name;
            }
            release.artist_credit = MBImport.makeArtistCredits([artistName]);

            // Date
            if (json.datePublished) {
                var d = new Date(json.datePublished);
                if (!isNaN(d.getTime())) {
                    release.year = d.getUTCFullYear();
                    release.month = d.getUTCMonth() + 1;
                    release.day = d.getUTCDate();
                }
            }

            // Tracks
            var disc = { tracks: [], format: release.format };
            release.discs.push(disc);

            if (json.track && json.track.itemListElement) {
                $.each(json.track.itemListElement, function(i, item) {
                    var trackObj = item.item;
                    var trackArtist = [];
                    if (trackObj.byArtist && trackObj.byArtist.name && trackObj.byArtist.name !== artistName) {
                        trackArtist = [trackObj.byArtist.name];
                    }
                    disc.tracks.push({
                        title: trackObj.name,
                        duration: parseDuration(trackObj.duration),
                        artist_credit: MBImport.makeArtistCredits(trackArtist)
                    });
                });
            }

            // UPC
            if (json.albumRelease && json.albumRelease[0].additionalProperty) {
                $.each(json.albumRelease[0].additionalProperty, function(i, prop) {
                    if (prop.name === 'gtin12' || prop.name === 'upc') {
                        release.barcode = prop.value;
                    }
                });
            }

            return release;
        } catch (e) {
            return null;
        }
    }

    // --- MAIN LOGIC ---
    $(document).ready(function() {
        var attempts = 0;
        var maxAttempts = 40; // 20 seconds
        
        var interval = setInterval(function() {
            attempts++;
            
            // 1. Get Data
            var release = getDataFromJSONLD();
            
            if (release) {
                // 2. Data Found! Now wait for DOM Target.
                var $target = $('#name-section'); // Desktop
                if (!$target.length) $target = $('.album-title-header'); // Mobile
                if (!$target.length) $target = $('h2.trackTitle').parent(); // Fallback
                
                // If we found the target, or if we've waited long enough (5s) that we should force it
                if ($target.length || attempts > 10) {
                    
                    clearInterval(interval);
                    
                    try {
                        MBImportStyle();

                        // Prevent duplicates
                        if ($('#mb_buttons').length) return;

                        var edit_note = MBImport.makeEditNote(release.url, 'Bandcamp');
                        var parameters = MBImport.buildFormParameters(release, edit_note);
                        
                        var mbUI = $('<div id="mb_buttons" style="margin-top:10px; margin-bottom:10px;">' + 
                                     MBImport.buildFormHTML(parameters) + 
                                     MBImport.buildSearchButton(release) + 
                                     '</div>').hide();

                        if ($target.length) {
                            $target.append(mbUI);
                            $('form.musicbrainz_import').css({'display': 'inline-block', 'margin-right': '5px'});
                            mbUI.slideDown();
                            updateStatus('green', 'MB Import: Button Added!');
                        } else {
                            // Failsafe: Floating Button (visible over header)
                            mbUI.css({
                                'position': 'fixed',
                                'top': '60px', // Below standard header
                                'right': '10px',
                                'z-index': '9999999',
                                'background': '#fff',
                                'padding': '10px',
                                'border': '2px solid red',
                                'box-shadow': '0 0 10px rgba(0,0,0,0.5)'
                            });
                            $('body').append(mbUI);
                            mbUI.show();
                            updateStatus('red', 'Layout Unknown: Button Floated (Top Right)');
                        }

                    } catch (e) {
                        updateStatus('red', 'Error: ' + e.message);
                    }
                } else {
                    updateStatus('yellow', 'Data found, waiting for layout...');
                }

            } else if (attempts > maxAttempts) {
                clearInterval(interval);
                updateStatus('red', 'Timeout: No Album Data Found');
            }
        }, 500);
    });

})(jQuery);
