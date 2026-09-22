import * as os from 'os';
import { S } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { isSoundBank, NUM_TRACKS, NUM_CLIPS, DRUM_LANES, BANKS, ACTION_POPUP_MS,
         VOL_CARD_MS } from './ui_constants.mjs';
import { DAVEBOX_HOST_DIR } from './ui_engine.mjs';

/* Basename prefix for every file this module owns. Mirrors the C-side
 * SEQ8_STATE_PREFIX (dsp/seq8.c) and MUST agree with it — the DSP writes the
 * state file and JS writes the sidecar next to it. Injected by the bundler via
 * esbuild --define:SEQ8_STATE_PREFIX='"..."' so a second davebox can be
 * installed alongside the daily driver without sharing its sessions; these
 * paths are keyed by set UUID alone and carry no module id. Undefined (the
 * normal build) falls back to 'seq8' — `typeof` on an undeclared identifier is
 * safe, so no define is needed for the stable build. */
const STATE_PREFIX = (typeof SEQ8_STATE_PREFIX === 'string') ? SEQ8_STATE_PREFIX : 'seq8';

/* ⭑⭑ Per-project state lives INSIDE the project's set dir (Phase B of the
 * state-co-location plan, 2026-08-12): Sets/<uuid>/<state dir>/<prefix>-*.json,
 * beside Move's inner <Name>/ dir. It travels with the set on copy/delete/
 * rename because it IS in the set — the parallel set_state/ tree, and all the
 * machinery that kept it in step (liveness test, orphan prune, two-root
 * delete, name index), retires with the old location.
 *
 * ⚠ These MUST agree with the DSP's seq8_set_state_path (dsp/seq8.c) — the DSP
 * writes state where JS expects to read it back — and the reserved subdir name
 * is a contract with project-cmd.sh/select-list.sh, pinned by check-config.sh.
 * ⚠ In-session Sets/ is the standalone library (bind-mounted), so these paths
 * only ever land inside dAVEBOx projects. */
import { setUuidIsProvisional }
    from '/data/UserData/schwung/shared/session_state.mjs';

const SETS_DIR    = '/data/UserData/UserLibrary/Sets';

/* ⚠⚠ The state dir's NAME is resolved, never spelled (set-folder order fix,
 * 2026-09-14): `dAVEBOx` or `dAVEBOx~<n>`, whichever lists AFTER Move's song
 * folder — Move opens the first subfolder it lists as the song, so a plain
 * `dAVEBOx/` opened some projects as an empty set. host_state_subdir applies
 * the one rule (dbx_state_subdir.h); with create it runs the chooser, so the
 * first JS write of a fresh project (sidecar, snapshot, new-project marker)
 * cannot make the losing name. Never for a provisional identity: that makes
 * nothing at all (see ensureStateDir). */
/* The JS copy of dbx_project_path.h's rule. ⚠ ONE RULE, SEVERAL LANGUAGES —
 * read that header for WHY this resolves at all; check-config.sh pins the
 * copies together. Same contract: resolve the entry, and keep the literal
 * join when it cannot be resolved (ENOENT is the NORMAL case for a project
 * being created — returning nothing would file its first write nowhere). */
function dbxProjectDir(root, uuid) {
    const joined = root + '/' + uuid;
    try {
        const r = os.realpath(joined);
        if (r && r[1] === 0 && r[0]) return r[0];
    } catch (e) { /* fall through to the join */ }
    return joined;
}

function setStateDir(uuid) {
    const dir = dbxProjectDir(SETS_DIR, uuid);
    return dir + '/' + host_state_subdir(dir, !setUuidIsProvisional(uuid));
}

/* The PROJECT a library entry leads to, by id.
 *
 * ⚠⚠ THE ENTRY IS NOT THE PROJECT. Move names, and logs, the SLOT it opened —
 * the entry in its one set library. What the picker lists, and what every
 * project verb knows, is the PROJECT that slot points at. Those are the same
 * string today, because the library shows one slot per project and names it
 * after the project; they stop being the same the moment the library shows two
 * fixed slots instead of N.
 *
 * So resolve it, rather than assume it. Same rule, same seam and the same
 * reason as setStateDir above: today this is the identity function, and when it
 * stops being one nothing else has to change.
 *
 * Returns '' when the entry resolves to nothing — a caller comparing project
 * ids must treat that as "no match", never as a match against another empty. */
