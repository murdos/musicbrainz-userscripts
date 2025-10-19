export default {
    name: 'Import Beatport releases to MusicBrainz',
    description: 'One-click importing of releases from beatport.com/release pages into MusicBrainz',
    version: '2025.09.28',
    author: 'VxJasonxV',
    namespace: 'https://github.com/murdos/musicbrainz-userscripts/',
    downloadURL: 'https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js',
    updateURL: 'https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/dist/beatport_importer.user.js',
    match: ['https://www.beatport.com/release/*'],
    require: ['https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js'],
    icon: 'https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png',
};
