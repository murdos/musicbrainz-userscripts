import { hmsToMilliSeconds, ISO8601toMilliSeconds } from '../shared/time-functions';
import { buildFormHTML } from './buildFormHTML';
import { buildFormParameters } from './buildFormParameters';
import { buildHarmonyButton } from './buildHarmonyButton';
import { buildSearchButton } from './buildSearchButton';
import { buildSearchLink } from './buildSearchLink';
import { guessReleaseType } from './guessReleaseType';
import { makeArtistCredits } from './makeArtistCredits';
import { makeEditNote } from './makeEditNote';
import { searchUrlFor, exactSearchUrlFor } from './searchUrlFor';
import { special_artists, specialArtist } from './specialArtist';
import { URL_TYPES } from './urlTypes';

export const MBImport = {
    buildHarmonyButton,
    buildSearchLink,
    buildSearchButton,
    buildFormHTML,
    buildFormParameters,
    makeArtistCredits,
    guessReleaseType,
    hmsToMilliSeconds,
    ISO8601toMilliSeconds,
    makeEditNote,
    searchUrlFor,
    exactSearchUrlFor,
    URL_TYPES,
    SPECIAL_ARTISTS: special_artists,
    specialArtist,
};
