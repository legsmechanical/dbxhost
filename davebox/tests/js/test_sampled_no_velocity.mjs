/* tests/js/test_sampled_no_velocity.mjs — Audio and Slicer offer nothing
 * that does nothing.
 *
 * Josh, 2026-11-02, on the Slicer: "no velocity modulation" — the engine
 * plays every chop at one level, and an Audio clip has no notes at all. So
 * neither track offers VelIn in its config rows, and MIDI Import (whose notes
 * would be chop numbers the Slicer mostly does not have) is not offered on
 * either. A melodic track keeps both.
 */
import './_bulk_get_stub.mjs';

import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const ENGINE = {};
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw'
        : (ENGINE[k] !== undefined ? ENGINE[k] : '');
globalThis.shadow_set_param = (slot, k, v) => { ENGINE[k] = String(v); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
const SENT = [];
globalThis.host_module_set_param = (k, v) => { SENT.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
for (const fn of ['host_system_cmd', 'host_read_file', 'host_file_exists', 'host_write_file',
                  'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now', 'host_vol_block',
                  'host_edit_cc_block', 'clear_screen', 'print', 'draw_rect', 'fill_rect',
                  'draw_line', 'set_pixel', 'flush_display', 'move_midi_internal_send', 'set_led',
                  'shadow_get_ui_flags', 'host_register_primary', 'host_open_service',
                  'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'stipple_rect', 'shadow_get_shift_held'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const C = await import('../../ui/ui_constants.mjs');
const MI = await import('../../ui/ui_midi_import.mjs');

const keys = (t) => snd.configRowsForTest(t).map((r) => r && r.key);

step("⭐ VelIn is a melodic track's row, never an Audio or Slicer one", () => {
    GS.trackPadMode[2] = 0;
    assert(keys(2).indexOf('velin') >= 0, 'a melodic track lost VelIn: ' + keys(2).join(','));
    for (const [pm, label] of [[C.PAD_MODE_AUDIO, 'Audio'], [C.PAD_MODE_SLICER, 'Slicer']]) {
        GS.trackPadMode[2] = pm;
        assert(keys(2).indexOf('velin') < 0, label + ' offers VelIn: ' + keys(2).join(','));
    }
    GS.trackPadMode[2] = 0;
});

step('⭐ MIDI Import is offered on a melodic track, never on Audio or Slicer', () => {
    GS.trackPadMode[2] = 0;
    assert(MI.miOffered(2), 'not offered on a melodic track');
    GS.trackPadMode[2] = C.PAD_MODE_AUDIO;
    assert(!MI.miOffered(2), 'offered on Audio');
    GS.trackPadMode[2] = C.PAD_MODE_SLICER;
    assert(!MI.miOffered(2), 'offered on a Slicer');
    GS.trackPadMode[2] = 0;
});

if (failed) { console.log('FAIL: test_sampled_no_velocity'); process.exit(1); }
console.log('PASS: test_sampled_no_velocity');
}
main().catch(e => { console.error(e); process.exit(1); });
