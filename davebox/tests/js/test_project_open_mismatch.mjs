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
/* dbx_state_subdir.h, per project: X ("Project 32") is the device's measured
 * loser, so its state dir is the chosen `dAVEBOx~3`; P keeps the plain name. */
const stateName = (uuidOrDir) => (String(uuidOrDir).indexOf(X) >= 0 ? 'dAVEBOx~3' : 'dAVEBOx');
globalThis.host_state_subdir = (dir) => stateName(dir);
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
/* Every value JS ever pushed into awaiting_select, in order — the save gate's
 * own history. A fresh session must show '1' once (init's own arm, if any) and
 * never a 0/1 flap, because a flap means a save was briefly permitted. */
const awWrites = [];
/* Every state_load the DSP was sent — the one event that means "a project was
 * loaded", whether a pick asked for it or something loaded behind the user. */
const stateLoads = [];
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
    if (k === 'awaiting_select') { awWrites.push(v); if (v[0] === '1') dsp.awaiting = 1; return; }
    if (k === 'save') { if (!dsp.awaiting) writes.push(SETS + (dsp.uuid || '<fallback>') + '/' + stateName(dsp.uuid) + '/seq8sa-state.json'); return; }
    if (k === 'state_load') { stateLoads.push(v); dsp.uuid = v; dsp.awaiting = 0; return; }
};
globalThis.host_module_set_params = () => true;

/* ---- the host, as a STATEFUL fake driven by the real machine -------------
 *
 * ⚠⚠ This used to fake the PUBLISH and nothing else: it wrote active_set.txt
 * itself, with the semantics the host had at the time. That made it a copy of
 * the producer rather than a stand-in for it, and when the producer changed the
 * copy went on describing a host that no longer existed — nine steps of this
 * file passed against a tree where the mechanism they cover was dead.
 *
 * So the fake now holds the host's STATE and answers the same two params the
 * real one does. The vocabulary is read out of the C header, so a rename there
 * fails here rather than on a device. */
const POLICY = readFileSync('../src/host/shadow_loaded_set_policy.h', 'utf8');
const STATES  = (POLICY.match(/return "(open|none|pending)";/g) || []).length;
const REASONS = ['unopened', 'default', 'unknown']
    .filter((r) => POLICY.indexOf('return "' + r + '";') >= 0);

/* The host's published record. `pending` is the resting state: nothing is
 * confirmed until Move says so. */
let hostState = { state: 'pending', reason: '', uuid: '', name: '', index: -1 };

function publish(state, reason, uuid, name, index) {
    hostState = { state, reason: reason || '', uuid: uuid || '', name: name || '', index };
    /* The real host writes the boot record ONLY on a confirmed open, and an
     * empty identity otherwise — that is what stops anything downstream naming
     * a project Move has not confirmed. */
    if (state === 'open') files.set(ACTIVE, uuid + '\n' + name);
    else files.set(ACTIVE, '\n' + (name || ''));
}

/* moveSays: null (Move has said nothing yet) | 'default' | a uuid.
 * This is the machine's rule, not a re-implementation of it: a request for
 * `resolvedUuid` is confirmed only by Move naming that same uuid. */
function hostPublish(resolvedUuid, name, index, moveSays) {
    if (moveSays === null) { publish('pending', '', '', name, index); return; }
    if (String(moveSays).toLowerCase() === String(resolvedUuid).toLowerCase()) {
        publish('open', '', resolvedUuid, name, index);
    } else {
        publish('none', 'unopened', '', name, index);
    }
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
globalThis.shadow_get_param = (slot, k) => {
    if (k === 'active_set_state') return hostState.state + '\n' + hostState.reason + '\n' + hostState.index;
    if (k === 'active_set') return hostState.state === 'open' ? (hostState.uuid + '\n' + hostState.name) : '\n';
    if (typeof k === 'string' && k.indexOf('synth:module') >= 0) return 'nusaw';
    return '';
};
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
/* The headless select actuator (ui_tick's pendingProjectSwitch branch). Recorded,
 * because after a verdict it is the WRONG way to open a project: Move is sitting
 * on a default set it minted, and walking its overview loads nothing. */
const selectArms = [];
globalThis.shadow_select_arm = (k) => { selectArms.push(k); };
globalThis.host_suspend_overtake = () => {};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const render = await import('../../ui/ui_render.mjs');
const shared = await import('/data/UserData/schwung/shared/session_state.mjs');
const dialogs = await import('../../ui/ui_dialogs.mjs');

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
        files.set(SETS + activeUuid + '/' + stateName(activeUuid) + '/seq8sa-state.json', BLOB);
    }
    dsp.uuid = activeUuid || ''; dsp.awaiting = 0; dsp.dirty = 1;
    /* ⭑ A boot into a project means the host CONFIRMED it — Move logged the
     * load on the way up. Saying so is now the harness's job: identity comes
     * from the host record, so a boot that does not publish one leaves the
     * session with no project and every save correctly refused. */
    if (activeUuid) publish('open', '', activeUuid, activeName, 0);
    else publish('pending', '', '', '', -1);
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
    /* A host suspend: the host swaps clear_screen for a no-op while parked, and
     * the tick saves on that edge (saveState -> sidecar + DSP 'save'). */
    const cs = globalThis.clear_screen;
    globalThis.clear_screen = () => {};
    ticks(4);
    globalThis.clear_screen = cs;
    ticks(4);
}
const aimedAt = (uuid) => writes.filter((w) => w.indexOf(uuid) >= 0);

