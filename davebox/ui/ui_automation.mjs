/* ui_automation.mjs — the push side of per-parameter automation (Front 3).
 *
 * The DSP evaluates automation and sends what it can reach itself: MIDI CCs
 * and aftertouch. Everything else — a chain slot's parameters, a bus level —
 * it cannot touch, because a module DSP is handed MIDI callbacks and nothing
 * more. Those values are staged in the DSP and pushed from here.
 *
 * ⚠ THE ONE OWNER. Every automation write from JS goes through this module.
 * The alternative — a push at each call site that needs one — is the shape
 * that has produced the same bug three times in this codebase.
 *
 * The budget is the whole design, and it comes from measurement rather than
 * argument. On device (OTLP, 2026-09-02): a parameter round-trip is 2852 us at
 * p50 whatever it carries, a tick is about 10.6 ms, and js.tick p95 is already
 * 37 ms. So nothing here crosses per parameter: see THE TRANSPORT below.
 */

import { S } from './ui_state.mjs';
import { POLL_INTERVAL } from './ui_constants.mjs';
/* The move_fx: prefix has exactly one builder, and a source invariant pins
 * that (tests/test_move_fx_prefix_owner.sh). Build it here and the suite fails
 * — correctly: two builders are two things to keep in step. */
import { moveBusComp } from './ui_engine.mjs';

/* ------------------------------------------------------------------ */
/* THE TRANSPORT — everything crosses in BULK                           */
/*                                                                      */
/* A round-trip is an SPI frame (~2.9 ms) whatever it carries, and the  */
/* tick is ~10.6 ms with js.tick already at 6.9 ms p50. Per-parameter   */
/* round-trips were tried first and cost the device its playhead: three */
/* of them a tick, and the step display stalled while the tick waited.  */
/* So each direction crosses ONCE a tick:                               */
/*   - the drain is one bulk GET (pa_pending + the three warning flags) */
/*   - the module writes (rest, checkpoint, lock, live, release) are    */
/*     one bulk SET to the DSP, in order, live values coalesced         */
/*   - the pushes are one bulk SET per chain slot ("chain:" — the host  */
/*     lands each pair where shadow_set_param would)                    */
/* All of it blocking and ordered; the mailbox never sees two of ours   */
/* in flight, so nothing is stomped. Fire-and-forget stays banned here. */

/* SHADOW_BULK_MAX_ITEMS is 64 = 32 key/value pairs per request. */
const BULK_MAX_PAIRS = 32;
/* Chain-slot push requests per tick. One per slot with pending values;
 * a third slot waits a tick. */
const PUSH_REQUESTS_PER_TICK = 2;

function bulkEncode(items) {
    let s = items.length + '\n';
    for (const it of items) s += it.length + '\n' + it;      /* ASCII: length == bytes */
    return s;
}
function bulkDecode(blob) {
    const out = [];
    if (!blob) return out;
    let nl = blob.indexOf('\n');
    if (nl < 0) return out;
    const n = parseInt(blob.slice(0, nl), 10) || 0;
    let p = nl + 1;
    for (let i = 0; i < n; i++) {
        const e = blob.indexOf('\n', p);
        if (e < 0) break;
        const len = parseInt(blob.slice(p, e), 10) || 0;
        p = e + 1;
        out.push(blob.slice(p, p + len));
        p += len;
    }
    return out;
}
function bulkPairs(pairs) {
    const items = [];
    for (const [k, v] of pairs) { items.push(k); items.push(v); }
    return bulkEncode(items);
}

/* target -> pending 14-bit value. A map, not a queue: if a parameter moves
 * twice before we reach it, only the newer value has any worth. */
let pending = new Map();
/* Writes to the DSP, in order: [key, val]. Flushed as one bulk SET a tick.
 * A live value for a target that already has one queued REPLACES it in place
 * — a knob turned twice in a tick is one write, at the newer value. */
