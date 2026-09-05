/* tests/js/test_midi_via_slot_sync.mjs — item 15 (2026-09-05): the three facts of a MIDI
 * track running through its parked slot (the slot's midi_out + channel, the
 * DSP's midi_via_slot) are set together and follow the route, the channel and
 * the MIDI FX load.
 *
 * A track with no instrument: the pattern plays, nothing is emitted, the chain
 * slot is parked. This file pins the JS half — the picker row, the encode/decode
 * through `t<N>_route = 'none'`, the live-note drop against a Schwung CONTROL,
 * and the screens that must collapse for it — with source pins where the state
 * is module-private. The DSP half is tests/test_route_none.c. */
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
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 1;


async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');

function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

/* the slot's loaded MIDI FX, per slot, as the engine would answer */
const fxLoaded = {};
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    if (k.indexOf('midi_fx1:module') >= 0) return fxLoaded[slot] || '';
    if (k.indexOf('synth:module') >= 0) return 'nusaw';
    return '';
};
const chainWrites = [];
globalThis.shadow_set_param = (slot, k, v) => { chainWrites.push([slot, k, String(v)]); return true; };
const dspWrites = [];
const _hmsp = globalThis.host_module_set_param;
globalThis.host_module_set_param = (k, v) => { dspWrites.push([k, String(v)]); return _hmsp ? _hmsp(k, v) : true; };
const lastChain = (slot, key) => { for (let i = chainWrites.length - 1; i >= 0; i--) if (chainWrites[i][0] === slot && chainWrites[i][1] === key) return chainWrites[i][2]; return null; };
const lastDsp = (key) => { for (let i = dspWrites.length - 1; i >= 0; i--) if (dspWrites[i][0] === key) return dspWrites[i][1]; return null; };

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 5;
    S.trackChannel[5] = 5;               /* MIDI channel 5 (1-based) */
});
step('route → MIDI with an EMPTY slot: straight to the port (midi_out synth, via_slot 0)', () => {
    chainWrites.length = 0; dspWrites.length = 0;
    B.applyInstrChoice(5, C.INSTR_MIDI_CH + 4);
    if (S.trackRoute[5] !== 2) throw new Error('route ' + S.trackRoute[5]);
    if (lastChain(5, 'midi_out') !== 'synth') throw new Error('midi_out=' + lastChain(5, 'midi_out'));
    if (lastChain(5, 'midi_out_channel') !== '-1') throw new Error('ch=' + lastChain(5, 'midi_out_channel'));
    if (lastDsp('t5_midi_via_slot') !== '0') throw new Error('via_slot=' + lastDsp('t5_midi_via_slot'));
});
step('a MIDI FX loaded in the parked slot: through the slot, out the port on the TRACK\'s channel', () => {
    fxLoaded[5] = 'arp';
    chainWrites.length = 0; dspWrites.length = 0;
    B.syncMidiViaSlot(5);
    if (lastChain(5, 'midi_out') !== 'external') throw new Error('midi_out=' + lastChain(5, 'midi_out'));
    if (lastChain(5, 'midi_out_channel') !== '4') throw new Error('channel 5 must be wire nibble 4, got ' + lastChain(5, 'midi_out_channel'));
    if (lastDsp('t5_midi_via_slot') !== '1') throw new Error('via_slot=' + lastDsp('t5_midi_via_slot'));
});
step('a channel change follows onto the wire', () => {
    chainWrites.length = 0;
    B.applyTrackConfig(5, 'channel', 12);
    if (lastChain(5, 'midi_out_channel') !== '11') throw new Error('ch=' + lastChain(5, 'midi_out_channel'));
});
step('the FX removed: back to the port directly', () => {
    fxLoaded[5] = '';
    chainWrites.length = 0; dspWrites.length = 0;
    B.syncMidiViaSlot(5);
    if (lastChain(5, 'midi_out') !== 'synth' || lastDsp('t5_midi_via_slot') !== '0') throw new Error('did not fall back');
});
step('route → Schwung: the slot plays its own synth again (midi_out synth, via_slot 0)', () => {
    fxLoaded[5] = 'arp';
    chainWrites.length = 0; dspWrites.length = 0;
    B.applyInstrChoice(5, C.INSTR_SCHWUNG);
    if (lastChain(5, 'midi_out') !== 'synth') throw new Error('midi_out=' + lastChain(5, 'midi_out'));
    if (lastChain(5, 'midi_out_channel') !== '-1') throw new Error('ch=' + lastChain(5, 'midi_out_channel'));
    if (lastDsp('t5_midi_via_slot') !== '0') throw new Error('via_slot=' + lastDsp('t5_midi_via_slot'));
});
if (failed) process.exit(1);
console.log('PASS: test_midi_via_slot_sync.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
