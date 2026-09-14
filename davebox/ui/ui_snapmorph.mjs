/* ui_snapmorph.mjs — SNAPMORPH (18b, Josh 2026-09-13): a macro leg that morphs
 * a track's chain between two or more of its TRACK SNAPSHOTS.
 *
 * "Schwung chain snapshots and a Morph target on the macro knobs that morphs
 * params between 2 or more user-selected snapshots." The leg is
 * `{ kind:'morph', snaps:[n,…], lo, hi }` in the mapping store; the knob's own
 * position `v` (through the leg's lo..hi window) is a position ALONG the list
 * of snapshots: 0 = the first, 1 = the last, and between two neighbours every
 * parameter the two snapshots share is interpolated.
 *
 * WHAT MORPHS: the snapshot's PARAM LIST (`davebox.json` → `params[t][comp] =
 * { module, values }`, written at the take by ui_devsnap), never the host's
 * opaque state blobs — those are exact and replay on RECALL, but nothing can
 * interpolate them. A component counts only when EVERY chosen snapshot and
 * the LIVE slot carry the same module id; a key counts only when every
 * snapshot has a value for it and the module's chain_params describe it as a
 * number, an int or a choice. Everything else is left alone, silently, which
 * is the same rule a recall applies (a swapped module is skipped).
 *
 * RULINGS (Josh, 2026-09-13):
 *   · enums and switches SNAP to the nearest snapshot's value — the value is
 *     interpolated in the parameter's own units and `clampValue` quantises it
 *     to the parameter's grid, so a choice steps at the midpoint and nothing
 *     in the snapshot is silently excluded.
 *   · the morph is recorded as ONE lane — the knob's position, target
 *     `mac:<track>:<knob>`, labelled SnapMorph — not as a lane per parameter
 *     ("that way all the params don't have to be recorded and blasted, just
 *     the morph knob position"). Playback comes back through the applier
 *     below, the way `seq:` lanes do. Export skips it (no Live equivalent).
 *
 * COST: one bulk SET per ≤32 changed pairs per detent (2.9 ms a round trip;
 * a 40-param morph is two). Only pairs whose wire string CHANGED are sent.
 * A hand turn writes TRANSIENT (the host's autosave must not serialise the
 * slot on every detent — [[host-autosave-was-the-once-per-loop-stall]]),
 * then ONE non-transient resend once the hand has been off for a moment, so
 * the morphed sound survives a project reload. Playback writes are transient
 * only, exactly as every other automation push is.
 *
 * SEEDING costs round trips (chain_params + the live module id, per shared
 * component, ≤7) and file reads; both happen ONCE per (track, knob, snap
 * list, project) and are budgeted per tick by the caller, never on a detent.
 */
import { S as GS } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { NUM_TRACKS } from './ui_constants.mjs';
import { trackSnapDir } from './ui_persistence.mjs';
import { engineGet, engineLoadedModule, faderGainToTravel, faderTravelToGain, faderWire,
         moveBusForChannel, moveBusComp } from './ui_engine.mjs';
import { makeCell } from './ui_discover.mjs';
import { parseValue, clampValue, commitString } from './ui_cells.mjs';
import { bulkEncode } from './ui_automation.mjs';

export const MORPH_KIND = 'morph';
export const MORPH_LABEL = 'SnapMorph';
export const MORPH_MIN_SNAPS = 2;
export const MORPH_MAX_SNAPS = 16;            /* = DEVSNAP_SLOTS */
/* SHADOW_BULK_MAX_ITEMS is 64 = 32 key/value pairs per request (ui_automation). */
const MORPH_BULK_PAIRS = 32;
/* The hand is off the knob this long → the last values are re-sent as an EDIT. */
export const MORPH_FINAL_MS = 400;
/* Cell kinds a morph can drive: anything numeric or a choice. */
const MORPH_SKIP_KINDS = { file: 1, text: 1, opaque: 1 };

/* One entry per (track, knob): what was loaded, and what was last written. */
const entries = new Map();
/* chain_params per `<slot>:<comp>`, read once per project. */
let metaCache = new Map();

