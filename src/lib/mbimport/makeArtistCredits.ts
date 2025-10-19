import type { ArtistCredit } from '~/types/importers';

// Convert a list of artists to a list of artist credits with joinphrases
export function makeArtistCredits(artists_list: string[]): ArtistCredit[] {
    let artists: ArtistCredit[] = artists_list.map(function (item) {
        return { artist_name: item };
    });
    if (artists.length > 2) {
        const last = artists.pop();
        if (last) {
            last.joinphrase = '';
            const prev = artists.pop();
            if (prev) {
                prev.joinphrase = ' & ';
                for (let i = 0; i < artists.length; i++) {
                    const artist = artists[i];
                    if (artist) {
                        artist.joinphrase = ', ';
                    }
                }
                artists.push(prev);
                artists.push(last);
            }
        }
    } else if (artists.length == 2) {
        const first = artists[0];
        if (first) {
            first.joinphrase = ' & ';
        }
    }
    const credits: ArtistCredit[] = [];
    // re-split artists if featuring or vs
    artists.map(function (item) {
        let c = item.artist_name.replace(/\s*\b(?:feat\.?|ft\.?|featuring)\s+/gi, ' feat. ');
        c = c.replace(/\s*\(( feat. )([^)]+)\)/g, '$1$2');
        c = c.replace(/\s*\b(?:versus|vs\.?)\s+/gi, ' vs. ');
        c = c.replace(/\s+/g, ' ');
        const splitted = c.split(/( feat\. | vs\. )/);
        if (splitted.length === 1) {
            credits.push(item); // nothing to split
        } else {
            const new_items: ArtistCredit[] = [];
            let n = 0;
            for (const element of splitted) {
                if (n && (element === ' feat. ' || element === ' vs. ')) {
                    const prevItem = new_items[n - 1];
                    if (prevItem) {
                        prevItem.joinphrase = element;
                    }
                } else {
                    new_items[n++] = {
                        artist_name: element.trim(),
                        joinphrase: '',
                    };
                }
            }
            const lastItem = new_items[n - 1];
            if (lastItem && item.joinphrase) {
                lastItem.joinphrase = item.joinphrase;
            }
            new_items.forEach(newit => credits.push(newit));
        }
    });
    return credits;
}