step('⭑ the verdict is a STATE, not a prefix smuggled inside a name', () => {
    /* The old design encoded "Move did not open it" as a fake uuid sharing the
     * placeholder's prefix, so that writers refusing a placeholder refused it
     * too. That cleverness cost the whole mechanism once: a guard added to the
     * placeholder prefix silently swallowed the verdict. Nothing may decode a
     * name again. */
    if (STATES < 3) throw new Error('the header no longer spells all three states');
    if (REASONS.length !== 3) throw new Error('reasons missing from the header: ' + REASONS.join(','));
    /* ⚠ Match CODE, not the word: the header legitimately names the retired
     * placeholder in prose, explaining what replaced it. A literal is a mint. */
    if (/["']__pending-/.test(POLICY))
        throw new Error('the header still mints a placeholder identity');
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
    /* ...and every one of them aimed at X's RESOLVED state dir, never a plain
     * `dAVEBOx/` beside it (which would list before "Project 32" on the device). */
    const plain = aimedAt(X).filter((w) => w.indexOf('/dAVEBOx/') >= 0);
    if (plain.length) throw new Error('writes to a spelled dAVEBOx/ under X: ' + plain.join(', '));
    if (!aimedAt(X).some((w) => w.indexOf('/dAVEBOx~3/') >= 0)) throw new Error('no write under dAVEBOx~3: ' + aimedAt(X).join(', '));
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    const before = writes.length;
    dsp.dirty = 1;
    provokeSaves();
    const hits = writes.slice(before).filter((w) => w.indexOf(X) >= 0);
    if (hits.length) throw new Error('saves aimed at X after the verdict: ' + hits.join(', '));
    /* Nor ANYWHERE else a project's state could be filed: with no project open
     * a uuid-less save falls back to the stock tree's path, which is not ours. */
    const stray = writes.slice(before).filter((w) =>
        w.indexOf('/dAVEBOx') >= 0 || w.indexOf('seq8') >= 0 || w.indexOf('/data/UserData/schwung/') === 0);
    if (stray.length) throw new Error('project-state saves after the verdict: ' + stray.join(', '));
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

/* 5. Back, then load the SAME pad from the picker (S9). Before the fix the pick
 *    went through the select actuator (or loaded the "current" project in place)
 *    on the default set Move had minted: nothing loaded, and the verdict fired
 *    again. It must relaunch Move into that pad instead. Real gestures only:
 *    Back button, a pad note-on, the jog click on the menu's Load row. */
const PAD_NOTE = (k) => 68 + k;
function padTap(k) {
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, PAD_NOTE(k), 100]));
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, PAD_NOTE(k), 0]));
}
step('verdict -> Back -> pick pad 31 -> Load RELAUNCHES into it (project-cmd switch), no select actuator', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (!onScreen()) throw new Error('no verdict screen');
    cc(BACK, 127); cc(BACK, 0);
    ticks(2);
    if (!S.projectPadPicker) throw new Error('Back did not open the picker');
    sysCmds.length = 0; selectArms.length = 0;
    padTap(31);
    ticks(2);
    const p = S.projectPadPicker;
    if (!p || !p.menu || p.menu.k !== 31) throw new Error('pad tap did not open pad 31\'s menu: ' + JSON.stringify(p && p.menu));
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(6);
    const sw = sysCmds.filter((c) => /project-cmd\.sh switch 31$/.test(c));
    if (sw.length !== 1) throw new Error('expected one relaunch switch to 31, got: ' + JSON.stringify(sysCmds));
    if (selectArms.length) throw new Error('the select actuator was armed: ' + JSON.stringify(selectArms));
    if (S.forceRelaunchNextLoad) throw new Error('the one-shot flag was not consumed');
});
step('control: without a verdict, loading a pre-existing pad still uses the select actuator', () => {
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    S.pendingOpenProjectPicker = false;
    sysCmds.length = 0; selectArms.length = 0;
    /* open the picker the way the Back path does, then pick pad 31 */
    S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    padTap(31);
    ticks(2);
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(6);
    if (sysCmds.some((c) => /switch 31$/.test(c))) throw new Error('relaunched without a verdict: ' + JSON.stringify(sysCmds));
    if (selectArms.indexOf(31) < 0) throw new Error('select actuator not armed for a normal switch: ' + JSON.stringify(selectArms) + ' ' + JSON.stringify(sysCmds));
});

