import type { BeatportPageData, BeatportSSRState } from '../types';
import { Logger } from '~/lib/logger';

export const getBeatportReleaseData = async (logger: Logger): Promise<BeatportPageData | null> => {
    const initialNextDataElement = document.getElementById('__NEXT_DATA__');
    if (!initialNextDataElement) {
        return null;
    }
    const data = JSON.parse(initialNextDataElement.innerHTML) as unknown as BeatportSSRState;

    const buildId = data.buildId;
    const initialReleaseId = data.props.pageProps.release.id.toString();
    const releaseIdFromURL = window.location.pathname.match(/release\/[^/]+\/(\d+)/)?.[1];

    if (!releaseIdFromURL) {
        return null;
    }
    if (releaseIdFromURL === initialReleaseId) {
        return data.props;
    } else if (releaseIdFromURL !== initialReleaseId) {
        const name_placeholder = '0'; // NextJS ignores this parameter
        const pageDataURL = `https://www.beatport.com/_next/data/${buildId}/en/release/${name_placeholder}/${releaseIdFromURL}.json`;
        try {
            const response = await fetch(pageDataURL);
            const pageData = (await response.json()) as unknown as BeatportPageData;
            return pageData;
        } catch (error) {
            logger.error('Error fetching release data:', error);
            return null;
        }
    }

    return null;
};
