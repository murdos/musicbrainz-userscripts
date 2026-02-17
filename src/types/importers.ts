export interface ArtistCredit {
    credited_name?: string;
    artist_name: string;
    mbid?: string;
    joinphrase?: string;
}

export interface Label {
    name: string;
    mbid?: string;
    catno?: string;
}

export interface URL {
    url: string;
    link_type: number;
}

export interface Track {
    number?: number;
    title: string;
    duration?: number | string;
    artist_credit: ArtistCredit[];
}

export interface Disc {
    title?: string;
    format: string;
    tracks: Track[];
}

export interface Release {
    title: string;
    artist_credit: ArtistCredit[];
    type?: string;
    status?: string; // TODO: should be enum
    secondary_types?: string[];
    language?: string; // TODO: should be enum
    script?: string; // TODO: should be enum
    packaging?: string; // TODO: should be enum
    country?: string; // TODO: should be enum
    year?: number;
    month?: number;
    day?: number;
    labels?: Label[];
    barcode?: string;
    comment?: string;
    annotation?: string;
    urls?: URL[];
    discs: Disc[];
    release_group_mbid?: string;
    format?: string; // TODO: should be enum
}
