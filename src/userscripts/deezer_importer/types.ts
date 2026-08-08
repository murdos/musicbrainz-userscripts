import type { Release } from '../../types/importers';

export type DeezerErrorType =
    | 'Exception'
    | 'OAuthException'
    | 'ParameterException'
    | 'MissingParameterException'
    | 'InvalidQueryException'
    | 'DataException'
    | 'IndividualAccountChangedNotAllowedException';

export interface DeezerApiError {
    code: number;
    message: string;
    type: DeezerErrorType;
}

export interface DeezerGenre {
    id: number;
    name: string;
    picture?: string;
    type?: string;
}

export interface DeezerContributor {
    id: number;
    name: string;
    link?: string;
    share?: string;
    picture?: string;
    picture_small?: string;
    picture_medium?: string;
    picture_big?: string;
    picture_xl?: string;
    radio?: boolean;
    tracklist?: string;
    type?: string;
    role?: string;
}

export interface DeezerArtist {
    id: number;
    name: string;
    link?: string;
    share?: string;
    picture?: string;
    picture_small?: string;
    picture_medium?: string;
    picture_big?: string;
    picture_xl?: string;
    radio?: boolean;
    tracklist?: string;
    type?: string;
    nb_album?: number;
    nb_fan?: number;
}

export interface DeezerTrack {
    id: number;
    readable?: boolean;
    title: string;
    title_short: string;
    title_version?: string;
    link?: string;
    share?: string;
    duration: number; // Duration in seconds
    rank?: number | string;
    explicit_lyrics?: boolean;
    explicit_content_lyrics?: number;
    explicit_content_cover?: number;
    preview?: string;
    bpm?: number;
    gain?: number;
    available_countries?: string[];
    md5_image?: string;
    artist: DeezerArtist;
    contributors?: DeezerContributor[];
    type?: string;
    isrc?: string | null;
    track_position: number;
    disk_number: number;
}

export interface DeezerTracksResponse {
    data: DeezerTrack[];
    total: number;
    next?: string;
    prev?: string;
    error?: DeezerApiError;
}

export interface DeezerAlbum {
    id: number;
    title: string;
    upc?: string;
    link?: string;
    share?: string;
    cover?: string;
    cover_small?: string;
    cover_medium?: string;
    cover_big?: string;
    cover_xl?: string;
    md5_image?: string;
    genre_id?: number;
    genres?: {
        data: DeezerGenre[];
    };
    label?: string;
    nb_tracks?: number;
    duration?: number;
    fans?: number;
    rating?: number;
    release_date: string;
    record_type: string;
    available?: boolean;
    tracklist?: string;
    explicit_lyrics?: boolean;
    explicit_content_lyrics?: number;
    explicit_content_cover?: number;
    contributors?: DeezerContributor[];
    artist?: DeezerArtist;
    type?: string;
    tracks: {
        data: DeezerTrack[];
        total?: number;
    };
    error?: DeezerApiError;
}

export interface ParsedDeezerRelease {
    release: Release;
    isrcs: (string | null)[];
    barcode?: string | undefined;
}
