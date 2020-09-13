// ==UserScript==
// @name        MusicBrainz: Batch-add "performance of" relationships
// @description Batch link recordings to works from artist Recordings page.
// @version     2020.9.12.1
// @author      Michael Wiencek
// @license     X11
// @downloadURL https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/batch-add-recording-relationships.user.js
// @updateURL   https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/batch-add-recording-relationships.user.js
// @include     *://musicbrainz.org/artist/*/recordings*
// @include     *://*.musicbrainz.org/artist/*/recordings*
// @match       *://musicbrainz.org/artist/*/recordings*
// @match       *://*.musicbrainz.org/artist/*/recordings*
// ==/UserScript==

// ==License==
// Copyright (C) 2014 Michael Wiencek
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// Except as contained in this notice, the name(s) of the above copyright
// holders shall not be used in advertising or otherwise to promote the sale,
// use or other dealings in this Software without prior written
// authorization.
// ==/License==

const scr = document.createElement('script');
scr.textContent = `(${batch_recording_rels})();`;
document.body.appendChild(scr);

function batch_recording_rels() {
    function setting(name) {
        name = `bpr_${name}`;

        if (arguments.length === 2) {
            localStorage.setItem(name, arguments[1]);
        } else {
            return localStorage.getItem(name);
        }
    }

    // 'leven' function taken from https://github.com/sindresorhus/leven
    // Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
    // Released under the MIT License:
    // https://raw.githubusercontent.com/sindresorhus/leven/49baddd/license
    function leven(a, b) {
        if (a === b) {
            return 0;
        }

        let aLen = a.length;
        let bLen = b.length;

        if (aLen === 0) {
            return bLen;
        }

        if (bLen === 0) {
            return aLen;
        }

        let bCharCode;
        let ret;
        let tmp;
        let tmp2;
        let i = 0;
        let j = 0;
        let arr = [];
        let charCodeCache = [];

        while (i < aLen) {
            charCodeCache[i] = a.charCodeAt(i);
            arr[i] = ++i;
        }

        while (j < bLen) {
            bCharCode = b.charCodeAt(j);
            tmp = j++;
            ret = j;

            for (i = 0; i < aLen; i++) {
                tmp2 = bCharCode === charCodeCache[i] ? tmp : tmp + 1;
                tmp = arr[i];
                ret = arr[i] = tmp > ret ? (tmp2 > ret ? ret + 1 : tmp2) : tmp2 > tmp ? tmp + 1 : tmp2;
            }
        }

        return ret;
    }

    // HTML helpers

    function make_element(el_name, args) {
        let el = $(`<${el_name}></${el_name}>`);
        el.append.apply(el, args);
        return el;
    }
    function td() {
        return make_element('td', arguments);
    }
    function tr() {
        return make_element('tr', arguments);
    }
    function table() {
        return make_element('table', arguments);
    }
    function label() {
        return make_element('label', arguments);
    }
    function goBtn(func) {
        return $('<button>Go</button>').click(func);
    }

    // Date parsing utils
    let dateRegex = /^(\d{4}|\?{4})(?:-(\d{2}|\?{2})(?:-(\d{2}|\?{2}))?)?$/;
    let integerRegex = /^[0-9]+$/;

    function parseInteger(num) {
        return integerRegex.test(num) ? parseInt(num, 10) : NaN;
    }

    function parseIntegerOrNull(str) {
        let integer = parseInteger(str);
        return isNaN(integer) ? null : integer;
    }

    function parseDate(str) {
        let match = str.match(dateRegex) || [];
        return {
            year: parseIntegerOrNull(match[1]),
            month: parseIntegerOrNull(match[2]),
            day: parseIntegerOrNull(match[3]),
        };
    }

    function nonEmpty(value) {
        return value !== null && value !== undefined && value !== '';
    }

    let daysInMonth = {
        true: [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
        false: [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    };

    function isDateValid(y, m, d) {
        y = nonEmpty(y) ? parseInteger(y) : null;
        m = nonEmpty(m) ? parseInteger(m) : null;
        d = nonEmpty(d) ? parseInteger(d) : null;
        if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
        if (y !== null && y < 1) return false;
        if (m !== null && (m < 1 || m > 12)) return false;
        if (d === null) return true;
        let isLeapYear = y % 400 ? (y % 100 ? !(y % 4) : false) : true;
        if (d < 1 || d > 31 || d > daysInMonth[isLeapYear.toString()][m]) return false;
        return true;
    }

    // Request rate limiting

    let REQUEST_COUNT = 0;
    setInterval(function () {
        if (REQUEST_COUNT > 0) {
            REQUEST_COUNT -= 1;
        }
    }, 1000);

    function RequestManager(rate, count) {
        this.rate = rate;
        this.count = count;
        this.queue = [];
        this.last = 0;
        this.active = false;
        this.stopped = false;
    }

    RequestManager.prototype.next = function () {
        if (this.stopped || !this.queue.length) {
            this.active = false;
            return;
        }
        this.queue.shift()();
        this.last = new Date().getTime();

        REQUEST_COUNT += this.count;
        if (REQUEST_COUNT >= 10) {
            let diff = REQUEST_COUNT - 9;
            let timeout = diff * 1000;

            setTimeout(
                function (self) {
                    self.next();
                },
                this.rate + timeout,
                this
            );
        } else {
            setTimeout(
                function (self) {
                    self.next();
                },
                this.rate,
                this
            );
        }
    };

    RequestManager.prototype.push_get = function (url, cb) {
        this.push(function () {
            $.get(url, cb);
        });
    };

    RequestManager.prototype.unshift_get = function (url, cb) {
        this.unshift(function () {
            $.get(url, cb);
        });
    };

    RequestManager.prototype.push = function (req) {
        this.queue.push(req);
        this.maybe_start_queue();
    };

    RequestManager.prototype.unshift = function (req) {
        this.queue.unshift(req);
        this.maybe_start_queue();
    };

    RequestManager.prototype.maybe_start_queue = function () {
        if (!(this.active || this.stopped)) {
            this.start_queue();
        }
    };
    RequestManager.prototype.start_queue = function () {
        if (this.active) {
            return;
        }
        this.active = true;
        this.stopped = false;
        let now = new Date().getTime();
        if (now - this.last >= this.rate) {
            this.next();
        } else {
            let timeout = this.rate - now + this.last;
            setTimeout(
                function (self) {
                    self.next();
                },
                timeout,
                this
            );
        }
    };

    let ws_requests = new RequestManager(1000, 1);
    let edit_requests = new RequestManager(1500, 2);

    // Get recordings on the page

    let TITLE_SELECTOR = "a[href*='/recording/']";
    let $recordings = $(`tr:has(${TITLE_SELECTOR})`).data('filtered', false);

    if (!$recordings.length) {
        return;
    }

    let MBID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
    let WITHOUT_PAREN_CLAUSES_REGEX = /^(.+?)(?:(?: \([^()]+\))+)?$/;
    let ASCII_PUNCTUATION = [
        [/…/g, '...'],
        [/‘/g, "'"],
        [/’/g, "'"],
        [/‚/g, "'"],
        [/“/g, '"'],
        [/”/g, '"'],
        [/„/g, '"'],
        [/′/g, "'"],
        [/″/g, '"'],
        [/‹/g, '<'],
        [/›/g, '>'],
        [/‐/g, '-'],
        [/‒/g, '-'],
        [/–/g, '-'],
        [/−/g, '-'],
        [/—/g, '-'],
        [/―/g, '--'],
    ];

    function normalizeTitle(title) {
        title = title.toLowerCase().replace(/\s+/g, '');

        ASCII_PUNCTUATION.forEach(function (val) {
            title = title.replace(val[0], val[1]);
        });

        return title;
    }

    let RECORDING_TITLES = Object.fromEntries(
        Array.from($recordings).map(function (row) {
            let $title = $(row).find(TITLE_SELECTOR),
                mbid = $title.attr('href').match(MBID_REGEX)[0],
                norm_title = normalizeTitle($title.text().match(WITHOUT_PAREN_CLAUSES_REGEX)[1]);

            return [mbid, norm_title];
        })
    );

    let $work_options = Object.fromEntries(['type', 'language'].map(kind => [kind, $(`<select id="bpr-work-${kind}"></select>`)]));

    // Add button to manage performance ARs
    let $relate_table = table(
        tr(
            td(label('New work with this title:').attr('for', 'bpr-new-work')),
            td('<input type="text" id="bpr-new-work"/>', goBtn(relate_to_new_titled_work))
        ),
        tr(
            td(label('Existing work (URL/MBID):').attr('for', 'bpr-existing-work')),
            td(entity_lookup('existing-work', 'work'), goBtn(relate_to_existing_work))
        ),
        tr(td('New works using recording titles'), td(goBtn(relate_to_new_works))),
        tr(td('Their suggested works'), td(goBtn(relate_to_suggested_works))),
        tr(td(label('Work type:').attr('for', 'bpr-work-type')), td($work_options['type'])),
        tr(td(label('Lyrics language:').attr('for', 'bpr-work-language')), td($work_options['language']))
    ).hide();

    let $works_table = table(
        $('<tr id="bpr-works-row"></tr>')
            .append(
                td(label('Load another artist’s works (URL/MBID):').attr('for', 'bpr-load-artist')),
                td(entity_lookup('load-artist', 'artist'), goBtn(load_artist_works_btn))
            )
            .hide()
    );

    let $container = table(
        tr(
            td('<h3>Relate checked recordings to…</h3>'),
            td('<h3>Cached works</h3>', $('<span>(These are used to auto-suggest works.)</span>').css('font-size', '0.9em'))
        ),
        tr(td($relate_table), td($works_table))
    )
        .css({ margin: '0.5em', background: '#F2F2F2', border: '1px #999 solid' })
        .insertAfter($('div#content h2')[0]);

    let hide_performed_recs = setting('hide_performed_recs') === 'true' ? true : false;
    let hide_pending_edits = setting('hide_pending_edits') === 'true' ? true : false;

    function make_checkbox(func, default_val, lbl) {
        let chkbox = $('<input type="checkbox"/>').on('change', func).attr('checked', default_val);
        return label(chkbox, lbl);
    }

    let $display_table = table(
        tr(
            td(label('Filter recordings list: ', $('<input type="text"/>').on('input', filter_recordings))),
            td(
                make_checkbox(toggle_performed_recordings, hide_performed_recs, 'Hide recordings with performance ARs'),
                '&#160;',
                make_checkbox(toggle_pending_edits, hide_pending_edits, 'Hide recordings with pending edits')
            )
        )
    )
        .css('margin', '0.5em')
        .insertAfter($container);

    let $recordings_load_msg = $('<span>Loading performance relationships…</span>');

    $container.find('table').find('td').css('width', 'auto');
    $container.children('tbody').children('tr').children('td').css({ padding: '0.5em', 'vertical-align': 'top' });

    // Get actual work types/languages
    ws_requests.unshift_get('/dialog?path=%2Fwork%2Fcreate', function (data) {
        let nodes = $.parseHTML(data);
        Object.entries($work_options).forEach(function populate([kind, $obj]) {
            $obj.append($(`#id-edit-work\\.${kind}_id`, nodes).children())
                .val(setting(`work_${kind}`) || 0)
                .on('change', function () {
                    setting(`work_${kind}`, this.value);
                });
        });
    });

    $('<span></span>').append('<img src="/static/images/icons/loading.gif"/> ', $recordings_load_msg).insertBefore($relate_table);

    // Add additional column

    $('.tbl > thead > tr').append('<th>Performance Attributes</th>');

    let $date_element = $('<input />')
        .attr('type', 'text')
        .attr('placeholder', 'yyyy-mm-dd')
        .addClass('date')
        .addClass('bpr-date-input')
        .css({ color: '#ddd', width: '7em', border: '1px #999 solid' });

    $recordings.append(
        td(
            $(
                '<span class="bpr-attr partial">part.</span>/' +
                    '<span class="bpr-attr live">live</span>/' +
                    '<span class="bpr-attr instrumental">inst.</span>/' +
                    '<span class="bpr-attr cover">cover</span>'
            )
                .css('cursor', 'pointer')
                .data('checked', false),
            '&#160;',
            $date_element
        ).addClass('bpr_attrs')
    );

    $(document)
        .on('input', 'input.bpr-date-input', function () {
            let $input = $(this);

            $input.css('border-color', '#999');

            if (this.value) {
                $input.css('color', '#000');

                let parsedDate = parseDate(this.value);
                if (
                    !(
                        (parsedDate.year || parsedDate.month || parsedDate.day) &&
                        isDateValid(parsedDate.year, parsedDate.month, parsedDate.day)
                    )
                ) {
                    $input.css('border-color', '#f00');
                    parsedDate = null;
                }
                $input.parent().data('date', parsedDate);
            } else {
                $input.css('color', '#ddd');
            }
        })
        .on('click', 'span.bpr-attr', function () {
            let $this = $(this);
            let checked = !$this.data('checked');

            $this.data('checked', checked).css({
                background: checked ? 'blue' : 'inherit',
                color: checked ? 'white' : 'black',
            });
        });

    // Style buttons

    function style_buttons($buttons) {
        return $buttons.css({
            color: '#565656',
            'background-color': '#FFFFFF',
            border: '1px solid #D0D0D0',
            'border-top': '1px solid #EAEAEA',
            'border-left': '1px solid #EAEAEA',
        });
    }

    style_buttons($container.find('button'));

    // Don't check hidden rows when the "select all" checkbox is pressed

    function uncheckRows($rows) {
        $rows.find('input[name=add-to-merge]').attr('checked', false);
    }

    $('.tbl > thead input[type=checkbox]').on('change', function () {
        if (this.checked) {
            uncheckRows($recordings.filter(':hidden'));
        }
    });

    let ARTIST_MBID = window.location.href.match(MBID_REGEX)[0];
    let ARTIST_NAME = $('h1 a').text();
    let $artist_works_msg = $('<td></td>');

    // Load performance relationships

    let CURRENT_PAGE = 1;
    let TOTAL_PAGES = 1;
    let page_numbers = $('.pagination .sel')[0];
    let recordings_not_parsed = $recordings.length;

    if (page_numbers !== undefined) {
        CURRENT_PAGE = parseInt(page_numbers.href.match(/.+\?page=(\d+)/)[1] || '1', 10);
        let re_match = $('a[rel=xhv\\:last]:first')
            .next('em')
            .text()
            .match(/Page \d+ of (\d+)/);
        TOTAL_PAGES = Math.ceil((re_match ? parseInt(re_match[1], 10) : 1) / 2);
    }

    let NAME_FILTER = $.trim($('#id-filter\\.name').val());
    let ARTIST_FILTER = $.trim($('#id-filter\\.artist_credit_id').find('option:selected').text());

    if (NAME_FILTER || ARTIST_FILTER) {
        get_filtered_page(0);
    } else {
        queue_recordings_request(
            `/ws/2/recording?artist=${ARTIST_MBID}&inc=work-rels&limit=100&offset=${(CURRENT_PAGE - 1) * 100}&fmt=json`
        );
    }

    function request_recordings(url) {
        let attempts = 1;

        $.get(url, function (data) {
            let recs = data.recordings;
            let cache = {};

            function extract_rec(node) {
                let row = cache[node.id];

                if (row === undefined) {
                    for (let j = 0; j < $recordings.length; j++) {
                        let row_ = $recordings[j];
                        let row_id = $(row_).find(TITLE_SELECTOR).attr('href').match(MBID_REGEX)[0];

                        if (node.id === row_id) {
                            row = row_;
                            break;
                        } else {
                            cache[row_id] = row_;
                        }
                    }
                }

                if (row !== undefined) {
                    parse_recording(node, $(row));
                    recordings_not_parsed -= 1;
                }
            }

            if (recs) {
                recs.forEach(extract_rec);
            } else {
                extract_rec(data);
            }

            if (hide_performed_recs) {
                $recordings.filter('.performed').hide();
                restripeRows();
            }
        })
            .done(function () {
                $recordings_load_msg.parent().remove();
                $relate_table.show();
                load_works_init();
            })
            .fail(function () {
                $recordings_load_msg.text(`Error loading relationships. Retry #${attempts}...`).css('color', 'red');
                attempts += 1;
                ws_requests.unshift(request_recordings);
            });
    }

    function queue_recordings_request(url) {
        ws_requests.push(function () {
            request_recordings(url);
        });
    }

    function get_filtered_page(page) {
        let url = `/ws/2/recording?query=${NAME_FILTER ? `${encodeURIComponent(NAME_FILTER)}%20AND%20` : ''}${
            ARTIST_FILTER ? `creditname:${encodeURIComponent(ARTIST_FILTER)}%20AND%20` : ''
        } arid:${ARTIST_MBID}&limit=100&offset=${page * 100}&fmt=json`;

        ws_requests.push_get(url, function (data) {
            data.recordings.forEach(function (r) {
                queue_recordings_request(`/ws/2/recording/${r.id}?inc=work-rels&fmt=json`);
            });

            if (recordings_not_parsed > 0 && page < TOTAL_PAGES - 1) {
                get_filtered_page(page + 1);
            }
        });
    }

    function parse_recording(node, $row) {
        let $attrs = $row.children('td.bpr_attrs');
        let performed = false;

        $row.data('performances', []);
        $attrs.data('checked', false).css('color', 'black');

        node.relations.forEach(function (rel) {
            if (rel.type.match(/performance/)) {
                if (!performed) {
                    $row.addClass('performed');
                    performed = true;
                }

                if (rel.begin) {
                    $attrs.find('input.date').val(rel.begin).trigger('input');
                }

                let attrs = [];
                rel.attributes.forEach(function (name) {
                    let cannonical_name = name.toLowerCase();
                    let $button = $attrs.find(`span.${cannonical_name}`);

                    attrs.push(cannonical_name);
                    if (!$button.data('checked')) {
                        $button.click();
                    }
                });

                add_work_link($row, rel.work.id, rel.work.title, rel.work.disambiguation, attrs);
                $row.data('performances').push(rel.work.id);
            }
        });

        //Use the dates in "live YYYY-MM-DD" disambiguation comments

        let comment = node.disambiguation;
        let date = comment && comment.match && comment.match(/live(?: .+)?, ([0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?)(?:: .+)?$/);
        if (date) {
            $attrs.find('input.date').val(date[1]).trigger('input');
        }

        if (!performed) {
            if (node.title.match(/.+\(live.*\)/) || (comment && comment.match && comment.match(/^live.*/))) {
                $attrs.find('span.live').click();
            } else {
                let url = `/ws/2/recording/${node.id}?inc=releases+release-groups&fmt=json`;

                const request_rec = function () {
                    $.get(url, function (data) {
                        let releases = data.releases;

                        for (let i = 0; i < releases.length; i++) {
                            if (releases[i]['release-group']['secondary-types'].includes('Live')) {
                                $attrs.find('span.live').click();
                                break;
                            }
                        }
                    }).fail(function () {
                        ws_requests.push(request_rec);
                    });
                };
                ws_requests.push(request_rec);
            }
        }
    }

    // Load works

    let WORKS_LOAD_CACHE = [];
    let LOADED_WORKS = {};
    let LOADED_ARTISTS = {};

    function load_works_init() {
        let artists_string = localStorage.getItem(`bpr_artists ${ARTIST_MBID}`);
        let artists = [];

        if (artists_string) {
            artists = artists_string.split('\n');
        }

        function callback() {
            if (artists.length > 0) {
                let parts = artists.pop();
                let mbid = parts.slice(0, 36);
                let name = parts.slice(36);

                if (mbid && name) {
                    load_artist_works(mbid, name).done(callback);
                }
            }
        }

        load_artist_works(ARTIST_MBID, ARTIST_NAME).done(callback);
    }

    function load_artist_works(mbid, name) {
        let deferred = $.Deferred();

        if (LOADED_ARTISTS[mbid]) {
            return deferred.promise();
        }

        LOADED_ARTISTS[mbid] = true;

        let $table_row = $('<tr></tr>');
        let $button_cell = $('<td></td>').css('display', 'none');
        let $msg = $artist_works_msg;

        if (mbid !== ARTIST_MBID) {
            $msg = $('<td></td>');

            $button_cell.append(
                style_buttons($('<button>Remove</button>')).click(function () {
                    $table_row.remove();
                    remove_artist_works(mbid);
                })
            );
        }

        let $reload = style_buttons($('<button>Reload</button>'))
            .click(function () {
                $button_cell.css('display', 'none');
                $msg.text(`Loading works for ${name}...`);
                load();
            })
            .prependTo($button_cell);

        $msg.text(`Loading works for ${name}...`).css('color', 'green'), $table_row.append($msg, $button_cell);
        $('tr#bpr-works-row').css('display', 'none').before($table_row);

        let works_date = localStorage.getItem(`bpr_works_date ${mbid}`);
        let result = [];

        function finished(result) {
            let parsed = load_works_finish(result);
            update_artist_works_msg($msg, result.length, name, works_date);
            $button_cell.css('display', 'table-cell');
            $('tr#bpr-works-row').css('display', 'table-row');

            deferred.resolve();
            match_works(parsed[0], parsed[1], parsed[2], parsed[3]);
        }

        if (works_date) {
            let works_string = localStorage.getItem(`bpr_works ${mbid}`);
            if (works_string) {
                finished(works_string.split('\n'));
                return deferred.promise();
            }
        }

        load();
        function load() {
            works_date = new Date().toString();
            localStorage.setItem(`bpr_works_date ${mbid}`, works_date);
            result = [];

            let callback = function (loaded, remaining) {
                result.push.apply(result, loaded);
                if (remaining > 0) {
                    $msg.text(`Loading ${remaining.toString()} works for ${name}...`);
                } else {
                    localStorage.setItem(`bpr_works ${mbid}`, result.join('\n'));
                    finished(result);
                }
            };

            let works_url = `/ws/2/work?artist=${mbid}&inc=aliases&limit=100&fmt=json`;
            ws_requests.unshift(function () {
                request_works(works_url, 0, -1, callback);
            });
        }

        return deferred.promise();
    }

    function load_works_finish(result) {
        let tmp_mbids = [];
        let tmp_titles = [];
        let tmp_comments = [];
        let tmp_norm_titles = [];

        result.forEach(function (parts) {
            let mbid = parts.slice(0, 36);
            let rest = parts.slice(36).split('\u00a0');

            LOADED_WORKS[mbid] = true;
            tmp_mbids.push(mbid);
            tmp_titles.push(rest[0]);
            tmp_comments.push(rest[1] || '');
            tmp_norm_titles.push(normalizeTitle(rest[0]));
        });
        return [tmp_mbids, tmp_titles, tmp_comments, tmp_norm_titles];
    }

    function request_works(url, offset, count, callback) {
        $.get(`${url}&offset=${offset}`, function (data, textStatus, jqXHR) {
            if (count < 0) {
                count = data['work-count'];
            }

            let works = data.works;
            let loaded = [];

            works.forEach(function (work) {
                let comment = work.disambiguation;
                loaded.push(work.id + work.title + (comment ? `\u00a0${comment}` : ''));
            });

            callback(loaded, count - offset - works.length);

            if (works.length + offset < count) {
                ws_requests.unshift(function () {
                    request_works(url, offset + 100, count, callback);
                });
            }
        }).fail(function () {
            ws_requests.unshift(function () {
                request_works(url, offset, count, callback);
            });
        });
    }

    function match_works(mbids, titles, comments, norm_titles) {
        if (!mbids.length) {
            return;
        }

        let $not_performed = $recordings.filter(':not(.performed)');
        if (!$not_performed.length) {
            return;
        }

        function sim(r, w) {
            r = r || '';
            w = w || '';
            return r == w ? 0 : leven(r, w) / ((r.length + w.length) / 2);
        }

        let matches = {};

        let to_recording = function ($rec, rec_title) {
            if (rec_title in matches) {
                let match = matches[rec_title];
                suggested_work_link($rec, match[0], match[1], match[2]);
                return;
            }

            let $progress = $('<span></span>');
            rowTitleCell($rec).append(
                $('<div class="suggested-work"></div>')
                    .append($('<span>Looking for matching work…</span>'), '&#160;', $progress)
                    .css({ 'font-size': '0.9em', padding: '0.3em', 'padding-left': '1em', color: 'orange' })
            );

            let current = 0;
            let context = { minScore: 0.250001, match: null };
            let total = mbids.length;

            let done = function () {
                let match = context.match;
                if (match !== null) {
                    matches[rec_title] = match;
                    suggested_work_link($rec, match[0], match[1], match[2]);
                } else {
                    $progress.parent().remove();
                }
            };

            const iid = setInterval(function () {
                let j = current++;
                let norm_work_title = norm_titles[j];
                let score = sim(rec_title, norm_work_title);

                if (current % 12 === 0) {
                    $progress.text(`${current.toString()}/${total.toString()}`);
                }

                if (score < context.minScore) {
                    context.match = [mbids[j], titles[j], comments[j]];
                    if (score === 0) {
                        clearInterval(iid);
                        done();
                        return;
                    }
                    context.minScore = score;
                }
                if (j === total - 1) {
                    clearInterval(iid);
                    done();
                }
            }, 0);
        };

        for (let i = 0; i < $not_performed.length; i++) {
            let $rec = $not_performed.eq(i);
            let mbid = $rec.find(TITLE_SELECTOR).attr('href').match(MBID_REGEX)[0];

            to_recording($rec, RECORDING_TITLES[mbid]);
        }
    }

    function suggested_work_link($rec, mbid, title, comment) {
        let $title_cell = rowTitleCell($rec);
        $title_cell.children('div.suggested-work').remove();
        $title_cell.append(
            $('<div class="suggested-work"></div>')
                .append(
                    $('<span>Suggested work:</span>').css({ color: 'green', 'font-weight': 'bold' }),
                    '&#160;',
                    $('<a></a>').attr('href', `/work/${mbid}`).text(title),
                    comment ? '&#160;' : null,
                    comment ? $('<span></span>').text(`(${comment})`) : null
                )
                .css({ 'font-size': '0.9em', padding: '0.3em', 'padding-left': '1em' })
        );
        $rec.data('suggested_work_mbid', mbid);
        $rec.data('suggested_work_title', title);
    }

    function remove_artist_works(mbid) {
        if (!LOADED_ARTISTS[mbid]) {
            return;
        }
        delete LOADED_ARTISTS[mbid];

        let item_key = `bpr_artists ${ARTIST_MBID}`;
        localStorage.setItem(
            item_key,
            localStorage
                .getItem(item_key)
                .split('\n')
                .filter(artist => artist.slice(0, 36) !== mbid)
                .join('\n')
        );
    }

    function cache_work(mbid, title, comment) {
        LOADED_WORKS[mbid] = true;
        WORKS_LOAD_CACHE.push(mbid + title + (comment ? `\u00a0${comment}` : ''));

        let norm_title = normalizeTitle(title);
        let works_date = localStorage.getItem(`bpr_works_date ${ARTIST_MBID}`);
        let count = $artist_works_msg.data('works_count') + 1;

        update_artist_works_msg($artist_works_msg, count, ARTIST_NAME, works_date);
        match_works([mbid], [title], [comment], [norm_title]);
    }

    function flush_work_cache() {
        if (!WORKS_LOAD_CACHE.length) {
            return;
        }
        let works_string = localStorage.getItem(`bpr_works ${ARTIST_MBID}`);
        if (works_string) {
            works_string += `\n${WORKS_LOAD_CACHE.join('\n')}`;
        } else {
            works_string = WORKS_LOAD_CACHE.join('\n');
        }
        localStorage.setItem(`bpr_works ${ARTIST_MBID}`, works_string);
        WORKS_LOAD_CACHE = [];
    }

    function load_artist_works_btn() {
        let $input = $('#bpr-load-artist');

        if (!$input.data('selected')) {
            return;
        }

        let mbid = $input.data('mbid');
        let name = $input.data('name');

        load_artist_works(mbid, name).done(function () {
            let artists_string = localStorage.getItem(`bpr_artists ${ARTIST_MBID}`);
            if (artists_string) {
                artists_string += `\n${mbid}${name}`;
            } else {
                artists_string = mbid + name;
            }
            localStorage.setItem(`bpr_artists ${ARTIST_MBID}`, artists_string);
        });
    }

    function update_artist_works_msg($msg, count, name, works_date) {
        $msg.html('')
            .append(`${count} works loaded for ${name}<br/>`, $(`<span>(cached ${works_date})</span>`).css({ 'font-size': '0.8em' }))
            .data('works_count', count);
    }

    // Edit creation

    function relate_all_to_work(mbid, title, comment) {
        let deferred = $.Deferred();
        let $rows = checked_recordings();
        let total = $rows.length;

        if (!total) {
            deferred.resolve();
            return deferred.promise();
        }

        for (let i = 0; i < total; i++) {
            let $row = $rows.eq(i);

            $row.children('td').not(':has(input)').first().css('color', 'LightSlateGray').find('a').css('color', 'LightSlateGray');

            let promise = relate_to_work($row, mbid, title, comment, false, false);
            if (i === total - 1) {
                promise.done(function () {
                    deferred.resolve();
                });
            }
        }

        if (!LOADED_WORKS[mbid]) {
            cache_work(mbid, title, comment);
            flush_work_cache();
        }

        return deferred.promise();
    }

    function relate_to_new_titled_work() {
        let $rows = checked_recordings();
        let total = $rows.length;
        let title = $('#bpr-new-work').val();

        if (!total || !title) {
            return;
        }

        ws_requests.stopped = true;

        let $button = $(this).attr('disabled', true).css('color', '#EAEAEA');

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr('disabled', false).css('color', '#565656');
        }

        create_new_work(title, function (data) {
            let work = data.match(/\/work\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
            relate_all_to_work(work[1], title, '').done(callback);
        });
    }

    function relate_to_existing_work() {
        let $input = $('input#bpr-existing-work');
        let $button = $(this);

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr('disabled', false).css('color', '#565656');
        }

        if ($input.data('selected')) {
            ws_requests.stopped = true;

            $button.attr('disabled', true).css('color', '#EAEAEA');

            relate_all_to_work($input.data('mbid'), $input.data('name'), $input.data('comment') || '').done(callback);
        } else {
            $input.css('background', '#ffaaaa');
        }
    }

    function relate_to_new_works() {
        let $rows = checked_recordings();
        let total_rows = $rows.length;

        if (!total_rows) {
            return;
        }

        ws_requests.stopped = true;

        let $button = $(this).attr('disabled', true).css('color', '#EAEAEA');

        $.each($rows, function (i, row) {
            let $row = $(row);
            let $title_cell = rowTitleCell($row);
            let title = $title_cell.find(TITLE_SELECTOR).text();

            $title_cell.css('color', 'LightSlateGray').find('a').css('color', 'LightSlateGray');

            create_new_work(title, function (data) {
                let work = data.match(/\/work\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                let promise = relate_to_work($row, work[1], title, '', true, true);

                if (--total_rows === 0) {
                    promise.done(function () {
                        flush_work_cache();
                        ws_requests.stopped = false;
                        ws_requests.start_queue();
                        $button.attr('disabled', false).css('color', '#565656');
                    });
                }
            });
        });
    }

    function create_new_work(title, callback) {
        function post_edit() {
            let data = `edit-work.name=${title}`;
            Object.entries($work_options).forEach(function ([kind, $obj]) {
                if ($obj.val()) {
                    data += `&edit-work.${kind}_id=${$obj.val()}`;
                }
            });

            $.post('/work/create', data, callback).fail(function () {
                edit_requests.unshift(post_edit);
            });
        }
        edit_requests.push(post_edit);
    }

    function relate_to_suggested_works() {
        let $rows = checked_recordings().filter(function () {
            return $(this).data('suggested_work_mbid');
        });

        let total = $rows.length;
        if (!total) {
            return;
        }

        let $button = $(this).attr('disabled', true).css('color', '#EAEAEA');
        ws_requests.stopped = true;

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr('disabled', false).css('color', '#565656');
        }

        $.each($rows, function (i, row) {
            let $row = $(row);
            let mbid = $row.data('suggested_work_mbid');
            let title = $row.data('suggested_work_title');
            let $title_cell = rowTitleCell($row);

            $title_cell.css('color', 'LightSlateGray').find('a').css('color', 'LightSlateGray');

            let promise = relate_to_work($row, mbid, title, '', false, false);
            if (i === total - 1) {
                promise.done(callback);
            }
        });
    }

    function add_work_link($row, mbid, title, comment, attrs) {
        let $title_cell = rowTitleCell($row);
        $title_cell.children('div.suggested-work').remove();
        $row.removeData('suggested_work_mbid').removeData('suggested_work_title');
        $title_cell.removeAttr('style').append(
            $('<div class="work"></div>')
                .text(`${attrs.join(' ')} recording of `)
                .css({ 'font-size': '0.9em', padding: '0.3em', 'padding-left': '1em' })
                .append(
                    $('<a></a>').attr('href', `/work/${mbid}`).text(title),
                    comment ? '&#160;' : null,
                    comment ? $('<span></span>').text(`(${comment})`) : null
                )
        );
    }

    function relate_to_work($row, work_mbid, work_title, work_comment, check_loaded, priority) {
        let deferred = $.Deferred();
        let performances = $row.data('performances');

        if (performances) {
            if (performances.indexOf(work_mbid) === -1) {
                performances.push(work_mbid);
            } else {
                deferred.resolve();
                return deferred.promise();
            }
        } else {
            $row.data('performances', [work_mbid]);
        }

        let rec_mbid = $row.find(TITLE_SELECTOR).attr('href').match(MBID_REGEX)[0];
        let $title_cell = rowTitleCell($row);
        let title_link = $title_cell.children('a')[0];
        let $attrs = $row.children('td.bpr_attrs');
        let selectedAttrs = [];

        function selected(attr) {
            let checked = $attrs.children(`span.${attr}`).data('checked') ? 1 : 0;
            if (checked) {
                selectedAttrs.push(attr);
            }
            return checked;
        }

        let data = {
            'rel-editor.rels.0.action': 'add',
            'rel-editor.rels.0.link_type': '278',
            'rel-editor.rels.0.entity.1.type': 'work',
            'rel-editor.rels.0.entity.1.gid': work_mbid,
            'rel-editor.rels.0.entity.0.type': 'recording',
            'rel-editor.rels.0.entity.0.gid': rec_mbid,
        };

        let attrs = [];
        if (selected('live')) attrs.push('70007db6-a8bc-46d7-a770-80e6a0bb551a');
        if (selected('partial')) attrs.push('d2b63be6-91ec-426a-987a-30b47f8aae2d');
        if (selected('instrumental')) attrs.push('c031ed4f-c9bb-4394-8cf5-e8ce4db512ae');
        if (selected('cover')) attrs.push('1e8536bd-6eda-3822-8e78-1c0f4d3d2113');

        attrs.forEach(function (attr, index) {
            data[`rel-editor.rels.0.attributes.${index}.type.gid`] = attr;
        });

        let date = $attrs.data('date');
        if (date != null) {
            data['rel-editor.rels.0.period.begin_date.year'] = date['year'];
            data['rel-editor.rels.0.period.begin_date.month'] = date['month'] || '';
            data['rel-editor.rels.0.period.begin_date.day'] = date['day'] || '';
            data['rel-editor.rels.0.period.end_date.year'] = date['year'];
            data['rel-editor.rels.0.period.end_date.month'] = date['month'] || '';
            data['rel-editor.rels.0.period.end_date.day'] = date['day'] || '';
        }

        function post_edit() {
            $(title_link).css('color', 'green');

            $.post('/relationship-editor', data, function () {
                add_work_link($row, work_mbid, work_title, work_comment, selectedAttrs);

                $(title_link).removeAttr('style');
                $row.addClass('performed');

                if (hide_performed_recs) {
                    uncheckRows($row.hide());
                    restripeRows();
                }

                deferred.resolve();
            }).fail(function () {
                edit_requests.unshift(post_edit);
            });
        }
        if (priority) {
            edit_requests.unshift(post_edit);
        } else {
            edit_requests.push(post_edit);
        }

        if (check_loaded) {
            if (!LOADED_WORKS[work_mbid]) {
                cache_work(work_mbid, work_title, work_comment);
            }
        }

        return deferred.promise();
    }

    function filter_recordings() {
        let string = this.value.toLowerCase();

        for (let i = 0; i < $recordings.length; i++) {
            let $rec = $recordings.eq(i);
            let title = $rec.find(TITLE_SELECTOR).text().toLowerCase();

            if (title.indexOf(string) !== -1) {
                $rec.data('filtered', false);
                if (!hide_performed_recs || !$rec.hasClass('performed')) {
                    $rec.show();
                }
            } else {
                $rec.hide().data('filtered', true);
            }
        }
        restripeRows();
    }

    function toggle_performed_recordings() {
        let $performed = $recordings.filter('.performed');
        hide_performed_recs = this.checked;

        if (hide_performed_recs) {
            uncheckRows($performed.hide());
        } else {
            $performed
                .filter(function () {
                    return !$(this).data('filtered');
                })
                .show();
        }
        restripeRows();
        setting('hide_performed_recs', hide_performed_recs.toString());
    }

    function toggle_pending_edits(event, checked) {
        let $pending = $recordings.filter(function () {
            return $(this).find(TITLE_SELECTOR).parent().parent().is('span.mp');
        });
        hide_pending_edits = checked !== undefined ? checked : this.checked;

        if (hide_pending_edits) {
            uncheckRows($pending.hide());
        } else {
            $pending
                .filter(function () {
                    return !$(this).data('filtered');
                })
                .show();
        }
        restripeRows();
        setting('hide_pending_edits', hide_pending_edits.toString());
    }
    toggle_pending_edits(null, hide_pending_edits);

    function checked_recordings() {
        return $recordings.filter(':visible').filter(function () {
            return $(this).find('input[name=add-to-merge]:checked').length;
        });
    }

    function entity_lookup(id_suffix, entity) {
        let $input = $(`<input type="text" id="bpr-${id_suffix}"/>`);
        $input
            .on('input', function () {
                let match = this.value.match(MBID_REGEX);
                $(this).data('selected', false);
                if (match) {
                    let mbid = match[0];
                    ws_requests
                        .unshift_get(`/ws/2/${entity}/${mbid}?fmt=json`, function (data) {
                            let value = data.title || data.name;
                            let out_data = { selected: true, mbid: mbid, name: value };

                            if (entity === 'work' && data.disambiguation) {
                                out_data.comment = data.disambiguation;
                            }

                            $input.val(value).data(out_data).css('background', '#bbffbb');
                        })
                        .fail(function () {
                            $input.css('background', '#ffaaaa');
                        });
                } else {
                    $input.css('background', '#ffaaaa');
                }
            })
            .data('selected', false);

        return $input;
    }

    function restripeRows() {
        $recordings.filter(':visible').each(function (index, row) {
            let even = (index + 1) % 2 === 0;
            row.className = row.className.replace(even ? 'odd' : 'even', even ? 'even' : 'odd');
        });
    }

    function rowTitleCell($row) {
        return $row.children(`td:has(${TITLE_SELECTOR})`);
    }
}
