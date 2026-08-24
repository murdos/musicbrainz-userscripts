export type MBReleaseType = '' | 'single' | 'EP' | 'album';

const VERSION_MARKER =
    /\b(?:acoustic|clean|club|demo|dub|edit|explicit|extended|instrumental|karaoke|live|mix|mono|radio|remaster(?:ed)?|remix|stereo|version|vocal)\b/i;

/** Remove version information while retaining the actual work title. */
function normalizeTrackTitle(title: string): string {
    let normalized = title.normalize('NFKC').toLocaleLowerCase();

    // Remove bracketed qualifiers such as "(Jane Doe Remix)" or "[Live]".
    normalized = normalized.replace(/\s*[([{]([^\])}]*?)[\])}]/g, (match, contents: string) =>
        VERSION_MARKER.test(contents) ? '' : match,
    );

    // Also support unbracketed suffixes such as " - Radio Edit".
    normalized = normalized.replace(/\s*[-–—:]\s*([^\n]*)$/, (match, suffix: string) => (VERSION_MARKER.test(suffix) ? '' : match));

    return normalized
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function isMultiTrackSingle(numTracks: number, trackTitles: readonly string[]): boolean {
    if (
        !Array.isArray(trackTitles) ||
        numTracks < 2 ||
        trackTitles.length !== numTracks ||
        trackTitles.some(title => typeof title !== 'string')
    ) {
        return false;
    }

    const normalizedTitles = trackTitles.map(normalizeTrackTitle);
    return normalizedTitles.every(title => title.length > 0 && title === normalizedTitles[0]);
}

/**
 * Guess a primary release type in descending order of confidence:
 *
 * 1. Reject invalid track counts.
 * 2. Honor an explicit "EP" token in the release title. It takes precedence over every other signal, including "Single" and version-title deduplication.
 * 3. Honor an explicit "Single" token when the release remains within broad track count and duration guards. Unlike "EP", "single" is common English text and therefore needs basic false-positive protection.
 * 4. Normalize track titles by removing technical version qualifiers such as "Remix", "Instrumental", "Edit", "Live", and "Version". If every track then has the same non-empty title, classify the release as a multi-track Single.
 * 5. If duration is missing, use track count only where it is reasonably decisive: one track is a Single, three to six tracks is an EP, and seven or more tracks is an album. Leave two tracks unclassified because both Singles and electronic EPs commonly have two tracks.
 * 6. With duration available, seven or more tracks or more than 30 minutes is an album. For releases with fewer than seven tracks, one to seven minutes is a Single; more than seven and up to 30 minutes with at least two tracks is an EP. Leave sub-minute releases and one-track releases between seven and 30 minutes unclassified rather than making a weak guess.
 *
 * `durationMs` is the complete release duration. Pass NaN when one or more track durations are unavailable. `trackTitles` must contain every track title for the multi-track Single check to apply.
 */
export function guessReleaseType(title: string, numTracks: number, durationMs: number, trackTitles: readonly string[] = []): MBReleaseType {
    if (!Number.isInteger(numTracks) || numTracks < 1) return '';

    const releaseTitle = typeof title === 'string' ? title : '';
    const hasSingle = /\bsingle\b/i.test(releaseTitle);
    const hasEP = /\bEP\b/i.test(releaseTitle);
    const hasDuration = Number.isFinite(durationMs) && durationMs > 0;
    const durationMinutes = hasDuration ? durationMs / 60_000 : Number.NaN;

    // "EP" is a comparatively unambiguous marketing token and takes precedence, including over track-title deduplication and a simultaneous "Single" token.
    if (hasEP) return 'EP';

    // "Single" is a common English word, so retain broad sanity limits. A missing duration is not evidence against an otherwise plausible explicit token.
    if (hasSingle && numTracks <= 8 && (!hasDuration || durationMinutes <= 50)) return 'single';

    // Remix/version bundles of one work are normally marketed as singles. Do this before count/duration heuristics so large remix bundles can still be detected.
    if (isMultiTrackSingle(numTracks, trackTitles)) return 'single';

    if (!hasDuration) {
        if (numTracks === 1) return 'single';
        if (numTracks >= 3 && numTracks <= 6) return 'EP';
        if (numTracks >= 7) return 'album';
        // A two-track release without duration can plausibly be a Single or an EP.
        return '';
    }

    // Track count is strong evidence for albums even when individual tracks are short.
    if (numTracks >= 7) return 'album';
    if (durationMinutes > 30) return 'album';
    if (durationMinutes < 1) return '';
    if (durationMinutes <= 7) return 'single';
    if (numTracks >= 2) return 'EP';

    // A long one-track release is album-like; 7..30 minutes remains too ambiguous.
    return '';
}
