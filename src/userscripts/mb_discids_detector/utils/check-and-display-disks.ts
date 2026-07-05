import { LOGGER, MB_API_URL, MB_BASE_URL } from '../constants';
import type { DiscIdLookupResponse, DisplayDiscHandler, TocEntry } from '../types';
import { MBDiscid } from './mb-discid';

function computeAttachUrl(mbTocNumbers: number[], mbArtistName: string, mbReleaseName: string): string {
    const mbURL = new URL(`${MB_BASE_URL}/cdtoc/attach`);
    mbURL.searchParams.set('toc', mbTocNumbers.join(' '));
    mbURL.searchParams.set('artist-name', mbArtistName);
    mbURL.searchParams.set('release-name', mbReleaseName);
    return mbURL.toString();
}

function createDiscIdLink(
    discid: string,
    mbTocNumbers: number[],
    artistName: string,
    releaseName: string,
    found: boolean,
): HTMLAnchorElement {
    const htmlElement = document.createElement('a');
    htmlElement.href = computeAttachUrl(mbTocNumbers, artistName, releaseName);
    htmlElement.textContent = discid;
    if (found) {
        htmlElement.style.backgroundColor = '#d0f1d0';
        htmlElement.style.color = 'rgb(30, 70, 32)';
        htmlElement.style.border = '1px solid rgb(30, 70, 32)';
        htmlElement.style.paddingInline = '3px';
        htmlElement.style.borderRadius = '3px';
    }
    return htmlElement;
}

interface CheckAndDisplayDiscsProps {
    artistName: string;
    releaseName: string;
    discs: TocEntry[][];
    displayDiscHandler: DisplayDiscHandler;
    getElementIdForResultDisplay: (discNumber: number) => string;
}

export const checkAndDisplayDiscs = async ({
    artistName,
    releaseName,
    discs,
    displayDiscHandler,
    getElementIdForResultDisplay,
}: CheckAndDisplayDiscsProps): Promise<void> => {
    // For each disc, check if it's in MusicBrainz database
    for (let i = 0; i < discs.length; i++) {
        const entries = discs[i];
        if (!entries || entries.length === 0) {
            continue;
        }

        const discNumber = i + 1;
        const mbTocNumbers = MBDiscid.calculateMbTocNumbers(entries);
        if (!mbTocNumbers) {
            continue;
        }

        const discid = await MBDiscid.calculateMbDiscid(entries);
        LOGGER.info(`Computed discid :${discid}`);
        displayDiscHandler(mbTocNumbers, discid, discNumber);

        let found = false;

        try {
            const response = await fetch(MB_API_URL(discid), {
                headers: { Accept: 'application/json' },
            });

            if (response.ok) {
                const data = (await response.json()) as DiscIdLookupResponse;
                if (!('error' in data)) {
                    found = true;
                }
            }
        } catch (error: unknown) {
            LOGGER.error(`Failed to check if discid ${discid} is in MusicBrainz database`, error);
        }

        // Display the result
        const htmlElement = createDiscIdLink(discid, mbTocNumbers, artistName, releaseName, found);
        LOGGER.debug(`#${getElementIdForResultDisplay(discNumber)}`);
        document.getElementById(getElementIdForResultDisplay(discNumber))?.appendChild(htmlElement);
    }
};
