import type { ElasticStageRelease } from '../types';

/**
 * elasticstage.com is a Vue 3 single-page app. The release page fetches the
 * release group's releases itself and keeps them in the Vue component state, so
 * instead of issuing our own API requests we read the data straight out of the
 * mounted components. This requires running in page context (`@grant none`) so
 * that the `__vueParentComponent` expando property added by Vue is visible.
 */

/** Minimal shape of a mounted Vue 3 internal component instance. */
type VueComponentInstance = {
    type?: { name?: string; __name?: string };
    props?: Record<string, unknown> | null;
};

type VueElement = Element & { __vueParentComponent?: VueComponentInstance };

/** The component that renders the list of purchasable formats for a release group. */
const RELEASE_DETAILS_COMPONENT = 'ReleaseDetails';

/** Does this value look like the array of releases exposed by the page? */
function isReleaseArray(value: unknown): value is ElasticStageRelease[] {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }
    const [first] = value as unknown[];
    return typeof first === 'object' && first !== null && 'ean' in first && 'tracks' in first && 'release_type' in first;
}

/**
 * Walk the mounted Vue components and return the release list held in state.
 * Prefers the dedicated `ReleaseDetails` component but falls back to any
 * component prop that looks like the release array, in case elasticstage
 * renames or restructures its components.
 */
export function getReleasesFromVueState(): ElasticStageRelease[] {
    let fallback: ElasticStageRelease[] | null = null;

    for (const el of document.querySelectorAll<VueElement>('*')) {
        const component = el.__vueParentComponent;
        const props = component?.props;
        if (!props) {
            continue;
        }

        const name = component.type?.name ?? component.type?.__name;
        if (name === RELEASE_DETAILS_COMPONENT && isReleaseArray(props['releases'])) {
            return cloneReleases(props['releases']);
        }

        if (!fallback) {
            for (const key of Object.keys(props)) {
                let value: unknown;
                try {
                    value = props[key];
                } catch {
                    continue;
                }
                if (isReleaseArray(value)) {
                    fallback = value;
                    break;
                }
            }
        }
    }

    return fallback ? cloneReleases(fallback) : [];
}

/**
 * Detach the data from Vue's reactive proxies, returning plain serialisable
 * objects. The release data is plain JSON, so a structured clone is sufficient.
 */
function cloneReleases(releases: ElasticStageRelease[]): ElasticStageRelease[] {
    try {
        return JSON.parse(JSON.stringify(releases)) as ElasticStageRelease[];
    } catch {
        return releases;
    }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll for the release data, which is populated asynchronously after the page
 * (or an SPA navigation) finishes fetching it.
 */
export async function waitForReleases(maxAttempts = 40, intervalMs = 250): Promise<ElasticStageRelease[]> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const releases = getReleasesFromVueState();
        if (releases.length > 0) {
            return releases;
        }
        await sleep(intervalMs);
    }
    return [];
}
