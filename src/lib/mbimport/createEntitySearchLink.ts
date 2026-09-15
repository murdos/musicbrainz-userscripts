import { exactSearchUrlFor, searchUrlFor } from './searchUrlFor';

const MB_SEARCH_MARKS: Record<string, string> = {
    artist: 'A',
    recording: 'T',
    release: 'R',
    'release-group': 'G',
    place: 'P',
    label: 'L',
    series: 'S',
};

interface EntitySearchLinkOptions {
    searchMode?: 'indexed' | 'exact';
}

type EntityLookupState = 'error' | 'loading' | 'matched' | 'search';

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

export function setEntityLookupState(indicator: HTMLElement, state: EntityLookupState): void {
    indicator.classList.remove('mb_lookup_error', 'mb_lookup_loading');
    indicator.removeAttribute('aria-label');
    indicator.removeAttribute('role');
    indicator.removeAttribute('title');

    if (state === 'matched') {
        indicator.classList.remove('mb_searchit');
        return;
    }

    indicator.classList.add('mb_searchit');
    if (state === 'loading') {
        indicator.classList.add('mb_lookup_loading');
        indicator.setAttribute('aria-label', 'Looking up this entity on MusicBrainz');
        indicator.setAttribute('role', 'status');
        indicator.title = 'Looking up this entity on MusicBrainz';
    } else if (state === 'error') {
        indicator.classList.add('mb_lookup_error');
        indicator.setAttribute('aria-label', 'MusicBrainz lookup failed');
        indicator.setAttribute('role', 'img');
        indicator.title = 'MusicBrainz lookup failed';
    }
}

export function createEntityLookupIndicator(mbType: string, entityName: string, options?: EntitySearchLinkOptions): HTMLSpanElement {
    const indicator = createEntitySearchLink(mbType, entityName, options);
    setEntityLookupState(indicator, 'loading');
    return indicator;
}
