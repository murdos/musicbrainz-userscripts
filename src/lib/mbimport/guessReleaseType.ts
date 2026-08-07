// Try to guess release type using number of tracks, title and total duration (in milliseconds)
// 1. If Single is explicitly mentioned in the title, use that as the release type, with some basic guards around track number and duration for Singles. The word "single" is very common in English so it is very easy to misclassify here.
// 2. If EP is explicitly mentioned in the title, use that as the release type without any medium guards. EP medium boundary is very loosely defined but thankfully the word itself is much rarer than the word "single" in English so it can be used directly.
// 3. If the title does not contain "single" or "EP", use some heuristics to guess the release type based on the number of tracks and duration.
// 3.1 For anything between 1 and 6 tracks and 1 to 30 minutes duration, guess "single".
// 3.2 For anything between 2 and 6 tracks and 2 to 70 minutes duration, guess "EP".
// 3.3 For anything with 7 or more tracks or 30 minutes or more duration, guess "album".
export function guessReleaseType(title: string, num_tracks: number, duration_ms: number): string {
    if (typeof num_tracks !== 'number' || isNaN(num_tracks) || num_tracks < 1) return '';

    const isDurationValid = !isNaN(duration_ms);
    const durationMinutes = duration_ms / 60_000;

    let has_single = !!title.match(/\bsingle\b/i);
    let has_EP = !!title.match(/\bEP\b/i);
    if (has_single && has_EP) {
        has_single = false;
        has_EP = false;
    } else if (has_single) {
        if (num_tracks <= 8 && isDurationValid && durationMinutes >= 0 && durationMinutes <= 50) {
            return 'single';
        }
    } else if (has_EP) {
        return 'EP';
    }

    const perhaps_single = num_tracks <= 6;
    const perhaps_EP = num_tracks >= 2 && num_tracks <= 6;
    const perhaps_album = num_tracks >= 7;

    // In both branches here try to match EP first since the 2..6 set is narrower than the 1..6 set.
    if (isDurationValid) {
        if (perhaps_EP && durationMinutes >= 2 && durationMinutes <= 70) return 'EP';
        if (perhaps_single && durationMinutes >= 1 && durationMinutes <= 30) return 'single';
        if (perhaps_album || durationMinutes >= 30) return 'album';
    } else {
        // no duration, try to guess by the number of tracks only.
        if (perhaps_EP) return 'EP';
        if (perhaps_single) return 'single';
        if (perhaps_album) return 'album';
    }

    return '';
}
