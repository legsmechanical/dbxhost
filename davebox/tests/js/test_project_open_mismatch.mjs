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
/* ⭐ The same saves PLUS the awaiting_select arms, in one ordered list. `writes`
 * alone can say a save happened; only this can say it happened BEFORE the gate
 * that refuses saves closed, which is the entire content of ruling ② (Josh, 2026-09-20). */
const events = [];
globalThis.host_read_file = (p) => (files.has(String(p)) ? files.get(String(p)) : '');
globalThis.host_file_exists = (p) => files.has(String(p));        /* stat(): empty exists */
globalThis.host_write_file = (p, body) => { writes.push(String(p)); events.push('write ' + p); files.set(String(p), String(body)); return true; };
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
/* ⭑ THE LIST CAN FAIL. project-cmd can be missing, refused by the host's
 * command allowlist, or write nothing readable — on the device all three look
 * identical from here: `list` returns and projects.json is not there. */
let listFails = false;
/* ⭐ `switch-slot` re-points the IDLE slot and answers with the slot to press,
 * through slot_switch.json — the drain refuses to arm without an ok answer,
 * which is the point of it. The rig answers as the device would: slot 1, whose
 * entry uuid is what Move will log. `switchSlotFails` drives the refusal path.
 * ⚠ The SLOT uuid is deliberately not either project's: a request carrying the
 * project would never match the uuid Move logs, and this rig is where that
 * would otherwise go unnoticed. */
