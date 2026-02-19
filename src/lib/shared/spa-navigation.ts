type SubscribeToSPANavigationProps = {
    beforeNavigate?: () => void;
    onNavigate: () => Promise<void>;
    delay?: number;
};

/**
 * Subscribe to Single Page Application (SPA) navigation events.
 * Works with frameworks like Next.js that use pushState/replaceState for client-side routing.
 *
 * @param beforeNavigate - Callback function to execute before navigation occurs
 * @param onNavigate - Callback function to execute when navigation occurs
 * @param delay - Delay in milliseconds before calling onNavigate (default: 200ms)
 * @returns Cleanup function to unsubscribe from navigation events
 */
export function subscribeToSPANavigation({ beforeNavigate, onNavigate, delay = 200 }: SubscribeToSPANavigationProps): () => void {
    let currentUrl = window.location.href;
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const handleNavigation = () => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            beforeNavigate?.();
            setTimeout(() => {
                void onNavigate();
            }, delay);
        }
    };

    // Intercept pushState (used by Next.js and most SPAs)
    history.pushState = function (...args) {
        originalPushState.apply(history, args);
        handleNavigation();
    };

    // Intercept replaceState
    history.replaceState = function (...args) {
        originalReplaceState.apply(history, args);
        handleNavigation();
    };

    // Listen for browser navigation (back/forward)
    const popstateHandler = () => {
        currentUrl = window.location.href;
        beforeNavigate?.();
        setTimeout(() => {
            void onNavigate();
        }, delay);
    };
    window.addEventListener('popstate', popstateHandler);

    // Return cleanup function
    return () => {
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', popstateHandler);
    };
}
