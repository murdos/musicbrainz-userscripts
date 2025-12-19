export type BeatportImage = {
    id: number;
    uri: string;
    dynamic_uri: string;
};

export type BeatportArtist = {
    id: number;
    name: string;
    slug: string;
    url: string;
    image: BeatportImage;
};

export type BeatportLabel = {
    id: number;
    name: string;
    slug: string;
    image: BeatportImage;
};

export type BeatportPrice = {
    code: string;
    symbol: string;
    value: number;
    display: string;
};

export type BeatportBpmRange = {
    min: number;
    max: number;
};

export type BeatportReleaseType = {
    id: number;
    name: string;
};

export type BeatportReleaseData = {
    id: number;
    name: string;
    new_release_date: string;
    publish_date: string;
    upc: string;
    catalog_number: string;
    track_count: number;
    tracks: string[];
    artists: BeatportArtist[];
    label: BeatportLabel;
    bpm_range: BeatportBpmRange;
    type: BeatportReleaseType;
    remixers: BeatportArtist[];
};

export type BeatportGenre = {
    id: number;
    name: string;
    slug: string;
    url: string;
};

export type BeatportCurrentStatus = {
    id: number;
    name: string;
    url: string;
};

export type BeatportSaleType = {
    id: number;
    name: string;
    url: string;
};

export type BeatportTrackData = {
    id: number;
    name: string;
    mix_name: string;
    length: string;
    length_ms: number;
    isrc: string;
    bpm: number;
    catalog_number: string;
    artists: BeatportArtist[];
    release: {
        id: number;
        name: string;
        label: BeatportLabel;
    };
    genre: BeatportGenre;
    sub_genre: BeatportGenre | null;
    price: BeatportPrice;
    remixers: BeatportArtist[];
    url?: string;
};

export type BeatportSSRState = {
    buildId?: string;
    props: BeatportPageData;
};

export type BeatportPageData = {
    pageProps: {
        release: BeatportReleaseData;
        dehydratedState: {
            queries: Array<{
                queryKey: string;
                state?: {
                    data: {
                        results: BeatportTrackData[];
                    };
                };
            }>;
        };
    };
};