/* 6. THE FRESH SESSION. Device, 2026-09-15, four identical tools-menu launches:
 *    the launcher armed fresh_session, so nothing was loaded and the picker was
 *    pending — and ~3 s in the host published the placeholder for the project
 *    the PREVIOUS session had been in. The verdict fired on a project nobody
 *    had chosen: it killed pendingOpenProjectPicker, and ~1 s later, when Move
 *    finished opening after all, the late-answer branch loaded that project.
 *    SELECT-BEFORE-LOAD was gone every launch, too fast to see on the OLED.
 *
 *    A fresh session must sit on the picker through the whole flip-flop: no
 *    load, no verdict screen, and the save gate never moving off 1. */
function bootFresh(activeUuid, activeName) {
    files.clear(); writes.length = 0; sysCmds.length = 0;
    awWrites.length = 0; stateLoads.length = 0;
    /* active_set.txt still names the LAST session's project — nothing clears it
     * at launch, which is exactly how the host came to publish a verdict about
     * a project this session never asked for. */
    if (activeUuid) {
        files.set(ACTIVE, activeUuid + '\n' + activeName);
        files.set(SETS + activeUuid + '/' + stateName(activeUuid) + '/seq8sa-state.json', BLOB);
    }
    files.set(HOST_DIR + '/fresh_session', '1');   /* the launcher's entry marker */
    /* create_instance saw the marker: nothing loaded, every save refused. */
    dsp.uuid = ''; dsp.awaiting = 1; dsp.dirty = 1;
    publish('pending', '', '', '', -1);   /* nothing confirmed at a fresh launch */
    S.projectOpenFailed = null; S.projectPadPicker = null; S.pendingOpenProjectPicker = false;
    S.pendingProjectRelaunch = null; S.pendingProjectSwitch = null;
    S.pendingSetLoad = false; S.pendingDspSync = 0; S.stateLoading = false;
    S.awaitingProjectSelect = false; S.confirmStateWipe = false;
    S.currentSetUuid = ''; S.forceRelaunchNextLoad = false; S.selectHandoffUntil = 0;
    globalThis.init();
    S.ledInitComplete = true;
    ticks(20);
}
const pickerUp = () => !!(S.projectPadPicker || S.pendingOpenProjectPicker);

step('fresh session: the picker comes up with nothing loaded', () => {
    bootFresh(X, 'Project 32');
    if (!S.awaitingProjectSelect) throw new Error('not awaiting a selection');
    if (!pickerUp()) throw new Error('no picker: ' + frame());
    if (stateLoads.length) throw new Error('something loaded before a pick: ' + stateLoads.join(', '));
});
step('...a verdict about the LAST session\'s project does not take the picker away', () => {
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (onScreen()) throw new Error('PROJECT DID NOT OPEN raised before any pick: ' + frame());
    if (S.projectOpenFailed) throw new Error('verdict state raised before any pick');
    if (!pickerUp()) throw new Error('picker lost to the verdict: ' + frame());
    if (stateLoads.length) throw new Error('loaded during the verdict: ' + stateLoads.join(', '));
});
step('...and the late real answer does not load it either', () => {
    hostPublish(X, 'Project 32', 31, X);          /* Move opened it after all */
    ticks(200);
    if (stateLoads.length) throw new Error('loaded with no pick: ' + stateLoads.join(', '));
    if (S.pendingSetLoad) throw new Error('a load is armed with no pick');
    if (!S.awaitingProjectSelect) throw new Error('select-before-load was abandoned');
    if (!pickerUp()) throw new Error('picker gone after the late answer: ' + frame());
    if (onScreen()) throw new Error('verdict screen after the late answer: ' + frame());
});
step('...and the save gate never flapped: awaiting_select stayed 1 throughout', () => {
    if (dsp.awaiting !== 1) throw new Error('the DSP stopped refusing saves');
    const flap = awWrites.filter((v) => v[0] !== '1');
    if (flap.length) throw new Error('awaiting_select written non-1: ' + JSON.stringify(awWrites));
    provokeSaves();
    const hits = writes.filter((w) => w.indexOf('seq8') >= 0 || w.indexOf('/dAVEBOx') >= 0);
    if (hits.length) throw new Error('project-state saves during a fresh session: ' + hits.join(', '));
});
step('control: the SAME publish sequence on a relaunch boot still raises the verdict', () => {
    boot(P, 'Project 1');
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (!onScreen()) throw new Error('the verdict stopped working for a picked project: ' + frame());
});

