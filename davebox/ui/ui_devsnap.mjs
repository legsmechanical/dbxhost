/* ui_devsnap.mjs — DEVICE-WIDE SNAPSHOTS (item 18, Josh 2026-09-05).
 *
 * "recallable device wide snapshots … accessible in session view through a
 * UI/UX analogous to mute snapshots, but accessed by holding capture rather
 * than mute." A snapshot holds ALL of: every track's module/instrument params
 * (the host's per-slot files), the Move buses + master/send FX (the host's bus
 * files), THE MIXER (every track's level/pan/sends, read here), and the macro
 * knobs' POSITIONS (the values their targets sit at — chain and level legs are
 * already in those files; bank legs are davebox's own params, kept here).
 * MUTES DO NOT RIDE (Josh, 2026-09-05 late: "take mutes out of snapshots" —
 * mute snapshots own mutes; the two systems must not fight).
 * THE PARAM LIST rides (Josh: "any automatable param, in fact"): every loaded
 * module's chain_params values per slot and component, read in ONE bulk GET
 * per component, and the sequencer's bank-knob settings per track. Recall
 * replays the host's opaque state blobs (exact, instant) and re-applies the
 * sequencer values; the module values are what a MORPH will interpolate
 * later (the spec's 18b) — stored raw, with the module id, so they can be
 * normalised against chain_params when that lands.
 *
 * THE LAYER (session view): hold CAPTURE for DEVSNAP_HOLD_MS with no other
 * gesture and the 16 step buttons become the 16 snapshot slots — exactly the
 * mute-snapshot grammar with Mute swapped for Capture: tap a filled slot =
 * recall, hold a slot = save (overwrite asks nothing, like mute snapshots),
 * Delete + slot = clear. Releasing Capture closes the layer. A Capture + pad
 * / row within the hold keeps its existing modifier meaning; a tap keeps the
 * retrospective capture — the layer only opens once the hold is unmistakable.
 *
 * STORAGE: per PROJECT, Sets/<uuid>/dAVEBOx/snapshots/<n>/ — the host writes
 * its files there (host_snapshot_take) and davebox adds davebox.json. RECALL:
 * host_snapshot_recall(dir) is state-only, id-guarded and budgeted one bulk
 * per host tick (never load_file, so a reverb tail is not cut); the layer says
 * RECALLING until host_snapshot_status() reports done, then davebox applies
 * its own json. No per-tick reads: slot presence is scanned ONCE on open.
 */
import { S } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { NUM_TRACKS, DRUM_LANES } from './ui_constants.mjs';
import { showActionPopup, showActionPopupFor, deviceSnapDir, deviceSnapUndoDir } from './ui_persistence.mjs';
import { markSnapshotUndo } from './ui_editops.mjs';
import { engineGet, engineSet, engineGetSlotParam, engineSetSlotParam, moveBusComp,
         moveBusForChannel, engineLoadedModule, engineDescribe, engineGetMany } from './ui_engine.mjs';
import { midiVal, midiSendValue, seqAutoSnapshot, seqAutoRestore } from './ui_sound.mjs';
import { forceRedraw, invalidateLEDCache } from './ui_leds.mjs';

export const DEVSNAP_SLOTS   = 16;
export const DEVSNAP_HOLD_MS = 450;     /* = BACK_HOLD_MS: a deliberate long-press */
/* A SAVED / RESTORED card is a result to read, not a flash: the default popup
 * (520 ms) was "gone before you can read it" (Josh, 2026-09-05, device). */
export const DEVSNAP_CARD_MS = 1500;
/* A recall that had to BYPASS something is a warning to read. */
export const DEVSNAP_WARN_MS = 3500;
const LEVEL_KEYS = ['volume', 'pan', 'send_a', 'send_b'];
/* A level that read back as nothing is NOT a level (isFinite(null) is true —
 * JSON turns NaN into null on the way through the file). */
const num = (v) => (typeof v === 'number' && isFinite(v));

function st() {
    if (!S.devSnap) S.devSnap = { open: false, slots: new Array(DEVSNAP_SLOTS).fill(false),
                                  last: -1, recalling: -1, recallDir: null, recallJson: null, recallUndo: null, since: 0 };
    return S.devSnap;
}
export function devSnapOpen()   { return !!(S.devSnap && S.devSnap.open); }
export function devSnapState()  { return st(); }