let moduleWrites = [];
let liveSlot = new Map();          /* "<track> <target>" -> index into moduleWrites */
/* The DSP-side flags come back with every drain; polled on their own only
 * when nothing has drained lately. */
let lastFlags = null;
let lastDrainTick = -1000;
/* After a gesture that may or may not have recorded anything, ask the DSP
 * once whether the project has automation, so the drain gate is exact again. */
let presenceStale = false;
/* "<slot>:<comp>" -> { key: {min,max,step,type,options} }, one fetch each. */
let metaCache = new Map();

/* Does this project have ANY automation?
 *
 * ⚠ This gate is the difference between a feature and a tax on every session.
 * Draining costs a get_param — 2852 us measured, a quarter of a tick — and
 * without this it would be paid on EVERY tick of EVERY session, whether or not
 * a single parameter is automated, against a tick already overrunning at p95.
 *
 * It is exact rather than a guess: automation can only come into being two
 * ways, and both are visible here. A project brings it in when it loads (the
 * DSP is asked once, on the sync), and JS creates it (every write goes through
 * this module). Nothing else can produce an entry. */
let anyAutomation = false;

/* Ticks left to keep draining after the transport stops. The DSP stages the
 * RESTING values on the stop edge, and S.playing is a mirror that pollDSP
 * clears — before this runs, on the same tick — so a drain gated on the mirror
 * alone misses the very thing the stop produced. See automationTick. */
let stopGrace = 0;
const STOP_GRACE_TICKS = 3;

export function automationResetCaches() {
    pending = new Map();
    metaCache = new Map();
    anyAutomation = false;
    stopGrace = 0;
    gestures = new Map();
    moduleWrites = [];
    liveSlot = new Map();
    lastFlags = null;
    lastDrainTick = -1000;
    presenceStale = false;
}

/* Value metadata is per (slot, component) and lives as long as the module in
 * that slot does. Swapping the module — or loading a project, which can swap
 * every slot — must throw it away, or the next push maps into the OLD
 * module's range. No slot given = all of it. */
export function automationInvalidateMeta(slot) {
    if (slot === undefined || slot === null) { metaCache = new Map(); return; }
    const pfx = String(slot) + ':';
    for (const k of Array.from(metaCache.keys())) if (k.startsWith(pfx)) metaCache.delete(k);
}

/* Called once when a project's contents arrive from the DSP — NOT per tick.
 * One round-trip per project load, against one per tick if we guessed. */
export function automationRefreshPresence() {
    const list = host_module_get_param('pa_list');
    anyAutomation = !!(list && list.length);
}

/* Every automation write goes through JS, so JS always knows when the first
 * one appears; P3's record and lock paths call this. */
export function automationNoteWrite() { anyAutomation = true; }

export function automationPresentForTest() { return anyAutomation; }

/* chain_params for one component, fetched once. Costs a round-trip the first
 * time a parameter on that component is automated, then nothing. */
function componentMeta(slot, comp) {
    const id = slot + ':' + comp;
    let m = metaCache.get(id);
    if (m) return m;
    m = {};
    try {
        const raw = shadow_get_param(slot, comp + ':chain_params');
        for (const p of (JSON.parse(raw || '[]') || [])) {
            if (p && p.key) m[p.key] = p;
        }
    } catch (e) { /* no metadata: fall back to a plain 0..1 float below */ }
    metaCache.set(id, m);
    return m;
}

/* 14-bit normalized -> the string the parameter actually takes.
 *
 * The DSP stores automation normalized because only JS has the metadata that
 * says what a parameter's units are; this is where that knowledge is applied. */