function entryKey(track, knob) { return track + ':' + knob; }
function legSig(track, leg) {
    return GS.currentSetUuid + '|' + track + '|' + (leg && Array.isArray(leg.snaps) ? leg.snaps.join('+') : '');
}

export function morphLegValid(leg) {
    return !!leg && leg.kind === MORPH_KIND && Array.isArray(leg.snaps) && leg.snaps.length >= MORPH_MIN_SNAPS;
}

/* The track's FILLED snapshot slots — the morph picker's rows. A slot exists
 * when its davebox.json does (ui_devsnap's own rule; a cleared slot is an
 * EMPTY file, which host_file_exists in the rig treats as absent and the
 * device's read returns '' for — both fail the parse below). */
export function morphSnapshotSlots(track) {
    const out = [];
    if (!GS.currentSetUuid) return out;
    for (let n = 0; n < MORPH_MAX_SNAPS; n++)
        if (host_file_exists(trackSnapDir(GS.currentSetUuid, track, n) + '/davebox.json')) out.push(n);
    return out;
}

function readSnapshot(track, n) {
    let json = null;
    try { json = JSON.parse(host_read_file(trackSnapDir(GS.currentSetUuid, track, n) + '/davebox.json') || 'null'); }
    catch (e) { json = null; }
    const p = json && Array.isArray(json.params) ? json.params[track] : null;
    const m = json && Array.isArray(json.mixer) ? json.mixer[track] : null;
    return { params: (p && typeof p === 'object') ? p : null, mixer: (m && typeof m === 'object') ? m : null };
}

/* THE MIXER LEVELS ride too (Josh, 2026-09-13: "let's add track mixer
 * levels"): the snapshot's `mixer[t]` half — volume, pan, send A, send B of a
 * chain track's own slot. Volume is a FADER ([[davebox-fader-law]]): it
 * morphs in TRAVEL (dB) space, so the halfway point between −6 dB and unity
 * is −3 dB, exactly where the fader itself would sit halfway; pan and the
 * sends are linear 0..1. Written as `slot:<key>` pairs in the same bulk SET
 * as the chain params (the automation push spells them the same way). */
const LEVEL_KEYS = ['volume', 'pan', 'send_a', 'send_b'];
const num = (v) => (typeof v === 'number' && isFinite(v));
/* ── WHERE A TRACK'S SOUND LIVES (Josh, 2026-09-13: Move tracks too) ────────
 * A chain track: its slot (= the track index), components synth/fxN/midi_fxN,
 * levels `slot:<key>`. A MOVE track: slot 0, its bus's insert FX as
 * `move_fx:N:fxK`, levels `move_fx:N:<key>`. One dAVEBOx track owns a Move
 * instrument (moveInstrOwner), so writing the bus moves this track alone.
 * ⚠ The bus is checked against the SAVE: every snapshot must name the bus
 * the track is on NOW, or the morph is empty — re-pointed to another Move
 * instrument, the saved values belong to a bus that is somebody else's. */
function trackAddress(track, mixers) {
    const route = GS.trackRoute[track] | 0;
    if (route === 0) return { slot: track, levelComp: 'slot', ok: true };
    if (route !== 1) return { ok: false, why: 'not a chain or Move track' };
    const live = moveBusForChannel(GS.trackChannel[track]) | 0;
    if (!live) return { ok: false, why: 'no bus' };
    for (const m of mixers)
        if (!m || (m.route | 0) !== 1 || (m.bus | 0) !== live)
            return { ok: false, why: 'a snapshot was taken on bus ' + (m ? m.bus : '?') + ', the track is on bus ' + live };
    return { slot: 0, levelComp: moveBusComp(live), ok: true };
}
function buildLevels(mixers, route) {
    const out = {};
    if (!mixers.length || mixers.some(m => !m || (m.route | 0) !== route)) return out;
    for (const key of LEVEL_KEYS) {
        const vals = [];
        for (const m of mixers) {
            if (!num(m[key])) { vals.length = 0; break; }
            vals.push(key === 'volume' ? faderGainToTravel(m[key]) : Math.max(0, Math.min(1, m[key])));
        }
        if (vals.length) out[key] = vals;
    }
    return out;
}
function levelWire(key, t) {
    return key === 'volume' ? faderWire(faderTravelToGain(t)) : t.toFixed(3);
}