export function projectIdOfEntry(uuid) {
    if (!uuid) return '';
    const dir = dbxProjectDir(SETS_DIR, uuid);
    const cut = dir.lastIndexOf('/');
    return cut >= 0 ? dir.slice(cut + 1) : dir;
}
/* ⭐ THE NAME A USER SEES is a TAG in the project — `<state>/name.txt`, written
 * by project-cmd (standalone/scripts/project_name.py, the rule's home). The
 * song folder is Move's (`Move-Set-<id>`) and is never shown. Read on the
 * events that change which project is open, never per tick. Falls back to the
 * short project id, exactly as the Python side does. `uuid` is the LIBRARY
 * entry (a slot); it resolves to the project the same way state paths do. */
export const PROJECT_NAME_FILE = 'name.txt';
export function projectDisplayName(uuid) {
    if (!uuid) return '';
    try {
        const dir = dbxProjectDir(SETS_DIR, uuid);
        const st = host_state_subdir(dir, false);
        if (st) {
            const t = host_read_file(dir + '/' + st + '/' + PROJECT_NAME_FILE);
            const n = t ? String(t).split('\n')[0].trim() : '';
            if (n) return n;
        }
    } catch (e) { /* fall through */ }
    const pid = projectIdOfEntry(uuid);
    return pid ? pid.slice(0, 8) : '';
}

/* Device-wide snapshots (item 18): one dir per slot beside the live state. */
export function deviceSnapDir(uuid, n) { return setStateDir(uuid) + '/snapshots/' + (n | 0); }
/* The hidden "before" take a recall makes so Undo can return to it (Josh,
 * 2026-09-05: "can we just make recall subject to undo?"). One dir, rewritten
 * by every recall; never listed as a slot. */
export function deviceSnapUndoDir(uuid) { return setStateDir(uuid) + '/snapshots/undo'; }
/* TRACK snapshots (Josh, 2026-09-05): the same layer from TRACK view, saving and
 * recalling one track's params only. Per project, per track. */
export function trackSnapDir(uuid, track, n) { return setStateDir(uuid) + '/snapshots/t' + (track | 0) + '/' + (n | 0); }
export function trackSnapUndoDir(uuid, track) { return setStateDir(uuid) + '/snapshots/t' + (track | 0) + '/undo'; }

/* Every JS write below an existing project's dir goes through here first. The
 * DSP's own save creates the subdir itself (ensure_parent_dir, seq8_state.c);
 * JS writes — the sidecar, snapshots — can land BEFORE any DSP save on a fresh
 * project, so they must not assume it. Cheap: mkdir on an existing dir is a
 * no-op. */
function ensureStateDir(uuid) {
    /* ⚠ NEVER create a directory for a PROVISIONAL identity. `__pending-N-M`
     * is the host's placeholder for "Move moved to a set whose folder does not
     * exist yet"; making a dir for it puts a fake project in the set library and
     * files this session's state where no real project will read it. Belt and
     * braces — readActiveSet() already refuses to report one — because this is
     * the function that actually makes the directory. */
    if (uuid && !setUuidIsProvisional(uuid)) host_ensure_dir(setStateDir(uuid));
}

/* The "this project is brand new" note project-cmd leaves at creation. Read and
 * DELETED on the first load of that project — see consumeNewProjectSeed. */
export function uuidToNewProjectPath(uuid) {
    return uuid ? setStateDir(uuid) + '/new-project.json' : '';
}

export function uuidToStatePath(uuid) {
    /* ⚠⚠ NO FALLBACK — see uuidToUiStatePath. */
    if (!uuid) throw new Error('uuidToStatePath: no project identity');
    return setStateDir(uuid) + '/' + STATE_PREFIX + '-state.json';
}

