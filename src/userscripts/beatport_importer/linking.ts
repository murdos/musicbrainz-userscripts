import { MBImport } from '~/lib/mbimport';
import { MBLinks, type MBLinkQuery } from '~/lib/mblinks';
import type { Release } from '~/types/importers';

import type { BeatportReleaseData } from './types';

const LOOKUP_ATTRIBUTE = 'data-mb-beatport-lookup';
const INDICATOR_CLASS = 'mb-beatport-link';

/** Link the release header and visible table entities, including newly paginated rows. */
export function linkBeatportRelease(mblinks: MBLinks, release: Release, data: BeatportReleaseData): () => void {
    const pageUrl = window.location.href;
    const form = document.querySelector<HTMLFormElement>('.musicbrainz-import form.musicbrainz_import_add');
    let active = true;

    const updateForm = (name: string, value: string) => {
        if (!active || window.location.href !== pageUrl || !form?.isConnected) return;
        let input = [...form.querySelectorAll<HTMLInputElement>('input')].find(element => element.name === name);
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            form.append(input);
        }
        input.value = value;
    };

    const scan = () => {
        if (!active || window.location.href !== pageUrl) return;
        const queries: Record<string, MBLinkQuery[]> = { artist: [], label: [], release: [] };

        const addLookup = (
            target: Element,
            type: 'artist' | 'label' | 'release',
            url: string,
            name: string,
            onMatch?: (mbid: string) => void,
        ) => {
            if (!name || target.hasAttribute(LOOKUP_ATTRIBUTE)) return;
            target.setAttribute(LOOKUP_ATTRIBUTE, type);
            const indicator = MBImport.createEntityLookupIndicator(type, name);
            indicator.classList.add(INDICATOR_CLASS);
            indicator.style.marginRight = '4px';
            indicator.addEventListener('click', event => event.stopPropagation());
            if (type === 'release') target.prepend(indicator);
            else target.before(indicator);

            let matched = false;
            const key = `${type}:${url}`;
            queries[type]!.push({
                url,
                mb_type: type,
                key,
                insert_func: link => {
                    if (!active || window.location.href !== pageUrl || !indicator.isConnected) return;
                    if (!matched) {
                        indicator.replaceChildren();
                        MBImport.setEntityLookupState(indicator, 'matched');
                        matched = true;
                    }
                    indicator.insertAdjacentHTML('beforeend', link.trim());
                },
                complete_func: result => {
                    if (!active || window.location.href !== pageUrl || !indicator.isConnected) return;
                    if (!matched) MBImport.setEntityLookupState(indicator, result.status === 'error' ? 'error' : 'search');
                    // Ambiguous URL relationships remain visible, but must not select an arbitrary entity.
                    const mbid = result.status === 'success' && matched ? mblinks.resolveMBID(key) : undefined;
                    if (mbid) onMatch?.(mbid);
                },
            });
        };

        const header = document.querySelector('[class^="ReleaseDetailCard_meta"]');
        const title = header?.querySelector('h1');
        if (title) {
            const path = window.location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/release\/)/, '').replace(/\/$/, '');
            addLookup(title, 'release', `https://www.beatport.com${path}`, release.title);
        }

        document
            .querySelectorAll<HTMLAnchorElement>('[class^="ReleaseDetailCard_meta"] a[href], [class*="DetailsCell-style__"] a[href]')
            .forEach(link => {
                const url = new URL(link.href, window.location.origin);
                const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(artist|label)\/[^/]+\/(\d+)\/?$/.exec(url.pathname);
                if (url.origin !== window.location.origin || !match) return;
                const type = match[1] as 'artist' | 'label';
                const id = Number(match[2]);
                const path = url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/(?:artist|label)\/)/, '').replace(/\/$/, '');
                const primary = header?.contains(link);
                addLookup(
                    link,
                    type,
                    `https://www.beatport.com${path}`,
                    link.title || link.textContent.trim(),
                    primary
                        ? mbid => {
                              if (type === 'label' && data.label.id === id) {
                                  updateForm('labels.0.mbid', mbid);
                              } else if (type === 'artist') {
                                  const artist = data.artists.find(candidate => candidate.id === id);
                                  if (!artist || data.artists.filter(candidate => candidate.name === artist.name).length !== 1) return;
                                  release.artist_credit.forEach((credit, index) => {
                                      if (credit.artist_name !== artist.name || credit.mbid) return;
                                      updateForm(`artist_credit.names.${index}.mbid`, mbid);
                                      updateForm(`artist_credit.names.${index}.name`, credit.credited_name || credit.artist_name);
                                  });
                              }
                          }
                        : undefined,
                );
            });

        Object.values(queries).forEach(batch => {
            if (batch.length) mblinks.searchAndDisplayMbLinks(batch);
        });
    };

    const observer = new MutationObserver(scan);
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
        active = false;
        observer.disconnect();
        document.querySelectorAll(`.${INDICATOR_CLASS}`).forEach(indicator => indicator.remove());
        document.querySelectorAll(`[${LOOKUP_ATTRIBUTE}]`).forEach(target => target.removeAttribute(LOOKUP_ATTRIBUTE));
    };
}
