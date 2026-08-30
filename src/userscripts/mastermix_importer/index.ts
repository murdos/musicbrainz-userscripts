import { Logger, LogLevel } from '~/lib/logger';
import { MBImport } from '~/lib/mbimport';
import { MBImportStyle, MBSearchItStyle } from '~/lib/mbimportstyle';
import { MBLinks, type MBLinkQuery } from '~/lib/mblinks';
import { type ArtistCredit, type Release, type Track } from '~/types/importers';

import { addReleaseLookup, normalizeProductUrl } from './releaseLookup';
import { initSearchResultLookups } from './searchResultLookups';

const LOGGER = new Logger('MusicBrainz mastermix_importer', LogLevel.INFO);
const MASTERMIX_MBID = '8e0090e8-9081-4797-a386-990040f0accf'; // Music Factory label
const MASTERMIX_LABEL = 'Music Factory';
const PRODUCT_URL_PATTERN = /^\/product\/[^/]+\/?$/;

interface ProductApiResponse {
    date?: string;
}

function getCurrentProductUrl(): string {
    const canonicalUrl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    return normalizeProductUrl(canonicalUrl || window.location.href);
}

function addReleaseLookups(mblinks: MBLinks): void {
    MBSearchItStyle();
    const queries: MBLinkQuery[] = [];

    document.querySelectorAll<HTMLElement>('article.article--album').forEach(article => {
        const productLink = article.querySelector<HTMLAnchorElement>(':scope > a[href*="/product/"]');
        const titleElement = productLink?.querySelector<HTMLElement>('h2');
        const title = titleElement?.textContent.trim();
        if (!productLink || !titleElement || !title) return;

        const titleText = document.createElement('span');
        titleText.className = 'mastermix-card-title-text';
        titleText.textContent = title;
        titleElement.replaceChildren(titleText);
        titleElement.classList.add('mastermix-card-title');

        addReleaseLookup(queries, {
            url: normalizeProductUrl(productLink.href),
            title,
            target: titleElement,
        });
    });

    if (PRODUCT_URL_PATTERN.test(window.location.pathname)) {
        const title = document.querySelector<HTMLElement>('h1.product_title');
        if (title?.textContent.trim()) {
            addReleaseLookup(queries, {
                url: getCurrentProductUrl(),
                title: title.textContent.trim(),
                target: title,
            });
        }
    }

    if (queries.length > 0) {
        mblinks.searchAndDisplayMbLinks(queries);
    }
}

function getProductId(): string | undefined {
    const product = document.querySelector<HTMLElement>('.product[id^="product-"]');
    return product?.id.match(/^product-(\d+)$/)?.[1];
}