function wireValue(slot, comp, key, norm) {
    const t = Math.max(0, Math.min(16383, norm)) / 16383;
    const p = componentMeta(slot, comp)[key];
    if (!p) return String(Math.round(t * 100) / 100);      /* assume 0..1 */

    if (p.type === 'enum' && Array.isArray(p.options) && p.options.length) {
        return String(Math.round(t * (p.options.length - 1)));
    }
    const min = (typeof p.min === 'number') ? p.min : 0;
    const max = (typeof p.max === 'number') ? p.max : 1;
    const v = min + (max - min) * t;
    if (p.type === 'int') return String(Math.round(v));
    /* Quantize to the parameter's own step, so a value the UI can never show
     * is never written either. */
    const step = (typeof p.step === 'number' && p.step > 0) ? p.step : 0.01;
    const q = Math.round((v - min) / step) * step + min;
    return String(Math.round(q * 1e6) / 1e6);
}

/* "<slot>:<comp>:<key>" -> { slot, key, val } in the parameter's own units.
 * Bus levels ("bus:<n>:<field>") are the other shape; anything else is null
 * rather than guessed at. */
function pushPair(target, norm) {
    let m = target.split(':');
    if (m.length >= 3 && m[0] !== 'bus') {
        const slot = parseInt(m[0], 10);
        const comp = m[1];
        const key  = m.slice(2).join(':');
        if (isNaN(slot)) return null;
        return { slot, key: comp + ':' + key, val: wireValue(slot, comp, key, norm) };
    }
    if (m.length >= 3 && m[0] === 'bus') {
        const bus = parseInt(m[1], 10);
        const field = m.slice(2).join(':');
        if (isNaN(bus)) return null;
        const t = Math.max(0, Math.min(16383, norm)) / 16383;
        return { slot: 0, key: moveBusComp(bus) + ':' + field, val: String(Math.round(t * 1e4) / 1e4) };
    }
    return null;
}

/* The drain: ONE bulk GET carrying the staged values and the three flags the
 * DSP can only report. */
const DRAIN_KEYS = ['pa_pending', 'pa_store_full', 'pa_ring_dropped', 'pa_owner_conflict'];
const FLAG_KEYS  = DRAIN_KEYS.slice(1);

function takeFlags(vals, offset) {
    const f = { full: vals[offset] === '1', dropped: vals[offset + 1] === '1',
                owner: parseInt(vals[offset + 2] || '0', 10) || 0 };
    /* Sticky until reported: a flag seen on one drain and reported on a later
     * poll must not be lost to a drain in between. */
    if (!lastFlags) lastFlags = f;
    else { lastFlags.full = lastFlags.full || f.full; lastFlags.dropped = lastFlags.dropped || f.dropped;
           if (f.owner) lastFlags.owner = f.owner; }
}

function drain() {
    const vals = bulkDecode(host_module_get_params(bulkEncode(DRAIN_KEYS)));
    lastDrainTick = S.tickCount;
    if (vals.length < 4) return;
    takeFlags(vals, 1);
    const raw = vals[0];
    if (!raw || !raw.length) return;
    for (const line of raw.split('\n')) {
        if (!line.length) continue;
        const sp = line.lastIndexOf(' ');
        if (sp <= 0) continue;
        const target = line.slice(0, sp);
        const val = parseInt(line.slice(sp + 1), 10);
        if (isNaN(val)) continue;
        pending.set(target, val);       /* newest wins */
    }
}

/* The module writes: one bulk SET, in order. A request the host refused
 * (timed out) is kept whole at the front for the next tick. */
function flushModuleWrites() {
    if (!moduleWrites.length) return;
    const batch = moduleWrites.slice(0, BULK_MAX_PAIRS);
    const ok = host_module_set_params(bulkPairs(batch));
    if (!ok) return;                         /* try again next tick, same order */
    moduleWrites = moduleWrites.slice(batch.length);
    liveSlot = new Map();                    /* indices are stale either way */
    for (let i = 0; i < moduleWrites.length; i++)
        if (moduleWrites[i][2]) liveSlot.set(moduleWrites[i][2], i);
}

