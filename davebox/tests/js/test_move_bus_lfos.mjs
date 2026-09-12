
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_move_bus_lfos.mjs — LFOs ON MOVE TRACKS (Block 5).
 *
 * Josh, 2026-09-10: "Add lfos to move tracks b/c they can target the move bus's
 * effects." A Move bus carries real effects, so there IS something to modulate;
 * the restriction was ours.
 *
 * ⚠⚠ THE FAILURE THIS EXISTS TO CATCH is a HALF-LIFTED GATE. Five separate
 * places conditioned the LFO surface on having a chain; lifting four of them
 * gives a row that opens an editor that reads and writes nothing, and looks
 * completely normal on screen. So this asserts the whole path:
 *   the row is REACHABLE → the editor reads the BUS's keys → the target picker
 *   lists the BUS's effects → committing writes the BUS's key
 * and every one of those has a CONTROL proving a Schwung track still uses the
 * chain keys. Re-pointing both paths at one of them is the real risk.
 * → [[wired-is-not-reachable]]
 *
 * The DSP half is pinned by tests/host/test_move_bus_lfos.sh.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* A Move bus with two effects loaded, and a chain slot with its own — so a
 * confusion between the two ADDRESSES shows up as the wrong module name rather
 * than as an empty list, which is much easier to read in a failure. */
