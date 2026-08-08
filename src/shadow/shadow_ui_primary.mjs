/*
 * Shadow UI — primary-surface claims engine (pure core).
 *
 * The cure for the ownership-desync bug class: hardware-surface ownership
 * (input routing, LED ownership, sysex suppression, the co-run split) is
 * DERIVED from a declarative surface stack and re-applied by diffing, never
 * asserted imperatively at enter/exit sites. A surface declares what it
 * claims once; every transition recomputes the whole effective claim set, so
 * there is no handoff to forget and no re-assertion to miss.
 *
 * This file is deliberately dependency-free and side-effect-free so the
 * derivation and diffing logic can be unit-tested off-device with node
 * (tests/host/test_primary_claims.sh). The stateful wrapper that owns the
 * stack and calls the host bindings lives in shadow_ui.js, behind the
 * primary.json toggle.
 *
 * Model:
 *   primaryClaims — the claim set the registered primary surface declared.
 *   stack         — open services, bottom→top; each entry carries a PARTIAL
 *                   claim set (only the keys it overrides).
 *   effective     — NEUTRAL ← primary ← stack[0] ← … ← stack[top].
 *
 * The plan's rule "claims = stack.top().claims ?? PRIMARY_CLAIMS" holds:
 * with an empty stack the primary's claims apply verbatim; a service's
 * partial set overrides exactly the keys it names.
 */

/* Every claim key, with its neutral (nothing-registered) value. Flat scalars
 * only — merging is Object.assign, diffing is key-by-key comparison. */
export const NEUTRAL_CLAIMS = Object.freeze({
    /* MIDI routing mode: 0 = pass to Move, 1 = UI events only, 2 = module
     * owns all events. (Mirrors shadow_set_overtake_mode.) */
    overtake_mode: 0,
    /* Co-run session: 0 = none, 1 = chain-edit, 2 = move-native; corun_id is
     * the slot / track argument. A claim set with corun_target 0 means "no
     * co-run session open". */
    corun_target: 0,
    corun_id: 0,
    /* Input groups the surface KEEPS during co-run (CORUN_GRP_* bits). */
    keep_mask: 0,
    /* LED-keep override; 0 = follow keep_mask. */
    led_keep_mask: 0,
    /* Co-run overlay: OLED to shadow_ui over the co-run target, with its own
     * keep mask. 0 = no overlay. (Mirrors shadow_corun_overlay.) */
    overlay: 0,
    overlay_keep_mask: 0,
    /* LED strip-loop bypass: Move's own LED writes pass through. */
    skip_led_clear: 0,
    /* Suppress Move's cable-0 sysex LED writes (clip/grid repaints). */
    suppress_sysex: 0,
    /* Runtime input claims. */
    vol_block: 0,
    edit_cc_block: 0,
    pad_block: 0,
    canvas_input: 0,
    /* CSV of CC numbers the surface yields to Move firmware. */
    passthrough: "",
});

export const CLAIM_KEYS = Object.freeze(Object.keys(NEUTRAL_CLAIMS));

/* Effective claims for a primary claim set + service stack. Pure.
 * Unknown keys in any layer are dropped (never applied, never diffed). */
export function deriveClaims(primaryClaims, stack) {
    const out = { ...NEUTRAL_CLAIMS };
    const layers = [primaryClaims].concat(stack ? stack.map(s => s && s.claims) : []);
    for (const layer of layers) {
        if (!layer) continue;
        for (const k of CLAIM_KEYS) {
            if (Object.prototype.hasOwnProperty.call(layer, k)) out[k] = layer[k];
        }
    }
    return out;
}

