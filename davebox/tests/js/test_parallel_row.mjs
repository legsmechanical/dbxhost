/* tests/js/test_parallel_row.mjs — the `Parallel` CONFIG row and the
 * per-module device-wide default it edits (Josh, ruled 2026-09-05: "a
 * per-track Parallel CONFIG row whose flip is the device-wide per-module
 * default"; Dexed and JE-8086 pre-set Off).
 *
 * Drives the REAL screen: sound mode on a Schwung track, the CONFIG door,
 * the row list, and the real slotCfgStep on the real row object — then
 * asserts what reached the host (`slot:parallel` writes, by slot) and the
 * preference file. A MIDI track is the control: no row. A slot holding a
 * DIFFERENT module is the other control: never written. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

/* A mutable engine (test_instr_lists' shape): a slot holds what was loaded. */
const loaded = {};                       /* `${slot}:${comp}` -> module id */
const files = {};                        /* path -> content */
const slotWrites = [];                   /* {slot, key, val} for slot:* writes */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (p in files ? files[p] : '');
globalThis.host_file_exists = (p) => (p in files);
globalThis.host_write_file = (p, c) => { files[p] = c; return true; };
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    return m ? (loaded[slot + ':' + m[1]] || '') : '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k === 'string' && k.indexOf('slot:') === 0) slotWrites.push({ slot, key: k, val: String(v) });
    const m = typeof k === 'string' && k.match(/^(.*):module$/);
    if (m) loaded[slot + ':' + m[1]] = String(v);
};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const sound = await import('../../ui/ui_sound.mjs');
const P = await import('../../ui/ui_parallel.mjs');

function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function ticks(n) { for (let i = 0; i < n; i++) globalThis.tick(); }
/* ⚠ The config rows are INLINE at the foot of the track's sound MENU since
 * 2026-09-19 — there is no CONFIG door to open any more. Entering the menu IS
 * how you reach them. */
function configRowsFor(t) {
    sound.soundExit(); sound.soundEnter(t, t); ticks(2);
    sound.soundShowMenu();
    ticks(2);
    return sound.soundCfgRowsForTest();
}
function writesTo(slot) { return slotWrites.filter(w => w.slot === slot && w.key === 'slot:parallel').map(w => w.val); }

step('setup: dexed in slots 0 and 3, nusaw in slot 1, a MIDI track on 2', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 0;
    B.applyInstrChoice(0, C.INSTR_SCHWUNG);
    B.applyInstrChoice(1, C.INSTR_SCHWUNG);
    B.applyInstrChoice(3, C.INSTR_SCHWUNG);
    B.applyInstrChoice(2, C.INSTR_MIDI_CH + 4);
    loaded['0:synth'] = 'dexed'; loaded['3:synth'] = 'dexed'; loaded['1:synth'] = 'nusaw';
    P.parallelResetForTest();
    slotWrites.length = 0;
});

step('built-in defaults: ON for everything (the list ships empty), no module On', () => {
    if (P.BUILTIN_OFF.length !== 0) throw new Error('BUILTIN_OFF not empty: ' + P.BUILTIN_OFF.join(','));
    if (P.moduleParallelDefault('dexed') !== 1) throw new Error('dexed');
    if (P.moduleParallelDefault('jp8000') !== 1) throw new Error('jp8000');
    if (P.moduleParallelDefault('nusaw') !== 1) throw new Error('nusaw');
    if (P.moduleParallelDefault('') !== 1) throw new Error('empty');
});

step('the Schwung track holding dexed shows a Parallel row reading On (seeded Off below to test the flip)', () => {
    S.activeTrack = 0;
    const keys = configRowsFor(0);
    if (!keys.includes('parallel')) throw new Error('no row: ' + keys.join(','));
    const row = sound.soundCfgRowForTest('parallel');
    if (row.get() !== 1) throw new Error('reads ' + row.get());
    /* seed a user preference so the flip below has an Off to leave */
    P.setModuleParallelDefault('dexed', 0);
    configRowsFor(0);
    if (sound.soundCfgRowForTest('parallel').get() !== 0) throw new Error('seeded Off not read back');
    if (row.fmt(0) !== 'Off' || row.fmt(1) !== 'On') throw new Error('fmt');
});
step('…the one holding nusaw reads On', () => {
    S.activeTrack = 1;
    configRowsFor(1);
    if (sound.soundCfgRowForTest('parallel').get() !== 1) throw new Error('reads Off');
});
step('CONTROL: a MIDI-routed track has no Parallel row', () => {
    S.activeTrack = 2;
    const keys = configRowsFor(2);
    if (keys.includes('parallel')) throw new Error('row present on a MIDI track: ' + keys.join(','));
});
step('CONTROL: a Schwung track with no instrument has no Parallel row', () => {
    B.applyInstrChoice(4, C.INSTR_SCHWUNG);
    S.activeTrack = 4;
    const keys = configRowsFor(4);
    if (keys.includes('parallel')) throw new Error('row present with no module: ' + keys.join(','));
});

