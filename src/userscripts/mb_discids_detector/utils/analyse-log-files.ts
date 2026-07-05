import type { TocEntry } from '../types';
import { getElementTextWithLineBreaks } from './get-element-text-with-line-breaks';
import { MBDiscid } from './mb-discid';

export async function analyzeLogFiles(logFiles: NodeListOf<Element> | Element[]): Promise<TocEntry[][]> {
    const discs: TocEntry[][] = [];

    for (const logFile of logFiles) {
        const logText = getElementTextWithLineBreaks(logFile);
        const discsInLog = MBDiscid.logInputToEntries(logText);
        discs.push(...discsInLog);
    }

    const seenDiscids = new Set<string>();
    const uniqueDiscs: TocEntry[][] = [];

    for (const disc of discs) {
        const discid = await MBDiscid.calculateMbDiscid(disc);
        if (seenDiscids.has(discid)) {
            continue;
        }
        seenDiscids.add(discid);
        uniqueDiscs.push(disc);
    }

    return uniqueDiscs;
}
