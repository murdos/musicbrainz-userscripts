// ==UserScript==
// @name		MusicBrainz: Add recording edit links to instrument pages
// @description Direct links to the recording edit page are added to instruments' recordings pages.
// @version		2019.6.20.1
// @author		Nicolás Tamargo
// @license     X11
// @downloadURL https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/edit-instrument-recordings-links.user.js
// @updateURL   https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/edit-instrument-recordings-links.user.js
// @include     *://musicbrainz.org/instrument/*/recordings*
// @include     *://*.musicbrainz.org/instrument/*/recordings*
// @grant       none
// ==/UserScript==

// ==License==
// Copyright (C) 2019 Nicolás Tamargo
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

// There should be only one of each
const table = document.getElementsByClassName('tbl')[0];
const header = table.getElementsByTagName('thead')[0].getElementsByTagName('tr')[0];
const recordings = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');

// We add a column to the header to make it less ugly
const headerColumn = document.createElement('th');
headerColumn.innerText = 'Edit';
header.appendChild(headerColumn);

// We add the links to the recordings
for (let i = 0; i < recordings.length; i++) {
    const recordingRow = recordings[i];
    const recordingUrl = recordingRow.childNodes[1].childNodes[0].getAttribute('href');
    const extraCell = document.createElement('td');
    extraCell.innerHTML = `<a href="${recordingUrl}/edit">edit</a>`;
    recordingRow.appendChild(extraCell);
}