export function uuidToUiStatePath(uuid) {
    /* ⚠⚠ NO FALLBACK. An empty identity used to resolve to an install-wide
     * file beside the stock tree, which meant "I cannot name a project" was a
     * valid place to write. Two sessions wrote a whole night there (2026-09-16)
     * and everything looked fine. A destination we cannot name is now a BUG,
     * and it says so rather than inventing a path. */
    if (!uuid) throw new Error('uuidToUiStatePath: no project identity');
    return setStateDir(uuid) + '/' + STATE_PREFIX + '-ui-state.json';
}

/* ⚠ active_set.txt lives under THIS host's install dir, never the stock literal
 * (shadow_ui.js writes HOST_STATE_ROOT + "/active_set.txt" on SET_CHANGED).
 * Reading the stock path here returned a STALE stock file, so the resume-edge
 * set-mismatch check never fired and a project switch resumed with the previous
 * project's data (found on hardware 2026-08-06, v2 no-restart picker). State is
 * per-install and never crosses. */
const ACTIVE_SET_PATH = DAVEBOX_HOST_DIR + '/active_set.txt';

/* ⭑ `readActiveSet()` is GONE (2026-09-16). It was the module's own reader of
 * the host's boot record, and its existence is half of why this went wrong:
 * the sequencer DSP read the same file independently, so two consumers could
 * disagree with nothing to reconcile them, and each decoded "no project" its
 * own way. Identity now enters through hostIdentity() below and nowhere else.
 * The file itself survives as the host's boot-persistence record, written only
 * when a project is confirmed open — the module never reads it. */

/* ── IDENTITY ENTERS HERE, AND NOWHERE ELSE ───────────────────────────────
 *
 * The host decides which project is open, from Move's own word, and publishes
 * a TYPED record. dAVEBOx reads it and does not second-guess it.
 *
 * What this replaces: reading `active_set.txt` directly, and deciding what an
 * empty or odd-looking value meant. That file had two independent readers who
 * could disagree, and its value could be a placeholder that every consumer
 * decoded as "no project" — except the one that mattered, which went on saving.
 *
 *   state   'open' | 'pending' | 'none'
 *   reason  '' | 'unopened' | 'default' | 'unknown'   (only when none)
 *   index   the open pad, or the one asked for, or -1
 *
 * ⚠⚠ A uuid exists ONLY when state is 'open'. `pending` and `none` carry an
 * empty identity deliberately: there is nothing to name, and naming something
 * anyway is the entire bug this design removes. */
export function hostIdentity() {
    const empty = { state: 'pending', reason: '', uuid: '', name: '', projectId: '', index: -1 };
    try {
        const rec = shadow_get_param(0, 'active_set_state');
        if (!rec) return empty;
        const L = String(rec).split('\n');
        const state = (L[0] || '').trim() || 'pending';
        const reason = (L[1] || '').trim();
        const index = parseInt((L[2] || '-1').trim(), 10);
        let uuid = '', name = '';
        if (state === 'open') {
            const a = String(shadow_get_param(0, 'active_set') || '').split('\n');
            uuid = (a[0] || '').trim();
            name = (a[1] || '').trim();
            /* Defence in depth: the host publishes an empty identity for
             * anything but OPEN, so an OPEN with no uuid is a contradiction.
             * Treat it as pending rather than inventing one. */
            if (!uuid) return empty;
        }
        /* ⭐ uuid is the LIBRARY ENTRY Move opened and logged; projectId is the
         * project it leads to. Identical strings today — the library names each
         * slot after its project — and deliberately carried as two fields
         * anyway, because a caller that wants one and reads the other is
         * indistinguishable from a correct one until the day they diverge. */
        return { state, reason, uuid, name,
                 projectId: state === 'open' ? projectIdOfEntry(uuid) : '',
                 index: isNaN(index) ? -1 : index };
    } catch (e) {
        return empty;
    }
}