const SLOT1_UUID = '5107b000-0000-4000-8000-000000000001';
let switchSlotFails = false;
globalThis.host_system_cmd = (c) => {
    sysCmds.push(String(c));
    if (/project-cmd\.sh list$/.test(String(c))) {
        if (listFails) files.delete('/data/UserData/dbx-host/projects.json');
        else files.set('/data/UserData/dbx-host/projects.json', PROJECTS_JSON);
    }
    const m = /switch-slot (\S+)/.exec(String(c));
    if (m) {
        files.set('/data/UserData/dbx-host/slot_switch.json', JSON.stringify(
            switchSlotFails
                ? { ok: false, slot: -1, project: '', slot_uuid: '', why: 'rig: refused' }
                : { ok: true, slot: 1, project: m[1], slot_uuid: SLOT1_UUID, why: '' }));
    }
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
    if (k === 'awaiting_select') { awWrites.push(v); events.push('awaiting_select=' + v); if (v[0] === '1') dsp.awaiting = 1; return; }
    if (k === 'save') {
        /* seq8_save_state returns early under awaiting_select — a refused save
         * leaves no trace on the device, and must leave none here either. */
        if (dsp.awaiting) { events.push('save REFUSED (awaiting_select)'); return; }
        const dest = SETS + (dsp.uuid || '<fallback>') + '/' + stateName(dsp.uuid) + '/seq8sa-state.json';
        writes.push(dest); events.push('dsp save ' + dest);
        return;
    }
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
/* ⚠ The kit faces draw through fill_rect, so print() alone sees nothing a kit
 * screen says — and the verdict screen moved onto the kit. Collect both. */
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
const fonts = await import('../../ui/ui_fonts_pp.mjs');
fonts.setKitTextTrace((t) => frameText.push(String(t)));

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
    files.clear(); writes.length = 0; events.length = 0; sysCmds.length = 0;
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
    /* ⚠ A test that QUIT leaves the session mid-teardown: exitFarewell freezes
     * every later tick stage, so without this the next boot's picker never
     * opens and the failure lands on a step that did nothing wrong. */
    S.pendingExitAfterSave = false; S.exitFarewell = 0; S.pendingHideAfterSave = false;
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
    /* the kit draws CAPS; the name is what matters, not its case */
    if (frame().toUpperCase().indexOf('PROJECT 32') < 0) throw new Error('project name not shown: ' + frame());
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

/* 1c. ⭐⭐ RULING ② (Josh, 2026-09-20): A PROJECT LOST UNDERNEATH A LIVE SESSION SAVES TO
 *     WHERE IT CAME FROM, THEN LOCKS.
 *
 *     Everything played since the last autosave lives in DSP memory and nowhere
 *     else. Locking on the verdict — which is what this did until 2026-09-20 —
 *     throws it away with no screen, no log and no way back. The work is
 *     written into the project it was LOADED under (Move-confirmed when it
 *     opened, so a legitimate destination), and only then does the session stop
 *     accepting saves.
 *
 *     ⚠ These steps assert an ORDER, not a count, and the order is the whole
 *     mechanism: `awaiting_select` is what makes seq8_save_state refuse, so a
 *     lock that runs one tick too early turns the final save into a no-op that
 *     looks exactly like a success from JS. That is why the fake DSP records a
 *     refusal rather than silently dropping it. */
step('⭐⭐ the project goes out from under a LIVE session -> a final save lands in it', () => {
    boot(X, 'Project 32');
    /* Work since the last save: the DSP is dirty and nothing has been written
     * for this session yet. */
    writes.length = 0; events.length = 0; dsp.dirty = 1;
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (!onScreen()) throw new Error('the verdict screen never came up: ' + frame());
    const saved = writes.filter((w) => w.indexOf(X) >= 0 && w.indexOf('seq8sa-state.json') >= 0);
    if (!saved.length)
        throw new Error('the session locked without saving into the project it came from: ' + JSON.stringify(events));
    /* ...and into X's RESOLVED state dir, not a plain dAVEBOx/ beside it. */
    if (!saved.every((w) => w.indexOf('/dAVEBOx~3/') >= 0))
        throw new Error('final save went to the wrong state dir: ' + saved.join(', '));
});
step('⭐⭐ ...and it lands BEFORE the gate that refuses saves closes', () => {
    const iSave = events.findIndex((e) => e.indexOf('dsp save') === 0 && e.indexOf(X) >= 0);
    const iLock = events.indexOf('awaiting_select=1');
    if (iSave < 0) throw new Error('no DSP save reached the project: ' + JSON.stringify(events));
    if (iLock < 0) throw new Error('the session never locked: ' + JSON.stringify(events));
    if (iSave > iLock)
        throw new Error('locked before saving — the save was refused: ' + JSON.stringify(events));
    if (events.some((e) => e.indexOf('save REFUSED') === 0))
        throw new Error('a save was refused during the handover: ' + JSON.stringify(events));
});
step('⭐ ...and the sidecar goes to the same project, not to nowhere', () => {
    /* ⚠ the JS half's STATE_PREFIX is injected at bundle time and is `seq8`
     * here, `seq8sa` on the device — match the suffix, not the whole name. */
    const side = writes.filter((w) => /-ui-state\.json$/.test(w));
    if (!side.length) throw new Error('no sidecar written: ' + JSON.stringify(writes));
    if (!side.every((w) => w.indexOf(X) >= 0))
        throw new Error('sidecar written outside the project it came from: ' + side.join(', '));
});
step('⭐ ...and once locked, nothing more is written anywhere', () => {
    const before = writes.length;
    dsp.dirty = 1;
    provokeSaves();
    const after = writes.slice(before);
    if (after.length) throw new Error('writes after the lock: ' + after.join(', '));
    if (dsp.awaiting !== 1) throw new Error('the DSP was not told to refuse saves');
});
step('⭑ control: no project loaded -> the verdict locks IMMEDIATELY, with no save', () => {
    /* The other way in. Nothing was ever loaded, so there is nothing to write
     * and the one-tick detour must not happen at all — without this control the
     * steps above would pass just as well against code that always saves, which
     * would file an empty session over a real project. */
    boot(null, '');
    S.awaitingProjectSelect = false;         /* a session that is not awaiting, but holds no project */
    S.currentSetUuid = ''; S.currentSetName = '';
    writes.length = 0; events.length = 0;
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (S.pendingProjectLostLock) throw new Error('a save-then-lock was armed with no project to save into');
    if (events.indexOf('awaiting_select=1') < 0) throw new Error('the session did not lock: ' + JSON.stringify(events));
    const stray = writes.filter((w) => w.indexOf('seq8') >= 0);
    if (stray.length) throw new Error('state written with no project open: ' + stray.join(', '));
});

/* 1d. ⭐⭐ RULING ③ (Josh, 2026-09-20): A LIST THAT CANNOT BE READ FAILS CLOSED.
 *
 *     _pppFailOpen was the last place in the module where a project opened
 *     WITHOUT a pick: if the list could not be read at session start it loaded
 *     whatever the session booted into, on the reasoning that a degraded
 *     session beats an unusable one. It did that at the one moment we know
 *     least — the list we would have checked against is the thing that just
 *     failed — and it did it behind a popup that is gone by the time anyone
 *     looks up. Now: a NO PROJECT LIST card with Retry / Quit, and nothing
 *     loads on its own.
 *
 *     ⚠ Nothing pinned the old behaviour, which is why it survived three
 *     design passes. These steps assert on the SCREEN and on state_load — the
 *     one event that means a project was opened — not on the popup. */
function bootAwaiting(noList) {
    listFails = !!noList;
    boot(null, '');
    /* A FRESH DSP instance arms awaiting_select itself (seq8.c create_instance)
     * — that is what select-before-load IS, and without it here the session
     * believes a project is live and the fail-closed path never applies. */
    dsp.awaiting = 1;
    S.projectListFailed = null;
    S._pppFaultCount = 0;
    stateLoads.length = 0;
    globalThis.init();
    S.ledInitComplete = true;
    ticks(40);
}
const bootAwaitingNoList = () => bootAwaiting(true);
step('⭐⭐ no list at session start -> the NO PROJECT LIST card, and NOTHING loaded', () => {
    bootAwaitingNoList();
    if (!S.awaitingProjectSelect) throw new Error('precondition: the session is not awaiting a selection');
    if (!S.projectListFailed) throw new Error('no card raised: ' + frame());
    if (S.projectPadPicker) throw new Error('a picker opened with no list');
    if (stateLoads.length) throw new Error('a project was LOADED without a pick: ' + JSON.stringify(stateLoads));
    const f = frame().toUpperCase();
    if (f.indexOf('NO PROJECT LIST') < 0) throw new Error('the card is not on the OLED: ' + frame());
    if (f.indexOf('RETRY') < 0 || f.indexOf('QUIT') < 0) throw new Error('both answers must be offered: ' + frame());
});
step('⭐ ...and it STAYS — the watchdog does not re-arm an open behind it', () => {
    /* The re-arm watchdog fires on "awaiting with no picker", which is exactly
     * this state. Without a stand-down it would open, fault, fail closed and
     * re-arm again, once a tick, forever. */
    sysCmds.length = 0;
    ticks(400);
    if (!S.projectListFailed) throw new Error('the card went away on its own');
    if (S.projectPadPicker) throw new Error('the watchdog opened a picker behind the card');
    if (stateLoads.length) throw new Error('something loaded while the card was up: ' + JSON.stringify(stateLoads));
    /* ⚠ The visible state is the same either way — the card stays up because
     * _pppFailClosed stands down when one is already showing — so the cost is
     * the only thing that can say the stand-down is missing. host_system_cmd is
     * a BLOCKING system(): re-arming would spawn a shell every tick, on the
     * audio-adjacent thread, for as long as the user leaves the card up. */
    const lists = sysCmds.filter((c) => /project-cmd\.sh list$/.test(c));
    if (lists.length) throw new Error('the list ran ' + lists.length + ' more times behind the card ' +
                                      '— the watchdog is re-arming the open once a tick');
});
step('⭐ Retry: the list is back -> the picker opens and the card goes', () => {
    bootAwaitingNoList();
    listFails = false;
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(4);
    if (S.projectListFailed) throw new Error('the card survived a successful retry');
    if (!S.projectPadPicker) throw new Error('the picker did not open on retry');
    if (stateLoads.length) throw new Error('retry LOADED a project instead of opening the picker');
});
step('⭐ Retry: still no list -> a fresh card, not a blank screen', () => {
    bootAwaitingNoList();
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(4);
    if (!S.projectListFailed) throw new Error('a failed retry left nothing on screen: ' + frame());
    if (frame().toUpperCase().indexOf('NO PROJECT LIST') < 0) throw new Error('screen: ' + frame());
    if (stateLoads.length) throw new Error('a failed retry loaded something');
});
step('⭐ Quit: leaves the session, and still loads nothing', () => {
    bootAwaitingNoList();
    S.pendingExitAfterSave = false;
    cc(JOG_TURN, 1);                       /* Retry -> Quit */
    if (S.projectListFailed.sel !== 1) throw new Error('the jog did not move to Quit');
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    if (!S.pendingExitAfterSave) throw new Error('Quit did not arm the exit');
    if (stateLoads.length) throw new Error('Quit loaded a project on the way out');
});
step('⚠ control: the SAME boot WITH a list opens the picker and raises no card', () => {
    /* Without this the steps above would pass against a rig where the picker
     * can never open at all, which would make "fails closed" meaningless. */
    bootAwaiting(false);
    if (!S.awaitingProjectSelect) throw new Error('control: the rig cannot even reach select-before-load');
    if (S.projectListFailed) throw new Error('a card was raised with a perfectly good list');
    if (!S.projectPadPicker) throw new Error('control: the picker does not open even with a list — the rig proves nothing');
});
step('⚠ control: mid-session, a failed list is a POPUP, not a modal card', () => {
    /* Fail-closed is for the boot dead end. With a project loaded there is no
     * dead end to rescue anyone from, and a modal over working music would be
     * worse than the thing it reports. */
    listFails = false;
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    if (S.awaitingProjectSelect) throw new Error('precondition: still awaiting, this is not a live session');
    S.projectListFailed = null; S.projectPadPicker = null; S.pendingOpenProjectPicker = false;
    listFails = true;
    dialogs.openProjectPadPicker();
    if (S.projectListFailed) throw new Error('a live session was taken over by the card');
    if (S.projectPadPicker) throw new Error('a picker opened with no list');
    listFails = false;
});

/* 1e. ⭐⭐ A RESUME MUST NOT LOAD WHAT NOBODY PICKED.
 *
 *     The resume edge re-checks whether the active set changed while the module
 *     was parked, and reloads if the DSP's uuid disagrees with the host's. While
 *     AWAITING a pick the DSP holds no set, so its uuid is always empty and that
 *     disagreement is true for ANY open identity — typically the project the
 *     last session was in, which active_set.txt still names. Unguarded, a
 *     suspend/resume while the picker is up loads that project with no pick.
 *
 *     Josh met the shape of this on hardware 2026-09-16: a relaunch auto-opened
 *     the previous project behind the picker, which then offered Resume for a
 *     project he had only SELECTED — *"i never loaded a project. just selected
 *     it"*. The suspend door he used is gone, but a host-initiated park still
 *     reaches this edge, so it is guarded rather than reasoned away.
 *
 *     The test performs the real thing: the host swaps clear_screen for a no-op
 *     while parked (that IS the suspend signal ui_tick reads), ticks, swaps it
 *     back, ticks. No source pin — those cannot tell a guard from a comment. */
function suspendAndResume() {
    const cs = globalThis.clear_screen;
    globalThis.clear_screen = () => {};
    ticks(6);
    globalThis.clear_screen = cs;
    ticks(6);
}

step('⭐⭐ suspend + resume while AWAITING loads nothing, even with a set open underneath', () => {
    bootFresh(X, 'Project 32');
    ticks(4);
    if (!S.awaitingProjectSelect) throw new Error('precondition: not awaiting a pick');
    /* The host is holding the LAST session's project — exactly what
     * active_set.txt names at a relaunch. Nobody has picked it. */
    publish('open', '', X, 'Project 32', 31);
    ticks(4);
    stateLoads.length = 0;
    suspendAndResume();
    if (stateLoads.length)
        throw new Error('a resume loaded a project nobody picked: ' + JSON.stringify(stateLoads));
    if (S.pendingSetLoad) throw new Error('a resume ARMED a load nobody asked for');
    if (S.currentSetUuid) throw new Error('a resume adopted an identity with no pick: ' + S.currentSetUuid);
    if (!S.awaitingProjectSelect) throw new Error('select-before-load was abandoned by a resume');
});
step('⭐⭐ the SWITCH case: awaiting WITH a request outstanding must still load', () => {
    /* ⚠ THE GAP THAT SHIPPED A REGRESSION (261dbb899, caught on hardware within
     * the hour). An in-place switch PARKS the module and resumes it with a
     * fresh DSP, so `awaitingProjectSelect` is SET at the exact moment the
     * picked project must load. The original guard tested that flag alone and
     * blocked it: Move switched, the host published `open`, and the module sat
     * awaiting until the watchdog re-armed the picker.
     *
     * The step above covers awaiting with NO request. This covers awaiting WITH
     * one — the difference between "nobody asked" and "the user just asked for
     * exactly this". Both are needed; only having the first is what let the
     * regression through. */
    bootFresh(X, 'Project 32');
    ticks(4);
    if (!S.awaitingProjectSelect) throw new Error('precondition: not awaiting');
    /* The pick: a request for X is outstanding, and the host has confirmed X. */
    S.requestedSet = { uuid: X, index: 31, name: 'Project 32' };
    publish('open', '', X, 'Project 32', 31);
    ticks(4);
    stateLoads.length = 0; S.pendingSetLoad = false;
    suspendAndResume();
    if (!S.pendingSetLoad && !stateLoads.length)
        throw new Error('the resume refused to load the project the user PICKED — '
                        + 'this is the hardware regression, reproduced');
});
step('⚠ control: a request for a DIFFERENT project does not unlock it', () => {
    /* The exemption must be about THIS uuid, not merely about a request
     * existing — otherwise any stale request would re-open the hole. */
    bootFresh(X, 'Project 32');
    ticks(4);
    S.requestedSet = { uuid: P, index: 0, name: 'Project 1' };   /* asked for P */
    publish('open', '', X, 'Project 32', 31);                     /* host holds X */
    ticks(4);
    stateLoads.length = 0; S.pendingSetLoad = false;
    suspendAndResume();
    if (S.pendingSetLoad || stateLoads.length)
        throw new Error('a request for P unlocked a load of X: ' + JSON.stringify(stateLoads));
});
step('⚠ control: the same resume in a LOADED session still reloads a CHANGED set', () => {
    /* The guard must not cost the thing this edge exists for. With a project
     * loaded, a set that changed while parked must still be picked up — without
     * this control the step above passes just as well against an edge that was
     * simply deleted. */
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    if (S.awaitingProjectSelect) throw new Error('precondition: still awaiting, this is not a live session');
    dsp.uuid = P;
    publish('open', '', X, 'Project 32', 31);      /* the set changed while parked */
    stateLoads.length = 0; S.pendingSetLoad = false;
    suspendAndResume();
    if (!S.pendingSetLoad && !stateLoads.length)
        throw new Error('the resume edge no longer reloads a changed set — the guard went too far');
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
    /* ⭐ The actuator is armed with the SLOT, not the pad. The pad is dAVEBOx's
     * own picker position; Move only ever sees the two slots, so pressing a pad
     * number would walk its overview to a position that is not there. */
    if (selectArms.indexOf(1) < 0) throw new Error('select actuator not armed with the SLOT for a normal switch: ' + JSON.stringify(selectArms) + ' ' + JSON.stringify(sysCmds));
});

/* 5b. ⭐⭐ THE REQUEST. dAVEBOx authors `intended_set.txt` at the moment of the
 *     pick — the one moment the answer is KNOWN rather than inferred, because
 *     the picker is holding that project's record when the pad is pressed.
 *     Both actuators carry only a pad INDEX onward.
 *
 *     Without it the host cannot tell "we asked for this project and got it"
 *     from "a set was already open underneath": `have_request` stays 0 forever,
 *     the machine takes its no-request branch for every load, and the `unopened`
 *     verdict — the entire reason the PROJECT DID NOT OPEN screen exists — can
 *     never be produced. It shipped that way: the consumer landed, the producer
 *     was on a branch that was deleted, and nothing noticed because every
 *     request-branch unit test passes against a branch that never runs.
 *
 *     Format is fixed by the reader (identity_read_and_consume_request,
 *     src/host/shadow_set_pages.c): `uuid \n index \n name`. */
const INTENDED = HOST_DIR + '/intended_set.txt';
/* ⭐⭐ ...EXCEPT ON THE RELAUNCH ROUTE, WHERE THAT FILE IS A TRAP.
 * A request left in intended_set.txt when Move is about to restart is consumed
 * by the shim that is ABOUT TO DIE (its poll runs every ~1.4 s; the relaunch
 * follows ~1 s later). The next session then arms nothing and can never
 * confirm — Move opens exactly the right project and the host never says so,
 * which dAVEBOx reads as "nothing is open" and answers with the picker.
 * Device 2026-09-21: every project created this session bounced on its FIRST
 * load, and authoring the request at all (the previous fix) did not help.
 * The relaunch routes write here instead; launch.sh installs it for the next
 * session. */
const RELAUNCH = HOST_DIR + '/relaunch_request.txt';

step('⭐⭐ the pick AUTHORS the request, and does it BEFORE the actuator fires', () => {
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    S.pendingOpenProjectPicker = false;
    sysCmds.length = 0; selectArms.length = 0;
    files.delete(INTENDED);                       /* the host unlinks as it arms */
    /* Catch the file's contents AT THE MOMENT the actuator arms: a request
     * written after the walk starts is a record about a load already underway. */
    const armFn = globalThis.shadow_select_arm;
    let atArm = null;
    globalThis.shadow_select_arm = (k) => { atArm = files.get(INTENDED) || null; armFn(k); };
    try {
        S.projectPadPicker = null;
        dialogs.openProjectPadPicker();
        padTap(31);
        ticks(2);
        cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
        ticks(6);
    } finally { globalThis.shadow_select_arm = armFn; }

    if (selectArms.indexOf(1) < 0)
        throw new Error('precondition: the actuator never armed, so the ordering proves nothing');
    if (atArm === null)
        throw new Error('the actuator armed with NO request on disk — the host cannot tell this load from a coincidence');
    /* ⭐⭐ THE REQUEST NAMES THE SLOT, and the index is the slot's position.
     * Confirmation is a string compare against the uuid MOVE logs, and Move
     * logs the library entry it opened — so a request carrying the project
     * uuid would never match, and every switch would read as `unopened`.
     * That is why this asserts the slot uuid and not X. */
    if (atArm !== SLOT1_UUID + '\n1\nProject 32\n')
        throw new Error('request must name the SLOT `uuid \\n slot \\n name`: ' + JSON.stringify(atArm));
    /* ⚠ CONTROL for the relaunch fix below: this is the IN-PLACE route, where
     * the arming shim is the one that sees the answer. Routing it through the
     * surviving file too would leave a record nothing consumes, to be
     * installed over a later, unrelated request. */
    if (files.has(RELAUNCH))
        throw new Error('the in-place route wrote the relaunch request file: ' + JSON.stringify(files.get(RELAUNCH)));
});

step('⚠ CONTROL: the already-current pad asks for NOTHING', () => {
    /* That path loads only OUR state — Move is already holding the set and
     * confirmed it on its own. A request there would be a claim we never made,
     * and it would be judged against a load nobody performed. */
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    S.pendingOpenProjectPicker = false;
    files.delete(INTENDED);
    S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    padTap(0);                                    /* pad 0 IS the current project */
    ticks(2);
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(6);
    if (files.has(INTENDED))
        throw new Error('the current-pad shortcut wrote a request: ' + JSON.stringify(files.get(INTENDED)));
});

step('⭑ RETRY re-issues the SAME request (the verdict screen has no uuid of its own)', () => {
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    S.pendingOpenProjectPicker = false;
    S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    padTap(31); ticks(2);
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);         /* Load pad 31 -> a request */
    ticks(6);
    /* The request names the SLOT; the project it leads to rides along beside
     * it for the message the user sees. */
    if (!S.requestedSet || S.requestedSet.uuid !== SLOT1_UUID || S.requestedSet.projectId !== X)
        throw new Error('precondition: the pick did not record a slot request');
    files.delete(INTENDED);                       /* the host consumed it */
    /* ...and Move opened something else. */
    hostPublish(X, 'Project 32', 31, 'default');
    ticks(40);
    if (!onScreen()) throw new Error('precondition: no verdict screen to retry from');
    sysCmds.length = 0;
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);         /* Retry (sel 0) */
    ticks(4);
    if (!sysCmds.some((c) => /project-cmd\.sh switch 31$/.test(c)))
        throw new Error('precondition: Retry did not fire the relaunch');
    /* Retry re-issues the SAME record — the slot one, unchanged. The verdict
     * screen has no identity of its own, which is the whole point: it re-asks
     * for exactly what was asked for, rather than re-deriving it. */
    /* ⚠ Retry RELAUNCHES (the switch above), so the record must go where it
     * survives the restart. In intended_set.txt it would be eaten by the shim
     * this very Retry is about to kill. */
    if (files.get(RELAUNCH) !== SLOT1_UUID + '\n1\nProject 32\n')
        throw new Error('Retry relaunched WITHOUT re-issuing the request where it survives: ' + JSON.stringify(files.get(RELAUNCH)));
    if (files.has(INTENDED))
        throw new Error('Retry wrote the request into the file the dying shim consumes: ' + JSON.stringify(files.get(INTENDED)));
});

