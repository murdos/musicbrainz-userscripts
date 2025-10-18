import type { Release } from '~/types/importers';
import { luceneEscape } from '~/lib/shared/lucene-escape';

export interface FormParameter {
    name: string;
    value: string | number;
}

export function appendParameter(parameters: FormParameter[], paramName: string, paramValue: string | number): void {
    if (!paramValue) return;
    parameters.push({ name: paramName, value: paramValue });
}

export function searchParams(release: Release): FormParameter[] {
    const params: FormParameter[] = [];

    const totaltracks = release.discs.reduce((acc, { tracks }) => acc + tracks.length, 0);
    let release_artist = '';
    for (let i = 0; i < release.artist_credit.length; i++) {
        const ac = release.artist_credit[i];
        if (ac) {
            release_artist += ac.artist_name;
            if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != '') {
                release_artist += ac.joinphrase;
            } else {
                if (i != release.artist_credit.length - 1) release_artist += ', ';
            }
        }
    }

    let query =
        `artist:(${luceneEscape(release_artist)})` +
        ` release:(${luceneEscape(release.title)})` +
        ` tracks:(${totaltracks})${release.country ? ` country:${release.country}` : ''}`;

    appendParameter(params, 'query', query);
    appendParameter(params, 'type', 'release');
    appendParameter(params, 'advanced', '1');
    return params;
}
