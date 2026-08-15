// ESM hooks for audit_loader.mjs — the DESIGN-AUDIT variant of
// render_loader_hooks.mjs.
//
// The difference is the whole point: render_loader STUBS every
// /data/UserData/schwung/ import with no-op draw helpers, which is fine when
// the harness only needs the pure fmt/BANKS logic. A visual audit cannot use
// stubs — `drawMenuList` and `drawMenuHeader` ARE the thing being audited, and
// a stubbed one renders a blank screen that would read as "this screen draws
// nothing" rather than "this screen draws in the other chassis".
//
// The host shared modules live in THIS repo (host + module are one deliverable),
// so the device-absolute specifier resolves to the real file on disk. Only what
// genuinely is not here falls back to a stub.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const DEVICE_PREFIX = '/data/UserData/schwung/';
const STUB_SCHEME = 'device-stub:';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));   // dbxhost/

/* QuickJS built-ins. `std` has no node equivalent at all; `os` DOES resolve to
 * node's, which is worse than not resolving — the shared modules call
 * QuickJS's os (readdir/stat with different shapes), so node's would load fine
 * and then misbehave at draw time. Both are stubbed to a filesystem that is
 * simply empty, which is the honest answer off-device. */
const QJS_BUILTINS = new Set(['std', 'os']);

export async function resolve(specifier, context, nextResolve) {
    if (QJS_BUILTINS.has(specifier)) {
        return { url: STUB_SCHEME + 'qjs/' + specifier + '.mjs', shortCircuit: true };
    }
    if (specifier.startsWith(DEVICE_PREFIX)) {
        const rel = specifier.slice(DEVICE_PREFIX.length);            // e.g. shared/menu_layout.mjs
        const real = REPO_ROOT + 'src/' + rel;
        if (existsSync(real)) return { url: pathToFileURL(real).href, shortCircuit: true };
        return { url: STUB_SCHEME + specifier, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

// Only reached for a shared module this repo does not carry.
const STUBS = {
    'std.mjs':
        'export function loadFile() { return null; }\n' +
        'export function open() { return null; }\n' +
        'export function getenv() { return undefined; }\n' +
        'export function urlGet() { return null; }\n',
    'os.mjs':
        'export function readdir() { return [[], -1]; }\n' +
        'export function stat() { return [null, -1]; }\n' +
        'export function remove() { return -1; }\n' +
        'export function mkdir() { return -1; }\n' +
        'export function rename() { return -1; }\n' +
        'export const O_RDONLY = 0, O_WRONLY = 1, O_CREAT = 64, O_TRUNC = 512;\n' +
        'export const S_IFMT = 61440, S_IFDIR = 16384, S_IFREG = 32768;\n',
    'constants.mjs':
        ['Red','Blue','Green','DarkBlue','Mustard','DeepGreen','BrightGreen',
         'BrightPink','RoyalBlue','DarkOlive','DeepWine']
            .map(n => `export const ${n} = 0;`).join('\n'),
    'menu_layout.mjs':
        'export function drawMenuHeader() {}\nexport const MENU_HDR_H = 12;',
};

export async function load(url, context, nextLoad) {
    if (url.startsWith(STUB_SCHEME)) {
        const file = url.split('/').pop();
        if (!url.includes('/qjs/'))
            console.error('[audit] WARNING: stubbing ' + file + ' — its screens will render blank');
        return { format: 'module', source: (STUBS[file] || '') + '\nexport default {};',
                 shortCircuit: true };
    }
    return nextLoad(url, context);
}
