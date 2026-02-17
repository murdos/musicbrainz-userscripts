import { luceneEscape } from '~/lib/shared/lucene-escape';

export function searchUrlFor(type: string, what: string): string {
    type = type.replace('-', '_');

    const params = [`query=${luceneEscape(what)}`, `type=${type}`, 'indexed=1'];
    return `https://musicbrainz.org/search?${params.join('&')}`;
}