step('flipping the row on track 0 (dexed) writes the pref and re-pins EVERY dexed slot, not the nusaw one', () => {
    S.activeTrack = 0;
    configRowsFor(0);
    const row = sound.soundCfgRowForTest('parallel');
    slotWrites.length = 0;
    const v = sound.soundSlotCfgStepForTest(row, row.get(), +1);   /* Off -> On, the real step */
    if (v !== 1) throw new Error('stepped to ' + v);
    if (!(P.PARALLEL_PREF_PATH in files)) throw new Error('pref file not written');
    if (!/^dexed 1$/m.test(files[P.PARALLEL_PREF_PATH])) throw new Error('file: ' + JSON.stringify(files[P.PARALLEL_PREF_PATH]));
    if (writesTo(0).join() !== '1') throw new Error('slot 0 writes: ' + writesTo(0).join());
    if (writesTo(3).join() !== '1') throw new Error('slot 3 (also dexed) writes: ' + writesTo(3).join());
    if (writesTo(1).length !== 0) throw new Error('slot 1 (nusaw) was written: ' + writesTo(1).join());
    if (P.moduleParallelDefault('dexed') !== 1) throw new Error('default did not flip');
});
step('the row now reads On, and stepping past the end clamps (no wrap back to Off)', () => {
    configRowsFor(0);
    const row = sound.soundCfgRowForTest('parallel');
    if (row.get() !== 1) throw new Error('reads ' + row.get());
    slotWrites.length = 0;
    const v = sound.soundSlotCfgStepForTest(row, 1, +1);
    if (v !== 1) throw new Error('wrapped to ' + v);
    if (slotWrites.length !== 0) throw new Error('a no-op step wrote ' + slotWrites.length);
});
step('the preference SURVIVES a reload of the module (fresh prefs read the file)', () => {
    P.parallelResetForTest();
    if (P.moduleParallelDefault('dexed') !== 1) throw new Error('lost after reload');
    if (P.moduleParallelDefault('jp8000') !== 1) throw new Error('jp8000 default disturbed');
});

step('a project load re-pins every slot for the module it holds — one write per slot, none for an unchanged pin', () => {
    files[P.PARALLEL_PREF_PATH] = 'dexed 0\n';  /* the user pinned dexed Off */
    P.parallelResetForTest();
    slotWrites.length = 0;
    P.parallelForgetPushed();
    P.reconcileParallelAll();
    if (writesTo(0).join() !== '0' || writesTo(3).join() !== '0') throw new Error('dexed slots: ' + writesTo(0) + '/' + writesTo(3));
    if (writesTo(1).join() !== '1') throw new Error('nusaw slot: ' + writesTo(1));
    if (writesTo(2).join() !== '1') throw new Error('empty slot 2 should be On: ' + writesTo(2));
    slotWrites.length = 0;
    P.reconcileParallelAll();
    if (slotWrites.length !== 0) throw new Error('a second reconcile wrote ' + slotWrites.length + ' (nothing changed)');
});
step('the tick sweep touches ONE slot per PARALLEL_SWEEP_TICKS and catches a module that arrived by another road', () => {
    slotWrites.length = 0;
    files[P.PARALLEL_PREF_PATH] = 'dexed 0\njp8000 0\n'; P.parallelResetForTest();
    P.parallelForgetPushed(); P.reconcileParallelAll(); slotWrites.length = 0;
    loaded['1:synth'] = 'jp8000';               /* a snapshot recall swapped slot 1's synth */
    let reads = 0;
    const realGet = globalThis.shadow_get_param;
    globalThis.shadow_get_param = (s, k) => { reads++; return realGet(s, k); };
    for (let t = 1; t < P.PARALLEL_SWEEP_TICKS; t++) P.parallelSweepTick(t);
    if (reads !== 0) throw new Error('read between sweep steps: ' + reads);
    for (let s = 0; s < 8; s++) P.parallelSweepTick(P.PARALLEL_SWEEP_TICKS * (s + 1));
    globalThis.shadow_get_param = realGet;
    if (reads !== 8) throw new Error('a full sweep read ' + reads + ' times, not 8');
    if (writesTo(1).join() !== '0') throw new Error('slot 1 (now jp8000) not re-pinned: ' + writesTo(1).join());
    if (writesTo(0).length !== 0) throw new Error('an unchanged slot was written');
});

if (failed) process.exit(1);
}
main().catch((e) => { bad('main', e); process.exit(1); });
