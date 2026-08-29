// ESM hooks (resolve + load) for render_loader.mjs. Redirects any
// /data/UserData/schwung/... import to a synthetic stub module whose every
// named export is `0` (colour palette constants) or a no-op function
// (draw helpers). The importing ui/*.mjs modules only need these to *load*;
// the render harness drives the pure fmt/BANKS/cell logic, none of which
// touches the stubbed values.
const DEVICE_PREFIX = '/data/UserData/schwung/';
const STUB_SCHEME = 'device-stub:';

/* ⭑ constants.mjs IS NOT STUBBED — it resolves to the REAL file in this repo.
 *
 * It is pure data with no imports of its own, so there is nothing to stub
 * AROUND, and stubbing it was actively wrong for anything that reads a colour:
 * the 0-stub answered every palette name with 0, which is the same value the
 * LED rule reserves for "nothing is bound here". An offline check of a colour
 * ramp against that stub reads as a flat, entirely dark ramp and cannot tell a
 * correct one from an inverted one. It also had to enumerate export names by
 * hand, so every new constant an importer wanted was a load error in a tool
 * that had nothing to do with colours.
 *
 * ⚠ Only constants.mjs. The other shared modules DO touch the device (draw
 * calls, MIDI sends) and keep their no-op stubs. */
const REAL = { 'constants.mjs': new URL('../../src/shared/constants.mjs', import.meta.url).href };

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(DEVICE_PREFIX)) {
        const file = specifier.split('/').pop();
        if (REAL[file]) return { url: REAL[file], shortCircuit: true };
        return { url: STUB_SCHEME + specifier, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

// ESM named imports are resolved statically, so each stub must declare the
// exact names its importer expects. The device shared modules are few and
// fixed, so we enumerate them here. Colour constants -> 0; draw helpers -> no-op.
const STUBS = {
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
        const body = STUBS[file] || '';
        // Trailing default keeps default-imports working for any un-enumerated stub.
        const src = `${body}\nexport default {};`;
        return { format: 'module', source: src, shortCircuit: true };
    }
    return nextLoad(url, context);
}