step('\u2b50\u2b50 A PROJECT CREATED THIS SESSION writes the request where it SURVIVES the relaunch', () => {
    /* THE BUG JOSH HIT, as a test. A project created this session cannot be
     * reached by the select actuator (Move enumerates its sets at launch), so
     * it goes through a Move RELAUNCH. That route wrote its request into
     * intended_set.txt, the live shim consumed it ~1 s before the relaunch
     * killed that shim, and the new session had nothing to confirm against:
     * "Loading..." and then straight back to the picker, every first load.
     *
     * The fix is not "author a request" (that was already true and still
     * broke) — it is authoring it where the NEXT session can find it. */
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    S.pendingOpenProjectPicker = false;
    sysCmds.length = 0; selectArms.length = 0;
    files.delete(INTENDED); files.delete(RELAUNCH);

    S.projectsCreatedThisSession.push(31);        /* made since Move last looked */
    S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    padTap(31);
    ticks(2);
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    ticks(6);
    S.projectsCreatedThisSession.length = 0;

    if (!sysCmds.some((c) => /project-cmd\.sh switch 31$/.test(c)))
        throw new Error('precondition: a created-this-session pad did not take the RELAUNCH route: ' + JSON.stringify(sysCmds));
    if (selectArms.length)
        throw new Error('precondition: the select actuator was armed for a set Move cannot see: ' + JSON.stringify(selectArms));

    /* \u2b50 The record itself: the SLOT, its position, the name — in the file
     * that outlives the shim. */
    if (files.get(RELAUNCH) !== SLOT1_UUID + '\n1\nProject 32\n')
        throw new Error('the relaunch route did not author a surviving request: ' + JSON.stringify(files.get(RELAUNCH)));
    /* \u26a0 And NOT in the one the dying shim eats. Writing both is not
     * harmless: the doomed copy is consumed and published as a `pending` that
     * nothing will ever settle. */
    if (files.has(INTENDED))
        throw new Error('the relaunch route also wrote the doomed request file: ' + JSON.stringify(files.get(INTENDED)));
});