function metaFor(slot, comp) {
    const id = slot + ':' + comp;
    if (metaCache.has(id)) return metaCache.get(id);
    let list = [];
    try { list = JSON.parse(engineGet(slot, comp, 'chain_params') || '[]') || []; } catch (e) { list = []; }
    const m = {};
    for (const p of (Array.isArray(list) ? list : [])) if (p && p.key) m[p.key] = p;
    metaCache.set(id, m);
    return m;
}

/* Build (or resume building) the entry for a leg. Returns { ready, reads }:
 * `reads` is how many round trips this call spent (≤ budget), `ready` is
 * whether morphApply can run. Files are read on the first call; round trips
 * are spread over calls by `budget`. A broken leg (a snapshot gone, nothing
 * shared) reads as ready with no keys — the knob turns and writes nothing,
 * which is what an unaddressable leg does everywhere else. */
export function morphPrepare(track, knob, leg, budget) {
    const k = entryKey(track, knob);
    const sig = legSig(track, leg);
    let e = entries.get(k);
    if (!e || e.sig !== sig) {
        e = { sig, ready: false, snaps: null, comps: {}, levels: {}, todo: [], keys: 0,
              slot: track, levelComp: 'slot', last: new Map(), finalDue: 0, finalPairs: null };
        entries.set(k, e);
        if (!morphLegValid(leg)) { e.ready = true; return { ready: true, reads: 0 }; }
        const read = leg.snaps.map(n => readSnapshot(track, n));
        const addr = trackAddress(track, read.map(r => r.mixer));
        if (!addr.ok) {
            console.log('[morph] t' + (track + 1) + ' K' + (knob + 1) + ': nothing to morph — ' + addr.why);
            e.ready = true; e.snaps = read.map(r => r.params);
            return { ready: true, reads: 0 };
        }
        e.slot = addr.slot; e.levelComp = addr.levelComp;
        e.snaps = read.map(r => r.params);
        e.levels = buildLevels(read.map(r => r.mixer), GS.trackRoute[track] | 0);
        e.keys += Object.keys(e.levels).length;
        /* Components every snapshot has, with one module id across them. */
        const first = e.snaps[0];
        e.comps = {};
        if (first) for (const comp in first) {
            const mod = first[comp] && first[comp].module;
            if (!mod) continue;
            let same = true;
            for (let i = 1; i < e.snaps.length; i++) {
                const c = e.snaps[i] && e.snaps[i][comp];
                if (!c || c.module !== mod || !c.values) { same = false; break; }
            }
            if (same && first[comp].values) e.comps[comp] = { module: mod, cells: null };
        }
        e.todo = Object.keys(e.comps);
    }
    if (e.ready) return { ready: true, reads: 0 };
    let reads = 0;
    const max = (budget == null) ? 2 : budget;
    while (e.todo.length && reads < max) {
        const comp = e.todo[0];
        const c = e.comps[comp];
        /* Two round trips per component: is the SAME module still there, and
         * what does it declare. Cached per project, so a second morph over the
         * same components costs nothing here. */
        if (c.live === undefined) {
            c.live = (engineLoadedModule(e.slot, comp) === c.module);
            reads++;
            if (!c.live) { delete e.comps[comp]; e.todo.shift(); continue; }
            if (reads >= max) break;
        }
        const meta = metaFor(e.slot, comp);
        reads++;
        c.cells = {};
        for (const key in meta) {
            const cell = makeCell(key, meta[key]);
            if (!cell || MORPH_SKIP_KINDS[cell.kind] || !(cell.max > cell.min)) continue;
            const span = cell.max - cell.min;
            const vals = [];
            let ok = true;
            for (const sn of e.snaps) {
                const raw = sn[comp].values[key];
                const v = (raw === undefined || raw === null || raw === '') ? null : parseValue(cell, raw);
                if (v == null || !isFinite(v)) { ok = false; break; }
                vals.push(Math.max(0, Math.min(1, (v - cell.min) / span)));
            }
            if (!ok) continue;
            c.cells[key] = { cell, vals };
            e.keys++;
        }
        e.todo.shift();
    }
    if (!e.todo.length) e.ready = true;
    return { ready: e.ready, reads };
}

