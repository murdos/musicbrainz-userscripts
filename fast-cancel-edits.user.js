// ==UserScript==
// @name        MusicBrainz: Fast cancel edits
// @version     2015.8.21
// @author      Michael Wiencek
// @downloadURL https://bitbucket.org/mwiencek/userscripts/raw/master/fast-cancel-edits.user.js
// @updateURL   https://bitbucket.org/mwiencek/userscripts/raw/master/fast-cancel-edits.user.js
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
//**************************************************************************//

var scr = document.createElement("script");
scr.textContent = "(" + fastCancelScript + ")();";
document.body.appendChild(scr);

function fastCancelScript() {
    var totalCancels = 0;

    var $status = $("<div></div>")
        .css({
            "position": "fixed",
            "right": "0",
            "bottom": "0",
            "background": "#FFBA58",
            "border-top": "1px #000 solid",
            "border-left": "1px #000 solid",
            "padding": "0.5em"
        })
        .appendTo("body")
        .hide();

    function updateStatus() {
        if (totalCancels === 0) {
            $status.hide();
        } else {
            $status.text("Canceling " + totalCancels + " edit" +
                (totalCancels > 1 ? "s" : "") + "...").show();
        }
    }

    $("a.negative").on("click", function (event) {
        event.preventDefault();
        totalCancels += 1;
        updateStatus();

        var $self = $(this),
            $edit = $self.parents("div.edit-list:eq(0)");

        pushRequest(function () {
            var editNote = $edit.find("div.add-edit-note textarea").val();
            var data = { "confirm.edit_note": editNote };

            $.ajax({
                type: "POST",
                url: $self.attr("href"),
                data: data,
                error: function (request, status, error) {
                    $self
                        .css({
                            "background": "red",
                            "color": "yellow",
                            "cursor": "help"
                        })
                        .attr("title", "Error cancelling this edit: “" + error + "”");
                    $edit
                        .css({border: "6px solid red"})
                        .show();
                },
                complete: function () {
                    totalCancels -= 1;
                    updateStatus();
                }
            });
        });
        $edit.hide();
    });

    var pushRequest = (function () {
        var queue = [],
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

        return function (req) {
            queue.push(req);

            if (!active) {
                active = true;
                var now = new Date().getTime();
                if (now - last >= rate) {
                    next();
                } else {
                    var timeout = rate - now + last;
                    setTimeout(next, timeout);
                }
            }
        };
    }());
}
