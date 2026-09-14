/* tests/js/test_project_open_mismatch.mjs — PROJECT DID NOT OPEN.
 *
 * Move can be pointed at a project (pad = song index) and open something else:
 * it logs `About to load default song` and sits on an unsaved set of its own.
 * The host resolves the project by index regardless, so before this screen
 * dAVEBOx loaded that project and autosaved INTO it while Move held a different
 * set — the save-destination hazard in
 * _worklogs/specs/2026-09-14-new-project-default-song-plan.md.
 *
 * This drives the REAL init / tick / MIDI path with host stubs that copy the
 * C side, not convenient semantics:
 *   - active_set.txt is what shadow_ui.js writes on SET_CHANGED: whatever the
 *     shim published. The shim's decision is src/host/shadow_loaded_set_policy.h
 *     (unit-tested in tests/host/test_loaded_set_policy.c); `hostPublish` below
 *     applies its outcomes, and the identity PREFIX is read out of that header
 *     so the two sides cannot drift.
 *   - the DSP refuses every save while awaiting_select is 1 (seq8_save_state,
 *     state_full, state_chunk_), answers state_uuid with what it loaded, and
 *     only state_load clears awaiting_select.
 *   - host_file_exists is a bare stat: an empty file exists.
 *
 * Cases: resolver X + Move says `default` (screen on the OLED, no save aimed at
 * X — including the boot that already HAD X loaded); file absent (unknown, no
 * screen); file == X (no screen); Retry issues the switch for the same pad;
 * Back opens the project picker. */

import './_bulk_get_stub.mjs';
import { readFileSync } from 'fs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const HOST_DIR = '/data/UserData/dbx-host';
const ACTIVE = HOST_DIR + '/active_set.txt';
const SETS = '/data/UserData/UserLibrary/Sets/';
const P = 'aaaaaaaa-0000-4000-8000-00000000000p'.replace('p', '1');
const X = 'bbbbbbbb-0000-4000-8000-000000000031';

/* ---- an in-memory filesystem with the device's semantics ---------------- */
const files = new Map();
const writes = [];                       /* every path any save aimed at */
globalThis.host_read_file = (p) => (files.has(String(p)) ? files.get(String(p)) : '');
globalThis.host_file_exists = (p) => files.has(String(p));        /* stat(): empty exists */
globalThis.host_write_file = (p, body) => { writes.push(String(p)); files.set(String(p), String(body)); return true; };
globalThis.host_ensure_dir = (p) => { writes.push(String(p)); return true; };
globalThis.host_remove_dir = () => false;                          /* fenced off Sets/ on the device */
const sysCmds = [];
/* host_system_cmd blocks (system()): `project-cmd.sh list` has WRITTEN
 * projects.json by the time it returns, which is what the picker relies on. */
const PROJECTS_JSON = JSON.stringify({ current: 31, projects: [
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Project 1', index: 0, color: 1 },
    { uuid: 'bbbbbbbb-0000-4000-8000-000000000031', name: 'Project 32', index: 31, color: 2 },
]});
globalThis.host_system_cmd = (c) => {
    sysCmds.push(String(c));
    if (/project-cmd\.sh list$/.test(String(c))) files.set('/data/UserData/dbx-host/projects.json', PROJECTS_JSON);
    return 0;
};

