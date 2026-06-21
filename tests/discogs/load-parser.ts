import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

type JQueryChain = {
    hide: () => JQueryChain;
    append: () => JQueryChain;
    prepend: () => JQueryChain;
    slideDown: () => JQueryChain;
    css: () => JQueryChain;
    attr: () => JQueryChain;
    find: () => JQueryChain;
    each: () => JQueryChain;
    remove: () => JQueryChain;
    ready: () => JQueryChain;
};

type JQueryStatic = {
    (arg?: unknown): JQueryChain | { ready: () => { ready: () => unknown } };
    each: (
        collection: unknown[] | Record<string, unknown>,
        callback: (this: unknown, index: string | number, value: unknown) => false | undefined,
    ) => void;
    noConflict: () => JQueryStatic;
};

type ParseDiscogsRelease = (discogsRelease: Record<string, unknown>) => Record<string, unknown>;

function createChain(): JQueryChain {
    const chain: JQueryChain = {
        hide: () => chain,
        append: () => chain,
        prepend: () => chain,
        slideDown: () => chain,
        css: () => chain,
        attr: () => chain,
        find: () => chain,
        each: () => chain,
        remove: () => chain,
        ready: () => chain,
    };
    return chain;
}

function createJQuery(): JQueryStatic {
    const jQuery = function jQueryMock(arg?: unknown) {
        if (typeof arg === 'object' && arg !== null && 'ready' in arg) {
            return {
                ready: () => ({ ready: () => undefined }),
            };
        }
        return createChain();
    } as JQueryStatic;

    jQuery.each = function each(collection, callback) {
        if (Array.isArray(collection)) {
            for (let i = 0; i < collection.length; i++) {
                if (callback.call(collection[i], i, collection[i]) === false) {
                    break;
                }
            }
            return;
        }
        for (const key of Object.keys(collection)) {
            if (callback.call(collection[key], key, collection[key]) === false) {
                break;
            }
        }
    };

    jQuery.noConflict = function noConflict() {
        return jQuery;
    };

    return jQuery;
}

export function loadParseDiscogsRelease(): ParseDiscogsRelease {
    const jQuery = createJQuery();

    function MBLinks(this: { resolveMBID: () => string }) {
        this.resolveMBID = function resolveMBID() {
            return '';
        };
    }

    const sandbox: vm.Context & {
        parseDiscogsRelease?: ParseDiscogsRelease;
        console: Console;
    } = {
        console,
        jQuery,
        $: jQuery,
        MBLinks,
        document: {
            ready() {
                // userscript bootstrapping is not needed for unit tests
            },
            querySelector() {
                return null;
            },
        },
        window: {},
        module: { exports: {} },
    };

    sandbox['this'] = sandbox;
    vm.createContext(sandbox);

    for (const lib of ['logger.js', 'mbimport.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib', lib), 'utf8'), sandbox);
    }

    let script = fs.readFileSync(path.join(ROOT, 'discogs_importer.user.js'), 'utf8');
    script = script.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n/, '');
    script = script.replace(/\r\n/g, '\n');

    vm.runInContext(script, sandbox);

    const parseDiscogsRelease = sandbox.parseDiscogsRelease;
    if (typeof parseDiscogsRelease !== 'function') {
        throw new Error('parseDiscogsRelease was not loaded');
    }

    return function parseDiscogsReleaseForTests(discogsRelease) {
        const log = sandbox.console.log;
        sandbox.console.log = function noop() {};
        try {
            return parseDiscogsRelease(discogsRelease);
        } finally {
            sandbox.console.log = log;
        }
    };
}