/* The pushes: pending values grouped by slot, one bulk SET per slot, at most
 * PUSH_REQUESTS_PER_TICK slots a tick. What does not go stays pending with
 * only its newest value. */
function pushPending() {
    if (!pending.size) return;
    const bySlot = new Map();               /* slot -> [[key,val,target,norm]...] */
    for (const [target, norm] of pending) {
        if (gestures.has(target)) { pending.delete(target); continue; }   /* touch wins */
        const p = pushPair(target, norm);
        if (!p) { pending.delete(target); continue; }
        let arr = bySlot.get(p.slot);
        if (!arr) { arr = []; bySlot.set(p.slot, arr); }
        if (arr.length >= BULK_MAX_PAIRS) continue;      /* this slot's next request, next tick */
        arr.push([p.key, p.val, target, norm]);
    }
    let requests = 0;
    for (const [slot, arr] of bySlot) {
        if (requests >= PUSH_REQUESTS_PER_TICK) break;
        requests++;
        for (const e of arr) pending.delete(e[2]);
        const ok = shadow_set_params(slot, 'chain:', bulkPairs(arr.map(e => [e[0], e[1]])));
        /* Refused (timed out): the DSP has recorded these as sent and will not
         * stage them again, so they must stay with us. Nothing newer can have
         * arrived since the delete — new values only land in the drain. */
        if (!ok) for (const e of arr) pending.set(e[2], e[3]);
    }
}

/* Called once per tick, in this order: gestures age; the module hears what
 * the hand did (one write); the DSP's staged values are drained (one read);
 * the chain slots get them (one write per slot). */
export function automationTick() {
    gesturesTick();
    flushModuleWrites();
    if (presenceStale && !gestures.size && !moduleWrites.length) {
        presenceStale = false;
        automationRefreshPresence();
    }
    /* Nothing to drain unless this project has automation AND the transport is
     * running: staging only happens on a playing clip. Both are already-known
     * flags, so the common case costs nothing at all. */
    if (!anyAutomation) { if (pending.size) pending.clear(); return; }
    /* The stop EDGE stages too — the resting values — and S.playing has
     * already flipped by the time this sees it. Keep draining for a few ticks
     * past the edge so what the stop produced is pushed, not left in the ring
     * for the next Play to find. */
    if (S.playing) stopGrace = STOP_GRACE_TICKS;
    else if (stopGrace > 0) stopGrace--;
    else if (!pending.size) return;

    drain();
    pushPending();
}

/* Diagnostics the DSP can only report, surfaced where a person can see them.
 * All clear on read, so each new occurrence is reported once. Returns popup
 * lines for the one a person must act on, or null — the caller owns the
 * popup, so this module stays free of the screen. */
export function automationPollWarnings() {
    /* The drain already carried the flags this poll window; otherwise one
     * bulk GET for the three of them — not three round-trips. And none at all
     * for a project that has no automation and no hand on a knob: the flags
     * can only be raised by a write or a load, both of which are visible here. */
    const active = anyAutomation || gestures.size || moduleWrites.length || presenceStale;
    if (active && S.tickCount - lastDrainTick >= POLL_INTERVAL) {
        const vals = bulkDecode(host_module_get_params(bulkEncode(FLAG_KEYS)));
        if (vals.length >= 3) takeFlags(vals, 0);
    }
    const f = lastFlags;
    lastFlags = null;
    if (!f) return null;
    if (f.full)    console.log('[dbx] automation store full — a write was refused');
    if (f.dropped) console.log('[dbx] automation queue overflowed — a staged value was dropped');
    if (f.owner > 0) return ['Already automated', 'by track ' + f.owner];
    return null;
}