/* ---- the DSP, as seq8.c behaves ------------------------------------------ */
const dsp = { uuid: '', awaiting: 0, dirty: 1 };
const BLOB = '{"v":36,"tracks":[]}';
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return dsp.uuid;
    if (k === 'awaiting_select') return String(dsp.awaiting);
    if (k === 'state_version_mismatch') return '0';
    /* pollDSP's per-poll snapshot: stopped, nothing playing. Without it pollDSP
     * returns before its save block and every saver here is silently inert. */
    if (k === 'state_snapshot') return new Array(64).fill('0').join(' ');
    if (k === 'state_snap_len') return String(dsp.awaiting ? 0 : BLOB.length);
    if (k === 'state_chunk_0') return (dsp.awaiting || !dsp.dirty) ? '' : BLOB;
    if (k.indexOf('state_chunk_') === 0) return '';
    if (k === 'state_full') return (dsp.awaiting || !dsp.dirty) ? '' : BLOB;
    return '';
};
globalThis.host_module_set_param = (k, v) => {
    k = String(k); v = String(v);
    if (k === 'awaiting_select') { if (v[0] === '1') dsp.awaiting = 1; return; }
    if (k === 'save') { if (!dsp.awaiting) writes.push(SETS + (dsp.uuid || '<fallback>') + '/dAVEBOx/seq8sa-state.json'); return; }
    if (k === 'state_load') { dsp.uuid = v; dsp.awaiting = 0; return; }
};
globalThis.host_module_set_params = () => true;

/* ---- the host's publish, per shadow_loaded_set_policy.h ------------------ */
/* The suite runs from davebox/ (tests/js/run.sh cds there); the bundle is CJS. */
const POLICY = readFileSync('../src/host/shadow_loaded_set_policy.h', 'utf8');
const HOST_PREFIX = (POLICY.match(/#define LOADED_SET_UNOPENED_PREFIX "([^"]+)"/) || [])[1];
let seq = 0;
/* moveSays: null (file absent) | 'default' | a uuid. Past the policy's settle and
 * hold windows, which is where each of these outcomes is final. */
function hostPublish(resolvedUuid, name, index, moveSays) {
    let uuid;
    if (moveSays === null || String(moveSays).toLowerCase() === resolvedUuid.toLowerCase()) uuid = resolvedUuid;
    else uuid = HOST_PREFIX + index + '-' + (++seq);
    files.set(ACTIVE, uuid + '\n' + name);   /* shadow_ui.js: uuid + "\n" + setName */
}

/* ---- display: a framebuffer plus the strings each frame printed ---------- */
let frameText = [];
globalThis.clear_screen = () => { frameText = []; };
globalThis.print = (x, y, str) => { frameText.push(String(str)); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_param = (slot, k) => (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
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
const tickmod = await import('../../ui/ui_tick.mjs');
const render = await import('../../ui/ui_render.mjs');
const shared = await import('/data/UserData/schwung/shared/session_state.mjs');

const JOG_CLICK = 3, JOG_TURN = 14, BACK = 51;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
function frame() { globalThis.clear_screen(); render.drawUI(); return frameText.join(' | '); }
const onScreen = () => frame().indexOf('PROJECT DID NOT OPEN') >= 0;
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

/* A relaunch: Move restarted, a fresh DSP loaded whatever active_set.txt named
 * at that moment, and dAVEBOx init()s. */
function boot(activeUuid, activeName) {
    files.clear(); writes.length = 0; sysCmds.length = 0;
    if (activeUuid) {
        files.set(ACTIVE, activeUuid + '\n' + activeName);
        /* A project that has been used before has its state file. */
        files.set(SETS + activeUuid + '/dAVEBOx/seq8sa-state.json', BLOB);
    }
    dsp.uuid = activeUuid || ''; dsp.awaiting = 0; dsp.dirty = 1;
    S.projectOpenFailed = null; S.projectPadPicker = null; S.pendingOpenProjectPicker = false;
    S.pendingProjectRelaunch = null; S.pendingProjectSwitch = null;
    S.pendingSetLoad = false; S.pendingDspSync = 0; S.stateLoading = false;
    S.awaitingProjectSelect = false; S.confirmStateWipe = false;
    globalThis.init();
    S.ledInitComplete = true;
    ticks(20);
}
/* Give every autonomous saver its chance: an immediate deferred save, a quiet
 * transport, a suspend edge's saveState. */
function provokeSaves() {
    S.saveNowOnce = true; S.playing = false; S.lastInputTick = 0;
    ticks(200);
}
const aimedAt = (uuid) => writes.filter((w) => w.indexOf(uuid) >= 0);

step('the placeholder prefix is the same on both sides of the seam', () => {
    if (!HOST_PREFIX) throw new Error('LOADED_SET_UNOPENED_PREFIX not found in the host header');
    if (HOST_PREFIX !== shared.UNOPENED_SET_UUID_PREFIX)
        throw new Error('host ' + HOST_PREFIX + ' vs shared ' + shared.UNOPENED_SET_UUID_PREFIX);
});

/* 1. The relaunch after creating X: the session was in P, Move was sent to pad
 *    31 and said `default song`. */
step('resolver X + Move says default -> PROJECT DID NOT OPEN is on the OLED', () => {
    boot(P, 'Project 1');
    if (onScreen()) throw new Error('screen up before any verdict');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (!onScreen()) throw new Error('rendered frame: ' + frame());
    if (frame().indexOf('Project 32') < 0) throw new Error('project name not shown: ' + frame());
});
step('...and no save of any kind is aimed at X', () => {
    provokeSaves();
    const hits = aimedAt(X);
    if (hits.length) throw new Error('saves aimed at X: ' + hits.join(', '));
    if (!onScreen()) throw new Error('screen went away');
});

/* 1b. The harder boot: active_set.txt still named X from an earlier session in
 *     which X DID open, so the fresh DSP loaded X — and Move refused it now. */
step('X already loaded at boot + Move says default -> no save reaches X after the verdict', () => {
    boot(X, 'Project 32');
    /* POSITIVE CONTROL: before any verdict the savers in this rig really do
     * write X — otherwise "nothing reached X" below would prove nothing. */
    provokeSaves();
    if (!aimedAt(X).length) throw new Error('control: no saver reached X even before the verdict — rig is inert');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    const before = writes.length;
    dsp.dirty = 1;
    provokeSaves();
    const hits = writes.slice(before).filter((w) => w.indexOf(X) >= 0);
    if (hits.length) throw new Error('saves aimed at X after the verdict: ' + hits.join(', '));
    if (dsp.awaiting !== 1) throw new Error('the DSP was not told to refuse saves');
    if (!onScreen()) throw new Error('no screen: ' + frame());
});

/* 2. Unknown is not default. */
step('file absent (unknown) -> no screen', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, null);
    ticks(400);
    if (onScreen()) throw new Error('screen raised on an unknown answer');
    if (S.projectOpenFailed) throw new Error('state raised on an unknown answer');
});

/* 3. The healthy load. */
step('Move loaded X -> no screen', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, X);
    ticks(400);
    if (onScreen()) throw new Error('screen raised on a matching load');
});

