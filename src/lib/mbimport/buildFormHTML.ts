import type { FormParameter } from '~/lib/shared/search-params';

// compute HTML of import form
export function buildFormHTML(parameters: FormParameter[]): string {
    // Build form
    let innerHTML = `<form class="musicbrainz_import musicbrainz_import_add" action="https://musicbrainz.org/release/add" method="post" target="_blank" accept-charset="UTF-8" charset="${document.characterSet}">`;
    parameters.forEach(function (parameter) {
        const value = `${parameter.value}`;
        innerHTML += `<input type='hidden' value='${value.replace(/'/g, '&apos;')}' name='${parameter.name}'/>`;
    });

    innerHTML +=
        '<button type="submit" title="Import this release into MusicBrainz (open a new tab)"><img src="https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg" width="16" height="16" />Import into MB</button>';
    innerHTML += '</form>';

    return innerHTML;
}
