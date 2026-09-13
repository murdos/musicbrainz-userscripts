import type { Release } from '~/types/importers';

export type MirloTrackArtist = {
    artistName?: string | null;
    isCoAuthor?: boolean;
    order?: number | null;
};

export type MirloLicense = {
    link?: string | null;
};

export type MirloTrack = {
    id: number;
    order: number;
    title: string;
    isrc?: string | null;
    audio?: {
        duration?: number | null;
    } | null;
    trackArtists?: MirloTrackArtist[];
    license?: MirloLicense | null;
};

export type MirloTrackGroup = {
    id: number;
    title: string;
    about?: string | null;
    credits?: string | null;
    tags?: string[];
    type?: string | null;
    releaseDate?: string | null;
    publishedAt?: string | null;
    isGettable: boolean;
    catalogNumber?: string | null;
    artist: {
        name: string;
    };
    tracks: MirloTrack[];
};

export type MirloTrackGroupResponse = {
    result: MirloTrackGroup;
};

export type ParsedMirloRelease = {
    release: Release;
    isrcs: (string | null)[];
};
