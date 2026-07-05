import { LOGGER } from '../constants';
import type { LogAction } from '../types';
import { analyzeLogFiles } from '../utils/analyse-log-files';
import { checkAndDisplayDiscs } from '../utils/check-and-display-disks';

interface ResolveLogActionProps {
    onclick: string;
    serverHost: string;
}

const resolveLogAction = ({ onclick, serverHost }: ResolveLogActionProps): LogAction | null => {
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
};

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
    const logAction = resolveLogAction({ onclick, serverHost });
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
                artistName,
                releaseName,
                discs,
                displayDiscHandler: (_mbTocNumbers, _discid, discNumber) => {
                    targetContainer?.insertAdjacentHTML(
                        'beforeend',
                        `<br /><strong>${
                            discs.length > 1 ? `Disc ${discNumber}: ` : ''
                        }MB DiscId: </strong><span id="${torrentId}_disc${discNumber}"></span>`,
                    );
                },
                getElementIdForResultDisplay: discNumber => `${torrentId}_disc${discNumber}`,
            });
        })
        .catch((err: unknown) => {
            LOGGER.error('Failed to fetch log', logUrl, err);
        });
}

const parseReleaseInfo = (serverHost: string): { artistName: string; releaseName: string } => {
    const titleAndArtists = document.querySelector('#content div.thin h2')?.textContent ?? '';

    const regularPattern = /(.*) - (.*) \[.*\] \[.*/;
    const orpheusPattern = /(.*) [-–] (.*) \[.*\]( \[.*)?/;

    const pattern = serverHost.match(/orpheus/) ? orpheusPattern : regularPattern;

    const match = titleAndArtists.match(pattern);

    return {
        artistName: match?.[1] ?? '',
        releaseName: match?.[2] ?? '',
    };
};

export const gazellePageHandler = (): void => {
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
};
