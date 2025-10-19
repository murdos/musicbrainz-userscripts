// Try to guess release type using number of tracks, title and total duration (in millisecs)
export function guessReleaseType(title: string, num_tracks: number, duration_ms: number): string {
    if (num_tracks < 1) return '';
    let has_single = !!title.match(/\bsingle\b/i);
    let has_EP = !!title.match(/\bEP\b/i);
    if (has_single && has_EP) {
        has_single = false;
        has_EP = false;
    }
    let perhaps_single = (has_single && num_tracks <= 4) || num_tracks <= 2;
    let perhaps_EP = has_EP || (num_tracks > 2 && num_tracks <= 6);
    let perhaps_album = num_tracks > 8;
    if (isNaN(duration_ms)) {
        // no duration, try to guess with title and number of tracks
        if (perhaps_single && !perhaps_EP && !perhaps_album) return 'single';
        if (!perhaps_single && perhaps_EP && !perhaps_album) return 'EP';
        if (!perhaps_single && !perhaps_EP && perhaps_album) return 'album';
        return '';
    }
    const duration_mn = duration_ms / (60 * 1000);
    if (perhaps_single && duration_mn >= 1 && duration_mn < 7) return 'single';
    if (perhaps_EP && duration_mn > 7 && duration_mn <= 30) return 'EP';
    if (perhaps_album && duration_mn > 30) return 'album';
    return '';
}
