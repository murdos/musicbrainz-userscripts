import type { ArtistCredit } from '~/types/importers';

interface SpecialArtists {
    [key: string]: {
        name: string;
        mbid: string;
    };
}

export const special_artists: SpecialArtists = {
    various_artists: {
        name: 'Various Artists',
        mbid: '89ad4ac3-39f7-470e-963a-56509c546377',
    },
    unknown: {
        name: '[unknown]',
        mbid: '125ec42a-7229-4250-afc5-e057484327fe',
    },
};

export function specialArtist(key: string, ac?: ArtistCredit): ArtistCredit {
    let joinphrase = '';
    if (typeof ac !== 'undefined') {
        joinphrase = ac.joinphrase || '';
    }
    const specialArtist = special_artists[key];
    if (!specialArtist) {
        throw new Error(`Unknown special artist: ${key}`);
    }
    return {
        artist_name: specialArtist.name,
        credited_name: '',
        joinphrase: joinphrase,
        mbid: specialArtist.mbid,
    };
}
