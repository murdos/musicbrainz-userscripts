interface Props {
    barcode?: string | undefined;
    release_url: string;
}

const styleBlock = `
    <style>
        .harmony-button {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 0 !important;
            border-radius: 5px;
            justify-content: center;
            cursor: pointer;
            font-family: Arial;
            font-size: 12px !important;
            padding: 3px 6px;
            border: 1px solid rgba(180,180,180,0.8) !important;
            background-color: rgba(240,240,240,0.8) !important;
            color: #334 !important;
            height: 26px;
            user-select: none;
            text-decoration: none !important;
        }

        .harmony-button:hover {
            background-color: rgba(250,250,250,0.9) !important;
        }

        .harmony-button:active {
            background-color: rgba(170,170,170,0.8) !important;
        }
    </style>
`;

export function buildHarmonyButton({ barcode, release_url }: Props): string {
    const searchParams = new URLSearchParams();
    if (barcode) {
        searchParams.set('gtin', barcode);
    }
    if (release_url) {
        searchParams.set('url', encodeURI(release_url));
    }

    searchParams.set('category', 'preferred'); // take Harmony user preferences into account
    searchParams.set('musicbrainz', ''); // enforce lookup by barcode in MusicBrainz

    const harmonyURL = `https://harmony.pulsewidth.org.uk/release?${searchParams.toString()}`;

    return `
        ${styleBlock}
        <a
            class="harmony-button"
            title="Import this release into MusicBrainz using Harmony (open a new tab)" 
            target="_blank"
            href="${harmonyURL}"
        >
            <img src="https://harmony.pulsewidth.org.uk/favicon.svg" alt="Harmony icon" width="16" height="16" />
            Import with Harmony
        </a>`;
}
