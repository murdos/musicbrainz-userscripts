import { getGmApi } from '../userscript-api';

const SERVER_PREFERENCE_KEY = 'smartlink-mb-importer:server';

export const MUSICBRAINZ_SERVERS = ['https://musicbrainz.org', 'https://beta.musicbrainz.org', 'https://musicbrainz.eu'] as const;

export type MusicBrainzServer = (typeof MUSICBRAINZ_SERVERS)[number];

function isMusicBrainzServer(value: unknown): value is MusicBrainzServer {
    return MUSICBRAINZ_SERVERS.includes(value as MusicBrainzServer);
}

function localServerPreference(): MusicBrainzServer | undefined {
    try {
        const stored = window.localStorage.getItem(SERVER_PREFERENCE_KEY);
        if (isMusicBrainzServer(stored)) return stored;
    } catch {
        // Fall through when page storage is unavailable.
    }
    return undefined;
}

export async function readServerPreference(): Promise<MusicBrainzServer> {
    const getValue = getGmApi('getValue');
    if (getValue) {
        try {
            const stored = await getValue(SERVER_PREFERENCE_KEY);
            if (isMusicBrainzServer(stored)) return stored;

            // Migrate the old origin-scoped preference when the script is upgraded.
            const legacyPreference = localServerPreference();
            if (legacyPreference) {
                await saveServerPreference(legacyPreference);
                return legacyPreference;
            }
        } catch {
            // Fall back to page storage when userscript storage is unavailable.
        }
    }
    return localServerPreference() ?? MUSICBRAINZ_SERVERS[0];
}

export async function saveServerPreference(server: MusicBrainzServer): Promise<void> {
    const setValue = getGmApi('setValue');
    try {
        if (setValue) {
            await setValue(SERVER_PREFERENCE_KEY, server);
            return;
        }
    } catch {
        // Fall back to page storage when userscript storage is unavailable.
    }
    try {
        window.localStorage.setItem(SERVER_PREFERENCE_KEY, server);
    } catch {
        // Preference persistence is optional.
    }
}
