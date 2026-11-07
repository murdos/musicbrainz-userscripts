export interface AmpwallArtist {
    name: string;
}

export interface AmpwallAlbumRelease {
    name: string;
}

export interface AmpwallTrack {
    name: string;
    duration: string;
}

export interface AmpwallTrackList {
    itemListElement: AmpwallTrack[];
}

export interface AmpwallReleaseData {
    byArtist: AmpwallArtist;
    albumRelease: AmpwallAlbumRelease[];
    track: AmpwallTrackList;
    datePublished: string;
    url: string;
}
