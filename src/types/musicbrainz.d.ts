/** Partial MusicBrainz release editor types used by userscripts. */

export interface MBPartialDate {
    /** Empty string when not populated. */
    year: () => string;
    /** Number when populated, empty string otherwise. */
    month: () => number | string;
    /** Number when populated, empty string otherwise. */
    day: () => number | string;
}

export interface MBReleaseEvent {
    date: MBPartialDate;
}

export interface MBRelease {
    annotation: {
        (): string;
        (value: string): void;
    };
    events: () => MBReleaseEvent[];
}

export interface MBReleaseEditor {
    rootField: {
        release: () => MBRelease | null | undefined;
    };
}

export interface MusicBrainz {
    releaseEditor: MBReleaseEditor;
}

declare global {
    interface Window {
        MB?: MusicBrainz;
    }
}

export {};
