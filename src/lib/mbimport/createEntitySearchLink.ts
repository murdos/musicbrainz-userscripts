import { exactSearchUrlFor, searchUrlFor } from './searchUrlFor';

const MB_SEARCH_MARKS: Record<string, string> = {
    artist: 'A',
    release: 'R',
    'release-group': 'G',
    place: 'P',
    label: 'L',
    series: 'S',
};

interface EntitySearchLinkOptions {
    searchMode?: 'indexed' | 'exact';
}

/**
 * Create the compact entity search indicator used next to external entity links.
 * Placement and replacement with resolved MusicBrainz links are left to the caller.
 */
export function createEntitySearchLink(
    mbType: string,
    entityName: string,
    { searchMode = 'indexed' }: EntitySearchLinkOptions = {},
): HTMLSpanElement {
    const normalizedType = mbType.replaceAll('_', '-');
    const mark = MB_SEARCH_MARKS[normalizedType] || '';
    const displayType = normalizedType in MB_SEARCH_MARKS ? normalizedType.replaceAll('-', ' ') : 'entity';
    const href = searchMode === 'exact' ? exactSearchUrlFor(mbType, entityName) : searchUrlFor(mbType, entityName);

    const indicator = document.createElement('span');
    indicator.className = 'mb_valign mb_searchit';

    const searchLink = document.createElement('a');
    searchLink.className = 'mb_search_link';
    searchLink.target = '_blank';
    searchLink.title = `Search this ${displayType} on MusicBrainz (open in a new tab)`;
    searchLink.href = href;
    searchLink.innerHTML = `<small>${mark}</small>?`;
    indicator.append(searchLink);

    return indicator;
}
