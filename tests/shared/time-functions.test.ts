import { describe, expect, it } from 'vitest';

import { hmsToMilliSeconds } from '../../src/lib/shared/time-functions';

describe('hmsToMilliSeconds', () => {
    it('converts MM:SS durations to milliseconds', () => {
        expect(hmsToMilliSeconds('06:50')).toBe(410_000);
    });

    it('converts HH:MM:SS durations to milliseconds', () => {
        expect(hmsToMilliSeconds('1:02:03')).toBe(3_723_000);
    });

    it('keeps numeric millisecond durations unchanged', () => {
        expect(hmsToMilliSeconds(410_000)).toBe(410_000);
    });

    it('returns NaN for missing or empty durations', () => {
        expect(hmsToMilliSeconds(undefined)).toBeNaN();
        expect(hmsToMilliSeconds(null)).toBeNaN();
        expect(hmsToMilliSeconds('')).toBeNaN();
        expect(hmsToMilliSeconds(NaN)).toBeNaN();
        expect(hmsToMilliSeconds('NaN')).toBeNaN();
        expect(hmsToMilliSeconds('random text')).toBeNaN();
    });
});
