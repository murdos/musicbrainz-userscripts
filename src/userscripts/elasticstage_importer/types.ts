/**
 * Types describing the subset of the elasticstage.com release data that the
 * importer relies on. The data is read out of the page's Vue component state;
 * only fields actually consumed by the script are typed, the state holds many
 * more.
 */

/** A single track within a release. */
export type ElasticStageTrack = {
    uuid: string;
    title: string;
    subtitle: string | null;
    /** 1-based physical side index (relevant for vinyl). */
    side: number;
    /** Duration in seconds (may be fractional). */
    duration: number;
    explicit: boolean;
    primary_artist: string;
    additional_artists: unknown[];
};

/** The product (medium) type backing a physical release. */
export type ElasticStageProductType = {
    /** e.g. "CD", "Vinyl". */
    medium: string;
    description: string;
    /** Number of physical sides (1 for CD, 2 for a single vinyl LP, ...). */
    sides: number;
};

/** Description of the release format, e.g. "CD | Album". */
export type ElasticStageReleaseType = {
    description: string;
    product_type: ElasticStageProductType;
    /** Primary type, e.g. "Album", "Single", "EP". */
    format: string;
};

/** A single purchasable physical release (one per format). */
export type ElasticStageRelease = {
    uuid: string;
    /** ISO 8601 date string. */
    release_date: string;
    year: string;
    ean: string;
    title: string;
    catalog_no: string;
    primary_artist: string;
    additional_artists: unknown[];
    explicit: boolean;
    label: string;
    track_count: number;
    /** Total playtime in seconds. */
    total_playtime: number;
    release_type: ElasticStageReleaseType;
    /** Tracks grouped by physical side. */
    tracks: ElasticStageTrack[][];
    is_limited_edition: boolean;
};
