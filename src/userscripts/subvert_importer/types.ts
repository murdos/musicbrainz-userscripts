export interface SubvertArtist {
    name: string;
}

export interface SubvertLabel {
    name: string;
}

export interface SubvertLabelOnRelease {
    label: SubvertLabel;
    catalogNumber: string;
}

export interface SubvertTrackDetails {
    name: string;
    duration: number;
    artists: SubvertArtist[];
}

export interface SubvertTrack {
    track: SubvertTrackDetails;
}

export interface SubvertRelease {
    name: string;
    releaseType: string;
    releaseDate: string;
    artists: SubvertArtist[];
    labelsOnReleases: SubvertLabelOnRelease[];
    tracks: SubvertTrack[];
    isDownloadAllowed: boolean;
    isStreamingAllowed: boolean;
    priceCents: number;
}

export interface SubvertPageProps {
    release: SubvertRelease;
}

export interface SubvertNextData {
    page: string;
    props: {
        pageProps: SubvertPageProps;
    };
}
