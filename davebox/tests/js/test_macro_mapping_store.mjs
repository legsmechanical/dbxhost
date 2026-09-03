/* tests/js/test_macro_mapping_store.mjs — A MACRO IS A MAPPING (2026-09-05).
 *
 * The store slot stopped being a bare typed target and became
 * `{v, legs:[leg,…]}`, a leg being that same target plus `lo`/`hi` fractions
 * of its own range. Nothing yet BUILDS a second leg or a range — this file
 * pins the seam that had to change for them to be possible, because every
 * failure here is silent:
 *
 *   1. A sidecar written BEFORE the reshape (the flat shape) still loads, as
 *      a one-leg whole-range mapping. If this breaks, every macro on every
 *      existing project reads as unassigned after one launch — and reads as
 *      `--` on the page rather than reporting anything.
 *   2. The new shape round-trips: leg order, a partial range, an INVERTED
 *      range (`lo > hi`, Josh 2026-09-05 §6.4), and `v`.
 *   3. Validation is per LEG, not per slot: a bad leg is dropped and its
 *      siblings survive; a slot whose legs are ALL bad is null, not a
 *      half-built mapping the turn law would read `undefined` off.
 *   4. Bounds are clamped, not rejected — a leg out of 0..1 would put the
 *      turn law outside the target's range.
 *
 * ⚠ Positive control first in each block: the well-formed case must load
 * before an assertion that a malformed one is dropped means anything (a
 * reader that dropped EVERYTHING would otherwise pass §3).
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function assert(cond, label) { if (cond) ok(label); else bad(label, 'assertion failed'); }

/* ---- host stubs (the shape test_preset_record_store uses) --------------- */
let fsFiles = Object.create(null);
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (p in fsFiles ? fsFiles[p] : '');
globalThis.host_file_exists = (p) => (p in fsFiles);
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const persist = await import('../../ui/ui_persistence.mjs');

const uiPath = persist.uuidToUiStatePath(S.currentSetUuid);

const load = (mac) => { fsFiles[uiPath] = JSON.stringify({ v: 9, mac }); bridge.restoreUiSidecar(false); };
const slot = (t, k) => (S.trackMacros[t] || [])[k];
const legs = (t, k) => (slot(t, k) || {}).legs || [];

/* ---- 1. THE OLD FLAT SHAPE still loads --------------------------------- */
try {
    load([[
        { kind: 'chain', comp: 'synth', key: 'cutoff' },
        { kind: 'level', key: 'volume' },
        { kind: 'bank', bank: 1, k: 5, alt: 'clkfb' },
        { kind: 'midi', target: 'cc:74' },
        null, null, null, null,
    ]]);
    const l = (k) => legs(0, k)[0];
    assert(legs(0, 0).length === 1 && l(0).kind === 'chain' && l(0).comp === 'synth' && l(0).key === 'cutoff',
           'a pre-09-05 CHAIN target loads as one leg');
    assert(l(0).lo === 0 && l(0).hi === 1, '…at whole range, which is what makes it behave as it always did');
    assert(slot(0, 0).v === null, '…with no knob position yet (v is unseeded, not 0)');
    assert(l(1).kind === 'level' && l(1).key === 'volume', 'a LEVEL target loads');
    assert(l(2).kind === 'bank' && l(2).bank === 1 && l(2).k === 5 && l(2).alt === 'clkfb', 'a BANK target loads, alt kept');
    assert(l(3).kind === 'midi' && l(3).target === 'cc:74', 'a MIDI target loads');
    assert(slot(0, 4) === null, 'an unassigned slot stays null');
} catch (e) { bad('the old flat shape loads', e); }

/* ---- 2. the NEW shape round-trips, ranges and all ----------------------- */
try {
    load([[
        { v: 0.25, legs: [
            { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.8 },
            { kind: 'chain', comp: 'fx1', key: 'mix', lo: 0.9, hi: 0.1 },   /* INVERTED */
            { kind: 'level', key: 'volume', lo: 0, hi: 1 },
        ]},
    ]]);
    const L = legs(0, 0);
    assert(L.length === 3, 'three legs survive, in order — got ' + L.length);
    assert(L[0].key === 'cutoff' && L[1].key === 'mix' && L[2].key === 'volume', '…in the order written');
    assert(L[0].lo === 0.2 && L[0].hi === 0.8, 'a partial range round-trips');
    assert(L[1].lo === 0.9 && L[1].hi === 0.1, '⭑ an INVERTED range is KEPT, not normalised (Josh §6.4)');
    assert(slot(0, 0).v === 0.25, 'the knob position round-trips');
} catch (e) { bad('the new shape round-trips', e); }

/* ---- 3. validation is per LEG ------------------------------------------ */
try {
    load([[
        { v: 0.5, legs: [
            { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 },  /* good */
            { kind: 'chain', key: 'nocomp', lo: 0, hi: 1 },                 /* chain with no comp */
            { kind: 'midi', target: 'cc:999x', lo: 0, hi: 1 },              /* not a MIDI target */
            'not-an-object',
        ]},
        { v: 0.5, legs: [{ kind: 'chain', key: 'nocomp' }] },               /* every leg bad */
        { v: 0.5, legs: [] },                                              /* no legs at all */
    ]]);
    const L = legs(0, 0);
    assert(L.length === 1 && L[0].key === 'cutoff', 'a bad leg is dropped and its GOOD sibling survives — got ' + JSON.stringify(L));
    assert(slot(0, 1) === null, 'a mapping whose legs are ALL bad is null, not a legless mapping');
    assert(slot(0, 2) === null, 'an empty legs array is null too');
} catch (e) { bad('validation is per leg', e); }

/* ---- 4. bounds are clamped, not rejected ------------------------------- */
try {
    load([[
        { v: 9, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: -3, hi: 4 }] },
        { v: 'x', legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 'x', hi: null }] },
    ]]);
    const a = legs(0, 0)[0], b = legs(0, 1)[0];
    assert(a && a.lo === 0 && a.hi === 1, 'out-of-range bounds CLAMP into 0..1 (the leg survives)');
    assert(slot(0, 0).v === 1, 'an out-of-range v clamps too');
    assert(b && b.lo === 0 && b.hi === 1, 'unreadable bounds fall back to whole range');
    assert(slot(0, 1).v === null, 'an unreadable v is unseeded, not NaN');
} catch (e) { bad('bounds clamp', e); }

/* ---- 5. a track absent from the sidecar stays UNSEEDED ------------------ */
try {
    load([null]);
    assert(S.trackMacros[0] === null, 'a null track stays UNSEEDED (null) so the chain-store migration still runs');
    assert(S.trackMacros[3] === null, 'a track the sidecar does not mention is unseeded too');
} catch (e) { bad('unseeded tracks', e); }

process.exit(failed);
}
main();
