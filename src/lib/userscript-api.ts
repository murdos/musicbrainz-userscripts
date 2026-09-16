interface GmApi {
    getValue: (...args: Parameters<typeof GM_getValue>) => unknown;
    setValue: (...args: Parameters<typeof GM_setValue>) => unknown;
    xmlHttpRequest: (...args: Parameters<typeof GM_xmlhttpRequest>) => unknown;
}

export function getOptionalGlobal(name: string): unknown {
    return Reflect.get(globalThis, name);
}

export function getGmApi<Name extends keyof GmApi>(name: Name): GmApi[Name] | undefined {
    // Tampermonkey may only inject granted APIs when the script references them directly.
    const apis: Partial<GmApi> = {};

    if (typeof GM !== 'undefined') {
        apis.getValue = GM.getValue;
        apis.setValue = GM.setValue;
        apis.xmlHttpRequest = GM.xmlHttpRequest;
    }

    if (!apis.getValue && typeof GM_getValue !== 'undefined') {
        apis.getValue = GM_getValue;
    }
    if (!apis.setValue && typeof GM_setValue !== 'undefined') {
        apis.setValue = GM_setValue;
    }
    if (!apis.xmlHttpRequest && typeof GM_xmlhttpRequest !== 'undefined') {
        apis.xmlHttpRequest = GM_xmlhttpRequest;
    }

    return apis[name];
}
