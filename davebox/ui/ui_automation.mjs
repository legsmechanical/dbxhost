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

export function automationResetCaches() {
    pending = new Map();
    metaCache = new Map();
}

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
 * other shape; anything else is ignored rather than guessed at. */
function pushTarget(target, norm) {
    let m = target.split(':');
    if (m.length >= 3 && m[0] !== 'bus') {
        const slot = parseInt(m[0], 10);
        const comp = m[1];
        const key  = m.slice(2).join(':');
        if (isNaN(slot)) return false;
        const val = wireValue(slot, comp, key, norm);
        /* Blocking: see WRITE_TIMEOUT_MS. */
        if (typeof shadow_set_param_timeout === 'function')
            shadow_set_param_timeout(slot, comp + ':' + key, val, WRITE_TIMEOUT_MS);
        else
            shadow_set_param(slot, comp + ':' + key, val);
        return true;
    }
    if (m.length >= 3 && m[0] === 'bus') {
        const bus = parseInt(m[1], 10);
        const field = m.slice(2).join(':');
        if (isNaN(bus)) return false;
        const t = Math.max(0, Math.min(16383, norm)) / 16383;
        const val = String(Math.round(t * 1e4) / 1e4);
        if (typeof shadow_set_param_timeout === 'function')
            shadow_set_param_timeout(0, moveBusComp(bus) + ':' + field, val, WRITE_TIMEOUT_MS);
        return true;
    }
    return false;
}

/* Called once per tick. One read to drain whatever the DSP staged, then at
 * most PUSH_PER_TICK writes. What is not pushed this tick stays pending and
 * goes next tick — with only its newest value, since a superseded one is not
 * worth a round-trip. */
export function automationTick() {
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
    for (const [target, val] of pending) {
        if (n >= PUSH_PER_TICK) break;
        pending.delete(target);
        if (pushTarget(target, val)) n++;
    }
}

/* Diagnostics the DSP can only report, surfaced where a person can see them.
 * Both clear on read, so each new occurrence is reported once. */
export function automationPollWarnings() {
    if (host_module_get_param('pa_store_full') === '1')
        console.log('[dbx] automation store full — a write was refused');
    if (host_module_get_param('pa_ring_dropped') === '1')
        console.log('[dbx] automation queue overflowed — a staged value was dropped');
}

/* For tests. */
export function automationPendingSizeForTest() { return pending.size; }