/* ------------------------------------------------------------------ */
/* THE WRITE SIDE — record, p-lock, override                            */
/*                                                                      */
/* Fed by the chain editor's two host hooks (io.onParamEdit and         */
/* io.onParamTouch, bound in ui_sound.mjs). The grammar is the spec's:  */
/*                                                                      */
/*   a step held + a turn      = a p-lock on that step (playing or not) */
/*   playing, Record on, turn  = recorded along the playhead until the  */
/*                               hand comes off                         */
/*   playing, Record off, turn = an override; automation resumes on     */
/*                               release                                */
/*   stopped, no step held     = just a knob turn                       */
/*                                                                      */
/* The DSP holds the authority on "recording": JS sends the live value  */
/* (tN_pa_live) and the DSP's own recording/playing flags decide whether */
/* it is written along the playhead or merely overrides. JS decides the */
/* rest: the resting value (from the edit BEFORE the first one), the    */
/* one undo checkpoint per gesture, and the lock writes.                */
/*                                                                      */
/* ⚠ Everything here runs from the MIDI handler, where get_param        */
/* silently returns null and a set_param cannot be made — so writes are */
/* buffered and go out as ONE bulk SET on the next tick (see the        */
/* transport note at the top). NOT the one-per-tick deferred queue step */
/* record uses: a recording is dozens of edits a second, and that queue */
/* delivered the release seconds after the hand let go.                 */

/* Idle ticks after which a gesture that never got a touch-down is ended
 * on its own. A capacitive sensor can miss a touch; without this the target
 * would stay "live" and its automation would never resume. */
const SYNTHETIC_GESTURE_IDLE_TICKS = 25;    /* ~270 ms, the controller's own gap */

/* target -> gesture state */
let gestures = new Map();

/* Ordered module write. `coalesce` names a slot a later write may replace in
 * place (a live value for one target); everything else appends. */
function queueSet(key, val, coalesce) {
    if (coalesce) {
        const at = liveSlot.get(coalesce);
        if (at !== undefined && moduleWrites[at] && moduleWrites[at][0] === key) {
            moduleWrites[at][1] = val;
            return;
        }
        liveSlot.set(coalesce, moduleWrites.length);
    }
    moduleWrites.push([key, val, coalesce || null]);
}

/* The parameter's wire string -> 14-bit normalized. The inverse of wireValue. */
function normValue(slot, comp, key, wire) {
    const p = componentMeta(slot, comp)[key];
    let v = parseFloat(wire);
    if (isNaN(v)) v = 0;
    let t;
    if (p && p.type === 'enum' && Array.isArray(p.options) && p.options.length > 1) {
        t = v / (p.options.length - 1);
    } else if (p) {
        const min = (typeof p.min === 'number') ? p.min : 0;
        const max = (typeof p.max === 'number') ? p.max : 1;
        t = (max > min) ? (v - min) / (max - min) : 0;
    } else {
        t = v;                                     /* assume 0..1 */
    }
    return Math.round(Math.max(0, Math.min(1, t)) * 16383);
}

function splitFullKey(fullKey) {
    const i = fullKey.indexOf(':');
    return i < 0 ? [fullKey, ''] : [fullKey.slice(0, i), fullKey.slice(i + 1)];
}

function gestureFor(target, track, clip, synthetic) {
    let g = gestures.get(target);
    if (!g) {
        g = { track, clip, rest: false, ckpt: false, live: false, lock: false, synthetic, idle: 0 };
        gestures.set(target, g);
    }
    return g;
}

/* Once per gesture: the resting value is what the parameter held BEFORE the
 * first edit — that is what a stop or a clear puts back. The DSP keeps the
 * first one it hears, so a second send is harmless but a round-trip. */
function ensureRest(g, target, prevNorm) {
    if (g.rest) return;
    g.rest = true;
    queueSet('t' + g.track + '_pa_rest', g.clip + ' ' + target + ' ' + prevNorm);
}

/* Once per gesture: the undo unit, same shape as step record's session. */
function ensureCheckpoint(g) {
    if (g.ckpt) return;
    g.ckpt = true;
    queueSet('t' + g.track + '_c' + g.clip + '_undo_checkpoint', '1');
}