function slotDir(n) { return deviceSnapDir(S.currentSetUuid, n); }

/* Scan once: a slot exists when the host's first file does. */
export function devSnapScan() {
    const d = st();
    for (let i = 0; i < DEVSNAP_SLOTS; i++)
        d.slots[i] = !!S.currentSetUuid && host_file_exists(slotDir(i) + '/davebox.json');
}

export function devSnapEnter() {
    const d = st();
    if (d.open) return;
    d.open = true;
    devSnapScan();
    /* No entry popup: the layer names itself on screen for as long as it is
     * open (the SNAPSHOTS row under the banner, ui_render) and the footer
     * carries the gestures. A 520 ms flash of the same words was too quick to
     * help (Josh, 2026-09-05, device). */
    invalidateLEDCache();
    forceRedraw();
}
export function devSnapLeave() {
    const d = st();
    if (!d.open) return;
    d.open = false;
    invalidateLEDCache();
    forceRedraw();
}

/* ---- davebox's own half of a snapshot ------------------------------------ */
/* The mixer: every track's position, whichever kind it is. Level legs of the
 * macros ride with it; chain legs are in the host files. Read at TAKE only. */
function mixerCapture() {
    const tracks = [];
    for (let t = 0; t < NUM_TRACKS; t++) {
        const r = S.trackRoute[t] | 0;
        const e = { route: r };
        if (r === 0) {
            e.slot = t;
            for (const k of LEVEL_KEYS) { const v = parseFloat(engineGetSlotParam(t, k)); if (num(v)) e[k] = v; }
        } else if (r === 1) {
            const bus = moveBusForChannel(S.trackChannel[t]) | 0;
            e.bus = bus;
            if (bus > 0) for (const k of LEVEL_KEYS) { const v = parseFloat(engineGet(0, moveBusComp(bus), k)); if (num(v)) e[k] = v; }
        } else if (r === 2) {
            e.cc7 = midiVal(t, 'cc:7'); e.cc10 = midiVal(t, 'cc:10');
        }
        tracks.push(e);
    }
    return tracks;
}
/* ---- the parameter list --------------------------------------------------- */
const COMPS = ['synth', 'midi_fx1', 'midi_fx2', 'fx1', 'fx2', 'fx3', 'fx4'];
/* chain_params is static per module: its key list is cached by module id, so
 * a take reads the description once per distinct module, ever. */
const keysByModule = {};
function paramKeysFor(slot, comp, moduleId) {
    if (keysByModule[moduleId]) return keysByModule[moduleId];
    let keys = [];
    try {
        const d = engineDescribe(slot, comp);
        if (d && Array.isArray(d.chainParams)) for (const cp of d.chainParams) if (cp && cp.key) keys.push(cp.key);
    } catch (e) { keys = []; }
    keysByModule[moduleId] = keys;
    return keys;
}
export function paramKeysCacheResetForTest() { for (const k in keysByModule) delete keysByModule[k]; }
/* Per Schwung track: { comp: { module, values: { key: raw } } } for every
 * loaded component. Cost: one bulk GET per loaded component (≤60 keys each). */
function paramsCapture() {
    const tracks = [];
    for (let t = 0; t < NUM_TRACKS; t++) {
        const e = {};
        if ((S.trackRoute[t] | 0) === 0) {
            for (const comp of COMPS) {
                const id = engineLoadedModule(t, comp);
                if (!id) continue;
                const keys = paramKeysFor(t, comp, id);
                e[comp] = { module: id, values: keys.length ? engineGetMany(t, comp, keys) : {} };
            }
        }
        tracks.push(e);
    }
    return tracks;
}
function seqCapture() {
    const out = [];
    for (let t = 0; t < NUM_TRACKS; t++) out.push(seqAutoSnapshot(t));
    return out;
}
function seqApply(list) {
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (let t = 0; t < NUM_TRACKS && t < list.length; t++) n += seqAutoRestore(t, list[t]);
    return n;
}

