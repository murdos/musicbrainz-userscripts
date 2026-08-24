import { LOGGER } from '../constants';
import { analyzeLogFiles } from '../utils/analyse-log-files';
import { checkAndDisplayDiscs } from '../utils/check-and-display-disks';
import { getElementTextWithLineBreaks } from '../utils/get-element-text-with-line-breaks';
import { EAC_LOG_PATTERN, parseArtistReleaseFromEacLog, parseArtistReleaseFromForumPost } from './artist-release-heuristics';

interface ProcessInlineEacLogProps {
    pre: Element;
    logIndex: number;
    fallbackArtist: string;
    fallbackRelease: string;
}

const processInlineEacLog = async ({ pre, logIndex, fallbackArtist, fallbackRelease }: ProcessInlineEacLogProps): Promise<void> => {
    const logText = getElementTextWithLineBreaks(pre);
    const fromLog = parseArtistReleaseFromEacLog(logText);
    const artistName = fromLog?.artistName || fallbackArtist;
    const releaseName = fromLog?.releaseName || fallbackRelease;
    const elementPrefix = `mb_discid_${logIndex}`;

    const discs = await analyzeLogFiles([pre]);
    LOGGER.debug('Number of disc found in inline log', discs.length);
    if (discs.length === 0) {
        return;
    }

    pre.insertAdjacentHTML('afterend', `<div class="mb-discids-detector" style="margin-top: 0.5em;"></div>`);
    const targetContainer = pre.nextElementSibling;

    await checkAndDisplayDiscs({
        artistName,
        releaseName,
        discs,
        displayDiscHandler: (_mbTocNumbers, _discid, discNumber) => {
            targetContainer?.insertAdjacentHTML(
                'beforeend',
                `<div><strong>${discs.length > 1 ? `Disc ${discNumber}: ` : ''}MB DiscId: </strong><span id="${elementPrefix}_disc${discNumber}"></span></div>`,
            );
        },
        getElementIdForResultDisplay: discNumber => `${elementPrefix}_disc${discNumber}`,
    });
};

export const bbForumPageHandler = async (): Promise<void> => {
    const { artistName, releaseName } = parseArtistReleaseFromForumPost();
    LOGGER.debug('artist:', artistName, '- releaseName:', releaseName);

    const eacLogs = [...document.querySelectorAll('pre')].filter(preElement => EAC_LOG_PATTERN.test(preElement.textContent));
    LOGGER.info(`Found ${eacLogs.length} inline EAC log(s)`);

    for (let i = 0; i < eacLogs.length; i++) {
        const pre = eacLogs[i];
        if (!pre) {
            continue;
        }
        await processInlineEacLog({ pre, logIndex: i, fallbackArtist: artistName, fallbackRelease: releaseName });
    }
};
