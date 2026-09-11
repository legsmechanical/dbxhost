/* tools/check_undeclared.mjs — every name a UI module USES but never DECLARES.
 *
 * ⚠⚠ WHY THIS EXISTS. esbuild builds an undeclared name as a host global, so a
 * typo'd or out-of-scope identifier COMPILES, bundles and passes `node --check`;
 * it throws only when that line runs, and the MIDI handler / tick catch and
 * swallow it into seq8-jserr.log. Every ALL LANES knob was dead that way from
 * 2026-08-26 to 2026-09-11 — the branch passed an undeclared `lane`.
 *
 * Scope analysis is eslint-scope over acorn: a reference nothing in its scope
 * chain declares escapes to the global scope, and those are what this lists.
 * The only names allowed to escape are the ones in ALLOWED below — the host's
 * bindings, the JS builtins, the build's --define constants — each written down
 * with where it comes from. Anything else fails.
 *
 *   node tools/check_undeclared.mjs            # check ui/, exit 1 on a hit
 *   node tools/check_undeclared.mjs --all      # list every escaping name
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(ROOT, 'ui');

/* ---- names allowed to be global ------------------------------------------ */
const ALLOWED = new Set([
    /* JS / QuickJS builtins */
    'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Error', 'TypeError', 'RangeError',
    'RegExp', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array',
    'Int32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView', 'BigInt',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'NaN', 'Infinity', 'undefined',
    'encodeURIComponent', 'decodeURIComponent', 'escape', 'unescape',
    'console', 'globalThis', 'Reflect', 'Proxy', 'Intl', 'TextEncoder', 'TextDecoder',
    'setTimeout', 'clearTimeout', 'queueMicrotask',
]);
/* Host bindings: what the shadow_ui process — the one dAVEBOx runs in — puts on
 * the global object. Three places, all read from the SOURCE so this list cannot
 * drift from what the host installs:
 *   - shadow_ui.c     JS_SetPropertyStr(ctx, global_obj, "name", …)
 *   - js_display.c    the display primitives (fill_rect, print, …), same form
 *   - shadow_ui.js    globalThis.name = …  (the tool-lifecycle bindings the
 *                     host swaps in around every module callback) */
function hostGlobals() {
    const names = new Set();
    const SRC = join(ROOT, '..', 'src');
    for (const f of [join(SRC, 'shadow', 'shadow_ui.c'), join(SRC, 'host', 'js_display.c')]) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/JS_SetPropertyStr\(\s*ctx\s*,\s*global_obj\s*,\s*"([A-Za-z_][A-Za-z0-9_]*)"/g))
            names.add(m[1]);
    }
    const js = readFileSync(join(SRC, 'shadow', 'shadow_ui.js'), 'utf8');
    for (const m of js.matchAll(/globalThis\.([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]/g)) names.add(m[1]);
    return names;
}

/* The build's own constants: esbuild `--define:NAME=…` in the build script
 * substitutes them at bundle time (the source reads each behind a typeof). */
function buildDefines() {
    const names = new Set();
    for (const f of ['build_sound.sh', 'bundle_ui.sh']) {
        let src = '';
        try { src = readFileSync(join(ROOT, 'scripts', f), 'utf8'); } catch (e) { continue; }
        for (const m of src.matchAll(/--define:([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
    }
    return names;
}

function escaping(file) {
    const code = readFileSync(file, 'utf8');
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true });
    const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
    const out = [];
    for (const ref of sm.globalScope.through) {
        out.push({ name: ref.identifier.name, line: ref.identifier.loc.start.line,
                   typeofOnly: isTypeofOperand(ref.identifier, ast) });
    }
    return out;
}

/* `typeof X` is the one read of an undeclared name that cannot throw. */
function isTypeofOperand(id, ast) {
    let hit = false;
    (function walk(n) {
        if (hit || !n || typeof n.type !== 'string') return;
        if (n.type === 'UnaryExpression' && n.operator === 'typeof' && n.argument === id) { hit = true; return; }
        for (const k in n) {
            const v = n[k];
            if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
        }
    })(ast);
    return hit;
}

const all = process.argv.includes('--all');
const host = hostGlobals();
const defines = buildDefines();
const files = readdirSync(UI).filter(f => f.endsWith('.mjs') || f === 'ui.js').map(f => join(UI, f));
let bad = 0;
const seen = new Map();
for (const f of files) {
    for (const r of escaping(f)) {
        const ok = ALLOWED.has(r.name) || host.has(r.name) || defines.has(r.name) || r.typeofOnly;
        if (!seen.has(r.name)) seen.set(r.name, { ok: true, where: [] });
        const e = seen.get(r.name);
        e.where.push(f.slice(ROOT.length + 1) + ':' + r.line + (r.typeofOnly ? ' (typeof)' : ''));
        if (!ok) { e.ok = false; bad++; }       /* a name is bad if ANY use is */
    }
}
for (const [name, v] of [...seen].sort()) {
    if (!all && v.ok) continue;
    console.log((v.ok ? '  ok    ' : '  UNDECLARED ') + name + '  ' + v.where.slice(0, 4).join(', ') + (v.where.length > 4 ? ' …+' + (v.where.length - 4) : ''));
}
console.log(bad ? `check_undeclared: ${bad} reference(s) to undeclared names`
                : `check_undeclared: clean (${files.length} files, ${host.size} host bindings, ${defines.size} build defines)`);
process.exit(bad ? 1 : 0);