/* Decide whether the DSP needs a state_load for the currently-active set, and
 * arm it: the version-mismatch gate first, then the plain "DSP holds a
 * different set / has no state file" checks.
 *
 * TWO callers, and they must stay identical — that is the whole reason this is
 * a function. init() runs it on an ordinary boot; the project picker runs it
 * when the user selects under SELECT-BEFORE-LOAD, where create_instance
 * deliberately loaded nothing and the selection IS the load. Inlining it at
 * either site would let a duplicate-set inherit silently work on one path and
 * not the other. */
export function resolveSetLoadDecision() {
    const _svMismatch = host_module_get_param('state_version_mismatch');
    const dspUuid = (host_module_get_param('state_uuid') || '');

    if (_svMismatch && parseInt(_svMismatch, 10) === 1) {
        /* Confirm dialog owns it; its "Yes" handler triggers the state_load. */
        S.confirmStateWipe = true;
        S.confirmStateWipeSel = 1;
        S.pendingSetLoad = false;
        S.screenDirty = true;
    } else if (S.currentSetUuid && dspUuid !== S.currentSetUuid) {
        S.pendingSetLoad = true;
    } else if (S.currentSetUuid) {
        if (S.currentSetUuid && !host_file_exists(uuidToStatePath(S.currentSetUuid)))
            S.pendingSetLoad = true;
    }
}

/* SELECT-BEFORE-LOAD: the user picked the already-current (boot) project, so
 * there is no set switch to make — the state simply has to be loaded for the
 * first time. Runs the same decision chain an ordinary boot would, then forces
 * the load: create_instance skipped it, so the DSP holds defaults and the
 * "DSP already has this set" branch above would otherwise conclude, wrongly,
 * that there is nothing to do. */
export function loadSelectedCurrentProject() {
    if (!S.awaitingProjectSelect) return;
    resolveSetLoadDecision();
    if (!S.confirmStateWipe)
        S.pendingSetLoad = true;
    S.stateLoading = true;      /* "LOADING <project>" from the tap, not the reload */
    S.screenDirty = true;
}

/* Shift+Volume's level card. Sibling of showActionPopup, deliberately NOT built
 * on it: a popup is two lines of text that defers to held gestures, and this has
 * to be the same boxed level-with-a-bar sound mode shows, over any screen, while
 * the gesture is still being held. 1 s after the last turn, matching sound
 * mode's own VOL_SHOW_MS so the two behave identically. */
export function showTrackVolCard(text, frac) {
    S.tvCardText = text;
    S.tvCardFrac = frac;
    S.tvCardUntil = nowMs() + VOL_CARD_MS;
    S.screenDirty = true;
}

/* ⭐ EVERY TIMED NOTICE IS A CARD, drawn over whatever screen is up (Josh:
 * "Every temporary full-screen notification becomes a POP-UP over the current
 * screen"). The plain popup used to take the whole screen in track view, and
 * in sound mode it drew NOTHING — soundRender owns the panel and returns before
 * any popup branch, so "AUTOMATION CLEARED", "MACROS CLEARED" and "NOT SAVED"
 * fired into the void whenever the sound card was up. What still separates the
 * plain popup from showActionPopupFor is only that it DEFERS: while a step is
 * held or a knob touched, the read-out you are using wins and the card waits
 * out the rest of its window. */
export function showActionPopup(...lines) {
    showActionPopupFor(ACTION_POPUP_MS, ...lines);
    S.actionPopupDefers = true;
}

/* The same popup, held for `ms`. The default ACTION_POPUP_MS is a glance —
 * right for "CLEARED" after a gesture you just made, too short for a result
 * you have to READ (Josh, 2026-09-05, the snapshot recall: "gone before you
 * can read it"). ⚠ An optional line passed as undefined/null is DROPPED, not
 * printed: the renderer prints whatever is in the array, and a
 * `cond ? text : undefined` third line read "undefined" on the device. */
export function showActionPopupFor(ms, ...lines) {
    S.actionPopupHighlight = -1;
    S.actionPopupGauge = -1;
    S.actionPopupGaugeMark = -1;
    S.actionPopupLines   = lines.filter((l) => l !== undefined && l !== null);
    S.actionPopupEndTick = nowMs() + ms;
    /* A timed notice is a CARD, drawn above whatever screen is up (ui_render
     * drawUI). Only the gauge opts out — it wants the room for its bar. */
    S.actionPopupCard = true;
    S.actionPopupDefers = false;
    S.actionPopupStepHint = false;
    S.screenDirty = true;
}