/* 4. Retry and Back, through the real jog / Back gestures. */
step('Retry (jog click on the default button) issues the switch for the same pad', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (!onScreen()) throw new Error('no screen');
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(3);
    const sw = sysCmds.filter((c) => /project-cmd\.sh switch 31$/.test(c));
    if (sw.length !== 1) throw new Error('switch commands: ' + JSON.stringify(sysCmds));
    if (!onScreen()) throw new Error('screen must stay up (locked) while the session restarts');
    cc(JOG_CLICK, 127); ticks(3);
    if (sysCmds.filter((c) => c.indexOf('switch') >= 0).length !== 1)
        throw new Error('a second click queued a second switch');
});
step('Back (jog to Back + click) opens the project picker', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    cc(JOG_TURN, 1); cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(2);
    if (S.projectOpenFailed) throw new Error('screen still up');
    if (!S.projectPadPicker) throw new Error('picker not open');
    if (sysCmds.some((c) => c.indexOf('switch') >= 0)) throw new Error('Back issued a switch');
});
step('the Back BUTTON does the same', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    cc(BACK, 127); cc(BACK, 0);
    ticks(2);
    if (S.projectOpenFailed || !S.projectPadPicker) throw new Error('Back button did not reach the picker');
});

if (failed) { console.error('FAIL: project_open_mismatch'); process.exit(1); }
console.log('PASS: project_open_mismatch');
}
main().catch((e) => { console.error(e); process.exit(1); });
