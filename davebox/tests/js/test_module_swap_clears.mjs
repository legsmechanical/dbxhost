/* tests/js/test_module_swap_clears.mjs — a MODULE swap or clear must not strand
 * its automation or its macro legs.
 *
 * Josh, 2026-09-10: "changing or clearing an automated module leaves any
 * automation pointing to the prior module behind." Plus the macro half: the
 * knob setup menu showing a removed module's assignment while the knob itself
 * reads unassigned on touch.
 *
 * ⭐ THE TYPE AXIS WAS ALREADY COVERED (test_type_change_clears.mjs). This is
 * its twin: `applyModulePick` is BOTH Swap Module and Remove Module, and it
 * touched neither automation nor macros.
 *
 * ⚠⚠ THE CASE THAT MATTERS MOST IS THE KEY-NAME COLLISION. An automation
 * target is `<slot>:<comp>:<key>` and a macro leg is `<comp>:<key>` -- NEITHER
 * CARRIES MODULE IDENTITY -- so swapping in a module that reuses `cutoff` does
 * not dangle the lane, it REBINDS it to the new module's parameter, silently.
 * A test that only checked "the lane is gone when the key disappears" would
 * pass over exactly the failure a user can hear and cannot see.
 */

import './_bulk_get_stub.mjs';
import { readFileSync } from 'fs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
/* A loaded generator: engineLoadedModule() reads `<comp>:module`, and an empty
 * answer is what "no generator" looks like — so the happy path needs a name. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
/* A synth pick now asks the host to seed that module's declared `default_fx` /
 * `default_buses` (applyModulePick -> host_seed_module_defaults). */
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 1;


/* ITEM 16 (Josh, 2026-09-05): "When instrument is changed from a schwung
 * generator to a move track or midi track, incompatible macros and
 * automations need to be cleared. Give users a warning and ask for
 * confirmation before switching instrument TYPE since this is destructive."
 * Item 15 = A (a MIDI track routes through its parked slot's MIDI FX), which
 * fixes the matrix below. */
async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const A = await import('../../ui/ui_automation.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

/* every write the module makes: singles and the bulk SET, decoded */
const writes = [];
const _single = globalThis.host_module_set_param;
globalThis.host_module_set_param = (k, v) => { writes.push([k, String(v)]); if (_single) _single(k, v); };
globalThis.host_module_set_params = (blob) => {
    const s = String(blob); let p = 0;
    /* bulkEncode: "<count>\n" then count × "<len>\n<bytes>" */
    const nl0 = s.indexOf('\n'); const count = parseInt(s.slice(0, nl0), 10); p = nl0 + 1;
    const rec = () => { const nl = s.indexOf('\n', p); const n = parseInt(s.slice(p, nl), 10); const v = s.slice(nl + 1, nl + 1 + n); p = nl + 1 + n; return v; };
    for (let i = 0; i + 1 < count; i += 2) { const k = rec(), v = rec(); writes.push([k, v]); }
    return true;
};
/* pa_list answers what the rig has planted */
let paList = '';
const _g = globalThis.host_module_get_param;
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : _g(k));
const routeName = { 0: 'Schwung', 1: 'Move', 2: 'MIDI', 3: 'NONE' };


/* ---- planting ----------------------------------------------------------- */
function plant() {
    /* track 0, Schwung, slot 0. Macro knob 0 carries a SYNTH leg and a LEVEL
     * leg; knob 1 carries a bank leg. Lanes: synth cutoff in two clips, an fx1
     * lane, a slot-level lane and a seq lane. Only the SYNTH ones may go. */
    S.trackMacros[0] = new Array(8).fill(null);
    S.trackMacros[0][0] = { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 },
                                           { kind: 'level', key: 'pan', lo: 0, hi: 1 }] };
    S.trackMacros[0][1] = { v: 0.2, legs: [{ kind: 'bank', bank: 0, k: 1, lo: 0, hi: 1 }] };
    S.trackMacros[0][2] = { v: 0.3, legs: [{ kind: 'chain', comp: 'fx1', key: 'mix', lo: 0, hi: 1 }] };
    paList = '0 0 1 4 0:synth:cutoff 0 4 100\n'
           + '0 3 1 4 0:synth:cutoff 0 4 100\n'
           + '0 0 1 4 0:synth:wave 0 4 100\n'
           + '0 0 1 4 0:fx1:mix 0 4 100\n'
           + '0 0 1 4 0:slot:pan 0 4 100\n'
           + '0 0 1 2 seq:0:swing 0 4 100\n';
    A.automationRefreshPresence();
    S.trackRoute[0] = 0;
    /* ⚠ ui_sound keeps its OWN S (track/slot/comp); the globals above are a
     * DIFFERENT object. The context goes through the hook, not through GS. */
    CTX = { track: 0, slot: 0, comp: 'synth' };
}
const lanesOf = (clip) => A.automationEntriesFor(0, clip).map(e => e.target).sort();
const NEW_MOD = { id: 'obxd', name: 'OB-Xd' };
let CTX = null;

