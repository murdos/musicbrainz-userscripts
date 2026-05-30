export function makeEditNote(
    release_url: string,
    importer_name: string,
    format?: string,
    home: string = 'https://github.com/murdos/musicbrainz-userscripts',
): string {
    return `Imported from ${release_url}${format ? ` (${format})` : ''} using ${importer_name} import script from ${home}`;
}