export function morphReady(track, knob, leg) {
    const e = entries.get(entryKey(track, knob));
    return !!(e && e.ready && e.sig === legSig(track, leg));
}
/* How many parameters this leg drives — for the leg list's row. */
export function morphKeyCount(track, knob, leg) {
    const e = entries.get(entryKey(track, knob));
    return (e && e.sig === legSig(track, leg)) ? e.keys : null;
}

function sendPairs(slot, pairs, transient) {
    let ok = true;
    for (let i = 0; i < pairs.length; i += MORPH_BULK_PAIRS) {
        const chunk = pairs.slice(i, i + MORPH_BULK_PAIRS);
        const flat = [];
        for (const p of chunk) flat.push(p[0], p[1]);
        if (!shadow_set_params(slot, 'chain:', bulkEncode(flat), !!transient)) ok = false;
    }
    return ok;
}

/* Write the chain at position `f` (0..1 along the snapshot list). Returns
 * the number of pairs sent, or null when the leg is not ready. Every write
 * from here is TRANSIENT; `mode` says what is owed afterwards:
 *   'turn' — a hand: the tick's final resend (morphTick) makes the same
 *            values an EDIT once the hand is off;
 *   'play' — automation playback: nothing — playback never dirties the
 *            slot, exactly as every other lane's push. */
export function morphApply(track, knob, leg, f, mode) {
    const e = entries.get(entryKey(track, knob));
    if (!e || !e.ready || e.sig !== legSig(track, leg)) return null;
    /* ⭐ A NEW TURN RE-ASSERTS EVERYTHING (Josh, device, 2026-09-13): "once I
     * start turning morph, everything should snap to the appropriate position
     * based on where things were when the snapshots were recorded." Between
     * turns the hand (or the editor, or a preset) may have moved a parameter
     * the morph also drives; `last` still says the morph wrote it, so the
     * changed-pairs filter would leave it where the hand put it — until the
     * interpolation happened to cross a grid step. So the first apply of a
     * turn forgets what was last sent and writes the whole set: one bulk per
     * 32 pairs, once per gesture. A turn is "new" after MORPH_FINAL_MS of
     * quiet — the same boundary that makes the transient writes an edit.
     * Playback keeps the filter: a lane drives continuously. */
    if (mode === 'turn') {
        const now = nowMs();
        if (now - (e.lastTurnMs || 0) > MORPH_FINAL_MS) e.last.clear();
        e.lastTurnMs = now;
    }
    const n = e.snaps ? e.snaps.length : 0;
    if (n < MORPH_MIN_SNAPS) return 0;
    f = Math.max(0, Math.min(1, isFinite(f) ? f : 0));
    const p = f * (n - 1);
    let a = Math.floor(p);
    if (a >= n - 1) a = n - 2;
    const frac = p - a;
    const pairs = [];
    let levelsMoved = false;
    for (const key in e.levels) {
        const vals = e.levels[key];
        const t = vals[a] + (vals[a + 1] - vals[a]) * frac;
        const wire = levelWire(key, t);
        const id = e.levelComp + ':' + key;
        if (e.last.get(id) === wire) continue;
        e.last.set(id, wire);
        pairs.push([id, wire]);
        levelsMoved = true;
    }
    for (const comp in e.comps) {
        const c = e.comps[comp];
        if (!c.cells) continue;
        for (const key in c.cells) {
            const { cell, vals } = c.cells[key];
            /* A CHOICE (enum, switch) snaps to the NEARER snapshot's own value
             * — never an option between them: Saw → Tri must not pass through
             * Square (Josh, 2026-09-13: "snap to the nearest snapshot's
             * value"). A number interpolates, and clampValue then lands an
             * int on an int. */
            const norm = cell.options ? (frac < 0.5 ? vals[a] : vals[a + 1])
                                      : vals[a] + (vals[a + 1] - vals[a]) * frac;
            const q = clampValue(cell, cell.min + norm * (cell.max - cell.min));
            if (q == null) continue;
            const wire = commitString(cell, q);
            const id = comp + ':' + key;
            if (e.last.get(id) === wire) continue;
            e.last.set(id, wire);
            pairs.push([id, wire]);
        }
    }
    if (pairs.length) {
        if (!sendPairs(e.slot, pairs, true)) {
            /* Refused: forget what we claimed to have written so the next
             * apply sends it again. */
            for (const pr of pairs) e.last.delete(pr[0]);
            return 0;
        }
        if (mode === 'turn') {
            /* Owed as an edit once the hand is off; accumulate across the turn. */
            if (!e.finalPairs) e.finalPairs = new Map();
            for (const pr of pairs) e.finalPairs.set(pr[0], pr[1]);
        }
        /* The session strips re-read a level they did not write themselves
         * (ui_devsnap's mixerApply does the same after a recall). */
        if (levelsMoved && Array.isArray(GS.sessVolLevel)) GS.sessVolLevel.fill(-1);
    }
    if (mode === 'turn' && e.finalPairs) e.finalDue = nowMs() + MORPH_FINAL_MS;
    return pairs.length;
}

