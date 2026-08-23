interface GmApi {
    getValue: (...args: Parameters<typeof GM_getValue>) => unknown;
    setValue: (...args: Parameters<typeof GM_setValue>) => unknown;
    xmlHttpRequest: (...args: Parameters<typeof GM_xmlhttpRequest>) => unknown;
}

const LEGACY_GM_API_NAMES = {
    getValue: 'GM_getValue',
    setValue: 'GM_setValue',
    xmlHttpRequest: 'GM_xmlhttpRequest',
} as const satisfies Record<keyof GmApi, string>;

export function getOptionalGlobal(name: string): unknown {
    return Reflect.get(globalThis, name);
}

export function getGmApi<Name extends keyof GmApi>(name: Name): GmApi[Name] | undefined {
    const modernGM = getOptionalGlobal('GM') as Partial<typeof GM> | undefined;
    const modernApi = modernGM?.[name] as GmApi[Name] | undefined;
    return modernApi ?? (getOptionalGlobal(LEGACY_GM_API_NAMES[name]) as GmApi[Name] | undefined);
}
