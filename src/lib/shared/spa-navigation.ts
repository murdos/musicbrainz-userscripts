type SubscribeToSPANavigationProps = {
    onNavigate: () => Promise<void>;
    delay?: number;
    /** Polling interval in ms; when set, polls for URL changes (works in sandboxed environments like Firefox/Greasemonkey) */
    pollInterval?: number;
};

/**
 * Subscribe to Single Page Application (SPA) navigation events.
 * Uses pushState/replaceState interception when possible; falls back to URL polling in sandboxed environments
 * (e.g. Firefox/Greasemonkey) where the page uses a different history object.
 *
 * @param onNavigate - Callback function to execute when navigation occurs
 * @param delay - Delay in milliseconds before calling onNavigate (default: 200ms)
 * @param pollInterval - If set, polls location.href for changes; use when pushState interception doesn't work (default: 400ms, 0 to disable)
 * @returns Cleanup function to unsubscribe from navigation events
 */
export function subscribeToSPANavigation({ onNavigate, delay = 200, pollInterval = 400 }: SubscribeToSPANavigationProps): () => void {
    let currentUrl = window.location.href;
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const scheduleOnNavigate = () => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            setTimeout(() => {
                void onNavigate();
            }, delay);
        }
    };

    let pushStatePatched = false;
    let replaceStatePatched = false;
    try {
        history.pushState = function (...args) {
            originalPushState.apply(history, args);
            scheduleOnNavigate();
        };
        pushStatePatched = true;
    } catch {
        // pushState is read-only in some sandboxed environments
    }

    try {
        history.replaceState = function (...args) {
            originalReplaceState.apply(history, args);
            scheduleOnNavigate();
        };
        replaceStatePatched = true;
    } catch {
        // replaceState is read-only in some sandboxed environments
    }

    let pollTimer: ReturnType<typeof setInterval> | undefined;
    if (pollInterval > 0) {
        pollTimer = setInterval(scheduleOnNavigate, pollInterval);
    }

    const popstateHandler = () => {
        currentUrl = window.location.href;
        setTimeout(() => {
            void onNavigate();
        }, delay);
    };
    window.addEventListener('popstate', popstateHandler);

    return () => {
        if (pollTimer) clearInterval(pollTimer);
        if (pushStatePatched) history.pushState = originalPushState;
        if (replaceStatePatched) history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', popstateHandler);
    };
}
