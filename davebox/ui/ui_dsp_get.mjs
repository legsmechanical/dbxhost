/* ui_dsp_get.mjs — the batched DSP readback resolver.
 *
 * Its own module for one structural reason: BOTH ui_dsp_bridge.mjs and
 * ui_drummodel.mjs read through it, and ui_dsp_bridge already imports the drum
 * sync functions — so putting the resolver in the bridge would close an import
 * cycle. Nothing here imports either of them, so there is no cycle to reason
 * about.
 *
 * NUM_TRACKS is the only thing it needs from the outside.
 */
import { NUM_TRACKS } from './ui_constants.mjs';

/* ---- batched readback ---------------------------------------------------
 *
 * A param request is a single-slot mailbox served once per SPI frame, so every
 * get_param costs a full audio frame (~2.9 ms measured) however trivial it is.
 * Re-reading a project after a load took ~1,468 of them: a 4.3 s tick with the
 * UI frozen and input dead. The DSP can hand over a whole track's readback in
 * ONE request (`tN_digest`, `<full key>=<value>` per line), so a load prefetches
 * eight of those and every reader below resolves out of the map instead.
 *
 * dspGet is a TRANSPORT swap and nothing more: it is the only thing that
 * changed in the readers, so every rule about what a value means still lives in
 * exactly one place. A key the digest does not carry falls through to the live
 * read — so this stays correct if the DSP's key list and the UI's readers ever
 * drift, at the cost of one frame for that key rather than a wrong value.
 *
 * The prefetch is scoped to a call, never left standing: a stale digest would
 * be a mirror of a project that is no longer loaded. */
let _digest = null;

export function dspGet(key) {
    if (_digest !== null) {
        const v = _digest.get(key);
        if (v !== undefined) return v;
    }
    return host_module_get_param(key);
}

/* Read an INTEGER param, or null if the engine did not answer with one.
 *
 * ⚠⚠ WHY NOT `if (raw !== null && raw !== undefined)`, which is what every
 * caller used to write. That guard tests whether a value ARRIVED, not whether
 * it is a NUMBER — and those are different questions here:
 *
 *   · the host binding returns `undefined` ONLY when the DSP signals an error
 *     (`len < 0`, `src/schwung_host.c:1466`);
 *   · a serve that writes ZERO bytes returns `len == 0`, and the binding hands
 *     JS an EMPTY STRING (`JS_NewString` over an untouched buffer);
 *   · `parseInt("", 10) | 0` is `0`.
 *
 * So a failed read passed the guard and wrote a confident ZERO. On `key` that
 * silently rewrote the project to C. The same held for `scale`,
 * `launch_quant`, `midi_in_channel`, `metro_on`, `metro_vol`, `swing_amt` and
 * `swing_res` — eight values that all defaulted to 0 on a failure nobody saw,
 * because "0" and "we did not get an answer" were indistinguishable.
 *
 * ⭑ Same defect class as `16368a97` on the shadow side.
 *
 * PARSE FIRST, THEN TEST: NaN covers `undefined`, `null` and `""` in one
 * check, so callers cannot reintroduce the gap by forgetting one of the three.
 * A caller that legitimately wants "0 on absence" says so at its own site. */
export function dspGetInt(key) {
    const n = parseInt(dspGet(key), 10);
    return Number.isFinite(n) ? n : null;
}

/* The same idea for a value that is not a number: the raw string, or null when
 * the engine did not answer. `""` is an ABSENT answer here, never a value —
 * no key this serves has the empty string as a legitimate reading. */
export function dspGetStr(key) {
    const v = dspGet(key);
    return (v === null || v === undefined || v === '') ? null : v;
}

/* Fetch every track's digest into one map. Returns the number of keys it
 * carries, for the caller to log/verify — a digest that silently came back
 * empty would look exactly like one that worked, just slow. */
export function prefetchTrackDigests() {
    const map = new Map();
    for (let t = 0; t < NUM_TRACKS; t++) {
        const blob = host_module_get_param('t' + t + '_digest');
        if (!blob) continue;
        for (const line of blob.split('\n')) {
            if (!line) continue;
            const eq = line.indexOf('=');
            if (eq <= 0) continue;
            map.set(line.slice(0, eq), line.slice(eq + 1));
        }
    }
    _digest = map;
    return map.size;
}

export function releaseTrackDigests() {
    _digest = null;
}

