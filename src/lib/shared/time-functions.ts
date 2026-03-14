// convert HH:MM:SS or MM:SS to milliseconds
export function hmsToMilliSeconds(str: number | string | undefined): number {
    if (typeof str == 'undefined' || str === '' || isNaN(Number(str))) return NaN;
    if (typeof str == 'number') return str;
    const t = str.split(':');
    let s = 0;
    let m = 1;
    while (t.length > 0) {
        s += m * parseInt(t.pop()!, 10);
        m *= 60;
    }
    return s * 1000;
}

// convert ISO8601 duration (limited to hours/minutes/seconds) to milliseconds
// format looks like PT1H45M5.789S (note: floats can be used)
// https://en.wikipedia.org/wiki/ISO_8601#Durations
export function ISO8601toMilliSeconds(str: string): number {
    const regex = /^PT(?:(\d*\.?\d*)H)?(?:(\d*\.?\d*)M)?(?:(\d*\.?\d*)S)?$/;
    const m = str.replace(',', '.').match(regex);
    if (!m) return NaN;
    return (3600 * parseFloat(m[1] || '0') + 60 * parseFloat(m[2] || '0') + parseFloat(m[3] || '0')) * 1000;
}
