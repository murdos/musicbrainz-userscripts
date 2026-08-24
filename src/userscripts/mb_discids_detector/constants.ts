import { Logger, LogLevel } from '~/lib/logger';

export const MB_BASE_URL = 'https://musicbrainz.org';
export const MB_API_URL = (discid: string) => `${MB_BASE_URL}/ws/2/discid/${discid}?cdstubs=no`;

export const GAZELLE_HOST_PATTERN = /orpheus\.network|redacted\.sh|lztr\.me|notwhat\.cd/;
export const BB_FORUM_HOST_PATTERN = /rutracker\.(me|org)|new-team\.org|nnmclub\.to/;

export const LOGGER = new Logger('mb_discids_detector', LogLevel.INFO);
