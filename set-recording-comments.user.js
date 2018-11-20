// ==UserScript==
// @name           MusicBrainz: Set recording comments for a release
// @description    Batch set recording comments from a Release page.
// @version        2018.2.18.1
// @author         Michael Wiencek
// @license        X11
// @namespace      790382e7-8714-47a7-bfbd-528d0caa2333
// @downloadURL    https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/set-recording-comments.user.js
// @updateURL      https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/set-recording-comments.user.js
// @match          *://*.musicbrainz.org/release/*
// @match          *://*.mbsandbox.org/release/*
// @exclude        *musicbrainz.org/release/*/*
// @exclude        *.mbsandbox.org/release/*/*
// @grant          none
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

var scr = document.createElement('script');
scr.textContent = `$(${setRecordingComments});`;
document.body.appendChild(scr);

function setRecordingComments() {
    let $tracks;
    let $inputs = $();
    let EDIT_RECORDING_EDIT = 72;

    $('head').append(
        $('<style></style>').text(
            'input.recording-comment { background: inherit; border: 1px #999 solid; width: 32em; margin-left: 0.5em; }'
        )
    );

    var delay = setInterval(function() {
        $tracks = $('.medium tbody tr[id]');

        if ($tracks.length) {
            clearInterval(delay);
        } else {
            return;
        }

        $tracks.each(function() {
            let $td = $(this)
                    .children('td:not(.pos):not(.video):not(.rating):not(.treleases)')
                    .has('a[href^=\\/recording\\/]'),
                node = $td.children('td > .mp, td > .name-variation, td > a[href^=\\/recording\\/]').filter(':first'),
                $input = $('<input />')
                    .addClass('recording-comment')
                    .insertAfter(node);

            if (!editing) {
                $input.hide();
            }

            $inputs = $inputs.add($input);
        });

        let release = location.pathname.match(MBID_REGEX)[0];

        $.get(`/ws/2/release/${release}?inc=recordings&fmt=json`, function(data) {
            let comments = _.map(_.map(_.flatten(_.map(data.media, 'tracks')), 'recording'), 'disambiguation');

            for (let i = 0, len = comments.length; i < len; i++) {
                let comment = comments[i];
                $inputs
                    .eq(i)
                    .val(comment)
                    .data('old', comment);
            }
        });
    }, 1000);

    if (!location.pathname.match(/^\/release\/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/)) {
        return;
    }

    var MBID_REGEX = /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/,
        editing = false,
        activeRequest = null;

    $('body').on('input.rc', '.recording-comment', function() {
        $(this).css('border-color', this.value === $(this).data('old') ? '#999' : 'red');
    });

    let $container = $('<div></div>').insertAfter('h2.tracklist');

    $('<button>Edit recording comments</button>')
        .addClass('styled-button')
        .on('click', function() {
            editing = !editing;
            $('#set-recording-comments')
                .add($inputs)
                .toggle(editing);
            $(this).text(`${editing ? 'Hide' : 'Edit'} recording comments`);
            if (editing) {
                $('#all-recording-comments').focus();
            }
        })
        .appendTo($container);

    $container.append(
        '\
<table id="set-recording-comments">\
  <tr>\
    <td><label for="all-recording-comments">Set all visible comments to:</label></td>\
    <td><input type="text" id="all-recording-comments" style="width: 32em;"></td>\
  </tr>\
  <tr>\
    <td><label for="recording-comments-edit-note">Edit note:</label></td>\
    <td><textarea id="recording-comments-edit-note" style="width: 32em;" rows="5"></textarea></td>\
  </tr>\
  <tr>\
    <td colspan="2">\
      <button id="submit-recording-comments" class="styled-button">Submit changes (visible and marked red)</button>\
    </td>\
  </tr>\
</table>'
    );

    $('#set-recording-comments').hide();

    $('#all-recording-comments').on('input', function() {
        $inputs
            .filter(':visible')
            .val(this.value)
            .trigger('input.rc');
    });

    var $submitButton = $('#submit-recording-comments').on('click', function() {
        if (activeRequest) {
            activeRequest.abort();
            activeRequest = null;
            $submitButton.text('Submit changes (marked red)');
            $inputs.prop('disabled', false).trigger('input.rc');
            return;
        }

        $submitButton.text('Submitting...click to cancel!');
        $inputs.prop('disabled', true);

        let editData = [],
            deferred = $.Deferred();

        $.each($tracks, function(i, track) {
            if ($(track).filter(':visible').length > 0) {
                let $input = $inputs.eq(i),
                    comment = $input.val();
                if (comment === $input.data('old')) {
                    $input.prop('disabled', false);
                    return;
                }

                deferred
                    .done(function() {
                        $input
                            .data('old', comment)
                            .trigger('input.rc')
                            .prop('disabled', false);
                    })
                    .fail(function() {
                        $input.css('border-color', 'red').prop('disabled', false);
                    });

                let link = track.querySelector("td a[href^='/recording/']"),
                    mbid = link.href.match(MBID_REGEX)[0];

                editData.push({ edit_type: EDIT_RECORDING_EDIT, to_edit: mbid, comment: comment });
            }
        });

        if (editData.length === 0) {
            $inputs.prop('disabled', false);
            $submitButton.prop('disabled', false).text('Submit changes (marked red)');
        } else {
            let editNote = $('#recording-comments-edit-note').val();

            activeRequest = $.ajax({
                type: 'POST',
                url: '/ws/js/edit/create',
                dataType: 'json',
                data: JSON.stringify({ edits: editData, editNote: editNote }),
                contentType: 'application/json; charset=utf-8'
            })
                .always(function() {
                    $submitButton.prop('disabled', false).text('Submit changes (marked red)');
                })
                .done(function() {
                    deferred.resolve();
                })
                .fail(function() {
                    deferred.reject();
                });
        }
    });
}