/* Same popup, plus a bar. For values you are DIALLING rather than events you
 * are being told about: a number alone makes you read where you are, a bar
 * shows it. `mark` draws a reference tick — unity on a level, so "back to
 * normal" is a place on screen rather than a number to hunt for. Both are
 * fractions of full scale; -1 omits the tick. */
export function showActionPopupGauge(frac, mark, ...lines) {
    showActionPopup(...lines);
    S.actionPopupCard = false;
    S.actionPopupGauge = Math.max(0, Math.min(1, frac));
    S.actionPopupGaugeMark = (mark >= 0 && mark <= 1) ? mark : -1;
}

/* Write the sidecar synchronously. Split out of saveState so bank-change
 * sites can persist immediately without scheduling a DSP save. */
let _identitylessSaveLogged = false;
function noteIdentitylessSave() {
    if (_identitylessSaveLogged) return;
    _identitylessSaveLogged = true;
    console.log('SAVE DEFERRED: no project identity yet — nothing written ' +
                '(awaiting_select=' + (S.awaitingProjectSelect ? 1 : 0) + ')');
}

export function writeSidecar() {
    /* SELECT-BEFORE-LOAD: no project is loaded, so S holds startup defaults —
     * writing them out replaces the boot project's sidecar with a blank one.
     * Guarded HERE rather than at the call sites: several of them (bank change,
     * AT mode, perf) are only unreachable while the picker owns input because
     * of how input routing happens to be arranged today, and that is too thin a
     * thread to hang a data-loss bug on. */
    if (S.awaitingProjectSelect) return;
    /* Mid-switch, S still holds the PREVIOUS project's JS state while
     * S.currentSetUuid has already been adopted for the new one — writing now
     * files the old project's banks, CC assigns and perf slots under the new
     * project's uuid. Same window, same shape as the deferred state_full save
     * in pollDSP; restoreUiSidecar has not run yet, so there is nothing worth
     * persisting here anyway. */
    if (S.pendingSetLoad || S.pendingDspSync > 0) return;
    /* Always sync the live activeBank into per-track storage before serializing
     * — BANK_SOUND included (Josh, 2026-08-25): SOUND + CONFIG records itself
     * like every other bank, so a track left on it comes back to it. The old
     * exception here is exactly why it did not: trackActiveBank stayed on the
     * bank you walked through (AUTOMATION), and that stale value is what the
     * exit restore, the co-run landing and the next launch all read. */
    /* ...except a sound bank reached by GESTURE, which is not the track's bank
     * (Josh, 2026-09-05) — only the jog's walk records those. */
    if (!isSoundBank(S.activeBank) || S.bankCardLatched)
        S.trackActiveBank[S.activeTrack] = S.activeBank;
    /* ⭑ No identity, no write — and no fallback either. The path builders now
     * THROW rather than invent a destination, so this is the one place that has
     * to decide what a save with no project MEANS, and it means "not yet",
     * never "somewhere else". Under the identity machine this is reachable only
     * while a project is still being confirmed, which is a wait rather than a
     * loss: the DSP holds the work and the next save lands once OPEN arrives.
     * One line per session, because the previous behaviour — redirecting to an
     * install-wide file beside the stock tree — was silent, and that silence is
     * why two sessions' work went missing before anyone noticed (2026-09-16). */
    if (!S.currentSetUuid) { noteIdentitylessSave(); return; }
    ensureStateDir(S.currentSetUuid);
    host_write_file(uuidToUiStatePath(S.currentSetUuid), JSON.stringify({
        v: 9, at: S.activeTrack, ac: S.trackActiveClip.slice(), sv: S.sessionView ? 1 : 0,
        dl: S.activeDrumLane.slice(),
        pm: S.perfModsToggled, lm: S.perfLatchMode ? 1 : 0,
        rs: S.perfRecalledSlot, us: S.perfSnapshots.slice(8),
        bm: S.beatMarkersEnabled ? 1 : 0,
        dva: S.drumVelZoneArmed.slice(),
        dleu: S.drumLaneEuclidN.map(function(lane) { return lane.slice(); }),
        to: S.trackOctave.slice(),
        tab: S.trackActiveBank.slice(),
        am: S.trackAtMode.slice(),
        pchr: S.padLayoutChromatic.map(function(b) { return b ? 1 : 0; }),
        /* The macro store, per track: eight MAPPINGS or null (see
         * ui_state.trackMacros) — `{v, legs:[leg,…]}`, a leg being a typed
         * target plus lo/hi. Additive on v:9: absent → unseeded, and ui_sound
         * migrates the chain's own knob_N assignments on first use. ⚠ Written
         * in the CURRENT shape only; the reader still accepts the pre-09-05
         * flat one, so an older sidecar loads and is rewritten reshaped. */
        mac: S.trackMacros.map(function(m) { return m ? m.slice() : null; }),
        /* The MIDI knob values per track (target -> value) and the per-clip
         * Program / Bank triples; additive on v:9 (spec §2b, 2026-09-03). */
        mcv: S.trackMidiVals.map(function(m) { return Object.assign({}, m); }),
        cpg: S.clipProgram.map(function(c) { return c.map(function(p) { return p.slice(); }); }),
        /* Which user preset each sound-mode component is on (ui_sound's
         * record, live in S.presetRec) — {name, path, hash, mod} keyed
         * 'slot:comp'. Additive field on v:9, like pchr: absent in older
         * sidecars → no records, which is exactly what session-lived meant.
         * Serialized as held; entries only ever enter through setPresetRecord,
         * so there is nothing to filter here. */
        upr: S.presetRec
        }));
}

