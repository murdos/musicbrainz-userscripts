import { MBImport } from '~/lib/mbimport';
import { MBSearchItStyle } from '~/lib/mbimportstyle';
import { MBLinks, type MBLinkQuery } from '~/lib/mblinks';

type EntityType = 'artist' | 'label' | 'recording' | 'release';
type EntityMatchHandler = (type: EntityType, url: string, mbid: string) => void;

const LOOKUP_ATTRIBUTE = 'data-mb-mirlo-lookup';
const RELEASE_PATH = /^\/([^/]+)\/release\/([^/]+)\/?$/;
const TRACK_PATH = /^\/([^/]+)\/release\/([^/]+)\/tracks\/(\d+)\/?$/;
const HOMEPAGE_SECTION_HEADINGS = new Set(['Recent releases', 'Recent purchases']);
const RELEASE_CARD_LINK_SELECTOR = ':is(h2, h3, h4) > a[href]';

let entityMatchHandler: EntityMatchHandler | undefined;
let scheduleLookups: (() => void) | undefined;
const labelRosterTypes = new Map<string, Map<string, 'artist' | 'label'>>();
const loadingLabelRosters = new Set<string>();

function canonicalUrl(pathname: string): string {
    return `${window.location.origin}${pathname.replace(/\/$/, '')}`;
}

function pathnameFor(link: HTMLAnchorElement): string | undefined {
    try {
        const url = new URL(link.href, window.location.origin);
        return url.origin === window.location.origin ? url.pathname : undefined;
    } catch {
        return undefined;
    }
}

function createLookup(
    queries: Record<EntityType, MBLinkQuery[]>,
    type: EntityType,
    url: string,
    name: string,
    target: Element,
    placement: 'prepend' | 'before' = 'prepend',
): void {
    if (target.hasAttribute(LOOKUP_ATTRIBUTE)) return;
    target.setAttribute(LOOKUP_ATTRIBUTE, type);

    const indicator = MBImport.createEntitySearchLink(type, name);
    indicator.classList.add('mb-mirlo-link');
    indicator.addEventListener('click', event => event.stopPropagation());
    if (placement === 'before') target.before(indicator);
    else target.prepend(indicator);

    let foundMatch = false;
    const matchedMbids = new Set<string>();
    let matchNotificationScheduled = false;
    queries[type].push({
        url,
        mb_type: type,
        key: `${type}:${url}`,
        insert_func: link => {
            if (!indicator.isConnected) return;
            if (!foundMatch) {
                indicator.replaceChildren();
                indicator.classList.remove('mb_searchit');
                foundMatch = true;
            }
            indicator.insertAdjacentHTML('beforeend', link.trim());

            const mbid = link.match(new RegExp(`/${type}/([0-9a-f-]{36})`, 'i'))?.[1];
            if (!mbid) return;
            matchedMbids.add(mbid);
            if (matchNotificationScheduled) return;
            matchNotificationScheduled = true;
            queueMicrotask(() => {
                matchNotificationScheduled = false;
                if (matchedMbids.size === 1) entityMatchHandler?.(type, url, mbid);
            });
        },
    });
}

function addArtistLookup(queries: Record<EntityType, MBLinkQuery[]>, artistSlug: string, artistLink: HTMLAnchorElement): void {
    const artistName = artistLink.textContent.trim() || artistLink.title;
    if (!artistName) return;
    createLookup(queries, 'artist', canonicalUrl(`/${artistSlug}`), artistName, artistLink, 'before');
}

function addLabelLookups(queries: Record<EntityType, MBLinkQuery[]>, artistSlug: string, title: HTMLElement | null): void {
    const header = title?.parentElement?.parentElement;
    if (!header) return;

    header.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
        const pathname = pathnameFor(link)?.replace(/\/$/, '');
        if (!pathname || pathname === `/${artistSlug}` || !/^\/[^/]+$/.test(pathname)) return;
        const labelName = link.textContent.trim() || link.title;
        if (labelName) createLookup(queries, 'label', canonicalUrl(pathname), labelName, link, 'before');
    });
}

