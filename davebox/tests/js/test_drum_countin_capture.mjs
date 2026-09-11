import './_bulk_get_stub.mjs';
/* tests/js/test_drum_countin_capture.mjs — a drum pad hit in the tail of a
 * count-in lands on step 1.
 *
 * From 2026-09-02 (7329e30e, the ms timing rework) to 2026-09-11 the drum branch
 * of the preroll capture used `tps` after that commit deleted its declaration: the
 * tick threw on it — AFTER taking the note off the queue — so the hit was simply
 * lost, and the rest of that tick never ran. Found by tools/check_undeclared.mjs.
 *
 * Drives it the real way: the pad press goes through the MIDI handler while the
 * count-in is running (that is what queues the note), then the count-in ends and
 * the tick does the rest. Asserts the step-1 write and an EMPTY JS error log. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let LIST = '';
let STEPS = {};                      /* 't<T>_c<C>' -> the pa_steps answer */
let stepReads = 0;
let failStepsRead = false;
const leds = {};                     /* note -> colour, NoteOn only */
let jsErrors = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = (path, body) => { if (/jserr/.test(String(path))) jsErrors = String(body); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) { stepReads++; return failStepsRead ? null : (STEPS[m[1]] || ''); }
    return '';
};
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }, { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM, TRACK_PAD_BASE } = await import('../../ui/ui_constants.mjs');
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.clockFollowTicks = true;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs = Math.round(S.tickCount * 10.6); globalThis.tick(); } };
S.trackPadMode[0] = PAD_MODE_DRUM;
ticks(2);

/* Record armed on track 1, the count-in running. */
S.recordArmed = true; S.recordArmedTrack = 0; S.recordCountingIn = true;
S.countInStartMs = S.clockMs - 1900;
/* The pad press, the real way — during the count-in it queues the preroll note. */
globalThis.onMidiMessageInternal(new Uint8Array([0x90, TRACK_PAD_BASE, 100]));
const queued = S.pendingPrerollNote;
step('setup: a pad press during the count-in queues a DRUM preroll note', () =>
    assert(queued && queued.isDrum, 'queued: ' + JSON.stringify(queued)));
globalThis.onMidiMessageInternal(new Uint8Array([0x80, TRACK_PAD_BASE, 0]));

/* The count-in ends; the transport is running. */
S.recordCountingIn = false; S.playing = true; S.transportStartMs = S.clockMs;
sets.length = 0;
ticks(40);                                           /* > one 16th at 120 bpm */

step('⭐ the hit lands on the lane\'s step 1', () => {
    const lane = queued.lane;
    assert(sets.some(x => x.indexOf('t0_l' + lane + '_step_0_toggle=') === 0),
           'no step-0 toggle; writes: ' + JSON.stringify(sets.filter(x => /_step_|preroll/.test(x)).slice(0, 6)));
});
step('⭐ and nothing was swallowed into the JS error log', () =>
    assert(jsErrors === '', 'seq8-jserr.log got: ' + jsErrors.slice(0, 200)));
if (failed) process.exit(1);
console.log('test_drum_countin_capture: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