export function saveState() {
    /* SELECT-BEFORE-LOAD: nothing is loaded, so there is nothing to save and
     * everything to lose — both halves below would write an empty instance's
     * state over the boot project (DSP blob AND the UI sidecar). Callers are
     * Quit, Shift+Back, suspend, the Save menu and the picker's switch path;
     * all of them can be reached before a selection. */
    if (S.awaitingProjectSelect) return;
    S.altMode = false;   /* transient; never persisted across suspend/resume */
    /* Route the DSP save through the end-of-tick pendingSuspendSave drain so it
     * cannot be coalesced by other set_params fired in the same audio buffer
     * (Quit / Shift+Back / Save menu / co-run handoff all call this from
     * MIDI-handler context). Sidecar write stays synchronous via writeSidecar(). */
    S.pendingSuspendSave = true;
    writeSidecar();
}

/* ------------------------------------------------------------------ */
/* Snapshots — explicit, user-named-by-timestamp save/load states.    */
/* Stored as flat files alongside the live state in the set's UUID     */
/* folder (set_state/<uuid>/). Manifest (seq8-snap-index.json) is the  */
/* authoritative list — there is no host_list_dir, and host_remove_dir */
/* is not permitted under set_state, so we never enumerate or delete    */
/* folders. Overwrite rewrites a file in place; wipe drops manifest     */
/* entries and best-effort stubs the orphaned files (cannot unlink).    */
/* ------------------------------------------------------------------ */

export const SNAPSHOT_CAP = 16;
const SNAP_MANIFEST_VER = 1;

function snapBaseDir(uuid) {
    /* ⚠⚠ NO FALLBACK — a snapshot of nothing has nowhere to go. */
    if (!uuid) throw new Error('snapBaseDir: no project identity');
    return setStateDir(uuid);
}
function snapManifestPath(uuid) { return snapBaseDir(uuid) + '/' + STATE_PREFIX + '-snap-index.json'; }
function snapStatePath(uuid, id) { return snapBaseDir(uuid) + '/' + STATE_PREFIX + '-snap-' + id + '-state.json'; }
function snapUiStatePath(uuid, id) { return snapBaseDir(uuid) + '/' + STATE_PREFIX + '-snap-' + id + '-ui-state.json'; }