/* 9. EVERY PATH THAT MAKES A PROJECT MUST MARK IT CREATED-THIS-SESSION.
 *
 * Move builds its set list when it starts. A project made after that is not in
 * it, so the fast in-place switch walks Move's overview to a pad Move believes
 * is EMPTY: nothing loads and it returns as though it worked. dAVEBOx is then
 * nominally in the new project while Move still holds the previous one — and
 * Move saves the set it HAS open, so edits land in the wrong project, silently.
 *
 * ⚠ The two create paths always recorded this. COPY did not, for as long as
 * copy has existed, and no test noticed because every test exercised create.
 * Found on hardware by Josh (2026-09-16). This asserts the RULE rather than the
 * three call sites, so the next path that makes a project fails here instead.
 */
step('⭑⭑ a COPIED project relaunches Move, exactly like a created one', () => {
    boot(P, 'Project 1');
    S.pendingOpenProjectPicker = false; S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    /* The real gesture: hold Copy, tap the source, tap an empty destination. */
    S.copyHeld = true;
    sysCmds.length = 0;
    padTap(0);          /* source */
    ticks(1);
    padTap(7);          /* empty destination */
    ticks(2);
    S.copyHeld = false;
    if (!sysCmds.some((c) => /project-cmd\.sh copy 0 7$/.test(c)))
        throw new Error('the copy gesture did not issue a copy: ' + JSON.stringify(sysCmds));
    if (S.projectsCreatedThisSession.indexOf(7) < 0)
        throw new Error('the COPY was not recorded as created this session — loading it ' +
                        'would take the in-place route to a pad Move has never seen');
});

step('⚠ CONTROL: the marker is what forces the relaunch, not the pad number', () => {
    /* Strip the marker and the same pick takes the fast route — proving the
     * assertion above is load-bearing rather than incidental. */
    boot(P, 'Project 1');
    S.projectsCreatedThisSession.length = 0;
    S.pendingOpenProjectPicker = false; S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    sysCmds.length = 0; selectArms.length = 0;
    padTap(31); ticks(2);
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(6);
    if (sysCmds.some((c) => /switch 31$/.test(c)))
        throw new Error('control: relaunched without the marker');
    if (selectArms.indexOf(31) < 0)
        throw new Error('control: the fast route was not taken without the marker');
});

/* 10. DELETING THE PROJECT YOU ARE IN takes the careful path even when the
 *     host has not confirmed the identity yet.
 *
 * The guard used to read the picker's `current`, which is −1 until the host
 * confirms — correct for the load shortcut, wrong here. "Am I in this project?"
 * is about what dAVEBOx has LOADED. Reading the unconfirmed value would delete
 * the directory underneath a live session, which is the one thing the careful
 * path (queue the removal, restart, remove when nothing holds it) exists to
 * stop. Introduced and caught the same day, 2026-09-16, from Josh asking
 * whether delete still worked. */
function holdDeleteTap(k) {
    S.deleteHeld = true;
    padTap(k); ticks(1);   /* arm */
    padTap(k); ticks(2);   /* confirm */
    S.deleteHeld = false;
}

step('⭑⭑ deleting the LOADED project restarts, even with identity unconfirmed', () => {
    boot(P, 'Project 1');
    publish('pending', '', '', '', -1);        /* host has not confirmed yet */
    S.currentSetUuid = P;                      /* ...but dAVEBOx has P loaded */
    S.pendingOpenProjectPicker = false; S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    if (S.projectPadPicker.current !== -1)
        throw new Error('precondition: current should be -1 while unconfirmed');
    sysCmds.length = 0;
    holdDeleteTap(0);
    if (!S.projectPadPicker || S.projectPadPicker.restarting !== 'DELETING')
        throw new Error('deleting the loaded project did NOT take the restarting path');
});

step('⚠ CONTROL: deleting a project you are NOT in still deletes in place', () => {
    boot(P, 'Project 1');
    publish('open', '', P, 'Project 1', 0);
    S.currentSetUuid = P;
    S.pendingOpenProjectPicker = false; S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    sysCmds.length = 0;
    holdDeleteTap(31);                         /* a DIFFERENT project */
    if (S.projectPadPicker && S.projectPadPicker.restarting === 'DELETING')
        throw new Error('control: deleting another project should not restart the session');
    if (!sysCmds.some((c) => /project-cmd\.sh delete 31$/.test(c)))
        throw new Error('control: the plain delete did not fire: ' + JSON.stringify(sysCmds));
});

if (failed) { console.error('FAIL: project_open_mismatch'); process.exit(1); }
console.log('PASS: project_open_mismatch');
}
main().catch((e) => { console.error(e); process.exit(1); });
