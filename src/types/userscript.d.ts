// Userscript environment types
declare global {
    const unsafeWindow: Window & typeof globalThis;
    const GM_info: {
        script: {
            name: string;
            version: string;
        };
    };
}

export {};
