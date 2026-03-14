import type { Release } from '~/types/importers';
import { searchParams } from '~/lib/shared/search-params';

// compute HTML of search button
export function buildSearchButton(release: Release): string {
    const parameters = searchParams(release);
    let html = `<form class="musicbrainz_import musicbrainz_import_search" action="https://musicbrainz.org/search" method="get" target="_blank" accept-charset="UTF-8" charset="${document.characterSet}">`;
    parameters.forEach(function (parameter) {
        const value = `${parameter.value}`;
        html += `<input type='hidden' value='${value.replace(/'/g, '&apos;')}' name='${parameter.name}'/>`;
    });
    html += '<button type="submit" title="Search for this release in MusicBrainz (open a new tab)">Search in MB</button>';
    html += '</form>';
    return html;
}