function addReleasePageLookups(queries: Record<EntityType, MBLinkQuery[]>, artistSlug: string, releaseSlug: string): void {
    const releaseUrl = canonicalUrl(`/${artistSlug}/release/${releaseSlug}`);
    const title = document.querySelector<HTMLElement>('#main-content h1');
    if (title?.textContent.trim()) createLookup(queries, 'release', releaseUrl, title.textContent.trim(), title);
    addLabelLookups(queries, artistSlug, title);

    document.querySelectorAll<HTMLAnchorElement>('#main-content a[href]').forEach(link => {
        if (pathnameFor(link)?.replace(/\/$/, '') === `/${artistSlug}`) addArtistLookup(queries, artistSlug, link);
    });

    document.querySelectorAll<HTMLLIElement>('#main-content li[id]').forEach(row => {
        if (!/^\d+$/.test(row.id) || !row.querySelector('button[aria-label="Track options"]')) return;
        const details = row.children.item(1);
        const trackTitle = details?.children.item(0);
        const name = trackTitle?.textContent.trim();
        if (!trackTitle || !name) return;
        createLookup(queries, 'recording', `${releaseUrl}/tracks/${row.id}`, name, trackTitle);
    });
}

function addTrackPageLookups(queries: Record<EntityType, MBLinkQuery[]>, artistSlug: string, releaseSlug: string, trackId: string): void {
    const releasePath = `/${artistSlug}/release/${releaseSlug}`;
    const releaseUrl = canonicalUrl(releasePath);
    const title = document.querySelector<HTMLElement>('#main-content h1');
    if (title?.textContent.trim()) {
        createLookup(queries, 'recording', `${releaseUrl}/tracks/${trackId}`, title.textContent.trim(), title);
    }
    addLabelLookups(queries, artistSlug, title);

    document.querySelectorAll<HTMLAnchorElement>('#main-content a[href]').forEach(link => {
        const pathname = pathnameFor(link)?.replace(/\/$/, '');
        if (pathname === `/${artistSlug}`) addArtistLookup(queries, artistSlug, link);
        if (pathname === releasePath) {
            const releaseName = link.textContent.trim() || link.title;
            if (releaseName) createLookup(queries, 'release', releaseUrl, releaseName, link, 'before');
        }
    });
}

function addArtistPageLookups(queries: Record<EntityType, MBLinkQuery[]>, artistSlug: string): void {
    const releasePathPrefix = `/${artistSlug}/release/`;
    const releases = [...document.querySelectorAll<HTMLAnchorElement>('#main-content h2 > a[href]')].filter(link =>
        pathnameFor(link)?.startsWith(releasePathPrefix),
    );
    if (releases.length === 0) return;

    const artistTitle = document.querySelector<HTMLElement>('#main-content h1');
    if (artistTitle?.textContent.trim()) {
        createLookup(queries, 'artist', canonicalUrl(`/${artistSlug}`), artistTitle.textContent.trim(), artistTitle);
    }

    releases.forEach(link => {
        const pathname = pathnameFor(link);
        const name = link.textContent.trim() || link.title;
        if (pathname && name) createLookup(queries, 'release', canonicalUrl(pathname), name, link.parentElement ?? link);
    });
}

function homepageSectionFor(heading: HTMLElement): HTMLElement | undefined {
    let section = heading.parentElement;
    while (section && section !== document.body) {
        if (section.querySelector(`li ${RELEASE_CARD_LINK_SELECTOR}`)) return section;
        section = section.parentElement;
    }
    return undefined;
}

function addReleaseCardLookups(queries: Record<EntityType, MBLinkQuery[]>, container: ParentNode): void {
    container.querySelectorAll<HTMLLIElement>('li').forEach(card => {
        const releaseLink = card.querySelector<HTMLAnchorElement>(RELEASE_CARD_LINK_SELECTOR);
        const releasePath = releaseLink ? pathnameFor(releaseLink) : undefined;
        const releaseMatch = releasePath ? RELEASE_PATH.exec(releasePath) : null;
        const releaseName = releaseLink?.textContent.trim() || releaseLink?.title;
        if (!releaseLink || !releasePath || !releaseMatch?.[1] || !releaseName) return;

        createLookup(queries, 'release', canonicalUrl(releasePath), releaseName, releaseLink.parentElement ?? releaseLink);

        const artistPath = `/${releaseMatch[1]}`;
        const artistLink = [...card.querySelectorAll<HTMLAnchorElement>('a[href]')].find(
            link => pathnameFor(link)?.replace(/\/$/, '') === artistPath,
        );
        if (artistLink) {
            artistLink.parentElement?.classList.add('mb-mirlo-card-entity');
            addArtistLookup(queries, releaseMatch[1], artistLink);
        }
    });
}