/* "MM-DD HH:MM" label from a Date (defaults to now). */
export function snapshotLabel(d) {
    d = d || new Date();
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
           p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/* Read top-level "v" (state version) out of a serialized state blob. */
function parseStateVersion(raw) {
    try { const o = JSON.parse(raw); return (o && typeof o.v === 'number') ? o.v : 0; }
    catch (e) { return 0; }
}

/* Returns the snapshot list (newest-first) for a set, or []. */
export function loadSnapshotManifest(uuid) {
    if (!uuid) return [];   /* no project, no manifest */
    const p = snapManifestPath(uuid);
    if (!host_file_exists(p)) return [];
    try {
        const obj = JSON.parse(host_read_file(p) || '');
        const arr = (obj && Array.isArray(obj.snaps)) ? obj.snaps : [];
        arr.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
        return arr;
    } catch (e) { return []; }
}

function writeSnapshotManifest(uuid, snaps) {
    return host_write_file(snapManifestPath(uuid),
        JSON.stringify({ v: SNAP_MANIFEST_VER, snaps: snaps }));
}

/* Copy the (just-saved) live state files into a snapshot identified by id,
 * and update the manifest. Reusing an existing id overwrites in place.
 * Call AFTER the DSP 'save' has flushed live state to disk. */
export function commitSnapshot(uuid, id, label) {
    if (!uuid) return false;   /* a snapshot of no project is not a snapshot */
    const srcSt = uuidToStatePath(uuid);
    if (!host_file_exists(srcSt)) return false;
    const stContents = host_read_file(srcSt);
    if (!stContents) return false;
    host_write_file(snapStatePath(uuid, id), stContents);
    const srcUi = uuidToUiStatePath(uuid);
    if (host_file_exists(srcUi)) {
        const uiContents = host_read_file(srcUi);
        if (uiContents) host_write_file(snapUiStatePath(uuid, id), uiContents);
    }
    let snaps = loadSnapshotManifest(uuid).filter(function(s) { return s.id !== id; });
    /* ts = save time (now), NOT the id: on overwrite the id is reused (old
     * timestamp) but the snapshot should sort/display as freshly saved. */
    snaps.unshift({
        id: id,
        ts: Date.now(),
        label: label,
        sv: parseStateVersion(stContents)
    });
    writeSnapshotManifest(uuid, snaps);
    return true;
}

/* Copy a snapshot's files over the live state files, so the normal
 * state_load reload path (pendingSetLoad) restores them. */
export function applySnapshotToLive(uuid, id) {
    if (!uuid) return false;
    const snSt = snapStatePath(uuid, id);
    if (!host_file_exists(snSt)) return false;
    const stContents = host_read_file(snSt);
    if (!stContents) return false;
    host_write_file(uuidToStatePath(uuid), stContents);
    const snUi = snapUiStatePath(uuid, id);
    if (host_file_exists(snUi)) {
        const uiContents = host_read_file(snUi);
        if (uiContents) host_write_file(uuidToUiStatePath(uuid), uiContents);
    }
    return true;
}

/* Drop the given snapshot ids from the manifest. Files can't be unlinked
 * from JS (no host API; host_remove_dir is disallowed under set_state), so
 * we best-effort stub the orphaned files to reclaim space. Returns the
 * surviving snapshot list. */
export function dropSnapshots(uuid, ids) {
    if (!uuid) return;
    /* Same shape as doClearSession: a direct destructive writer, reachable
     * before a project has been selected. See the guard note there. */
    if (S.awaitingProjectSelect) return loadSnapshotManifest(uuid);
    const idset = {};
    for (let i = 0; i < ids.length; i++) idset[ids[i]] = true;
    for (let i = 0; i < ids.length; i++) {
        host_write_file(snapStatePath(uuid, ids[i]), '{}');
        host_write_file(snapUiStatePath(uuid, ids[i]), '{}');
    }
    const snaps = loadSnapshotManifest(uuid).filter(function(s) { return !idset[s.id]; });
    writeSnapshotManifest(uuid, snaps);
    return snaps;
}

export function doClearSession() {
    /* SELECT-BEFORE-LOAD: this would wipe a project the user has not selected,
     * has never seen the contents of, and may not have meant to touch. Guarded
     * here because it writes the two project files DIRECTLY rather than through
     * saveState()/writeSidecar() — the audit that produced those guards called
     * them "every save path" and was wrong; a destructive writer that bypasses
     * them is exactly the shape that gets missed. */
    if (S.awaitingProjectSelect) return;
    /* No project, nothing to clear — and no fallback to clear instead. */
    if (!S.currentSetUuid) return;
    const sp = uuidToStatePath(S.currentSetUuid);
    host_write_file(sp, '{"v":0}');
    host_write_file(uuidToUiStatePath(S.currentSetUuid), '{"v":0}');
    /* Reset JS-only state not covered by S.pendingSetLoad */
    S.activeBank = 0;
    for (let _t = 0; _t < NUM_TRACKS; _t++) S.trackActiveBank[_t] = 0;
    S.undoSeqArpSnapshot = null;
    S.redoSeqArpSnapshot = null;
    for (let _t = 0; _t < NUM_TRACKS; _t++) {
        for (let _c = 0; _c < NUM_CLIPS; _c++) S.clipSeqFollow[_t][_c] = true;
        S.trackChannel[_t] = 1; S.trackRoute[_t] = 0; S.trackPadMode[_t] = 0;
        S.trackMidiTo[_t] = 0;   /* plays its own instrument */
        S.trackVelOverride[_t] = 0; S.trackLooper[_t] = 1;
        S.trackOctave[_t] = 0;
        S.drumVelZoneArmed[_t] = false;
        for (let _b = 3; _b <= 4; _b++) {
            for (let _k = 0; _k < 8; _k++) {
                const _pm = BANKS[_b].knobs[_k];
                S.bankParams[_t][_b][_k] = _pm ? _pm.def : 0;
            }
        }
        S.drumPerformMode[_t]   = 0;
        S.drumRepeatHeldPad[_t] = -1;
        S.drumRepeatLatched[_t] = false;
        S.drumRepeat2HeldLanes[_t].clear();
        S.drumRepeat2LatchedLanes[_t].clear();
        for (let _l = 0; _l < DRUM_LANES; _l++) S.drumRepeat2RatePerLane[_t][_l] = 0;
        for (let _l = 0; _l < DRUM_LANES; _l++) S.drumLaneEuclidN[_t][_l] = 0;
        for (let _l = 0; _l < DRUM_LANES; _l++) {
            S.drumRepeatGate[_t][_l] = 0xFF;
            for (let _s = 0; _s < 8; _s++) {
                S.drumRepeatVelScale[_t][_l][_s] = 100;
                S.drumRepeatNudge[_t][_l][_s]    = 0;
            }
        }
        S.trackAtMode[_t]              = 0;
        S.trackMuted[_t]               = false;
        S.trackSoloed[_t]              = false;
        S.drumLaneMute[_t]             = 0;
        S.drumLaneSolo[_t]             = 0;
        S.noteFXRandomMode[_t]         = 2;
        S.midiDlyRandomMode[_t]        = 2;
        S.lastTarpStyle[_t]            = 1;
        S.clipAdaptiveMode[_t]         = new Array(NUM_CLIPS).fill(false);
        S.clipLengthManuallySet[_t]    = new Array(NUM_CLIPS).fill(false);
        S.drumLaneLengthManuallySet[_t] = false;
    }
    S.sessionView          = false;
    S.beatMarkersEnabled   = true;
    S.perfModsToggled      = 0;
    S.perfLatchMode        = true;
    S.perfRecalledSlot     = -1;
    for (let _i = 8; _i < 16; _i++) S.perfSnapshots[_i] = 0;
    S.swingAmt             = 0;
    S.swingRes             = 0;
    S.launchQuant          = 0;
    S.midiInChannel        = 0;
    S.metronomeOn          = 1;
    S.inpQuant             = false;
    S.pendingSetLoad  = true;
    S.globalMenuOpen  = false;
    S.confirmClearSession = false;
    showActionPopup('SESSION', 'CLEARED');
}