step('a swap with automation on the component ASKS, and writes nothing yet', () => {
    plant(); writes.length = 0;
    snd.soundRequestModulePickForTest(NEW_MOD, CTX);
    if (!S.confirmModuleChange) throw new Error('the swap applied without asking');
    if (S.confirmModuleChangeSel !== 1) throw new Error('the modal must open on No');
    const c = S.confirmModuleChange;
    if (c.macros !== 1) throw new Error('macros counted: ' + c.macros + ' (knob 0 synth leg only)');
    if (c.lanes !== 3) throw new Error('lanes counted: ' + c.lanes + ' (cutoff x2, wave x1)');
    if (lanesOf(0).indexOf('0:synth:cutoff') < 0) throw new Error('nothing may be cleared before Yes');
});

step('No leaves everything — the module, its lanes and its macro leg', () => {
    const c = S.confirmModuleChange; S.confirmModuleChange = null;
    snd.cancelModuleChange(c);
    if (lanesOf(0).indexOf('0:synth:cutoff') < 0) throw new Error('a lane went on No');
    if (!S.trackMacros[0][0] || S.trackMacros[0][0].legs.length !== 2) throw new Error('a macro leg went on No');
});

step('⭐⭐ Yes clears EXACTLY the swapped component — in every clip — and nothing else', () => {
    plant();
    snd.soundRequestModulePickForTest(NEW_MOD, CTX);
    const c = S.confirmModuleChange; S.confirmModuleChange = null;
    snd.performModuleChange(c);

    for (const clip of [0, 3])
        for (const t of lanesOf(clip))
            if (t.indexOf('0:synth:') === 0)
                throw new Error('clip ' + clip + ' kept a synth lane: ' + t);
    /* ⚠ The controls are the point: a swap of the SYNTH must not touch the
     * fx1 insert, the slot level, or the sequencer's own lanes. */
    const l0 = lanesOf(0);
    for (const keep of ['0:fx1:mix', '0:slot:pan', 'seq:0:swing'])
        if (l0.indexOf(keep) < 0) throw new Error('a swap of synth took ' + keep);

    const k0 = S.trackMacros[0][0];
    if (!k0 || k0.legs.length !== 1 || k0.legs[0].kind !== 'level')
        throw new Error('knob 0 should keep its LEVEL leg only, got ' + JSON.stringify(k0));
    if (!S.trackMacros[0][1]) throw new Error('the bank leg went');
    if (!S.trackMacros[0][2]) throw new Error('the fx1 leg went on a SYNTH swap');
});

step('⭐⭐⭐ THE SILENT REBIND: the incoming module reusing `cutoff` does NOT keep the lane', () => {
    plant();
    /* A module that HAS a `cutoff` of its own. Under a key-existence rule this
     * lane would survive and quietly drive the new module's filter. */
    snd.soundRequestModulePickForTest({ id: 'dexed', name: 'Dexed', params: ['cutoff', 'wave'] }, CTX);
    const c = S.confirmModuleChange; S.confirmModuleChange = null;
    snd.performModuleChange(c);
    for (const t of lanesOf(0))
        if (t === '0:synth:cutoff')
            throw new Error('⭑ the lane SURVIVED into a different module — it now drives Dexed\'s '
                          + 'cutoff, which the user never mapped. This is the failure you can only hear.');
});

step('REMOVE ([ none ]) clears the component too', () => {
    plant();
    snd.soundRequestModulePickForTest({ id: '', name: '[ none ]' }, CTX);
    const c = S.confirmModuleChange;
    if (!c) throw new Error('remove applied without asking');
    if (!c.removing) throw new Error('the dialog must know it is a REMOVE, not a swap');
    S.confirmModuleChange = null;
    snd.performModuleChange(c);
    for (const t of lanesOf(0)) if (t.indexOf('0:synth:') === 0) throw new Error('remove kept ' + t);
});

step('⚠ a swap with NOTHING to lose applies at once — no dialog', () => {
    plant();
    /* Clear the synth's own automation and legs, leaving the others. */
    S.trackMacros[0][0] = { v: 0.5, legs: [{ kind: 'level', key: 'pan', lo: 0, hi: 1 }] };
    paList = '0 0 1 4 0:fx1:mix 0 4 100\n0 0 1 2 seq:0:swing 0 4 100\n';
    A.automationRefreshPresence();
    S.confirmModuleChange = null;
    snd.soundRequestModulePickForTest(NEW_MOD, CTX);
    if (S.confirmModuleChange) throw new Error('asked about a swap that loses nothing');
});

step('⚠ a swap of a BUS INSERT is the same operation — fx1 clears, synth does not', () => {
    plant();
    CTX = { track: 0, slot: 0, comp: 'fx1' };
    snd.soundRequestModulePickForTest(NEW_MOD, CTX);
    const c = S.confirmModuleChange; S.confirmModuleChange = null;
    if (!c) throw new Error('an fx1 swap with a lane and a leg asked nothing');
    snd.performModuleChange(c);
    const l0 = lanesOf(0);
    if (l0.indexOf('0:fx1:mix') >= 0) throw new Error('the fx1 lane survived its own swap');
    if (l0.indexOf('0:synth:cutoff') < 0) throw new Error('an fx1 swap took the SYNTH lane');
    if (!S.trackMacros[0][0]) throw new Error('an fx1 swap took knob 0');
    if (S.trackMacros[0][2]) throw new Error('the fx1 leg survived its own swap');
});

if (failed) { console.log('FAIL: module swap clears'); process.exit(1); }
console.log('PASS: a module swap or remove clears its own automation and macro legs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
