/* tests/js/bundle_seq_apply.mjs — SEQUENCER-LANE PLAYBACK, THROUGH THE REAL
 * BUNDLE. Run by tests/test_seq_lane_playback.sh (not by the tests/js runner:
 * this one bundles ui/ui.js ITSELF, because the bug it exists to catch is a
 * property of the BUNDLE and of nothing else).
 *
 * Josh, 2026-09-11, on the device: "automatable sequence params show all the
 * indications on the ui that they've been recorded but they don't actually play
 * back... the actual values on the sequencer bank oled cells don't change on
 * playback even though they have dots."
 *
 * ⚠⚠ WHY A BUNDLE TEST. The applier was registered by a call in ui_sound.mjs's
 * MODULE BODY, and ui_automation.mjs's body holds `let seqApplier = null`. Node
 * evaluates a dependency's body FIRST, so under every ordinary test the
 * registration survived. esbuild ordered ui_sound's body FIRST in the shipped
 * bundle, so the registration was wiped by that `= null` and the device silently
 * dropped every staged sequencer value. A test that imports the modules cannot
 * see this; only the artifact can. → [[schwung-two-bundlers-one-ships]] */
import * as esbuild from 'esbuild';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');          /* davebox/ */
const DEVICE_PREFIX = '/data/UserData/schwung/shared/';
const stubPlugin = {
    name: 'device-shared',
    setup(build) {
        build.onResolve({ filter: /^\/data\/UserData\/schwung\/shared\/constants\.mjs$/ }, () => ({
            path: path.join(__dirname, 'stubs/shared_constants.mjs'),
        }));
        build.onResolve({ filter: /^\/data\/UserData\/schwung\/shared\// }, (a) => ({
            path: path.join(repoRoot, '..', 'src/shared', a.path.slice(DEVICE_PREFIX.length)),
        }));
        build.onResolve({ filter: /^(std|os)$/ }, (a) => ({
            path: path.join(__dirname, a.path === 'os' ? 'stubs/quickjs_os.mjs' : 'stubs/quickjs_std.mjs'),
        }));
    },
};

/* The entry imports ui.js FIRST and then re-exports the state and the owner, so
 * the bundle's module ORDER is ui.js's own — the shipped one — while the probe
 * can still reach in. Reading them with a second `import` of the source files
 * would load a SECOND copy (and re-resolve the device paths), which is not the
 * artifact under test. */
const dir = process.env.DAVEBOX_JS_TEST_DIR || os.tmpdir();
fs.mkdirSync(dir, { recursive: true });
const entry = path.join(dir, 'ui_bundle_entry.mjs');
fs.writeFileSync(entry, "import " + JSON.stringify(path.join(repoRoot, 'ui/ui.js')) + ";\n"
    + "export { S } from " + JSON.stringify(path.join(repoRoot, 'ui/ui_state.mjs')) + ";\n"
    + "export * as auto from " + JSON.stringify(path.join(repoRoot, 'ui/ui_automation.mjs')) + ";\n");
const out = path.join(dir, 'ui_bundle_probe.mjs');
await esbuild.build({
    entryPoints: [entry],
    bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
    plugins: [stubPlugin],
});

/* ---- the host surface, before the bundle is evaluated ---- */
let failed = 0;
const fail = (m) => { console.error('  FAIL — ' + m); failed = 1; };
const modSets = [];
let staged = '';
let LIST = '';
globalThis.host_module_set_param = (k, v) => { modSets.push(k + '=' + v); };
globalThis.host_module_set_params = (b) => true;
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_pending') { const r = staged; staged = ''; return r; }
    if (k === 'pa_list') return LIST;
    if (k === 'pa_store_full' || k === 'pa_ring_dropped' || k === 'pa_owner_conflict') return '0';
    return '';
};
globalThis.host_module_get_params = () => '';
globalThis.host_read_file = () => '';
globalThis.host_write_file = () => true;
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_system_cmd = () => 0;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true;
globalThis.shadow_get_params = () => '';
globalThis.shadow_get_shift_held = () => 0;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.host_set_led = () => {};
globalThis.host_get_setting = () => ''; globalThis.host_set_setting = () => 0;
globalThis.host_send_midi = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.host_trace_begin = () => 0; globalThis.host_trace_end = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_set_ui_flags = () => 0;
/* Anything else init() reaches for: a no-op, declared up front so a missing
 * binding is not mistaken for the behaviour under test. */
for (const fn of ['host_register_primary', 'host_open_service', 'host_close_service',
                  'host_suspend_overtake', 'host_hide_module', 'host_exit_module',
                  'host_load_module', 'host_module_init', 'host_canvas_input',
                  'host_list_dir', 'host_stat', 'host_get_bpm', 'host_get_clock_status',
                  'host_pad_observe', 'host_claim_ccs', 'host_release_ccs',
                  'host_set_button_led', 'setButtonLED', 'host_display_flush'])
    if (typeof globalThis[fn] !== 'function') globalThis[fn] = () => 0;

const { S, auto } = await import(pathToFileURL(out).href);

if (typeof globalThis.init !== 'function') { fail('the bundle defined no init()'); process.exit(1); }
globalThis.init();

/* A melodic track 3 with one automated sequencer parameter: NOTE FX Gate Time
 * (0..400), staged at half = 200 — the same case the device shows dots for. */
const T = 2;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
S.trackActiveClip[T] = 0;
LIST = T + ' 0 1 4 seq:' + T + ':noteFX_gate 0 0\n';
auto.automationRefreshPresence();
staged = 'seq:' + T + ':noteFX_gate 8191\n';
S.playing = true;
modSets.length = 0;
for (let i = 0; i < 6; i++) { S.tickCount++; globalThis.tick(); }
S.playing = false;

const wrote = modSets.find(x => x.startsWith('t' + T + '_noteFX_gate='));
if (!wrote)
    fail('the bundle applied NOTHING for a staged sequencer lane — the applier is not registered '
         + '(this is the device bug: dots on the cells, values that never move). Writes seen: '
         + JSON.stringify(modSets.slice(0, 8)));
else if (wrote !== 't' + T + '_noteFX_gate=200')
    fail('applied the wrong value: ' + wrote + ' (8191/16383 of 0..400 is 200)');
else console.log('  ok   — ⭐ the SHIPPED BUNDLE applies a staged sequencer lane: ' + wrote);

if (S.bankParams && S.bankParams[T] && S.bankParams[T][1] && S.bankParams[T][1][5] !== 200)
    fail('the bank mirror did not follow, so the OLED cell would not move: ' + S.bankParams[T][1][5]);
else console.log('  ok   — the bank mirror follows, so the cell shows the value');

if (failed) process.exit(1);
console.log('bundle_seq_apply: all ok');
