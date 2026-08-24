// MBDiscid code comes from https://gist.github.com/kolen/766668
// Copyright 2010, kolen
// Released under the MIT License

import type { TocEntry } from '../types';

const PREGAP = 150;
const DATA_TRACK_GAP = 11400;

const TOC_ENTRY_MATCHER = new RegExp(
    '^\\s*' +
        '(\\d+)' + // 1 - track number
        '\\s*\\|\\s*' +
        '([0-9:.]+)' + // 2 - time start
        '\\s*\\|\\s*' +
        '([0-9:.]+)' + // 3 - time length
        '\\s*\\|\\s*' +
        '(\\d+)' + // 4 - start sector
        '\\s*\\|\\s*' +
        '(\\d+)' + // 5 - end sector
        '\\s*$',
);

function parseTocEntry(match: RegExpExecArray): TocEntry {
    return {
        trackNumber: match[1] ?? '',
        timeStart: match[2] ?? '',
        timeLength: match[3] ?? '',
        startSector: match[4] ?? '',
        endSector: match[5] ?? '',
    };
}

async function sha1MusicBrainzDiscId(message: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return b64.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-');
}

function getLayoutType(entries: TocEntry[]): 'standard' | 'with_data' | 'unknown' {
    let type: 'standard' | 'with_data' | 'unknown' = 'standard';
    for (let i = 0; i < entries.length - 1; i++) {
        const current = entries[i];
        const next = entries[i + 1];
        if (!current || !next) {
            continue;
        }
        const gap = parseInt(next.startSector, 10) - parseInt(current.endSector, 10) - 1;
        if (gap !== 0) {
            if (i === entries.length - 2 && gap === DATA_TRACK_GAP) {
                type = 'with_data';
            } else {
                type = 'unknown';
                break;
            }
        }
    }
    return type;
}

function logInputToEntries(text: string): TocEntry[][] {
    const discs: TocEntry[][] = [];
    let entries: TocEntry[] = [];

    for (const value of text.split('\n')) {
        const match = TOC_ENTRY_MATCHER.exec(value);
        if (!match) {
            continue;
        }
        if (parseInt(match[1] ?? '0', 10) === 1) {
            if (entries.length > 0) {
                discs.push(entries);
            }
            entries = [];
        }
        entries.push(parseTocEntry(match));
    }

    if (entries.length > 0) {
        discs.push(entries);
    }

    return discs.map(discEntries => {
        const layoutType = getLayoutType(discEntries);
        if (layoutType === 'with_data') {
            return discEntries.slice(0, discEntries.length - 1);
        }
        return discEntries;
    });
}

function calculateMbTocNumbers(entries: TocEntry[]): number[] | null {
    if (entries.length === 0) {
        return null;
    }

    const lastEntry = entries[entries.length - 1];
    if (!lastEntry) {
        return null;
    }

    const leadoutOffset = parseInt(lastEntry.endSector, 10) + PREGAP + 1;
    const offsets = entries.map(entry => parseInt(entry.startSector, 10) + PREGAP);
    return [1, entries.length, leadoutOffset, ...offsets];
}

function hexLeftPad(input: string | number, totalChars: number): string {
    let hex = parseInt(String(input), 10).toString(16).toUpperCase();
    const padWith = '0';
    while (hex.length < totalChars) {
        hex = `${padWith}${hex}`;
    }
    if (hex.length > totalChars) {
        // If padWith was a multiple character string and num was overpadded
        hex = hex.substring(hex.length - totalChars);
    }
    return hex;
}

async function calculateMbDiscid(entries: TocEntry[]): Promise<string> {
    const mbTocNumbers = calculateMbTocNumbers(entries);
    if (!mbTocNumbers) {
        throw new Error('Cannot calculate disc ID from empty TOC entries');
    }

    let message = '';
    const firstTrack = mbTocNumbers[0] ?? 0;
    const lastTrack = mbTocNumbers[1] ?? 0;
    const leadoutOffset = mbTocNumbers[2] ?? 0;
    message += hexLeftPad(firstTrack, 2);
    message += hexLeftPad(lastTrack, 2);
    message += hexLeftPad(leadoutOffset, 8);

    for (let i = 0; i < 99; i++) {
        const offset = i + 3 < mbTocNumbers.length ? (mbTocNumbers[i + 3] ?? 0) : 0;
        message += hexLeftPad(offset, 8);
    }

    return sha1MusicBrainzDiscId(message);
}

export const MBDiscid = {
    calculateMbDiscid,
    calculateMbTocNumbers,
    logInputToEntries,
};
