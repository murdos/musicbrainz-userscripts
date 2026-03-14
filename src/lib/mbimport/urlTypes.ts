export const URL_TYPES = {
    purchase_for_download: 74,
    download_for_free: 75,
    discogs: 76,
    purchase_for_mail_order: 79,
    other_databases: 82,
    stream_for_free: 85,
    license: 301,
} as const satisfies Record<string, number>;
