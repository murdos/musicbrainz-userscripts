import { MBImport } from '~/lib/mbimport';
import type { MBLinkQuery } from '~/lib/mblinks';

interface ReleaseLookupOptions {
    url: string;
    title: string;
    target: Element;
}

export function normalizeProductUrl(url: string): string {
    const parsed = new URL(url, window.location.origin);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
}

function createReleaseSearchLink(title: string): HTMLSpanElement {
    const indicator = MBImport.createEntitySearchLink('release', title);
    indicator.classList.add('mastermix-mb-indicator');
    indicator.addEventListener('click', event => {
        event.stopPropagation();
    });
    return indicator;
}

export function addReleaseLookup(queries: MBLinkQuery[], { url, title, target }: ReleaseLookupOptions): void {
    const indicator = createReleaseSearchLink(title);
    target.prepend(indicator);

    let foundMatch = false;
    queries.push({
        url,
        mb_type: 'release',
        key: `release:${url}`,
        insert_func: link => {
            if (!foundMatch) {
                indicator.replaceChildren();
                indicator.classList.remove('mb_searchit');
                foundMatch = true;
            }
            indicator.insertAdjacentHTML('beforeend', link.trim());
        },
    });
}