function mixerApply(tracks) {
    if (!Array.isArray(tracks)) return 0;
    let n = 0;
    for (let t = 0; t < NUM_TRACKS && t < tracks.length; t++) {
        const e = tracks[t]; if (!e) continue;
        const r = S.trackRoute[t] | 0;
        if (r !== (e.route | 0)) continue;              /* the track changed kind since: skip */
        if (r === 0) {
            for (const k of LEVEL_KEYS) if (num(e[k])) { engineSetSlotParam(t, k, e[k].toFixed(3)); n++; }
        } else if (r === 1) {
            const bus = moveBusForChannel(S.trackChannel[t]) | 0;
            if (bus > 0 && bus === (e.bus | 0))
                for (const k of LEVEL_KEYS) if (num(e[k])) { engineSet(0, moveBusComp(bus), k, e[k].toFixed(3)); n++; }
        } else if (r === 2) {
            if (num(e.cc7))  { midiSendValue(t, 'cc:7',  e.cc7,  midiVal(t, 'cc:7'),  false); n++; }
            if (num(e.cc10)) { midiSendValue(t, 'cc:10', e.cc10, midiVal(t, 'cc:10'), false); n++; }
        }
    }
    S.sessVolLevel.fill(-1);                              /* the strips re-read on the next poll */
    return n;
}

/* ---- the gestures ---------------------------------------------------------- */
/* The take itself: the host's files plus davebox.json into `dir`. Shared by a
 * slot save and the hidden before-take a recall makes for Undo. */
function takeInto(dir) {
    host_ensure_dir(dir);
    let res = null;
    try { res = JSON.parse(host_snapshot_take(dir) || 'null'); } catch (e) { res = null; }
    if (!res || !res.ok) return null;
    const json = { v: 4, mixer: mixerCapture(), params: paramsCapture(), seq: seqCapture(), taken: Date.now() };
    if (!host_write_file(dir + '/davebox.json', JSON.stringify(json))) return null;
    return res;
}

export function devSnapSave(n) {
    const d = st();
    if (!S.currentSetUuid) { showActionPopup('SNAPSHOT', 'No project'); return false; }
    const res = takeInto(slotDir(n));
    if (!res) { showActionPopup('SNAPSHOT', 'Save failed'); return false; }
    d.slots[n] = true; d.last = n;
    showActionPopupFor(DEVSNAP_CARD_MS, 'SNAPSHOT ' + (n + 1), 'SAVED', res.skipped ? res.skipped + ' skipped' : undefined);
    S.stepSaveFlashStartTick = S.clockMs;
    invalidateLEDCache(); forceRedraw();
    return true;
}

/* Recall `dir`. `undo` = { before, after, n } registers the recall as the
 * thing Undo returns from; null for an undo/redo recall itself (which must
 * not register a unit of its own — that would be undo-of-undo). */
function recallDir(dir, n, undo) {
    const d = st();
    if (d.recalling >= 0) return false;                  /* one at a time */
    let json = null;
    try { json = JSON.parse(host_read_file(dir + '/davebox.json') || 'null'); } catch (e) { json = null; }
    let res = null;
    try { res = JSON.parse(host_snapshot_recall(dir) || 'null'); } catch (e) { res = null; }
    if (!res || !res.ok) { showActionPopup('SNAPSHOT ' + (n + 1), 'Recall failed'); return false; }
    d.recalling = n; d.recallDir = dir; d.recallJson = json; d.since = nowMs(); d.recallUndo = undo || null;
    if (!res.pending) devSnapFinish();
    invalidateLEDCache(); forceRedraw();
    return true;
}

export function devSnapRecall(n) {
    const d = st();
    if (!d.slots[n]) return false;
    if (d.recalling >= 0) return false;
    /* UNDO (Josh, 2026-09-05): the live state goes into the hidden before-dir
     * first, so Undo can bring it back and Redo can re-apply the slot. A
     * failed before-take does not block the recall — it just leaves no undo. */
    let before = null;
    if (S.currentSetUuid) { const u = deviceSnapUndoDir(S.currentSetUuid); if (takeInto(u)) before = u; }
    return recallDir(slotDir(n), n, before ? { before, after: slotDir(n), n } : null);
}

