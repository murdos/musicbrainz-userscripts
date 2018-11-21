// ==UserScript==
// @name        MusicBrainz: Fast cancel edits
// @description Mass cancel open edits with optional edit notes.
// @version     2018.2.18.1
// @author      Michael Wiencek
// @license     X11
// @downloadURL https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/fast-cancel-edits.user.js
// @updateURL   https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/fast-cancel-edits.user.js
// @include     *://musicbrainz.org/user/*/edits/open*
// @include     *://musicbrainz.org/*/*/open_edits*
// @include     *://musicbrainz.org/*/*/edits*
// @include     *://musicbrainz.org/search/edits*
// @include     *://*.musicbrainz.org/user/*/edits/open*
// @include     *://*.musicbrainz.org/*/*/open_edits*
// @include     *://*.musicbrainz.org/*/*/edits*
// @include     *://*.musicbrainz.org/search/edits*
// @include     *://*.mbsandbox.org/user/*/edits/open*
// @include     *://*.mbsandbox.org/*/*/open_edits*
// @include     *://*.mbsandbox.org/*/*/edits*
// @include     *://*.mbsandbox.org/search/edits*
// @match       *://musicbrainz.org/user/*/edits/open*
// @match       *://musicbrainz.org/*/*/open_edits*
// @match       *://musicbrainz.org/*/*/edits*
// @match       *://musicbrainz.org/search/edits*
// @match       *://*.musicbrainz.org/user/*/edits/open*
// @match       *://*.musicbrainz.org/*/*/open_edits*
// @match       *://*.musicbrainz.org/*/*/edits*
// @match       *://*.musicbrainz.org/search/edits*
// @match       *://*.mbsandbox.org/user/*/edits/open*
// @match       *://*.mbsandbox.org/*/*/open_edits*
// @match       *://*.mbsandbox.org/*/*/edits*
// @match       *://*.mbsandbox.org/search/edits*
// @grant       none
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

//**************************************************************************//

var scr = document.createElement('script');
scr.textContent = `(${fastCancelScript})();`;
document.body.appendChild(scr);

function fastCancelScript() {
    let totalCancels = 0;

    let $status = $('<div></div>')
        .css({
            position: 'fixed',
            right: '0',
            bottom: '0',
            background: '#FFBA58',
            'border-top': '1px #000 solid',
            'border-left': '1px #000 solid',
            padding: '0.5em'
        })
        .appendTo('body')
        .hide();

    function updateStatus() {
        if (totalCancels === 0) {
            $status.hide();
        } else {
            $status.text(`Canceling ${totalCancels} edit${totalCancels > 1 ? 's' : ''}...`).show();
        }
    }

    document.body.addEventListener('click', function(event) {
        if (event.target && event.target.tagName && event.target.tagName == 'A' && event.target.classList.contains('negative')) {
            event.stopPropagation();
            event.preventDefault();
            totalCancels += 1;
            updateStatus();

            let $self = $(event.target),
                $edit = $self.parents('div.edit-list:eq(0)');

            pushRequest(function() {
                let editNote = $edit.find('div.add-edit-note textarea').val();
                let data = { 'confirm.edit_note': editNote };

                $.ajax({
                    type: 'POST',
                    url: $self.attr('href'),
                    data: data,
                    error: function(request, status, error) {
                        $self
                            .css({
                                background: 'red',
                                color: 'yellow',
                                cursor: 'help'
                            })
                            .attr('title', `Error cancelling this edit: “${error}”`);
                        $edit.css({ border: '6px solid red' }).show();
                    },
                    complete: function() {
                        $edit.remove();
                        totalCancels -= 1;
                        updateStatus();
                    }
                });
            });
            $edit.hide();
        }
    });

    $("div#edits > form[action$='/edit/enter_votes']").on('submit', function(event) {
        if (totalCancels > 0) {
            event.preventDefault();
            alert(`Please wait, ${totalCancels > 1 ? `${totalCancels} edits are` : 'an edit is'} being cancelled in the background.`);
        }
    });

    var pushRequest = (function() {
        let queue = [],
            last = 0,
            active = false,
            rate = 2000;

        function next() {
            if (queue.length === 0) {
                active = false;
            } else {
                queue.shift()();
                last = new Date().getTime();
                setTimeout(next, rate);
            }
        }

        return function(req) {
            queue.push(req);

            if (!active) {
                active = true;
                let now = new Date().getTime();
                if (now - last >= rate) {
                    next();
                } else {
                    let timeout = rate - now + last;
                    setTimeout(next, timeout);
                }
            }
        };
    })();
}
