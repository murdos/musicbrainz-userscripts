import { MUSICBRAINZ_SERVERS, type MusicBrainzServer } from './server-preference';
import type { SmartLinkImporterConfig } from './types';

export interface ImportPanel {
    root: HTMLElement;
    status: HTMLElement;
    release: HTMLAnchorElement;
    server: HTMLSelectElement;
    harmonyButton: HTMLAnchorElement;
    missingLinksButton: HTMLButtonElement;
    missingLinksLabel: HTMLElement;
}

export function panelId(config: SmartLinkImporterConfig): string {
    return `${config.id}-mb-importer`;
}

function styleId(config: SmartLinkImporterConfig): string {
    return `${panelId(config)}-style`;
}

function addStyles(config: SmartLinkImporterConfig): void {
    const importerPanelId = panelId(config);
    if (document.getElementById(styleId(config))) return;
    const style = document.createElement('style');
    style.id = styleId(config);
    style.textContent = `
        #${importerPanelId} {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 2147483646;
            width: min(340px, calc(100vw - 32px));
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            box-sizing: border-box;
            padding: 12px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.96);
            color: #222;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
            font: 13px/1.4 Arial, sans-serif;
        }
        @media (max-width: 720px) {
            #${importerPanelId} {
                top: auto;
                right: 8px;
                bottom: 8px;
                width: min(340px, calc(100vw - 16px));
                max-height: 50vh;
            }
        }
        #${importerPanelId} .smartlink-mb-heading,
        #${importerPanelId} .smartlink-mb-controls,
        #${importerPanelId} .smartlink-mb-buttons {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        #${importerPanelId} .smartlink-mb-heading { font-weight: bold; margin-bottom: 8px; }
        #${importerPanelId} [hidden] { display: none !important; }
        #${importerPanelId} .smartlink-mb-controls { margin: 8px 0; }
        #${importerPanelId} .smartlink-mb-status { color: #555; }
        #${importerPanelId} .smartlink-mb-release { color: #0875bd; font-weight: bold; }
        #${importerPanelId} .smartlink-mb-button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-height: 30px;
            padding: 5px 10px;
            box-sizing: border-box;
            border: 1px solid #a7a7a7;
            border-radius: 5px;
            background: #f4f4f4;
            color: #222;
            cursor: pointer;
            font: bold 12px Arial, sans-serif;
            text-decoration: none;
        }
        #${importerPanelId} .smartlink-mb-button:hover:not(:disabled) { background: #fff; }
        #${importerPanelId} .smartlink-mb-button:disabled { cursor: default; opacity: 0.55; }
        #${importerPanelId} .smartlink-mb-button img { flex: none; }
        .smartlink-mb-present { position: relative; outline: 3px solid #32a852 !important; }
        .smartlink-mb-present::after {
            content: '\u2713';
            position: absolute;
            top: -7px;
            right: -7px;
            width: 21px;
            height: 21px;
            border-radius: 25%;
            background: #ba478f;
            color: #fff;
            font: bold 15px/21px Arial, sans-serif;
            text-align: center;
            z-index: 2;
        }
    `;
    document.head.appendChild(style);
}

function mountPanel(config: SmartLinkImporterConfig, root: HTMLElement): void {
    if (config.mountPanel) config.mountPanel(root);
    else document.body.appendChild(root);
}

export function createPanel(config: SmartLinkImporterConfig, server: MusicBrainzServer): ImportPanel {
    addStyles(config);
    document.getElementById(panelId(config))?.remove();

    const root = document.createElement('section');
    root.id = panelId(config);
    root.innerHTML = `
        <div class="smartlink-mb-heading">
            <img src="https://musicbrainz.org/static/images/entity/release.svg" width="18" height="18" alt="" />
            MusicBrainz release importer
        </div>
        <div class="smartlink-mb-status">Resolving provider links…</div>
        <div class="smartlink-mb-controls">
            <label>MusicBrainz server <select class="smartlink-mb-server"></select></label>
            <a class="smartlink-mb-release" target="_blank" hidden></a>
        </div>
        <div class="smartlink-mb-buttons">
            <a class="smartlink-mb-button smartlink-mb-harmony" target="_blank" hidden>
                <img src="https://harmony.pulsewidth.org.uk/favicon.svg" width="16" height="16" alt="" />
                Import with Harmony
            </a>
            <button class="smartlink-mb-button smartlink-mb-missing" type="button" hidden>
                <img src="https://raw.githubusercontent.com/metabrainz/design-system/master/brand/logos/MusicBrainz/SVG/MusicBrainz_logo_icon.svg" width="16" height="16" alt="" />
                <span class="smartlink-mb-missing-label">Add Missing Links</span>
            </button>
        </div>
    `;

    mountPanel(config, root);

    const serverSelect = root.querySelector<HTMLSelectElement>('.smartlink-mb-server')!;
    for (const value of MUSICBRAINZ_SERVERS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = new URL(value).hostname;
        option.selected = value === server;
        serverSelect.appendChild(option);
    }

    return {
        root,
        status: root.querySelector<HTMLElement>('.smartlink-mb-status')!,
        release: root.querySelector<HTMLAnchorElement>('.smartlink-mb-release')!,
        server: serverSelect,
        harmonyButton: root.querySelector<HTMLAnchorElement>('.smartlink-mb-harmony')!,
        missingLinksButton: root.querySelector<HTMLButtonElement>('.smartlink-mb-missing')!,
        missingLinksLabel: root.querySelector<HTMLElement>('.smartlink-mb-missing-label')!,
    };
}

export function keepPanelMounted(config: SmartLinkImporterConfig, panel: ImportPanel, onRemount: () => void): void {
    let remountScheduled = false;
    const ensureMounted = (): void => {
        if (panel.root.isConnected || remountScheduled) return;
        remountScheduled = true;
        window.setTimeout(() => {
            remountScheduled = false;
            if (panel.root.isConnected) return;
            mountPanel(config, panel.root);
            onRemount();
        }, 250);
    };
    const observer = new MutationObserver(ensureMounted);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ensureMounted();
}