export function automationParamTouch(track, clip, slot, fullKey, down) {
    const target = slot + ':' + fullKey;
    if (down) { gestureFor(target, track, clip, false); return; }
    const g = gestures.get(target);
    if (!g) return;
    if (g.lock && S.heldStep >= 0) return;      /* the step holds it, not the touch */
    endGesture(target, g);
}

function endGesture(target, g) {
    if (g.live) { queueSet('t' + g.track + '_pa_live_end', target); presenceStale = true; }
    gestures.delete(target);
}

export function automationParamEdit(track, clip, slot, fullKey, wire, prevWire) {
    const target = slot + ':' + fullKey;
    const [comp, key] = splitFullKey(fullKey);
    const g = gestureFor(target, track, clip, true);
    g.idle = 0;
    const norm = normValue(slot, comp, key, wire);

    /* A held step wins over everything: the turn writes that step, playing or
     * not. Stepped hold means the lock lasts until the next point. */
    if (S.heldStep >= 0) {
        const tps = (S.clipTPS[track] && S.clipTPS[track][clip]) || 24;
        const from = S.heldStep * tps, to = from + tps - 1;
        ensureRest(g, target, normValue(slot, comp, key, prevWire));
        ensureCheckpoint(g);
        /* Playback keeps its hands off the target while the lock is being
         * dialled (the DSP stops staging it; JS stops pushing it), and the
         * gesture lives as long as the STEP is held — see gesturesTick. A
         * knob-touch may never reach the editor while a pad is down, so the
         * step is the hand here, not the touch sensor. */
        if (!g.live) { g.live = true; queueSet('t' + track + '_pa_hold', target); }
        g.lock = true;
        /* Turning a knob on a pressed step makes it a HOLD, however quickly the
         * finger came back up — otherwise a fast press-turn-release writes the
         * lock and then the release tap-toggles the note it was written on. The
         * tick's hold-threshold check consumes this and does the rest (closes
         * the tap window, auto-assigns an empty step's note). */
        S.stepHoldPromote = true;
        queueSet('t' + track + '_pa_set2', clip + ' ' + target + ' ' + from + ' ' + to + ' ' + norm);
        automationNoteWrite();
        return;
    }

    if (!S.playing) return;                       /* a plain knob turn */

    /* Playing: the DSP decides record vs override from its own flags. What JS
     * must do either way is name the resting value, and — when this is going
     * to be recorded — book the one undo for the gesture. */
    ensureRest(g, target, normValue(slot, comp, key, prevWire));
    if (S.recordArmed) ensureCheckpoint(g);
    /* The DSP may be recording whatever our Record mirror says, so the drain
     * gate opens now and is corrected by one presence read when the gesture
     * ends (endGesture) — a wrong "no automation" here would leave a fresh
     * recording silent until the next project sync. */
    automationNoteWrite();
    g.live = true;
    queueSet('t' + track + '_pa_live', target + ' ' + norm, track + ' ' + target);
}

/* Per tick, from automationTick: end gestures that never had a touch and
 * have gone quiet. */
function gesturesTick() {
    if (!gestures.size) return;
    for (const [target, g] of gestures) {
        /* A lock gesture is held by the STEP: alive while it is down, over the
         * tick it comes up — whatever the touch sensor said. */
        if (g.lock) {
            if (S.heldStep >= 0) { g.idle = 0; continue; }
            endGesture(target, g);
            continue;
        }
        if (!g.synthetic) continue;
        if (++g.idle < SYNTHETIC_GESTURE_IDLE_TICKS) continue;
        endGesture(target, g);
    }
}

export function automationGestureCountForTest() { return gestures.size; }

/* For tests. */
export function automationPendingSizeForTest() { return pending.size; }
export function automationModuleWriteCountForTest() { return moduleWrites.length; }
