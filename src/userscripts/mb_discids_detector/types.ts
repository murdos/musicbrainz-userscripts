export type LogAction = 'viewlog' | 'loglist' | 'log_ajax';

export interface TocEntry {
    trackNumber: string;
    timeStart: string;
    timeLength: string;
    startSector: string;
    endSector: string;
}

export type DisplayDiscHandler = (mbTocNumbers: number[], discid: string, discNumber: number) => void;

export type DisplayResultHandler = (mbTocNumbers: number[], discid: string, discNumber: number, found: boolean) => void;

export interface DiscIdLookupResponse {
    error?: string;
}
