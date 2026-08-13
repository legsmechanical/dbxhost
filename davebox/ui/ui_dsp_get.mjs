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

