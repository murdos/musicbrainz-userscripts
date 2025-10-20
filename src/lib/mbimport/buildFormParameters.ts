import type { ArtistCredit, Release } from '~/types/importers';
import type { FormParameter } from '~/lib/shared/search-params';
import { appendParameter } from '~/lib/shared/search-params';
import { hmsToMilliSeconds } from '~/lib/shared/time-functions';
import { guessReleaseType } from './guessReleaseType';

function buildArtistCreditsFormParameters(parameters: FormParameter[], paramPrefix: string, artist_credit: ArtistCredit[]): void {
    for (let i = 0; i < artist_credit.length; i++) {
        const ac = artist_credit[i];
        if (ac) {
            appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.name`, ac.credited_name || '');
            appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.artist.name`, ac.artist_name);
            if (ac.mbid) appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.mbid`, ac.mbid);
            if (typeof ac.joinphrase != 'undefined' && ac.joinphrase != '') {
                appendParameter(parameters, `${paramPrefix}artist_credit.names.${i}.join_phrase`, ac.joinphrase);
            }
        }
    }
}

// build form POST parameters that MB is expecting
export function buildFormParameters(release: Release, edit_note?: string): FormParameter[] {
    // Form parameters
    const parameters: FormParameter[] = [];
    appendParameter(parameters, 'name', release.title);

    // Release Artist credits
    buildArtistCreditsFormParameters(parameters, '', release.artist_credit);

    if (release['secondary_types']) {
        for (let i = 0; i < release.secondary_types.length; i++) {
            const secondaryType = release.secondary_types[i];
            if (secondaryType) {
                appendParameter(parameters, 'type', secondaryType);
            }
        }
    }
    if (release.status) appendParameter(parameters, 'status', release.status);
    if (release.language) appendParameter(parameters, 'language', release.language);
    if (release.script) appendParameter(parameters, 'script', release.script);
    if (release.packaging) appendParameter(parameters, 'packaging', release.packaging);

    // ReleaseGroup
    if (release.release_group_mbid) appendParameter(parameters, 'release_group', release.release_group_mbid);

    // Date + country
    if (release.country) appendParameter(parameters, 'country', release.country);
    if (!isNaN(release.year || 0) && release.year != 0) {
        appendParameter(parameters, 'date.year', release.year!);
    }
    if (!isNaN(release.month || 0) && release.month != 0) {
        appendParameter(parameters, 'date.month', release.month!);
    }
    if (!isNaN(release.day || 0) && release.day != 0) {
        appendParameter(parameters, 'date.day', release.day!);
    }

    // Barcode
    if (release.barcode) appendParameter(parameters, 'barcode', release.barcode);

    // Disambiguation comment
    if (release.comment) appendParameter(parameters, 'comment', release.comment);

    // Annotation
    if (release.annotation) appendParameter(parameters, 'annotation', release.annotation);

    // Label + catnos
    if (Array.isArray(release.labels)) {
        for (let i = 0; i < release.labels.length; i++) {
            const label = release.labels[i];
            if (label) {
                appendParameter(parameters, `labels.${i}.name`, label.name);
                if (label.mbid) appendParameter(parameters, `labels.${i}.mbid`, label.mbid);
                if (label.catno && label.catno != 'none') {
                    appendParameter(parameters, `labels.${i}.catalog_number`, label.catno);
                }
            }
        }
    }

    // URLs
    if (Array.isArray(release.urls)) {
        for (let i = 0; i < release.urls.length; i++) {
            const url = release.urls[i];
            if (url) {
                appendParameter(parameters, `urls.${i}.url`, url.url);
                appendParameter(parameters, `urls.${i}.link_type`, url.link_type);
            }
        }
    }

    // Mediums
    let total_tracks = 0;
    let total_tracks_with_duration = 0;
    let total_duration = 0;
    for (let i = 0; i < release.discs.length; i++) {
        const disc = release.discs[i];
        if (disc) {
            appendParameter(parameters, `mediums.${i}.format`, disc.format);
            if (disc.title) appendParameter(parameters, `mediums.${i}.name`, disc.title);

            // Tracks
            for (let j = 0; j < disc.tracks.length; j++) {
                const track = disc.tracks[j];
                if (track) {
                    total_tracks++;
                    if (track.number) appendParameter(parameters, `mediums.${i}.track.${j}.number`, track.number);
                    appendParameter(parameters, `mediums.${i}.track.${j}.name`, track.title);
                    let tracklength = '?:??';
                    const duration_ms = hmsToMilliSeconds(track.duration);
                    if (!isNaN(duration_ms)) {
                        tracklength = duration_ms.toString();
                        total_tracks_with_duration++;
                        total_duration += duration_ms;
                    }
                    appendParameter(parameters, `mediums.${i}.track.${j}.length`, tracklength);
                    // @ts-expect-error TODO: recording is not a property of Track and in no importer scripts a recording is found in a track. Once all scripts are migrated, we need to see if we can remove this line entirely.
                    if (track.recording) appendParameter(parameters, `mediums.${i}.track.${j}.recording`, track.recording); // eslint-disable-line @typescript-eslint/no-unsafe-argument
                    buildArtistCreditsFormParameters(parameters, `mediums.${i}.track.${j}.`, track.artist_credit);
                }
            }
        }
    }

    // Guess release type if not given
    if (!release.type && release.title && total_tracks == total_tracks_with_duration) {
        release.type = guessReleaseType(release.title, total_tracks, total_duration);
    }
    if (release.type) appendParameter(parameters, 'type', release.type);

    // Add Edit note parameter
    if (edit_note) appendParameter(parameters, 'edit_note', edit_note);

    return parameters;
}