function addTrackCardLookups(queries: Record<EntityType, MBLinkQuery[]>, container: ParentNode): void {
    container.querySelectorAll<HTMLLIElement>('li').forEach(card => {
        const trackLink = card.querySelector<HTMLAnchorElement>(RELEASE_CARD_LINK_SELECTOR);
        const trackPath = trackLink ? pathnameFor(trackLink) : undefined;
        const trackMatch = trackPath ? TRACK_PATH.exec(trackPath) : null;
        const trackName = trackLink?.textContent.trim() || trackLink?.title;
        if (!trackLink || !trackPath || !trackMatch?.[1] || !trackName) return;

        createLookup(queries, 'recording', canonicalUrl(trackPath), trackName, trackLink.parentElement ?? trackLink);

        const artistPath = `/${trackMatch[1]}`;
        const artistLink = [...card.querySelectorAll<HTMLAnchorElement>('a[href]')].find(
            link => pathnameFor(link)?.replace(/\/$/, '') === artistPath,
        );
        if (artistLink) {
            artistLink.parentElement?.classList.add('mb-mirlo-card-entity');
            addArtistLookup(queries, trackMatch[1], artistLink);
        }
    });
}

function addHomepageLookups(queries: Record<EntityType, MBLinkQuery[]>): void {
    document.querySelectorAll<HTMLElement>('#main-content h3').forEach(heading => {
        if (!HOMEPAGE_SECTION_HEADINGS.has(heading.textContent.trim())) return;
        const section = homepageSectionFor(heading);
        if (section) addReleaseCardLookups(queries, section);
    });
}

function addReleasesPageLookups(queries: Record<EntityType, MBLinkQuery[]>): void {
    const mainContent = document.querySelector('#main-content');
    if (mainContent) addReleaseCardLookups(queries, mainContent);
}

function resultContainerAfter(heading: HTMLElement, resultSelector: string): Element | undefined {
    let current: Element | null = heading;
    while (current && current.parentElement !== document.body) {
        const resultContainer = current.nextElementSibling;
        if (resultContainer?.querySelector(resultSelector)) return resultContainer;
        current = current.parentElement;
    }
    return undefined;
}

function addProfileCardLookups(
    queries: Record<EntityType, MBLinkQuery[]>,
    typeForPath: 'artist' | 'label' | ((pathname: string) => 'artist' | 'label' | undefined),
    container: Element,
): void {
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href]')];
    links.forEach(link => {
        const pathname = pathnameFor(link)?.replace(/\/$/, '');
        const name = link.textContent.trim();
        if (!pathname || !name || !/^\/[^/]+$/.test(pathname)) return;
        const hasMatchingImageLink = links.some(
            candidate => candidate !== link && pathnameFor(candidate)?.replace(/\/$/, '') === pathname && candidate.querySelector('img'),
        );
        if (!hasMatchingImageLink) return;
        const type = typeof typeForPath === 'function' ? typeForPath(pathname) : typeForPath;
        if (!type) return;

        link.parentElement?.classList.add('mb-mirlo-card-entity');
        createLookup(queries, type, canonicalUrl(pathname), name, link, 'before');
    });
}

function addSearchPageLookups(queries: Record<EntityType, MBLinkQuery[]>): void {
    document.querySelectorAll<HTMLElement>('#main-content h2').forEach(heading => {
        const headingText = heading.textContent.trim();
        if (/^Releases(?: for\b|$)/.test(headingText)) {
            const container = resultContainerAfter(heading, `li ${RELEASE_CARD_LINK_SELECTOR}`);
            if (container) addReleaseCardLookups(queries, container);
        } else if (/^Tracks(?: for\b|$)/.test(headingText)) {
            const container = resultContainerAfter(heading, `li ${RELEASE_CARD_LINK_SELECTOR}`);
            if (container) addTrackCardLookups(queries, container);
        } else if (/^Artists(?: for\b|$)/.test(headingText)) {
            const container = resultContainerAfter(heading, 'a[href] img');
            if (container) addProfileCardLookups(queries, 'artist', container);
        } else if (/^Labels(?: for\b|$)/.test(headingText)) {
            const container = resultContainerAfter(heading, 'a[href] img');
            if (container) addProfileCardLookups(queries, 'label', container);
        }
    });
}

function addArtistsPageLookups(queries: Record<EntityType, MBLinkQuery[]>): void {
    const mainContent = document.querySelector('#main-content');
    if (!mainContent) return;
    const type = new URLSearchParams(window.location.search).get('isLabel') === 'true' ? 'label' : 'artist';
    addProfileCardLookups(queries, type, mainContent);
}