async function getPublicationDate(): Promise<{ year: number; month: number; day: number } | undefined> {
    const productId = getProductId();
    if (!productId) return undefined;

    try {
        const response = await fetch(`/wp-json/wp/v2/product/${productId}`, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as ProductApiResponse;
        const match = data.date?.match(/^(\d{4})-(\d{2})-(\d{2})T/);
        if (!match) return undefined;
        return {
            year: parseInt(match[1]!, 10),
            month: parseInt(match[2]!, 10),
            day: parseInt(match[3]!, 10),
        };
    } catch (error) {
        LOGGER.error('Could not retrieve the product publication date', error);
        return undefined;
    }
}

function getReleaseArtistCredit(tracks: Track[]): ArtistCredit[] {
    const artists = tracks
        .map(track => track.artist_credit[0]?.artist_name)
        .filter((artist): artist is string => typeof artist === 'string');
    const uniqueArtists = [...new Set(artists)];
    return uniqueArtists.length === 1 && uniqueArtists[0] !== 'Various Artists'
        ? MBImport.makeArtistCredits(uniqueArtists)
        : [MBImport.specialArtist('various_artists')];
}

function getTrackArtistCredit(artist: string): ArtistCredit[] {
    return artist === 'Mastermix' ? [MBImport.specialArtist('various_artists')] : MBImport.makeArtistCredits([artist]);
}

function getAnnotation(): string | undefined {
    const description = document.querySelector<HTMLElement>('.woocommerce-product-details__short-description .wysiwyg');
    if (!description) return undefined;

    const paragraphs = Array.from(description.querySelectorAll('p'))
        .map(paragraph => paragraph.textContent.trim())
        .filter(Boolean);
    let annotation = paragraphs.length > 0 ? paragraphs.join('\n\n') : description.textContent.trim();
    if (annotation) {
        annotation = `=== Description from Mastermix ===\n\n${annotation}`;
    }

    return annotation || undefined;
}

function parseTracks(): Track[] {
    return Array.from(document.querySelectorAll<HTMLTableRowElement>('#mfeg-single-list tbody tr.single-item')).flatMap(row => {
        const title = row.querySelector<HTMLElement>('.single-item__title')?.textContent.trim();
        const artist = row.querySelector<HTMLElement>('.single-item__artist')?.textContent.trim();
        const duration = row.querySelector<HTMLElement>('.single-item__runtime')?.textContent.trim();
        const number = row.querySelector<HTMLElement>('.track-number')?.textContent.trim();
        if (!title || !artist) return [];

        const durationMs = duration ? MBImport.hmsToMilliSeconds(duration) : undefined;

        return [
            {
                ...(number ? { number } : {}),
                title,
                ...(durationMs === undefined ? {} : { duration: durationMs }),
                artist_credit: getTrackArtistCredit(artist),
            },
        ];
    });
}

async function parseRelease(): Promise<Release | undefined> {
    const titleElement = document.querySelector<HTMLElement>('h1.product_title');
    const title = Array.from(titleElement?.childNodes ?? [])
        .filter(node => !(node instanceof HTMLElement && node.classList.contains('mastermix-mb-indicator')))
        .map(node => node.textContent)
        .join('')
        .trim();
    const tracks = parseTracks();
    if (!title || tracks.length === 0) return undefined;

    // Publication date is not found in the DOM, so we need to call their API
    const publicationDate = await getPublicationDate();

    const sku = document.querySelector<HTMLElement>('.product_meta .sku')?.textContent.trim();
    const releaseUrl = getCurrentProductUrl();
    const annotation = getAnnotation();

    return {
        title,
        artist_credit: getReleaseArtistCredit(tracks),
        ...(annotation ? { annotation } : {}),
        type: 'album',
        secondary_types: ['compilation', 'dj-mix'],
        status: 'official',
        language: 'eng',
        script: 'Latn',
        packaging: 'None',
        country: 'XW',
        ...(publicationDate ?? {}),
        labels: [
            {
                mbid: MASTERMIX_MBID,
                name: MASTERMIX_LABEL,
                ...(sku ? { catno: sku } : {}),
            },
        ],
        barcode: '',
        urls: [
            {
                url: releaseUrl,
                link_type: MBImport.URL_TYPES.purchase_for_download,
            },
        ],
        discs: [
            {
                format: 'Digital Media',
                tracks,
            },
        ],
    };
}

async function addImportButtons(): Promise<void> {
    if (!PRODUCT_URL_PATTERN.test(window.location.pathname)) return;

    const release = await parseRelease();
    if (!release) {
        LOGGER.error('Could not parse release data from the product page');
        return;
    }

    const releaseUrl = getCurrentProductUrl();
    const editNote = MBImport.makeEditNote(releaseUrl, 'Mastermix');
    const parameters = MBImport.buildFormParameters(release, editNote);
    const buttons = document.createElement('div');
    buttons.id = 'mb_buttons';
    buttons.className = 'mastermix-import-buttons';
    buttons.innerHTML = MBImport.buildFormHTML(parameters) + MBImport.buildSearchButton(release);

    const productMeta = document.querySelector('.product_meta');
    if (!productMeta) {
        LOGGER.error('Could not find the product metadata container');
        return;
    }
    productMeta.insertAdjacentElement('afterend', buttons);
}

function addStyles(): void {
    MBImportStyle();
    document.head.insertAdjacentHTML(
        'beforeend',
        `<style>
            .article--album a h2.mastermix-card-title {
                display: flex;
                align-items: center;
            }
            .mastermix-card-title-text {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            h1.product_title {
                display: flex;
                align-items: center;
            }
            .mastermix-search-album-title {
                display: flex;
                align-items: center;
            }
            span.mastermix-mb-indicator {
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                min-height: 16px;
                margin-right: 4px;
                line-height: 16px;
                vertical-align: middle;
            }
            .mastermix-mb-indicator a {
                display: inline-flex;
                align-items: center;
                height: 16px;
                line-height: 16px;
            }
            .mastermix-mb-indicator img { display: block; }
            #singles td .mastermix-mb-indicator img {
                width: 16px;
                height: 16px;
                max-width: 16px;
            }
            .mastermix-import-buttons { margin-top: 1rem; flex-wrap: wrap; }
        </style>`,
    );
}

function init(): void {
    addStyles();
    const mblinks = new MBLinks('MASTERMIX_MBLINKS_CACHE', 1);
    addReleaseLookups(mblinks);
    initSearchResultLookups(mblinks);
    void addImportButtons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
