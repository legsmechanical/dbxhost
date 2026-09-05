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
 * state-co-location plan, 2026-08-12): Sets/<uuid>/dAVEBOx/<prefix>-*.json,
 * beside Move's inner <Name>/ dir. It travels with the set on copy/delete/
 * rename because it IS in the set — the parallel set_state/ tree, and all the
 * machinery that kept it in step (liveness test, orphan prune, two-root
 * delete, name index), retires with the old location.
 *
 * ⚠ These MUST agree with the DSP's SEQ8_SET_STATE_FMT (dsp/seq8.c) — the DSP
 * writes state where JS expects to read it back — and the reserved subdir name
 * is a contract with project-cmd.sh/select-list.sh, pinned by check-config.sh.
 * ⚠ In-session Sets/ is the standalone library (bind-mounted), so these paths
 * only ever land inside dAVEBOx projects. */
import { setUuidIsProvisional }
    from '/data/UserData/schwung/shared/session_state.mjs';

const SETS_DIR    = '/data/UserData/UserLibrary/Sets';
const DBX_SUBDIR  = 'dAVEBOx';

function setStateDir(uuid) { return SETS_DIR + '/' + uuid + '/' + DBX_SUBDIR; }

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
    return uuid
        ? setStateDir(uuid) + '/' + STATE_PREFIX + '-state.json'
        : '/data/UserData/schwung/' + STATE_PREFIX + '-state.json';
}

export function uuidToUiStatePath(uuid) {
    return uuid
        ? setStateDir(uuid) + '/' + STATE_PREFIX + '-ui-state.json'
        : '/data/UserData/schwung/' + STATE_PREFIX + '-ui-state.json';
}

/* ⚠ active_set.txt lives under THIS host's install dir, never the stock literal
 * (shadow_ui.js writes HOST_STATE_ROOT + "/active_set.txt" on SET_CHANGED).
 * Reading the stock path here returned a STALE stock file, so the resume-edge
 * set-mismatch check never fired and a project switch resumed with the previous
 * project's data (found on hardware 2026-08-06, v2 no-restart picker). State is
 * per-install and never crosses. */
const ACTIVE_SET_PATH = DAVEBOX_HOST_DIR + '/active_set.txt';

/* Read active_set.txt (per-install): line 1 = UUID, line 2 = name. */
export function readActiveSet() {
    try {
        const raw = host_read_file(ACTIVE_SET_PATH);
        if (!raw) return { uuid: '', name: '' };
        const lines = raw.split('\n');
        const _u = (lines[0] || '').trim();
        /* ⚠⚠ A PROVISIONAL identity is reported as NO PROJECT, not as itself.
         * `__pending-N-M` is the host's placeholder while Move sits on a song
         * index whose set folder does not exist yet. This is the single choke
         * point where the uuid enters dAVEBOx (both S.currentSetUuid writes in
         * ui_tick read it from here), so refusing it here keeps every path
         * builder, save and snapshot downstream from ever seeing one. */
        return {
            uuid: setUuidIsProvisional(_u) ? '' : _u,
            name: (lines[1] || '').trim()
        };
    } catch (e) {
        return { uuid: '', name: '' };
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
        if (!host_file_exists(uuidToStatePath(S.currentSetUuid)))
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

export function showActionPopup(...lines) {
    S.actionPopupHighlight = -1;
    S.actionPopupGauge = -1;
    S.actionPopupGaugeMark = -1;
    S.actionPopupLines   = lines;
    S.actionPopupEndTick = nowMs() + ACTION_POPUP_MS;
    S.screenDirty = true;
}

/* Same popup, plus a bar. For values you are DIALLING rather than events you
 * are being told about: a number alone makes you read where you are, a bar
 * shows it. `mark` draws a reference tick — unity on a level, so "back to
 * normal" is a place on screen rather than a number to hunt for. Both are
 * fractions of full scale; -1 omits the tick. */
export function showActionPopupGauge(frac, mark, ...lines) {
    showActionPopup(...lines);
    S.actionPopupGauge = Math.max(0, Math.min(1, frac));
    S.actionPopupGaugeMark = (mark >= 0 && mark <= 1) ? mark : -1;
}

/* Write the sidecar synchronously. Split out of saveState so bank-change
 * sites can persist immediately without scheduling a DSP save. */
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
    return uuid ? setStateDir(uuid) : '/data/UserData/schwung';
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
