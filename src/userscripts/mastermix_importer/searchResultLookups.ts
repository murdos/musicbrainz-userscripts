import { MBLinks, type MBLinkQuery } from '~/lib/mblinks';

import { addReleaseLookup, normalizeProductUrl } from './releaseLookup';

interface SearchLookupContext {
    mblinks: MBLinks;
    processedTargets: WeakSet<Element>;
}

function collectElements(root: ParentNode, selector: string): Element[] {
    const elements = Array.from(root.querySelectorAll(selector));
    if (root instanceof Element && root.matches(selector)) elements.unshift(root);
    return elements;
}

function addSingleResultLookups(context: SearchLookupContext, roots: ParentNode[], queries: MBLinkQuery[]): void {
    roots
        .flatMap(root => collectElements(root, 'td:nth-child(3)'))
        .forEach(albumCell => {
            if (
                !(albumCell instanceof HTMLTableCellElement) ||
                !albumCell.closest('#singles tbody') ||
                context.processedTargets.has(albumCell)
            )
                return;

            const albumLink = albumCell.querySelector<HTMLAnchorElement>(':scope > a[href*="/product/"]');
            const title = albumLink?.textContent.trim();
            if (!albumLink || !title) return;

            context.processedTargets.add(albumCell);
            albumCell.classList.add('mastermix-search-single-album');
            addReleaseLookup(queries, {
                url: normalizeProductUrl(albumLink.href),
                title,
                target: albumCell,
            });
        });
}

function addAlbumResultLookups(context: SearchLookupContext, roots: ParentNode[], queries: MBLinkQuery[]): void {
    roots
        .flatMap(root => collectElements(root, '.text-container > h3'))
        .forEach(titleElement => {
            if (
                !(titleElement instanceof HTMLElement) ||
                !titleElement.closest('#js-list-albums') ||
                context.processedTargets.has(titleElement)
            )
                return;

            const productLink = titleElement.closest<HTMLAnchorElement>('a[href*="/product/"]');
            const title = titleElement.textContent.trim();
            if (!productLink || !title) return;

            context.processedTargets.add(titleElement);
            titleElement.classList.add('mastermix-search-album-title');
            addReleaseLookup(queries, {
                url: normalizeProductUrl(productLink.href),
                title,
                target: titleElement,
            });
        });
}

function addSearchResultLookups(context: SearchLookupContext, roots: ParentNode[]): void {
    const queries: MBLinkQuery[] = [];
    addSingleResultLookups(context, roots, queries);
    addAlbumResultLookups(context, roots, queries);
    if (queries.length > 0) context.mblinks.searchAndDisplayMbLinks(queries);
}

function handleResultMutations(context: SearchLookupContext, mutations: MutationRecord[]): void {
    const addedElements = mutations.flatMap(mutation =>
        Array.from(mutation.addedNodes).filter((node): node is Element => node instanceof Element),
    );
    if (addedElements.length > 0) addSearchResultLookups(context, addedElements);
}

function observeDynamicResults(context: SearchLookupContext): void {
    const resultContainers = document.querySelectorAll('#singles tbody, #js-list-singles, #js-list-albums');
    if (resultContainers.length === 0) return;

    const observer = new MutationObserver(handleResultMutations.bind(undefined, context));
    resultContainers.forEach(container => {
        observer.observe(container, { childList: true, subtree: true });
    });
}

export function initSearchResultLookups(mblinks: MBLinks): void {
    const context: SearchLookupContext = {
        mblinks,
        processedTargets: new WeakSet(),
    };
    addSearchResultLookups(context, [document]);
    observeDynamicResults(context);
}
