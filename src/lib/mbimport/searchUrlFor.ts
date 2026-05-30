import { luceneEscape } from '~/lib/shared/lucene-escape';

export function searchUrlFor(type: string, what: string): string {
    type = type.replace('-', '_');

    const params = [`query=${luceneEscape(what)}`, `type=${type}`, 'indexed=1'];
    return `https://musicbrainz.org/search?${params.join('&')}`;
}

export function exactSearchUrlFor(type: string, what: string, limit = 25): string {
    type = type.replace('-', '_');

    const query = `"${luceneEscape(what)}"`;
    const params = [`query=${encodeURIComponent(query)}`, `type=${type}`, `limit=${limit}`, 'method=advanced'];
    return `https://musicbrainz.org/search?${params.join('&')}`;
}