const PARAMS = {
    /* the Move bus (track 3 -> channel 1 -> move_fx:1) */
    'move_fx:1:fx1:module': 'plate',
    'move_fx:1:fx1:name': 'Plate Reverb',
    'move_fx:1:fx1:chain_params': JSON.stringify([
        { key: 'size', name: 'Size', type: 'float', min: 0, max: 1, step: 0.01 },
    ]),
    'move_fx:1:fx2:module': 'delay',
    'move_fx:1:fx2:name': 'Delay',
    /* the chain slot, deliberately DIFFERENT modules */
    'synth:module': 'nusaw', 'synth:name': 'Nusaw',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
    ]),
    'fx1:module': 'chorus', 'fx1:name': 'Chorus',
};
let reads = [], writes = [];
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return PARAMS[key] || ''; };
globalThis.shadow_set_param = (slot, key, val) => {
    writes.push({ key, val: String(val) }); PARAMS[key] = String(val); return 1;
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_send_midi_to_dsp = () => {}; globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

GS.ledInitComplete = true; GS.stateLoading = false; GS.bootSplashMs = 0;
GS.awaitingProjectSelect = false; GS.sessionView = false;
GS.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
const VIEW_SLOTCFG = 7, VIEW_LFO = 14, VIEW_LFO_TARGET = 15;

/* Put track 3 on Move channel 1 and open its bus — the same rig
 * test_sound_bus_editor.mjs uses for a Move insert. */
function enterMoveBus() {
    GS.sessionView = false;
    GS.trackChannel[3] = 1;           /* -> move_fx:1 */
    GS.trackRoute[3] = 1;             /* ROUTE_MOVE */
    GS.activeTrack = 3;
    snd.soundExit();
    snd.soundEnterMove(3);
    ticks(4);
}
function enterChainTrack() {
    GS.trackRoute[2] = 0;             /* Schwung chain */
    GS.activeTrack = 2;
    snd.soundExit();
    snd.soundEnter(2);
    ticks(4);
}

step('⭐ THE DOOR: a Move track\'s menu offers an LFOs row', () => {
    enterMoveBus();
    if (!snd.soundOpen()) throw new Error('rig: sound mode did not open on the Move track');
    const st = snd.soundPickStateForTest();
    if (!st.labels.includes('LFOs'))
        throw new Error('no LFOs row on a Move track — rows: ' + st.labels.join(' / '));
});

step('⚠ CONTROL: a Schwung track still has its LFOs row (the door was not MOVED)', () => {
    enterChainTrack();
    const st = snd.soundPickStateForTest();
    if (!st.labels.includes('LFOs'))
        throw new Error('the chain track LOST its LFOs row — rows: ' + st.labels.join(' / '));
});

step('⭐ THE EDITOR READS THE BUS\'S KEYS, not the chain\'s', () => {
    enterMoveBus();
    reads.length = 0;
    snd.soundQueueActionForTest({ t: 'slotcfg', which: 'sound' }); ticks(2);
    snd.soundQueueActionForTest({ t: 'lfo', lfo: 0 }); ticks(2);
    if (snd.soundPickStateForTest().view !== VIEW_LFO)
        throw new Error('LFO 1 did not open on a Move track (view ' +
                        snd.soundPickStateForTest().view + ')');
    const busReads = reads.filter(k => k.indexOf('move_fx:1:lfo1:') === 0);
    if (!busReads.length)
        throw new Error('no move_fx:1:lfo1:* reads — the editor is still addressing the chain. Read: '
                        + reads.filter(k => k.indexOf('lfo') >= 0).join(','));
    const bareReads = reads.filter(k => /^lfo1:/.test(k));
    if (bareReads.length)
        throw new Error('it ALSO read bare chain keys on a Move track: ' + bareReads.join(','));
});

step('⭐ THE TARGET PICKER lists the BUS\'S effects — and no synth (Move owns the voice)', () => {
    enterMoveBus();
    snd.soundQueueActionForTest({ t: 'slotcfg', which: 'sound' }); ticks(2);
    snd.soundQueueActionForTest({ t: 'lfo', lfo: 0 }); ticks(2);
    const comps = snd.soundLfoCompsForTest();
    const names = comps.map(c => c.label).join(' / ');
    if (!names.includes('Plate Reverb'))
        throw new Error('the bus\'s FX 1 is not offered — got: ' + names);
    if (names.includes('Nusaw'))
        throw new Error('⚠ it offered the CHAIN\'s synth on a Move track — wrong address: ' + names);
    /* The stored key must be BARE: the host parses fx1..fxN relative to the bus
     * the LFO already belongs to. A prefixed key would never match. */
    const plate = comps.find(c => c.label === 'Plate Reverb');
    if (plate.key !== 'fx1')
        throw new Error('the stored target key is "' + plate.key + '", must be the bare "fx1"');
});

step('⭐⭐ COMMITTING A TARGET writes the BUS\'s key with the BARE value', () => {
    enterMoveBus();
    snd.soundQueueActionForTest({ t: 'slotcfg', which: 'sound' }); ticks(2);
    snd.soundQueueActionForTest({ t: 'lfo', lfo: 0 }); ticks(2);
    writes.length = 0;
    snd.soundCommitLfoTargetForTest('fx1', 'size');
    ticks(2);
    const tgt = writes.find(w => w.key === 'move_fx:1:lfo1:target');
    if (!tgt) throw new Error('no move_fx:1:lfo1:target write — wrote: ' +
                              writes.map(w => w.key).join(','));
    if (tgt.val !== 'fx1') throw new Error('target value is "' + tgt.val + '", must be bare "fx1"');
    const prm = writes.find(w => w.key === 'move_fx:1:lfo1:target_param');
    if (!prm || prm.val !== 'size') throw new Error('target_param not written as "size"');
});

step('⚠⚠ CONTROL: the SAME commit on a Schwung track writes the CHAIN key', () => {
    enterChainTrack();
    snd.soundQueueActionForTest({ t: 'slotcfg', which: 'sound' }); ticks(2);
    snd.soundQueueActionForTest({ t: 'lfo', lfo: 0 }); ticks(2);
    writes.length = 0;
    snd.soundCommitLfoTargetForTest('synth', 'cutoff');
    ticks(2);
    if (!writes.find(w => w.key === 'lfo1:target'))
        throw new Error('a chain track no longer writes lfo1:target — wrote: ' +
                        writes.map(w => w.key).join(','));
    if (writes.find(w => w.key.indexOf('move_fx:') === 0))
        throw new Error('a chain track wrote a move_fx key: ' +
                        writes.map(w => w.key).join(','));
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
