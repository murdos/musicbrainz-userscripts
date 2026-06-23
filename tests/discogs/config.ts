/** Discogs API release URLs to test. */
export const RELEASE_URLS = [
    'https://api.discogs.com/releases/1996829', // tracks grouped under a header track
    'https://api.discogs.com/releases/1156598', // unusual LP side track numbering
    'https://api.discogs.com/releases/5880212', // multi disc tracksets
    'https://api.discogs.com/releases/350350', // single header track
    'https://api.discogs.com/releases/15313328', // complex multi-disc tracksets
    'https://api.discogs.com/releases/3315779', // standard A/B sides LP
    'https://api.discogs.com/releases/15771199', // CD+CD+DVD
    'https://api.discogs.com/releases/1450895', // A/B+C/D with incorrectly nested subtracks
    'https://api.discogs.com/releases/8661943', // A/B+C/D with correctly nested subtracks
    'https://api.discogs.com/releases/16345092', // split track on second CD
] as const;