function labelPageRoute(): { labelSlug: string; tab?: string } | undefined {
    const match = /^\/([^/]+)(?:\/([^/]+))?\/?$/.exec(window.location.pathname);
    if (!match?.[1]) return undefined;
    const title = document.querySelector<HTMLElement>('#main-content h1');
    const isLabel = [...(title?.parentElement?.querySelectorAll('span') ?? [])].some(span => span.textContent.trim() === 'Label');
    if (!title || !isLabel) return undefined;
    return { labelSlug: match[1], ...(match[2] ? { tab: match[2] } : {}) };
}

function loadLabelRoster(labelSlug: string): void {
    if (labelRosterTypes.has(labelSlug) || loadingLabelRosters.has(labelSlug)) return;
    loadingLabelRosters.add(labelSlug);
    const endpoint = new URL(`/v1/labels/${encodeURIComponent(labelSlug)}`, window.location.origin);
    void fetch(endpoint, { headers: { Accept: 'application/json' } })
        .then(response => {
            if (!response.ok) throw new Error(`Mirlo API returned HTTP ${response.status}`);
            return response.json() as Promise<unknown>;
        })
        .then(data => {
            const result = data && typeof data === 'object' ? (data as Record<string, unknown>)['result'] : undefined;
            const roster = result && typeof result === 'object' ? (result as Record<string, unknown>)['artistLabels'] : undefined;
            const types = new Map<string, 'artist' | 'label'>();
            if (Array.isArray(roster)) {
                roster.forEach(membership => {
                    if (!membership || typeof membership !== 'object') return;
                    const artist = (membership as Record<string, unknown>)['artist'];
                    if (!artist || typeof artist !== 'object') return;
                    const profile = artist as Record<string, unknown>;
                    if (typeof profile['urlSlug'] !== 'string') return;
                    types.set(`/${profile['urlSlug']}`, profile['isLabelProfile'] === true ? 'label' : 'artist');
                });
            }
            labelRosterTypes.set(labelSlug, types);
            scheduleLookups?.();
        })
        .catch(() => {})
        .finally(() => loadingLabelRosters.delete(labelSlug));
}

function addLabelPageLookups(queries: Record<EntityType, MBLinkQuery[]>, { labelSlug, tab }: { labelSlug: string; tab?: string }): void {
    const title = document.querySelector<HTMLElement>('#main-content h1');
    const labelName = title?.textContent.trim();
    if (title && labelName) createLookup(queries, 'label', canonicalUrl(`/${labelSlug}`), labelName, title);

    const mainContent = document.querySelector('#main-content');
    if (!mainContent) return;
    if (tab === 'releases') {
        addReleaseCardLookups(queries, mainContent);
    } else if (tab === 'roster') {
        const rosterTypes = labelRosterTypes.get(labelSlug);
        if (rosterTypes) addProfileCardLookups(queries, pathname => rosterTypes.get(pathname), mainContent);
        else loadLabelRoster(labelSlug);
    }
}

export function addMirloLookups(mblinks: MBLinks): void {
    const queries: Record<EntityType, MBLinkQuery[]> = { artist: [], label: [], recording: [], release: [] };
    const track = TRACK_PATH.exec(window.location.pathname);
    const release = RELEASE_PATH.exec(window.location.pathname);
    const labelPage = labelPageRoute();

    if (window.location.pathname === '/') addHomepageLookups(queries);
    else if (window.location.pathname.replace(/\/$/, '') === '/releases') addReleasesPageLookups(queries);
    else if (window.location.pathname.replace(/\/$/, '') === '/search') addSearchPageLookups(queries);
    else if (window.location.pathname.replace(/\/$/, '') === '/artists') addArtistsPageLookups(queries);
    else if (track?.[1] && track[2] && track[3]) addTrackPageLookups(queries, track[1], track[2], track[3]);
    else if (release?.[1] && release[2]) addReleasePageLookups(queries, release[1], release[2]);
    else if (labelPage) addLabelPageLookups(queries, labelPage);
    else {
        const artist = /^\/([^/]+)\/?$/.exec(window.location.pathname);
        if (artist?.[1]) addArtistPageLookups(queries, artist[1]);
    }

    Object.values(queries).forEach(typeQueries => {
        if (typeQueries.length > 0) mblinks.searchAndDisplayMbLinks(typeQueries);
    });
}

export function initMirloLinking(onEntityMatch?: EntityMatchHandler): MBLinks {
    entityMatchHandler = onEntityMatch;
    MBSearchItStyle();
    const mblinks = new MBLinks('MIRLO_MBLINKS_CACHE', 1);
    let scheduled = false;
    scheduleLookups = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            addMirloLookups(mblinks);
        });
    };

    scheduleLookups();
    new MutationObserver(scheduleLookups).observe(document.body, { childList: true, subtree: true });
    return mblinks;
}
