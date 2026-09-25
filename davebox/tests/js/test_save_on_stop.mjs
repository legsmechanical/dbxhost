/* tests/js/test_save_on_stop.mjs — pressing STOP saves the project at once
 * (Josh, 2026-09-24), where it used to wait for a second of no input — which
 * never came while the user kept editing.
 *
 * The path is the real one: pollDSP reads the DSP's per-poll snapshot, sees
 * the transport go from playing to stopped, and its save block writes the blob.
 * CONTROL first: stopped with the user still turning things and no stop edge
 * writes nothing, so the positive below is the edge and not the quiet timer.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const written = Object.create(null);
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line',
    'set_pixel', 'flush_display', 'move_midi_internal_send', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi', 'host_module_set_param'])
    globalThis[fn] = () => 0;
globalThis.host_write_file = (p, c) => { written[p] = c; return true; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => String(t).length * 6;

const UUID = 'stop-save-uuid';
const BLOB = '{"v":36,"tracks":[]}';
const dsp = { playing: '1' };
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return UUID;
    if (k === 'state_snapshot') { const a = new Array(64).fill('0'); a[0] = dsp.playing; return a.join(' '); }
    if (k === 'state_snap_len') return String(BLOB.length);
    if (k === 'state_chunk_0') return BLOB;
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS } = await import('../../ui/ui_constants.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID;
const statePath = persist.uuidToStatePath(UUID);
/* The user never stops touching things: the quiet timer can never fire. */
const poll = () => { S.clockMs += 11; S.lastInputTick = S.clockMs; bridge.pollDSP(); };

step('precondition: playing, and nothing is saved while it plays', () => {
    dsp.playing = '1'; poll();
    assert(S.playing, 'the transport is not playing');
    delete written[statePath];
    for (let i = 0; i < 5; i++) poll();
    assert(!(statePath in written), 'saved while playing');
});
step('CONTROL: stopped but never quiet, and no stop edge, saves nothing', () => {
    dsp.playing = '0'; S.playing = false; S.saveNowOnce = false;
    delete written[statePath];
    for (let i = 0; i < 5; i++) poll();
    assert(!(statePath in written), 'the quiet timer fired with input every poll');
});
step('⭐ the STOP edge saves in the same poll, with the user still busy', () => {
    dsp.playing = '1'; poll();
    delete written[statePath];
    dsp.playing = '0'; poll();
    assert(!S.playing, 'the stop was not seen');
    assert(written[statePath] === BLOB, 'no save at the stop edge');
});
step('one save per stop: the edge does not repeat', () => {
    delete written[statePath];
    for (let i = 0; i < 5; i++) poll();
    assert(!(statePath in written), 'saved again without a new stop');
});

process.exit(failed);
}
main().catch((e) => { bad('main', e); process.exit(1); });
