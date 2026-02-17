// Userscript environment types
declare global {
    // jQuery is loaded via @require in userscripts
    const jQuery: typeof import('jquery');
    const $: typeof import('jquery');

    const unsafeWindow: Window & typeof globalThis;

    interface Window {
        $: typeof import('jquery');
        jQuery: typeof import('jquery');
    }
}

// Make jQuery available globally
declare const jQuery: typeof import('jquery'); // eslint-disable-line
declare const $: typeof import('jquery'); // eslint-disable-line

export {};