step('⭑ a live project SPENDS the request (a later Retry cannot re-issue a stale one)', () => {
    boot(P, 'Project 1');
    hostPublish(P, 'Project 1', 0, P);
    ticks(40);
    S.requestedSet = { uuid: X, index: 31, name: 'Project 32' };
    dsp.awaiting = 0;
    S.pendingDspSync = 1;
    ticks(6);
    if (S.requestedSet !== null)
        throw new Error('the request outlived the load it asked for');
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
    files.clear(); writes.length = 0; events.length = 0; sysCmds.length = 0;
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
    if (selectArms.indexOf(1) < 0)
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

/* 11. RENAME asks the same question as DELETE, and so does the warning.
 *     All three go through one predicate so they cannot drift apart; this pins
 *     that there is exactly one, and that it reads the LOADED project. */
step('⭑ renaming the LOADED project takes the restart path while unconfirmed', () => {
    boot(P, 'Project 1');
    publish('pending', '', '', '', -1);
    S.currentSetUuid = P;
    S.pendingOpenProjectPicker = false; S.projectPadPicker = null;
    dialogs.openProjectPadPicker();
    const src = readFileSync('ui/ui_dialogs.mjs', 'utf8');
    /* the three sites must all route through the one predicate — a direct
     * `=== p.current` comparison at any of them is the bug returning */
    const uses = (src.match(/_pppIsOpenProject\(/g) || []).length;
    if (uses < 4) throw new Error('expected the shared predicate at all three sites, saw ' + uses);
    if (/if \(k === p\.current\) \{\n\s+\/\* The OPEN project renames/.test(src))
        throw new Error('rename still compares against the unconfirmed current');
    if (/p\.deleteIdx === p\.current/.test(src))
        throw new Error('the delete warning still reads the unconfirmed current');
});

if (failed) { console.error('FAIL: project_open_mismatch'); process.exit(1); }
console.log('PASS: project_open_mismatch');
}
main().catch((e) => { console.error(e); process.exit(1); });
