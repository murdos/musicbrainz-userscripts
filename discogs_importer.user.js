// ==UserScript==

// @name           Import Discogs releases to MusicBrainz
// @version        2014.02.22.1
// @namespace      http://userscripts.org/users/22504
// @icon           http://www.discogs.com/images/discogs130.png
// @downloadURL    https://raw.github.com/murdos/musicbrainz-userscripts/master/discogs_importer.user.js
// @updateURL      https://raw.github.com/murdos/musicbrainz-userscripts/master/discogs_importer.user.js
// @include        http://www.discogs.com/*
// @include        http://*.discogs.com/*release/*
// @exclude        http://*.discogs.com/*release/*?f=xml*
// @exclude        http://www.discogs.com/release/add
// @require        https://ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js
// @require        https://raw.github.com/murdos/musicbrainz-userscripts/master/lib/import_functions.js
// ==/UserScript==

////////////////////////////////////////////////////////////////////////////////////////////////////////

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function(){

    initCache();

    // Feature #1: Normalize Discogs links on current page by removing title from URL
    magnifyLinks();

    // Feature #2: Display links of equivalent MusicBrainz entities for masters and releases
    initAjaxEngine();
    insertMBLinks();

    // Handle page navigation on artist page for the first two features
    $("#releases").bind("DOMNodeInserted",function(event) {
        // Only child of $("#releases") are of interest
        if (event.target.parentNode.id == 'releases') {
            magnifyLinks(event.target);
            insertMBLinks($(event.target));
        }
    });

    // Feature #3: Add an import button in a new section in sidebar, if we're on a release page?
    if (window.location.href.match( /discogs\.com\/(.*\/?)release\/(\d+)$/) ) {

        // Discogs Webservice URL
        var discogsReleaseId = window.location.href.match( /discogs\.com\/(.*\/?)release\/(\d+)$/)[2];
        var discogsWsUrl = 'http://api.discogs.com/releases/' + discogsReleaseId;

        // Swith JQuery to MB's one, and save GreaseMonkey one
        var GM_JQuery = $;
        $ = unsafeWindow.$;

        $.ajax({
            url: discogsWsUrl,
            dataType: 'jsonp',
            headers: { 'Accept-Encoding': 'gzip',  'User-Agent': 'MBDiscosgImporter/0.1 +http://userscripts.org/scripts/show/36376' },
            crossDomain: true,
            success: function (data, textStatus, jqXHR) {
                //mylog(data);
                var release = parseDiscogsRelease(data);
                insertLink(release);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                mylog("AJAX Status:" + textStatus);
                mylog("AJAX error thrown:" + errorThrown);
            }
        });

        // Back to GreaseMonkey's JQuery
        $ = GM_JQuery;

    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                 Display links of equivalent MusicBrainz entities for masters and releases                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Ajax engine to throttle requests to MusicBrainz
var ajax_requests = [];
function initAjaxEngine() {
    setInterval(function() {
        if(ajax_requests.length > 0) {
            var request = ajax_requests.shift();
            if(typeof request === "function") {
                request();
            }
        }
    }, 1000);
}

// Cache for Discogs to MB mapping
var DISCOGS_MB_MAPPING_CACHE = {};

function initCache() {
    // Check if we already added links for this content
    var CACHE_STRING = localStorage.getItem('DISCOGS_MB_MAPPING_CACHE');
    if(!CACHE_STRING) {
        CACHE_STRING = "{}";
    }
    DISCOGS_MB_MAPPING_CACHE = JSON.parse(CACHE_STRING);
}

function saveCACHE() {
    localStorage.setItem('DISCOGS_MB_MAPPING_CACHE', JSON.stringify(DISCOGS_MB_MAPPING_CACHE));
}

function createMusicBrainzLink(mb_url) {
    return '<a href="'+mb_url+'"><img src="http://musicbrainz.org/favicon.ico" /></a> ';
}

// Insert MusicBrainz links in a section of the page
function insertMBLinks($root) {

    function searchAndDisplayMbLinkInSection($tr, mb_type, discogs_type) {
        $tr.find('a[href*="http://www.discogs.com/'+discogs_type+'/"]').each(function() {
            var $link = $(this);
            var discogs_url = $link.attr('href');
            searchAndDisplayMbLink(discogs_url, mb_type, $link);
        });
    }

    if (!$root) {
        $root = $('body');
    }

    $root.find('tr.master').each(function() {
        searchAndDisplayMbLinkInSection($(this), 'release-group', 'master');
    });

    $root.find('tr.release').each(function() {
        searchAndDisplayMbLinkInSection($(this), 'release', 'release');
    });

    $root.find('tr.hidden.r_tr').each(function() {
        searchAndDisplayMbLinkInSection($(this), 'release', 'release');
    });

}

// Ask MusicBrainz if the provided Discogs URL is linked to MusicBrainz entities (release-group or release)
// and then create links to these MB entities inside the provided DOM container
function searchAndDisplayMbLink(discogs_url, mb_type, link_container) {

    if(DISCOGS_MB_MAPPING_CACHE[discogs_url]) {
        $.each(DISCOGS_MB_MAPPING_CACHE[discogs_url], function(idx, mb_url) {
            link_container.before(createMusicBrainzLink(mb_url));
        });
    } else {
        ajax_requests.push($.proxy(function() {
            var context = this;
            $.getJSON('http://musicbrainz.org/ws/2/url?resource='+context.discogs_url+'&inc='+context.mb_type+'-rels', function(data) {
                if ('relations' in data) {
                    DISCOGS_MB_MAPPING_CACHE[context.discogs_url] = [];
                    $.each(data['relations'], function(idx, relation) {
                        if (context.mb_type.replace('-', '_') in relation) {
                            var mb_url = 'http://musicbrainz.org/'+context.mb_type+'/' + relation[context.mb_type.replace('-', '_')]['id'];
                            DISCOGS_MB_MAPPING_CACHE[context.discogs_url].push(mb_url);
                            saveCACHE();
                            context.$link.before(createMusicBrainzLink(mb_url));
                        }
                    });
                }
            });
        }, {'discogs_url': discogs_url, '$link': link_container, 'mb_type': mb_type}));
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                 Normalize Discogs URLs in a DOM tree                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Normalize Discogs URLs in a DOM tree
function magnifyLinks(rootNode) {

    if (!rootNode) {
        rootNode = document.body;
    }

    // Check if we already added links for this content
    if (rootNode.hasAttribute('discogsLinksMagnified'))
        return;
    rootNode.setAttribute('discogsLinksMagnified', true);

    var re = /^http:\/\/www\.discogs\.com\/(.*)\/(master|release)\/(\d+)$/i;

    var elems = rootNode.getElementsByTagName('a');
    for (var i = 0; i < elems.length; i++) {
        var elem = elems[i];

        // Ignore empty links
        if (!elem.href || $.trim(elem.textContent) == '' || elem.textContent.substring(4,0) == 'http')
            continue;

        elem.href = magnifyLink(elem.href);
    }
}

// Normalize Discogs URL by removing title from URL
function magnifyLink(url) {
    var re = /^http:\/\/www\.discogs\.com\/(.*)\/(master|release)\/(\d+)$/i;
    if (m = re.exec(url)) {
        var type = m[2];
        var id = m[3];
        return "http://www.discogs.com/" + type + "/" + id;
    }
    return url;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                             Insert MusicBrainz section into Discogs page                                           //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Insert links in Discogs page
function insertLink(release) {

    var mbUI = $('<div class="section musicbrainz"><h3>MusicBrainz</h3></div>');

    var mbContentBlock = $('<div class="section_content"></div>');
    mbUI.append(mbContentBlock);

    // Form parameters
    var edit_note = 'Imported from ' + window.location.href.replace(/http:\/\/(www\.|)discogs\.com\/(.*\/|)release\//, 'http://www.discogs.com/release/');
    var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

    // Build form
    var innerHTML = "MusicBrainz release(s) linked to this release: <span></span><br /><br />";
    innerHTML += MBReleaseImportHelper.buildFormHTML(parameters);
    // Append search link
    innerHTML += ' <small>(' + MBReleaseImportHelper.buildSearchLink(release) + ')</small>';

    mbContentBlock.html(innerHTML);
    var prevNode = $("div.section.social");
    prevNode.before(mbUI);

    // Find MB release(s) linked to this Discogs release
    var mbLinkContainer = $("div.section.musicbrainz div.section_content span");
    searchAndDisplayMbLink(magnifyLink(window.location.href), 'release', mbLinkContainer);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                               Parsing of Discogs data                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Analyze Discogs data and return a release object
function parseDiscogsRelease(data) {

    var discogsRelease = data.data;

    var release = new Object();
    release.discs = [];

    // Release artist credit
    release.artist_credit = new Array();
    $.each(discogsRelease.artists, function(index, artist) {
        var ac = {
            'artist_name': artist.name.replace(/ \(\d+\)$/, ""),
            'credited_name': (artist.anv != "" ? artist.anv : artist.name.replace(/ \(\d+\)$/, "")),
            'joinphrase': decodeDiscogsJoinphrase(artist.join)
        };
        release.artist_credit.push(ac);
    });

    // Release title
    release.title = discogsRelease.title;

    // Release date
    if (discogsRelease.released) {
        var releasedate = discogsRelease.released;
        if (typeof releasedate != "undefined" && releasedate != "") {
            var tmp = releasedate.split('-');        if (tmp[0] != "undefined" && tmp[0] != "") {
                release.year = parseInt(tmp[0], 10);
                if (tmp[1] != "undefined" && tmp[1] != "") {
                    release.month = parseInt(tmp[1], 10);
                    if (tmp[2] != "undefined" && tmp[2] != "") {
                        release.day = parseInt(tmp[2], 10);
                    }
                }
            }
        }
    }

    // Release country
    if (discogsRelease.country) {
        release.country = Countries[ discogsRelease.country ];
    }

    // Release labels
    release.labels = new Array();
    if (discogsRelease.labels) {
        $.each(discogsRelease.labels, function(index, label) {
            release.labels.push( { name: label.name, catno: (label.catno == "none" ? "[none]" : label.catno) } );
        });
    }

    // Release URL
    release.urls = new Array();
    release.urls.push( { url: window.location.href, link_type: 76 } );

    // Release format
    var release_formats = new Array();

    if (discogsRelease.formats.length > 0) {
        for(var i = 0; i < discogsRelease.formats.length; i++)
        {
            for(var j = 0; j < discogsRelease.formats[i].qty; j++)
                release_formats.push(MediaTypes[ discogsRelease.formats[i].name ]);

            if (discogsRelease.formats[i].descriptions) {
                $.each(discogsRelease.formats[i].descriptions, function(index, desc) {
                    // Release format: special handling of vinyl 7", 10" and 12"
                    if (desc.match(/7"|10"|12"/)) release_formats[release_formats.length-1] = MediaTypes[desc];
                    // Release format: special handling of Vinyl, LP == 12" (http://www.discogs.com/help/submission-guidelines-release-format.html#LP)
                    if (discogsRelease.formats[i].name == "Vinyl" && desc == "LP") release_formats[release_formats.length-1] = '12" Vinyl';
                    // Release status
                    if (desc.match(/Promo|Smplr/)) release.status = "promotion";
                    // Release type
                    if (desc.match(/Compilation/)) release.type = "compilation";
                    if (desc.match(/Single/)) release.type = "single";

                });
            }

            // Release packaging
            if (discogsRelease.formats[i].text) {
                var freetext = discogsRelease.formats[i].text.toLowerCase().replace(/-/g, '').replace(/ /g, '');
                if (freetext.match(/cardboard|paper/)) release.packaging = "cardboard/paper sleeve";
                if (freetext.match(/digipak/)) release.packaging = "digipak";
                if (freetext.match(/keepcase/)) release.packaging = "keep case";
                if (freetext.match(/jewel/)) {
                    release.packaging = freetext.match(/slim/) ? "slim jewel case" : "jewel case";
                }
            }
        }
    }

    // Barcode
    if (discogsRelease.identifiers) {
        $.each(discogsRelease.identifiers, function(index, identifier) {
            if (identifier.type == "Barcode") {
                release.barcode = identifier.value.replace(/ /g, '');
                return false;
            }
        });
    }

    // Inspect tracks
    var tracks = [];

    var releaseNumber = 1;
    var lastPosition = 0;
    $.each(discogsRelease.tracklist, function(index, discogsTrack) {
        // TODO: dectect disc title and set disc.title

        var track = new Object();

        track.title = discogsTrack.title;
        track.duration = discogsTrack.duration;

        // Track artist credit
        track.artist_credit = new Array();
        if (discogsTrack.artists) {
            $.each(discogsTrack.artists, function(index, artist) {
                var ac = {
                    'artist_name': artist.name.replace(/ \(\d+\)$/, ""),
                    'credited_name': (artist.anv != "" ? artist.anv : artist.name.replace(/ \(\d+\)$/, "")),
                    'joinphrase': decodeDiscogsJoinphrase(artist.join)
                };
                track.artist_credit.push(ac);
            });
        }

        // Track position and release number
        var trackPosition = discogsTrack.position;

        // Skip special tracks
        if (trackPosition.toLowerCase().match("^(video|mp3)")) {
            trackPosition = "";
        }

        var tmp = trackPosition.match(/(\d+)(?:[\.-](\d+))?/);
        if(tmp)
        {
            tmp[1] = parseInt(tmp[1], 10);
            var trackNumber = 1;
            if(tmp[2]) // 1-1, 1-2, 2-1, ... - we can get release number and track number from this
            {
                releaseNumber = tmp[1];
                trackNumber = parseInt(tmp[2], 10);
            }
            else if(trackPosition.match(/^[A-Za-z]\d*$/)) // Vinyl or cassette, handle it specially
            {
                var code = trackPosition.charCodeAt(0);
                // A-Z
                if (65 <= code && code <= 90) {
                    code = code - 65;
                } else if (97 <= code && code <= 122) {
                // a-z
                    code = code - (65 + 32);
                }
                releaseNumber = (code-code%2)/2+1;
            }
            else if(tmp[1] <= lastPosition) // 1, 2, 3, ... - We've moved onto a new medium
            {
                releaseNumber++;
                trackNumber = tmp[1];
            }
            else
            {
                trackNumber = tmp[1];
            }

            lastPosition = trackNumber;
        }

        // Create release if needed
        if ( !release.discs[releaseNumber-1] ) {
            release.discs.push(new Object());
            release.discs[releaseNumber-1].tracks = [];
            release.discs[releaseNumber-1].format = release_formats[releaseNumber-1];
        }

        // Track number (only for Vinyl and Cassette)
        if ( release.discs[releaseNumber-1].format.match(/(Vinyl|Cassette)/)
            && discogsTrack.position.match(/^[A-Z]+[\.-]?\d*/) ){
            track.number = discogsTrack.position;
        }

        // Trackposition is empty e.g. for release title
        if (trackPosition != "" && trackPosition != null)
            release.discs[releaseNumber-1].tracks.push(track);

    });

    mylog(release);
    return release;
}

function decodeDiscogsJoinphrase(join) {
    var joinphrase = "";
    var trimedjoin = join.replace(/^\s*/, "").replace(/\s*$/, "");
    if (trimedjoin == "") return trimedjoin;
    if (trimedjoin != ",") joinphrase += " ";
    joinphrase += trimedjoin;
    joinphrase += " ";
    return joinphrase;
}

function mylog(obj) {
    var DEBUG = true;
    if (DEBUG && unsafeWindow.console) {
        unsafeWindow.console.log(obj);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Discogs -> MusicBrainz mapping                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var MediaTypes = new Array();
MediaTypes["8-Track Cartridge"] = "Cartridge";
MediaTypes["Acetate"] = "Vinyl";
MediaTypes["Betamax"] = "Betamax";
MediaTypes["Blu-ray"] = "Blu-ray";
MediaTypes["Blu-ray-R"] = "Blu-ray";
MediaTypes["Cassette"] = "Cassette";
MediaTypes["CD"] = "CD";
MediaTypes["CDr"] = "CD-R";
MediaTypes["CDV"] = "CD";
MediaTypes["Cylinder"] = "Wax Cylinder";
MediaTypes["DAT"] = "DAT";
MediaTypes["Datassette"] = "Other";
MediaTypes["DCC"] = "DCC";
MediaTypes["DVD"] = "DVD";
MediaTypes["DVDr"] = "DVD";
MediaTypes["Edison Disc"] = "Vinyl";
MediaTypes["File"] = "Digital Media";
MediaTypes["Flexi-disc"] = "Vinyl";
MediaTypes["Floppy Disk"] = 12;
MediaTypes["HD DVD"] = "HD-DVD";
MediaTypes["HD DVD-R"] = "HD-DVD";
MediaTypes["Hybrid"] = "Other";
MediaTypes["Laserdisc"] = "LaserDisc";
MediaTypes["Memory Stick"] = "Digital Media";
MediaTypes["Microcassette"] = "Other";
MediaTypes["Minidisc"] = "MiniDisc";
MediaTypes["MVD"] = "Other";
MediaTypes["Reel-To-Reel"] = "Reel-to-reel";
MediaTypes["SelectaVision"] = "Other";
MediaTypes["Shellac"] = "Vinyl";
MediaTypes["UMD"] = "UMD";
MediaTypes["VHS"] = "VHS";
MediaTypes["Video 2000"] = "Other";
MediaTypes["Vinyl"] = "Vinyl";
MediaTypes['7"'] = '7" Vinyl';
MediaTypes['10"'] = '10" Vinyl';
MediaTypes['12"'] = '12" Vinyl';

var Countries = new Array();
Countries["Afghanistan"] = "AF";
Countries["Albania"] = "AL";
Countries["Algeria"] = "DZ";
Countries["American Samoa"] = "AS";
Countries["Andorra"] = "AD";
Countries["Angola"] = "AO";
Countries["Anguilla"] = "AI";
Countries["Antarctica"] = "AQ";
Countries["Antigua and Barbuda"] = "AG";
Countries["Argentina"] = "AR";
Countries["Armenia"] = "AM";
Countries["Aruba"] = "AW";
Countries["Australia"] = "AU";
Countries["Austria"] = "AT";
Countries["Azerbaijan"] = "AZ";
Countries["Bahamas"] = "BS";
Countries["Bahrain"] = "BH";
Countries["Bangladesh"] = "BD";
Countries["Barbados"] = "BB";
Countries["Belarus"] = "BY";
Countries["Belgium"] = "BE";
Countries["Belize"] = "BZ";
Countries["Benin"] = "BJ";
Countries["Bermuda"] = "BM";
Countries["Bhutan"] = "BT";
Countries["Bolivia"] = "BO";
Countries["Croatia"] = "HR";
Countries["Botswana"] = "BW";
Countries["Bouvet Island"] = "BV";
Countries["Brazil"] = "BR";
Countries["British Indian Ocean Territory"] = "IO";
Countries["Brunei Darussalam"] = "BN";
Countries["Bulgaria"] = "BG";
Countries["Burkina Faso"] = "BF";
Countries["Burundi"] = "BI";
Countries["Cambodia"] = "KH";
Countries["Cameroon"] = "CM";
Countries["Canada"] = "CA";
Countries["Cape Verde"] = "CV";
Countries["Cayman Islands"] = "KY";
Countries["Central African Republic"] = "CF";
Countries["Chad"] = "TD";
Countries["Chile"] = "CL";
Countries["China"] = "CN";
Countries["Christmas Island"] = "CX";
Countries["Cocos (Keeling) Islands"] = "CC";
Countries["Colombia"] = "CO";
Countries["Comoros"] = "KM";
Countries["Congo"] = "CG";
Countries["Cook Islands"] = "CK";
Countries["Costa Rica"] = "CR";
Countries["Virgin Islands, British"] = "VG";
Countries["Cuba"] = "CU";
Countries["Cyprus"] = "CY";
Countries["Czech Republic"] = "CZ";
Countries["Denmark"] = "DK";
Countries["Djibouti"] = "DJ";
Countries["Dominica"] = "DM";
Countries["Dominican Republic"] = "DO";
Countries["Ecuador"] = "EC";
Countries["Egypt"] = "EG";
Countries["El Salvador"] = "SV";
Countries["Equatorial Guinea"] = "GQ";
Countries["Eritrea"] = "ER";
Countries["Estonia"] = "EE";
Countries["Ethiopia"] = "ET";
Countries["Falkland Islands (Malvinas)"] = "FK";
Countries["Faroe Islands"] = "FO";
Countries["Fiji"] = "FJ";
Countries["Finland"] = "FI";
Countries["France"] = "FR";
Countries["French Guiana"] = "GF";
Countries["French Polynesia"] = "PF";
Countries["French Southern Territories"] = "TF";
Countries["Gabon"] = "GA";
Countries["Gambia"] = "GM";
Countries["Georgia"] = "GE";
Countries["Germany"] = "DE";
Countries["Ghana"] = "GH";
Countries["Gibraltar"] = "GI";
Countries["Greece"] = "GR";
Countries["Greenland"] = "GL";
Countries["Grenada"] = "GD";
Countries["Guadeloupe"] = "GP";
Countries["Guam"] = "GU";
Countries["Guatemala"] = "GT";
Countries["Guinea"] = "GN";
Countries["Guinea-Bissau"] = "GW";
Countries["Guyana"] = "GY";
Countries["Haiti"] = "HT";
Countries["Virgin Islands, U.S."] = "VI";
Countries["Honduras"] = "HN";
Countries["Hong Kong"] = "HK";
Countries["Hungary"] = "HU";
Countries["Iceland"] = "IS";
Countries["India"] = "IN";
Countries["Indonesia"] = "ID";
Countries["Wallis and Futuna"] = "WF";
Countries["Iraq"] = "IQ";
Countries["Ireland"] = "IE";
Countries["Israel"] = "IL";
Countries["Italy"] = "IT";
Countries["Jamaica"] = "JM";
Countries["Japan"] = "JP";
Countries["Jordan"] = "JO";
Countries["Kazakhstan"] = "KZ";
Countries["Kenya"] = "KE";
Countries["Kiribati"] = "KI";
Countries["Kuwait"] = "KW";
Countries["Kyrgyzstan"] = "KG";
Countries["Lao People's Democratic Republic"] = "LA";
Countries["Latvia"] = "LV";
Countries["Lebanon"] = "LB";
Countries["Lesotho"] = "LS";
Countries["Liberia"] = "LR";
Countries["Libyan Arab Jamahiriya"] = "LY";
Countries["Liechtenstein"] = "LI";
Countries["Lithuania"] = "LT";
Countries["Luxembourg"] = "LU";
Countries["Montserrat"] = "MS";
Countries["Macedonia, The Former Yugoslav Republic of"] = "MK";
Countries["Madagascar"] = "MG";
Countries["Malawi"] = "MW";
Countries["Malaysia"] = "MY";
Countries["Maldives"] = "MV";
Countries["Mali"] = "ML";
Countries["Malta"] = "MT";
Countries["Marshall Islands"] = "MH";
Countries["Martinique"] = "MQ";
Countries["Mauritania"] = "MR";
Countries["Mauritius"] = "MU";
Countries["Mayotte"] = "YT";
Countries["Mexico"] = "MX";
Countries["Micronesia, Federated States of"] = "FM";
Countries["Morocco"] = "MA";
Countries["Monaco"] = "MC";
Countries["Mongolia"] = "MN";
Countries["Mozambique"] = "MZ";
Countries["Myanmar"] = "MM";
Countries["Namibia"] = "NA";
Countries["Nauru"] = "NR";
Countries["Nepal"] = "NP";
Countries["Netherlands"] = "NL";
Countries["Netherlands Antilles"] = "AN";
Countries["New Caledonia"] = "NC";
Countries["New Zealand"] = "NZ";
Countries["Nicaragua"] = "NI";
Countries["Niger"] = "NE";
Countries["Nigeria"] = "NG";
Countries["Niue"] = "NU";
Countries["Norfolk Island"] = "NF";
Countries["Northern Mariana Islands"] = "MP";
Countries["Norway"] = "NO";
Countries["Oman"] = "OM";
Countries["Pakistan"] = "PK";
Countries["Palau"] = "PW";
Countries["Panama"] = "PA";
Countries["Papua New Guinea"] = "PG";
Countries["Paraguay"] = "PY";
Countries["Peru"] = "PE";
Countries["Philippines"] = "PH";
Countries["Pitcairn"] = "PN";
Countries["Poland"] = "PL";
Countries["Portugal"] = "PT";
Countries["Puerto Rico"] = "PR";
Countries["Qatar"] = "QA";
Countries["Reunion"] = "RE";
Countries["Romania"] = "RO";
Countries["Russian Federation"] = "RU";
Countries["Russia"] = "RU";
Countries["Rwanda"] = "RW";
Countries["Saint Kitts and Nevis"] = "KN";
Countries["Saint Lucia"] = "LC";
Countries["Saint Vincent and The Grenadines"] = "VC";
Countries["Samoa"] = "WS";
Countries["San Marino"] = "SM";
Countries["Sao Tome and Principe"] = "ST";
Countries["Saudi Arabia"] = "SA";
Countries["Senegal"] = "SN";
Countries["Seychelles"] = "SC";
Countries["Sierra Leone"] = "SL";
Countries["Singapore"] = "SG";
Countries["Slovenia"] = "SI";
Countries["Solomon Islands"] = "SB";
Countries["Somalia"] = "SO";
Countries["South Africa"] = "ZA";
Countries["Spain"] = "ES";
Countries["Sri Lanka"] = "LK";
Countries["Sudan"] = "SD";
Countries["Suriname"] = "SR";
Countries["Swaziland"] = "SZ";
Countries["Sweden"] = "SE";
Countries["Switzerland"] = "CH";
Countries["Syrian Arab Republic"] = "SY";
Countries["Tajikistan"] = "TJ";
Countries["Tanzania, United Republic of"] = "TZ";
Countries["Thailand"] = "TH";
Countries["Togo"] = "TG";
Countries["Tokelau"] = "TK";
Countries["Tonga"] = "TO";
Countries["Trinidad and Tobago"] = "TT";
Countries["Tunisia"] = "TN";
Countries["Turkey"] = "TR";
Countries["Turkmenistan"] = "TM";
Countries["Turks and Caicos Islands"] = "TC";
Countries["Tuvalu"] = "TV";
Countries["Uganda"] = "UG";
Countries["Ukraine"] = "UA";
Countries["United Arab Emirates"] = "AE";
Countries["UK"] = "GB";
Countries["US"] = "US";
Countries["United States Minor Outlying Islands"] = "UM";
Countries["Uruguay"] = "UY";
Countries["Uzbekistan"] = "UZ";
Countries["Vanuatu"] = "VU";
Countries["Vatican City State (Holy See)"] = "VA";
Countries["Venezuela"] = "VE";
Countries["Viet Nam"] = "VN";
Countries["Western Sahara"] = "EH";
Countries["Yemen"] = "YE";
Countries["Zambia"] = "ZM";
Countries["Zimbabwe"] = "ZW";
Countries["Taiwan"] = "TW";
Countries["[Worldwide]"] = "XW";
Countries["Europe"] = "XE";
Countries["Soviet Union (historical, 1922-1991)"] = "SU";
Countries["East Germany (historical, 1949-1990)"] = "XG";
Countries["Czechoslovakia (historical, 1918-1992)"] = "XC";
Countries["Congo, The Democratic Republic of the"] = "CD";
Countries["Slovakia"] = "SK";
Countries["Bosnia and Herzegovina"] = "BA";
Countries["Korea (North), Democratic People's Republic of"] = "KP";
Countries["North Korea"] = "KP";
Countries["Korea (South), Republic of"] = "KR";
Countries["South Korea"] = "KR";
Countries["Montenegro"] = "ME";
Countries["South Georgia and the South Sandwich Islands"] = "GS";
Countries["Palestinian Territory"] = "PS";
Countries["Macao"] = "MO";
Countries["Timor-Leste"] = "TL";
Countries["<85>land Islands"] = "AX";
Countries["Guernsey"] = "GG";
Countries["Isle of Man"] = "IM";
Countries["Jersey"] = "JE";
Countries["Serbia"] = "RS";
Countries["Saint Barthélemy"] = "BL";
Countries["Saint Martin"] = "MF";
Countries["Moldova"] = "MD";
Countries["Yugoslavia (historical, 1918-2003)"] = "YU";
Countries["Serbia and Montenegro (historical, 2003-2006)"] = "CS";
Countries["Côte d'Ivoire"] = "CI";
Countries["Heard Island and McDonald Islands"] = "HM";
Countries["Iran, Islamic Republic of"] = "IR";
Countries["Saint Pierre and Miquelon"] = "PM";
Countries["Saint Helena"] = "SH";
Countries["Svalbard and Jan Mayen"] = "SJ";
