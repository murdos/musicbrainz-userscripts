import { guessReleaseType, type MBReleaseType } from '~/lib/mbimport/guessReleaseType';
import { makeArtistCredits } from '~/lib/mbimport/makeArtistCredits';
import { URL_TYPES } from '~/lib/mbimport/urlTypes';
import type { Release, Track, URL } from '~/types/importers';

import type { MirloTrack, MirloTrackGroup, ParsedMirloRelease } from './types';

function parseDate(value: string | null | undefined): Pick<Release, 'year' | 'month' | 'day'> {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    if (!match) return {};

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    };
}

function mapReleaseType(type: string | null | undefined): MBReleaseType {
    switch (type?.trim().toLocaleLowerCase()) {
        case 'album':
        case 'lp':
            return 'album';
        case 'ep':
        case 'e.p.':
            return 'EP';
        case 'single':
            return 'single';
        default:
            return '';
    }
}

function trackArtistNames(track: MirloTrack, fallbackArtist: string): string[] {
    const artists = [...(track.trackArtists ?? [])]
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .filter(artist => artist.artistName?.trim())
        .map(artist => ({ name: artist.artistName!.trim(), isCoAuthor: artist.isCoAuthor }));
    const coAuthors = artists.filter(artist => artist.isCoAuthor);
    return (coAuthors.length > 0 ? coAuthors : artists).map(artist => artist.name).concat(artists.length === 0 ? [fallbackArtist] : []);
}

function durationInMilliseconds(track: MirloTrack): number | undefined {
    const seconds = track.audio?.duration;
    return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

function commonLicenseUrl(tracks: MirloTrack[]): string | undefined {
    if (tracks.length === 0) return undefined;
    const links = tracks.map(track => track.license?.link?.trim()).filter((link): link is string => Boolean(link));
    if (links.length !== tracks.length || new Set(links).size !== 1) return undefined;
    return links[0];
}

function buildAnnotation(trackGroup: MirloTrackGroup): string | undefined {
    const genres = [...new Set((trackGroup.tags ?? []).map(tag => tag.trim()).filter(Boolean))].join(', ');
    const sections = [
        ['Credits', trackGroup.credits],
        ['About', trackGroup.about],
        ['Genres', genres],
    ].flatMap(([heading, content]) => {
        const trimmedContent = content?.trim().replaceAll('\r', '') ?? '';
        return trimmedContent ? [`=== ${heading} from Mirlo ===`, trimmedContent] : [];
    });
    if (sections.length === 0) return undefined;
    return sections.join('\n\n').replaceAll('[', '&#91;').replaceAll(']', '&#93;');
}

export function parseMirloRelease(releaseUrl: string, trackGroup: MirloTrackGroup): ParsedMirloRelease {
    const sourceTracks = [...trackGroup.tracks].sort((left, right) => left.order - right.order);
    const tracks: Track[] = sourceTracks.map(track => {
        const mbTrack: Track = {
            artist_credit: makeArtistCredits(trackArtistNames(track, trackGroup.artist.name)),
            title: track.title,
            number: track.order,
        };
        const duration = durationInMilliseconds(track);
        if (duration !== undefined) mbTrack.duration = duration;
        return mbTrack;
    });
    const durations = tracks.map(track => (typeof track.duration === 'number' ? track.duration : Number.NaN));
    const completeDuration = durations.every(Number.isFinite) ? durations.reduce((total, duration) => total + duration, 0) : Number.NaN;
    const urls: URL[] = trackGroup.isGettable ? [{ url: releaseUrl, link_type: URL_TYPES.purchase_for_download }] : [];
    const licenseUrl = commonLicenseUrl(sourceTracks);
    if (licenseUrl) urls.push({ url: licenseUrl, link_type: URL_TYPES.license });

    const explicitType = mapReleaseType(trackGroup.type);
    const annotation = buildAnnotation(trackGroup);
    const release: Release = {
        artist_credit: makeArtistCredits([trackGroup.artist.name]),
        title: trackGroup.title,
        ...parseDate(trackGroup.releaseDate ?? trackGroup.publishedAt),
        ...(annotation ? { annotation } : {}),
        packaging: 'None',
        country: 'XW',
        status: 'official',
        type:
            explicitType ||
            guessReleaseType(
                trackGroup.title,
                tracks.length,
                completeDuration,
                tracks.map(track => track.title),
            ),
        urls,
        discs: [{ format: 'Digital Media', tracks }],
    };

    return {
        release,
        isrcs: sourceTracks.map(track => track.isrc?.trim() || null),
    };
}
