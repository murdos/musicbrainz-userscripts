import type { Release } from '~/types/importers';
import { searchParams } from '~/lib/shared/search-params';

export function buildSearchLink(release: Release): string {
    const parameters = searchParams(release);
    const url_params: string[] = [];
    parameters.forEach(function (parameter) {
        const value = `${parameter.value}`;
        url_params.push(encodeURI(`${parameter.name}=${value}`));
    });
    return `<a class="musicbrainz_import" href="https://musicbrainz.org/search?${url_params.join('&')}">Search in MusicBrainz</a>`;
}
