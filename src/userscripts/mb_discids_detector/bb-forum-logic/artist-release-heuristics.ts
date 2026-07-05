const EAC_LOG_HEADER_PATTERN = String.raw`(?:EAC extraction logfile|EAC Auslese-Logdatei|Отч(?:е|ё)т EAC об извлечении|Звіт EAC про видобування)`;

export const EAC_LOG_PATTERN = new RegExp(EAC_LOG_HEADER_PATTERN, 'i');

const EAC_LOG_ARTIST_RELEASE_PATTERN = new RegExp(String.raw`${EAC_LOG_HEADER_PATTERN}[^\n]*\n\s*(.+?)\s*\/\s*(.+?)(?:\n|$)`, 'i');

type ReturnType = {
    artistName: string;
    releaseName: string;
} | null;

export const parseArtistReleaseFromEacLog = (logText: string): ReturnType => {
    const match = EAC_LOG_ARTIST_RELEASE_PATTERN.exec(logText);
    if (!match) {
        return null;
    }

    let artistName = match[1]?.trim() ?? '';
    let releaseName = match[2]?.trim() ?? '';

    if (artistName.toLowerCase() === 'unknown artist' || releaseName.toLowerCase() === 'unknown title') {
        artistName = '';
    }
    if (releaseName.toLowerCase() === 'unknown title' || releaseName.toLowerCase() === 'неизвестное название') {
        releaseName = '';
    }

    return {
        artistName,
        releaseName,
    };
};

const LABEL_PACK_PATTERN = /(?:Sub)*Label(?:: | - | Pack)/i;
const COLLECTION_PATTERN_V1 =
    /^(.+?)(?:\s+\([^)]*\))?\s+[-/]\s+(?:Official\s+|\d+\s+Releases\s+|Официальная\s+)*(?:Discography|Дискография)/i;
const COLLECTION_PATTERN_V2 =
    /^(.+?)(?:\s+\([^)]*\))?\s+[-/]\s+(?:Официальная\s+|Official\s+|Official\sSoundtrack\s+)*(?:Collection|Коллекция)/i;

const YEAR_PATTERN = String.raw`(?:19|20)\d{2}|197\?`;
const YEAR_RANGE_PATTERN = String.raw`(?:${YEAR_PATTERN})\s*-\s*(?:${YEAR_PATTERN})`;

// Artist - Release - 2026
// Artist - Release - 1957 (1999 Japan Edition)
const ARTIST_RELEASE_DASH_YEAR_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?)\s+-\s+(${YEAR_PATTERN})(?:\b|[,\s(])`, 'i');

// Artist - Release - 1982 - 2026
const ARTIST_RELEASE_DASH_YEAR_RANGE_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?)\s+-\s+(${YEAR_RANGE_PATTERN})(?:\b|[,\s(])`, 'i');

// Artist - Release (2024)
const ARTIST_RELEASE_PAREN_YEAR_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?)\s+\((${YEAR_PATTERN})\)(?:\b|[,\s\[])`, 'i');

// Artist - Release, 2000-2016
// Artist - Release, 1963 -2007
const ARTIST_RELEASE_COMMA_YEAR_RANGE_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?),\s*(${YEAR_RANGE_PATTERN})(?:\b|[,\s\[])`, 'i');

// Artist - Release, 2025
const ARTIST_RELEASE_COMMA_YEAR_PATTERN = new RegExp(String.raw`^(.+?)\s+-\s+(.+?),\s*(${YEAR_PATTERN})(?:\b|[,\s\[])`, 'i');

// Artist - Release [FLAC|...]
const ARTIST_RELEASE_BEFORE_FORMAT_BLOCK_PATTERN = /^(.+?)\s+-\s+(.+?)\s+\[[^\]]+\]/i;

// Last-resort fallback: Artist - Release
const ARTIST_RELEASE_FALLBACK_PATTERN = /^(.+?)\s+-\s+(.+?)(?:,|\[|$)/i;

const normalizeForumTopicTitle = (title: string): string => {
    return title
        .replace(/[–—-]/g, '-') // normalize dash variants
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim()
        .replace(/^(?:\([^)]+\)\s*)+/, '') // strip leading genre parentheses: (Rock, Pop)
        .replace(/^(?:\[[^\]]+\]\s*)+/, '') // strip leading format tags: [CD], [24/192], [LP/MB/DAT]
        .trim();
};

const cleanParsedValue = (value: string): string => {
    return value
        .replace(/\s+/g, ' ')
        .replace(/\s+[-/]\s*$/, '')
        .trim();
};

type ParsedForumPostRelease = {
    artistName: string;
    releaseName: string;
};

const tryMatchArtistRelease = (title: string, patterns: RegExp[]): ParsedForumPostRelease | null => {
    for (const pattern of patterns) {
        const match = title.match(pattern);

        if (!match) {
            continue;
        }

        const artistName = cleanParsedValue(match[1] ?? '');
        const releaseName = cleanParsedValue(match[2] ?? '');

        if (artistName || releaseName) {
            return {
                artistName,
                releaseName,
            };
        }
    }

    return null;
};

export const parseArtistReleaseFromForumPost = (): { artistName: string; releaseName: string } => {
    const pageHeader = document.querySelector('h1.maintitle a, h1 a.maintitle');
    const pageTitle = document.title.replace(/\s*(::|•).*$/s, '');

    const title = normalizeForumTopicTitle(pageHeader?.textContent ?? pageTitle);

    // Label packs are not artist releases.
    const isLabelPack = LABEL_PACK_PATTERN.test(title);
    if (isLabelPack) {
        // Abandon parsing since we can't reliably determine the artist and release name
        return {
            artistName: '',
            releaseName: '',
        };
    }

    const isCollectionV1 = title.match(COLLECTION_PATTERN_V1);
    const isCollectionV2 = title.match(COLLECTION_PATTERN_V2);
    if (isCollectionV1 || isCollectionV2) {
        const artistName = isCollectionV1?.[1]?.trim() ?? isCollectionV2?.[1]?.trim() ?? '';
        return {
            artistName,
            releaseName: '',
        };
    }

    const parsed = tryMatchArtistRelease(title, [
        ARTIST_RELEASE_DASH_YEAR_RANGE_PATTERN,
        ARTIST_RELEASE_DASH_YEAR_PATTERN,
        ARTIST_RELEASE_PAREN_YEAR_PATTERN,
        ARTIST_RELEASE_COMMA_YEAR_RANGE_PATTERN,
        ARTIST_RELEASE_COMMA_YEAR_PATTERN,
        ARTIST_RELEASE_BEFORE_FORMAT_BLOCK_PATTERN,
        ARTIST_RELEASE_FALLBACK_PATTERN,
    ]);

    return (
        parsed ?? {
            artistName: '',
            releaseName: '',
        }
    );
};
