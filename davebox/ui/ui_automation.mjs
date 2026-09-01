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
 * p50, a tick is about 10.6 ms, and js.tick p95 is already 37 ms. So a push is
 * a quarter of a tick, and the drain read is another. Two pushes per tick is
 * the ceiling that leaves the tick anything to work with.
 */

import { S } from './ui_state.mjs';
/* The move_fx: prefix has exactly one builder, and a source invariant pins
 * that (tests/test_move_fx_prefix_owner.sh). Build it here and the suite fails
 * — correctly: two builders are two things to keep in step. */
import { moveBusComp } from './ui_engine.mjs';

/* Pushes per tick. See the note above: this is 2, not 8, because each one
 * costs ~2.9 ms of a ~10.6 ms tick. */
const PUSH_PER_TICK = 2;

/* Blocking write timeout. Fire-and-forget cannot be used here: in overtake the
 * mailbox holds ONE request, and a write left unconsumed for 8 ms is stomped by
 * the next — recorded as sent, never re-sent, because the DSP diffs against
 * what it staged. A stomped automation value is a parameter stuck at the wrong
 * setting until it happens to change again. */
const WRITE_TIMEOUT_MS = 40;

/* target -> pending wire value. A map, not a queue: if a parameter moves twice
 * before we reach it, only the newer value has any worth. */
let pending = new Map();
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

/* "<slot>:<comp>:<key>" -> a write. Bus levels ("bus:<n>:<field>") are the
 * other shape; anything else is ignored rather than guessed at.
 *
 * Returns 'sent', 'failed' (the blocking write timed out — the caller MUST
 * keep the value, because the DSP has already recorded it as sent and will
 * never stage it again), or 'skip' (not a shape we write).
 *
 * No capability gate on shadow_set_param_timeout: one host, one module,
 * shipped together — the binding exists. A gate here would also have hidden a
 * fallback onto the fire-and-forget path, which is exactly the write that
 * cannot be used for automation. */
function pushTarget(target, norm) {
    let m = target.split(':');
    if (m.length >= 3 && m[0] !== 'bus') {
        const slot = parseInt(m[0], 10);
        const comp = m[1];
        const key  = m.slice(2).join(':');
        if (isNaN(slot)) return 'skip';
        const val = wireValue(slot, comp, key, norm);
        /* Blocking: see WRITE_TIMEOUT_MS. */
        return shadow_set_param_timeout(slot, comp + ':' + key, val, WRITE_TIMEOUT_MS)
            ? 'sent' : 'failed';
    }
    if (m.length >= 3 && m[0] === 'bus') {
        const bus = parseInt(m[1], 10);
        const field = m.slice(2).join(':');
        if (isNaN(bus)) return 'skip';
        const t = Math.max(0, Math.min(16383, norm)) / 16383;
        const val = String(Math.round(t * 1e4) / 1e4);
        return shadow_set_param_timeout(0, moveBusComp(bus) + ':' + field, val, WRITE_TIMEOUT_MS)
            ? 'sent' : 'failed';
    }
    return 'skip';
}

/* Called once per tick. One read to drain whatever the DSP staged, then at
 * most PUSH_PER_TICK writes. What is not pushed this tick stays pending and
 * goes next tick — with only its newest value, since a superseded one is not
 * worth a round-trip. */
export function automationTick() {
    gesturesTick();
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

    const raw = host_module_get_param('pa_pending');
    if (raw && raw.length) {
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

    if (!pending.size) return;
    let n = 0;
    const failed = [];
    for (const [target, val] of pending) {
        if (n >= PUSH_PER_TICK) break;
        pending.delete(target);
        /* Touch wins: a target under a hand is not pushed. The DSP stops
         * staging it too; this catches what was staged just before the touch.
         * On release the DSP re-asserts, so nothing is lost. */
        if (gestures.has(target)) continue;
        const r = pushTarget(target, val);
        if (r === 'skip') continue;
        n++;                                   /* a timed-out write cost its round-trip too */
        if (r === 'failed') failed.push([target, val]);
    }
    /* Timed out: keep them, for the NEXT tick. Re-inserted after the loop, not
     * inside it — a Map hands an entry added mid-iteration straight back to
     * the iterator, and a write that just spent 40 ms timing out is not
     * improved by being tried again in the same millisecond. Nothing newer for
     * these targets can have arrived since the delete: new values only land in
     * the drain above. */
    for (const [target, val] of failed) pending.set(target, val);
}

/* Diagnostics the DSP can only report, surfaced where a person can see them.
 * All clear on read, so each new occurrence is reported once. Returns popup
 * lines for the one a person must act on, or null — the caller owns the
 * popup, so this module stays free of the screen. */
export function automationPollWarnings() {
    if (host_module_get_param('pa_store_full') === '1')
        console.log('[dbx] automation store full — a write was refused');
    if (host_module_get_param('pa_ring_dropped') === '1')
        console.log('[dbx] automation queue overflowed — a staged value was dropped');
    const owner = parseInt(host_module_get_param('pa_owner_conflict') || '0', 10);
    if (owner > 0) return ['Already automated', 'by track ' + owner];
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
/* silently returns null and a set_param must be queued — every write   */
/* goes through the same deferred queue step record uses.               */

/* Idle ticks after which a gesture that never got a touch-down is ended
 * on its own. A capacitive sensor can miss a touch; without this the target
 * would stay "live" and its automation would never resume. */
const SYNTHETIC_GESTURE_IDLE_TICKS = 25;    /* ~270 ms, the controller's own gap */

/* target -> gesture state */
let gestures = new Map();

function queueSet(key, val) { S.pendingDefaultSetParams.push({ key, val }); }

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
        g = { track, clip, rest: false, ckpt: false, live: false, synthetic, idle: 0 };
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
    if (g.live) queueSet('t' + g.track + '_pa_live_end', target);
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
        queueSet('t' + track + '_pa_set2', clip + ' ' + target + ' ' + from + ' ' + to + ' ' + norm);
        automationNoteWrite();
        return;
    }

    if (!S.playing) return;                       /* a plain knob turn */

    /* Playing: the DSP decides record vs override from its own flags. What JS
     * must do either way is name the resting value, and — when this is going
     * to be recorded — book the one undo for the gesture. */
    ensureRest(g, target, normValue(slot, comp, key, prevWire));
    if (S.recordArmed) { ensureCheckpoint(g); automationNoteWrite(); }
    g.live = true;
    queueSet('t' + track + '_pa_live', target + ' ' + norm);
}

/* Per tick, from automationTick: end gestures that never had a touch and
 * have gone quiet. */
function gesturesTick() {
    if (!gestures.size) return;
    for (const [target, g] of gestures) {
        if (!g.synthetic) continue;
        if (++g.idle < SYNTHETIC_GESTURE_IDLE_TICKS) continue;
        if (g.live) queueSet('t' + g.track + '_pa_live_end', target);
        gestures.delete(target);
    }
}

export function automationGestureCountForTest() { return gestures.size; }

/* For tests. */
export function automationPendingSizeForTest() { return pending.size; }
