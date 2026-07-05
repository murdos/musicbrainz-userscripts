import { Logger, LogLevel } from '~/lib/logger';

import type { DiscIdLookupResponse, DisplayDiscHandler, DisplayResultHandler, LogAction, TocEntry } from './types';
import { analyzeLogFiles } from './utils/analyse-log-files';
import { MBDiscid } from './utils/mb-discid';

const LOGGER = new Logger('mb_discids_detector', LogLevel.INFO);

const MB_BASE_URL = 'https://musicbrainz.org';

const GAZELLE_HOST_PATTERN = /orpheus\.network|redacted\.sh|lztr\.me|notwhat\.cd/;

function computeAttachUrl(mbTocNumbers: number[], mbArtistName: string, mbReleaseName: string): string {
    const mbURL = new URL(`${MB_BASE_URL}/cdtoc/attach`);
    mbURL.searchParams.set('toc', mbTocNumbers.join(' '));
    mbURL.searchParams.set('artist-name', mbArtistName);
    mbURL.searchParams.set('release-name', mbReleaseName);
    return mbURL.toString();
}

interface CheckAndDisplayDiscsProps {
    discs: TocEntry[][];
    displayDiscHandler: DisplayDiscHandler;
    displayResultHandler: DisplayResultHandler;
}

async function checkAndDisplayDiscs({ discs, displayDiscHandler, displayResultHandler }: CheckAndDisplayDiscsProps): Promise<void> {
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

        void fetch(`${MB_BASE_URL}/ws/2/discid/${discid}?cdstubs=no`, {
            headers: { Accept: 'application/json' },
        })
            .then(response => {
                if (!response.ok) {
                    displayResultHandler(mbTocNumbers, discid, discNumber, false);
                    return null;
                }
                return response.json() as Promise<DiscIdLookupResponse>;
            })
            .then(data => {
                if (!data) {
                    return;
                }
                const existsInMusicbrainz = !('error' in data);
                displayResultHandler(mbTocNumbers, discid, discNumber, existsInMusicbrainz);
            })
            .catch(() => {
                displayResultHandler(mbTocNumbers, discid, discNumber, false);
            });
    }
}

function parseReleaseInfo(serverHost: string): { artistName: string; releaseName: string } {
    const titleAndArtists = document.querySelector('#content div.thin h2')?.textContent ?? '';

    const regularPattern = /(.*) - (.*) \[.*\] \[.*/;
    const orpheusPattern = /(.*) [-–] (.*) \[.*\]( \[.*)?/;

    const pattern = serverHost.match(/orpheus/) ? orpheusPattern : regularPattern;

    const match = titleAndArtists.match(pattern);

    return {
        artistName: match?.[1] ?? '',
        releaseName: match?.[2] ?? '',
    };
}

function resolveLogAction(onclick: string, serverHost: string): LogAction | null {
    if (onclick.match(/show_logs/)) {
        if (serverHost.match(/orpheus/)) {
            LOGGER.debug('Orpheus');
            return 'viewlog';
        }
        if (serverHost.match(/redacted/)) {
            LOGGER.debug('RED');
            return 'loglist';
        }
        return null;
    }
    if (onclick.match(/get_log/)) {
        LOGGER.debug('LzTR');
        return 'log_ajax';
    }
    if (onclick.match(/show_log/)) {
        LOGGER.debug('NotWhat.CD');
        return 'viewlog';
    }
    return null;
}

interface ProcessLogLinkProps {
    link: HTMLAnchorElement;
    artistName: string;
    releaseName: string;
    serverHost: string;
}

function processLogLink({ link, artistName, releaseName, serverHost }: ProcessLogLinkProps): void {
    if (!/View\s+Log/i.test(link.textContent)) {
        return;
    }

    LOGGER.debug('Log link', link);
    const onclick = link.getAttribute('onclick') ?? '';
    const logAction = resolveLogAction(onclick, serverHost);
    if (!logAction) {
        return;
    }

    const targetContainer = link.closest('.linkbox');
    const torrentIdMatch = /(show_logs|get_log|show_log)\('(\d+)/.exec(onclick);
    const torrentId = torrentIdMatch?.[2];
    if (!torrentId) {
        return;
    }

    const logUrl = `/torrents.php?action=${logAction}&torrentid=${torrentId}`;
    LOGGER.info('Log URL: ', logUrl);
    LOGGER.debug('targetContainer: ', targetContainer);

    void fetch(logUrl)
        .then(response => response.text())
        .then(async data => {
            const doc = new DOMParser().parseFromString(data, 'text/html');
            const pres = doc.querySelectorAll('pre');
            LOGGER.debug('Log content', pres);
            const discs = await analyzeLogFiles(pres);
            LOGGER.debug('Number of disc found', discs.length);

            await checkAndDisplayDiscs({
                discs,
                displayDiscHandler: (_mbTocNumbers, _discid, discNumber) => {
                    targetContainer?.insertAdjacentHTML(
                        'beforeend',
                        `<br /><strong>${
                            discs.length > 1 ? `Disc ${discNumber}: ` : ''
                        }MB DiscId: </strong><span id="${torrentId}_disc${discNumber}"></span>`,
                    );
                },
                displayResultHandler: (mbTocNumbers, discid, discNumber, found) => {
                    const url = computeAttachUrl(mbTocNumbers, artistName, releaseName);

                    const htmlElement = document.createElement('a');
                    htmlElement.href = url;
                    htmlElement.textContent = discid;
                    if (found) {
                        htmlElement.style.backgroundColor = '#d0f1d0';
                        htmlElement.style.color = 'rgb(30, 70, 32)';
                        htmlElement.style.border = '1px solid rgb(30, 70, 32)';
                        htmlElement.style.paddingInline = '3px';
                        htmlElement.style.borderRadius = '3px';
                    }

                    LOGGER.debug(`#${torrentId}_disc${discNumber}`);
                    document.getElementById(`${torrentId}_disc${discNumber}`)?.appendChild(htmlElement);
                },
            });
        })
        .catch((err: unknown) => {
            LOGGER.error('Failed to fetch log', logUrl, err);
        });
}

function gazellePageHandler(): void {
    const serverHost = window.location.host;
    const { artistName, releaseName } = parseReleaseInfo(serverHost);
    LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);

    for (const torrentRow of document.querySelectorAll('tr.group_torrent')) {
        if (!torrentRow.id) {
            continue;
        }
        const torrentInfo = torrentRow.nextElementSibling;
        if (!torrentInfo) {
            continue;
        }
        for (const link of torrentInfo.querySelectorAll('a')) {
            processLogLink({ link, artistName, releaseName, serverHost });
        }
    }
}

function init(): void {
    if (!window.location.host.match(GAZELLE_HOST_PATTERN)) {
        return;
    }

    LOGGER.info('Gazelle site detected');
    gazellePageHandler();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
