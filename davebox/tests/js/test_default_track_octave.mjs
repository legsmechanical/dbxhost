/* tests/js/test_default_track_octave.mjs — melodic pads start on octave +1
 * (Josh, 2026-09-24), and a project NEVER inherits the last one's octaves.
 *
 *   1. A fresh runtime starts every track on DEFAULT_TRACK_OCTAVE.
 *   2. A saved sidecar's octaves win (an existing project keeps its own).
 *   3. A project with NO sidecar resets to the default. Before this, the fresh
 *      branch of restoreUiSidecar left the previous project's octaves in place.
 *   4. A sidecar older than v7 (no `to`) resets to the default too.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function assert(cond, label) { if (cond) ok(label); else bad(label, 'assertion failed'); }

/* ---- host stubs -------------------------------------------------------- */
const written = Object.create(null);          /* path -> last payload */
let fsFiles = Object.create(null);            /* path -> contents for reads */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (p in fsFiles ? fsFiles[p] : '');
globalThis.host_file_exists = (p) => (p in fsFiles);
globalThis.host_write_file = (p, c) => { written[p] = c; return true; };
globalThis.host_ensure_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';   /* dbx_state_subdir.h's answer */
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
const { DEFAULT_TRACK_OCTAVE } = await import('../../ui/ui_constants.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');

const UUID = 'test-default-octave-uuid';
const uiPath = persist.uuidToUiStatePath(UUID);
S.currentSetUuid = UUID;
S.awaitingProjectSelect = false;
S.pendingSetLoad = false;
S.pendingDspSync = 0;
const all = (v) => S.trackOctave.every((o) => o === v);

assert(DEFAULT_TRACK_OCTAVE === 1, 'the default is +1');
assert(all(DEFAULT_TRACK_OCTAVE), '1. a fresh runtime starts on the default: ' + S.trackOctave);

try {
    fsFiles[uiPath] = JSON.stringify({ v: 9, to: [0, -2, 3, 1, 1, 1, 4, -4] });
    bridge.restoreUiSidecar(false);
    assert(S.trackOctave.join() === '0,-2,3,1,1,1,4,-4', '2. a saved project keeps its octaves: ' + S.trackOctave);
} catch (e) { bad('saved octaves restore', e); }

try {
    fsFiles = Object.create(null);            /* the next project has no sidecar */
    assert(!all(DEFAULT_TRACK_OCTAVE), 'precondition: the last project left non-default octaves');
    bridge.restoreUiSidecar(false);
    assert(all(DEFAULT_TRACK_OCTAVE), '3. a project with no sidecar does not inherit the last one: ' + S.trackOctave);
} catch (e) { bad('no-sidecar reset', e); }

try {
    S.trackOctave.fill(-3);
    fsFiles[uiPath] = JSON.stringify({ v: 6 });
    bridge.restoreUiSidecar(false);
    assert(all(DEFAULT_TRACK_OCTAVE), '4. a pre-v7 sidecar starts on the default: ' + S.trackOctave);
} catch (e) { bad('old sidecar reset', e); }

process.exit(failed);
}
main().catch(e => { bad('main', e); process.exit(1); });
