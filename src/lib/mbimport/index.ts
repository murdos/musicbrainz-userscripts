import { buildHarmonyButton } from './buildHarmonyButton';
import { buildSearchLink } from './buildSearchLink';
import { buildSearchButton } from './buildSearchButton';
import { buildFormHTML } from './buildFormHTML';
import { buildFormParameters } from './buildFormParameters';
import { makeArtistCredits } from './makeArtistCredits';
import { guessReleaseType } from './guessReleaseType';
import { hmsToMilliSeconds, ISO8601toMilliSeconds } from '../shared/time-functions';
import { makeEditNote } from './makeEditNote';
import { searchUrlFor, exactSearchUrlFor } from './searchUrlFor';
import { URL_TYPES } from './urlTypes';
import { special_artists, specialArtist } from './specialArtist';

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