/* Ordered operations to move the hardware from `prev` claims to `next`.
 * Pure. Returns [] when nothing changed (idempotence is what makes calling
 * this every tick safe and cheap).
 *
 * Op vocabulary maps 1:1 onto existing host bindings, which already contain
 * the SHM write-ordering that matters (corun_begin writes keep before
 * target; corun_end clears target first):
 *   {op:'corun_begin', target, id, keep_mask}
 *   {op:'corun_end'}
 *   {op:'corun_overlay', active, keep_mask}
 *   {op:'led_keep', mask}
 *   {op:'overtake_mode', mode}
 *   {op:'skip_led_clear', on} {op:'suppress_sysex', on}
 *   {op:'vol_block', on} {op:'edit_cc_block', on} {op:'pad_block', on}
 *   {op:'canvas_input', on}
 *   {op:'passthrough', csv}
 *
 * Ordering rules encoded here:
 *  - overtake_mode rises BEFORE anything else (a surface must own events
 *    before masks matter) and falls LAST (release events after teardown).
 *  - A co-run session change is begin/end, not a mutation: changing target
 *    or id emits corun_end + corun_begin. A keep_mask change while the SAME
 *    session stays open rides the overlay verb (that is what it exists for)
 *    when an overlay is up, else re-begins the session with the new mask.
 *  - Overlay close is emitted before session end (nested → unwound in order).
 */
export function computeOps(prev, next) {
    const ops = [];
    const p = { ...NEUTRAL_CLAIMS, ...prev };
    const n = { ...NEUTRAL_CLAIMS, ...next };

    if (n.overtake_mode > p.overtake_mode) {
        ops.push({ op: "overtake_mode", mode: n.overtake_mode });
    }

    const sessionChanged = p.corun_target !== n.corun_target || p.corun_id !== n.corun_id;
    const maskChanged = p.keep_mask !== n.keep_mask;
    const overlayChanged = p.overlay !== n.overlay || p.overlay_keep_mask !== n.overlay_keep_mask;

    /* Overlay down first when it is closing (or the session under it is going). */
    if (p.overlay && (!n.overlay || sessionChanged)) {
        ops.push({ op: "corun_overlay", active: 0, keep_mask: n.keep_mask });
    }

    if (sessionChanged) {
        if (p.corun_target !== 0) ops.push({ op: "corun_end" });
        if (n.corun_target !== 0) {
            ops.push({ op: "corun_begin", target: n.corun_target, id: n.corun_id, keep_mask: n.keep_mask });
        }
    } else if (n.corun_target !== 0 && maskChanged && !n.overlay && !p.overlay) {
        /* Same session, new input split: re-begin carries the new mask. */
        ops.push({ op: "corun_begin", target: n.corun_target, id: n.corun_id, keep_mask: n.keep_mask });
    }

    /* Overlay up (fresh, or mask change while up). */
    if (n.overlay && (overlayChanged || sessionChanged || (!p.overlay))) {
        ops.push({ op: "corun_overlay", active: 1, keep_mask: n.overlay_keep_mask });
    } else if (n.overlay && p.overlay && p.overlay_keep_mask !== n.overlay_keep_mask) {
        ops.push({ op: "corun_overlay", active: 1, keep_mask: n.overlay_keep_mask });
    }

    /* LED keep follows any session/mask activity or its own change. */
    if (p.led_keep_mask !== n.led_keep_mask ||
        ((sessionChanged || maskChanged) && n.corun_target !== 0 && n.led_keep_mask !== 0)) {
        ops.push({ op: "led_keep", mask: n.led_keep_mask });
    }

    for (const [key, op] of [
        ["skip_led_clear", "skip_led_clear"],
        ["suppress_sysex", "suppress_sysex"],
        ["vol_block", "vol_block"],
        ["edit_cc_block", "edit_cc_block"],
        ["pad_block", "pad_block"],
        ["canvas_input", "canvas_input"],
    ]) {
        if (p[key] !== n[key]) ops.push({ op, on: n[key] ? 1 : 0 });
    }

    if (p.passthrough !== n.passthrough) {
        ops.push({ op: "passthrough", csv: n.passthrough });
    }

    if (n.overtake_mode < p.overtake_mode) {
        ops.push({ op: "overtake_mode", mode: n.overtake_mode });
    }

    return ops;
}

/* Apply an op list through an effector table. The effectors close over the
 * real host bindings in shadow_ui.js; tests pass a recorder. Unknown ops
 * throw — an op this file emits that the wrapper cannot apply is a bug, and
 * a silent skip would be an ownership desync by another name. */
export function applyOps(ops, fx) {
    for (const o of ops) {
        const f = fx[o.op];
        if (typeof f !== "function") throw new Error("no effector for op: " + o.op);
        f(o);
    }
}