/* The Undo button on a recall: back to the before-take. Redo re-applies the
 * slot. Both go through the ordinary recall (host blobs + davebox's half). */
export function devSnapUndo() {
    const u = S.undoSnapshot;
    if (!u) return false;
    if (!recallDir(u.before, u.n, null)) return false;
    S.undoSnapshot = null; S.redoSnapshot = u;
    S.undoAvailable = false; S.redoAvailable = true;
    return true;
}
export function devSnapRedo() {
    const u = S.redoSnapshot;
    if (!u) return false;
    if (!recallDir(u.after, u.n, null)) return false;
    S.redoSnapshot = null; S.undoSnapshot = u;
    S.undoAvailable = true; S.redoAvailable = false;
    return true;
}

function devSnapFinish() {
    const d = st();
    const n = d.recalling;
    let status = null;
    try { status = JSON.parse(host_snapshot_status() || 'null'); } catch (e) { status = null; }
    let applied = 0;
    try { applied = d.recallJson ? mixerApply(d.recallJson.mixer) + seqApply(d.recallJson.seq) : 0; }
    catch (e) { console.log('[devsnap] mixer/seq apply failed: ' + e); }
    /* Mutes are NOT in a snapshot (Josh, 2026-09-05 late), and a track that
     * gained a synth since the take is left alone. Module values are not
     * applied from the list — the host's state blobs already restored them. */
    const undo = d.recallUndo;
    d.recalling = -1; d.recallDir = null; d.recallJson = null; d.recallUndo = null; d.last = n;
    if (undo) markSnapshotUndo(undo.before, undo.after, undo.n);
    /* The card: what came back, then what the recall had to DO about things
     * that were not there at the save (Josh, 2026-09-05: "pop a warning up"). */
    const added = status && status.added ? status.added | 0 : 0;
    const lines = ['SNAPSHOT ' + (n + 1), 'RESTORED'];
    if (status && status.skipped) lines.push(status.skipped + ' skipped');
    if (added) lines.push(added + ' new FX bypassed');
    if (added) console.log('[devsnap] recall ' + (n + 1) + ': bypassed ' + added + ' fx added since the save' +
                           (status && status.addedList ? ' (' + status.addedList.join(' ') + ')' : ''));
    showActionPopupFor(added ? DEVSNAP_WARN_MS : DEVSNAP_CARD_MS, ...lines);
    invalidateLEDCache(); forceRedraw();
    return applied;
}

/* Per tick while a recall is in flight: the host budgets one bulk per tick,
 * davebox waits for it to say done (or gives up after a bounded wait). */
export function devSnapTick() {
    const d = S.devSnap;
    if (!d || d.recalling < 0) return;
    let status = null;
    try { status = JSON.parse(host_snapshot_status() || 'null'); } catch (e) { status = null; }
    const done = !status || !status.pending;
    if (done || nowMs() - d.since > 5000) devSnapFinish();
}

export function devSnapClear(n) {
    const d = st();
    if (!d.slots[n]) return false;
    /* No unlink binding: the marker file is what "exists" means, so empty it. */
    host_write_file(slotDir(n) + '/davebox.json', '');
    d.slots[n] = false;
    if (d.last === n) d.last = -1;
    showActionPopup('SNAPSHOT ' + (n + 1), 'CLEARED');
    invalidateLEDCache(); forceRedraw();
    return true;
}

/* The step-button LED for slot i while the layer is open. */
export function devSnapLedFor(i, colors) {
    const d = st();
    if (d.recalling === i) return (Math.floor(S.clockMs / 220) % 2) ? colors.white : colors.off;
    if (!d.slots[i]) return colors.dim;
    return i === d.last ? colors.white : colors.filled;
}

export function devSnapHints() {
    const d = st();
    if (d.recalling >= 0) return [['SNAP', 'RECALLING']];
    /* Josh, 2026-09-05: "Step tap:recall" "Hold:store". Measured: the two pairs
     * are 123 px of 128; a third (DEL CLEAR) does not fit and the row's fit
     * rule would drop it anyway, so Delete+step stays an unlabelled gesture. */
    return [['STEP TAP', 'RECALL'], ['HOLD', 'STORE']];
}