/* A hand's mid-turn writes were transient; once it has been still for
 * MORPH_FINAL_MS the same values go out as one edit, so the slot is dirty
 * and its autosave keeps the morphed sound. One request per 32 pairs, once
 * per gesture. Called from the tick. */
export function morphTick() {
    const now = nowMs();
    for (const [k, e] of entries) {
        if (!e.finalPairs || now < e.finalDue) continue;
        const pairs = Array.from(e.finalPairs, ([id, wire]) => [id, wire]);
        e.finalPairs = null;
        if (!sendPairs(e.slot, pairs, false)) {
            /* Try again next tick rather than lose the edit. */
            e.finalPairs = new Map(pairs);
            e.finalDue = now + MORPH_FINAL_MS;
        }
    }
}
/* Is an edit still owed for this knob (a rig's observable). */
export function morphFinalPendingForTest(track, knob) {
    const e = entries.get(entryKey(track, knob));
    return !!(e && e.finalPairs);
}

/* Forget everything: a project load (new snapshot files, new modules) and a
 * module swap on `track` (the shared-module test must be asked again). */
export function morphInvalidate(track) {
    if (track == null) { entries.clear(); metaCache = new Map(); return; }
    for (const k of Array.from(entries.keys())) if (parseInt(k, 10) === track) entries.delete(k);
    for (const id of Array.from(metaCache.keys())) if (parseInt(id, 10) === track) metaCache.delete(id);
}
/* The meaning of every `move_fx:` component may have changed: a module swapped
 * on a bus, or a track re-pointed to another Move instrument. Bus entries all
 * live on slot 0, so this is the whole cache. */
export function morphInvalidateBuses() { morphInvalidate(); }

/* ── PLAYBACK: the SnapMorph lane comes back here ─────────────────────────
 * The owner (ui_automation) hands us (track, knob, v) for target
 * `mac:<track>:<knob>`; `v` is the KNOB's position, so the leg's lo..hi
 * window applies exactly as it does for a hand turn. Runs from the owner's
 * tick whether or not sound mode is open on that track — which is why this
 * module keeps its own caches rather than borrowing sound mode's. The
 * mapping's `v` is moved too, so the page's dial follows playback.
 * ⚠ Registered from init() (ui.js), never from a module body — see the
 * seq applier's note in ui_sound: a module-scope registration is wiped by
 * bundle order. */
export function snapMorphApply(track, knob, v) {
    if (track < 0 || track >= NUM_TRACKS || knob < 0 || knob > 7 || !isFinite(v)) return false;
    const store = GS.trackMacros[track];
    const mp = store && store[knob];
    if (!mp || !mp.legs) return false;
    const leg = mp.legs.find(l => l && l.kind === MORPH_KIND);
    if (!morphLegValid(leg)) return false;
    const route = GS.trackRoute[track] | 0;
    if (route !== 0 && route !== 1) return false;            /* a chain or a Move track */
    v = Math.max(0, Math.min(1, v));
    mp.v = v;
    if (!morphReady(track, knob, leg)) { morphPrepare(track, knob, leg, 2); if (!morphReady(track, knob, leg)) return false; }
    morphApply(track, knob, leg, leg.lo + v * (leg.hi - leg.lo), 'play');
    return true;
}

export function morphEntriesForTest() { return entries; }
