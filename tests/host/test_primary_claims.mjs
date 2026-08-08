/* Unit tests for the primary-surface claims engine (pure core).
 * Run by test_primary_claims.sh with node. Exercises deriveClaims/computeOps/
 * applyOps exhaustively off-device, per the P4a verification plan: the claim
 * derivation is a pure function and every ownership transition the device
 * will ever perform must fall out of these rules. */
import {
    NEUTRAL_CLAIMS, CLAIM_KEYS, deriveClaims, computeOps, applyOps,
} from "../../src/shadow/shadow_ui_primary.mjs";

let failures = 0;
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) {
        failures++;
        console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
    }
}
function ok(cond, label) {
    if (!cond) { failures++; console.error(`FAIL ${label}`); }
}

/* Realistic claim sets (mirroring davebox's masks; exact values irrelevant
 * to the engine — they are opaque ints here). */
const KEEP = 0x84_0e;        /* pads|steps|transport|menu|back-bit */
const KEEP_CHAIN = KEEP | 0x1000;
const LED_CHAIN = KEEP_CHAIN | 0x20;
const PICKER = KEEP | 0x9d0;

const PRIMARY = {
    overtake_mode: 2,
    suppress_sysex: 1,
    passthrough: "60,119",
};

/* ---- deriveClaims ---- */

/* No registration at all → neutral. */
eq(deriveClaims(null, []), NEUTRAL_CLAIMS, "derive: null primary is neutral");

/* Primary alone: declared keys override, others neutral. */
{
    const d = deriveClaims(PRIMARY, []);
    eq(d.overtake_mode, 2, "derive: primary overtake_mode");
    eq(d.suppress_sysex, 1, "derive: primary suppress_sysex");
    eq(d.passthrough, "60,119", "derive: primary passthrough");
    eq(d.corun_target, 0, "derive: undeclared keys stay neutral");
    eq(d.vol_block, 0, "derive: undeclared vol_block neutral");
}

/* One service: partial override, primary shows through elsewhere. */
{
    const chainEd = { claims: { corun_target: 1, corun_id: 2, keep_mask: KEEP_CHAIN, led_keep_mask: LED_CHAIN, suppress_sysex: 0 } };
    const d = deriveClaims(PRIMARY, [chainEd]);
    eq(d.corun_target, 1, "derive: service corun_target");
    eq(d.corun_id, 2, "derive: service corun_id");
    eq(d.suppress_sysex, 0, "derive: service overrides suppress_sysex");
    eq(d.overtake_mode, 2, "derive: primary shows through under service");
    eq(d.passthrough, "60,119", "derive: primary passthrough shows through");
}

/* Nested services: top wins per key; middle wins over primary. */
{
    const moveNative = { claims: { corun_target: 2, corun_id: 5, keep_mask: KEEP, skip_led_clear: 1, suppress_sysex: 0 } };
    const fxPicker = { claims: { overlay: 1, overlay_keep_mask: PICKER } };
    const d = deriveClaims(PRIMARY, [moveNative, fxPicker]);
    eq(d.corun_target, 2, "derive: nested keeps session from lower layer");
    eq(d.overlay, 1, "derive: nested overlay from top");
    eq(d.overlay_keep_mask, PICKER, "derive: overlay mask from top");
    eq(d.skip_led_clear, 1, "derive: lower service key survives");
}

/* Unknown keys are dropped, never carried into the effective set. */
{
    const d = deriveClaims({ overtake_mode: 2, bogus: 7 }, [{ claims: { also_bogus: 1 } }]);
    ok(!("bogus" in d) && !("also_bogus" in d), "derive: unknown keys dropped");
}

/* Entry without claims is transparent. */
{
    const d = deriveClaims(PRIMARY, [{ claims: null }, {}]);
    eq(d, deriveClaims(PRIMARY, []), "derive: claimless entries transparent");
}

/* ---- computeOps: idempotence ---- */
eq(computeOps(NEUTRAL_CLAIMS, NEUTRAL_CLAIMS), [], "ops: neutral→neutral empty");
{
    const d = deriveClaims(PRIMARY, []);
    eq(computeOps(d, d), [], "ops: x→x empty (primary)");
    const s = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 0, keep_mask: KEEP_CHAIN } }]);
    eq(computeOps(s, s), [], "ops: x→x empty (session)");
}

/* ---- computeOps: registration (neutral → primary) ---- */
{
    const ops = computeOps(NEUTRAL_CLAIMS, deriveClaims(PRIMARY, []));
    eq(ops[0], { op: "overtake_mode", mode: 2 }, "ops: register raises mode FIRST");
    ok(ops.some(o => o.op === "suppress_sysex" && o.on === 1), "ops: register asserts sysex");
    ok(ops.some(o => o.op === "passthrough" && o.csv === "60,119"), "ops: register pushes passthrough");
}

/* ---- computeOps: teardown (primary → neutral) ---- */
{
    const ops = computeOps(deriveClaims(PRIMARY, []), NEUTRAL_CLAIMS);
    eq(ops[ops.length - 1], { op: "overtake_mode", mode: 0 }, "ops: teardown drops mode LAST");
    ok(ops.some(o => o.op === "suppress_sysex" && o.on === 0), "ops: teardown clears sysex");
}

/* ---- computeOps: open a chain-edit service over the primary ---- */
{
    const base = deriveClaims(PRIMARY, []);
    const svc = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 3, keep_mask: KEEP_CHAIN, led_keep_mask: LED_CHAIN, suppress_sysex: 0 } }]);
    const ops = computeOps(base, svc);
    eq(ops[0], { op: "corun_begin", target: 1, id: 3, keep_mask: KEEP_CHAIN }, "ops: service open begins co-run first");
    ok(ops.some(o => o.op === "led_keep" && o.mask === LED_CHAIN), "ops: service open sets led keep");
    ok(ops.some(o => o.op === "suppress_sysex" && o.on === 0), "ops: service open clears sysex");
    ok(!ops.some(o => o.op === "overtake_mode"), "ops: mode untouched by service open");

    /* And the close is the exact inverse ownership state — sysex comes back
     * WITHOUT anyone re-asserting it (the desync class, retired). */
    const back = computeOps(svc, base);
    ok(back.some(o => o.op === "corun_end"), "ops: service close ends co-run");
    ok(back.some(o => o.op === "suppress_sysex" && o.on === 1), "ops: service close derives sysex back");
    ok(back.some(o => o.op === "led_keep" && o.mask === 0), "ops: service close clears led keep");
}

/* ---- computeOps: move-native + fx-picker overlay nesting ---- */
{
    const mv = deriveClaims(PRIMARY, [{ claims: { corun_target: 2, corun_id: 1, keep_mask: KEEP, led_keep_mask: KEEP, skip_led_clear: 1, suppress_sysex: 0 } }]);
    const mvPick = deriveClaims(PRIMARY, [
        { claims: { corun_target: 2, corun_id: 1, keep_mask: KEEP, led_keep_mask: KEEP, skip_led_clear: 1, suppress_sysex: 0 } },
        { claims: { overlay: 1, overlay_keep_mask: PICKER } },
    ]);
    const up = computeOps(mv, mvPick);
    eq(up, [{ op: "corun_overlay", active: 1, keep_mask: PICKER }], "ops: overlay push is exactly one overlay op");
    const down = computeOps(mvPick, mv);
    eq(down, [{ op: "corun_overlay", active: 0, keep_mask: KEEP }], "ops: overlay pop restores underlay mask");
}

/* ---- computeOps: session switch (chain-edit slot 1 → slot 2) ---- */
{
    const a = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 1, keep_mask: KEEP_CHAIN } }]);
    const b = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 2, keep_mask: KEEP_CHAIN } }]);
    const ops = computeOps(a, b);
    eq(ops, [
        { op: "corun_end" },
        { op: "corun_begin", target: 1, id: 2, keep_mask: KEEP_CHAIN },
    ], "ops: id change is end+begin");
}

/* ---- computeOps: session switch with overlay up unwinds overlay first ---- */
{
    const a = deriveClaims(PRIMARY, [
        { claims: { corun_target: 2, corun_id: 0, keep_mask: KEEP } },
        { claims: { overlay: 1, overlay_keep_mask: PICKER } },
    ]);
    const b = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 0, keep_mask: KEEP_CHAIN } }]);
    const ops = computeOps(a, b);
    eq(ops[0].op, "corun_overlay", "ops: overlay closes before session end");
    eq(ops[0].active, 0, "ops: overlay close is active=0");
    eq(ops[1], { op: "corun_end" }, "ops: then session ends");
    eq(ops[2], { op: "corun_begin", target: 1, id: 0, keep_mask: KEEP_CHAIN }, "ops: then new session begins");
}

/* ---- computeOps: mask-only change re-begins the same session ---- */
{
    const a = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 0, keep_mask: KEEP_CHAIN } }]);
    const b = deriveClaims(PRIMARY, [{ claims: { corun_target: 1, corun_id: 0, keep_mask: KEEP } }]);
    eq(computeOps(a, b), [{ op: "corun_begin", target: 1, id: 0, keep_mask: KEEP }],
       "ops: mask-only change re-begins with new mask");
}

/* ---- computeOps: every scalar claim toggles both ways ---- */
for (const key of ["skip_led_clear", "suppress_sysex", "vol_block", "edit_cc_block", "pad_block", "canvas_input"]) {
    const on = computeOps(NEUTRAL_CLAIMS, { ...NEUTRAL_CLAIMS, [key]: 1 });
    eq(on, [{ op: key, on: 1 }], `ops: ${key} on`);
    const off = computeOps({ ...NEUTRAL_CLAIMS, [key]: 1 }, NEUTRAL_CLAIMS);
    eq(off, [{ op: key, on: 0 }], `ops: ${key} off`);
}
eq(computeOps(NEUTRAL_CLAIMS, { ...NEUTRAL_CLAIMS, passthrough: "50" }),
   [{ op: "passthrough", csv: "50" }], "ops: passthrough change");

/* ---- applyOps ---- */
{
    const calls = [];
    const rec = new Proxy({}, { get: (_, op) => (o) => calls.push([op, o]) });
    const ops = computeOps(NEUTRAL_CLAIMS, deriveClaims(PRIMARY, []));
    applyOps(ops, rec);
    eq(calls.length, ops.length, "apply: every op reaches its effector");
    let threw = false;
    try { applyOps([{ op: "nonexistent" }], {}); } catch (_e) { threw = true; }
    ok(threw, "apply: missing effector throws (no silent desync)");
}

/* ---- property sweep: derive is total and ops are exact ----
 * For a grid of primary/stack shapes: applying computeOps(prev,next) against
 * a state-machine effector must land exactly on `next`'s observable state. */
{
    const machineFromOps = (start, ops) => {
        const st = { ...start };
        applyOps(ops, {
            overtake_mode: o => { st.overtake_mode = o.mode; },
            corun_begin: o => { st.corun_target = o.target; st.corun_id = o.id; st.keep_mask = o.keep_mask; },
            corun_end: () => { st.corun_target = 0; st.corun_id = 0; st.keep_mask = 0; st.led_keep_mask = 0; },
            corun_overlay: o => { st.overlay = o.active; st.overlay_keep_mask = o.active ? o.keep_mask : 0;
                                  if (!o.active) st.keep_mask = o.keep_mask; },
            led_keep: o => { st.led_keep_mask = o.mask; },
            skip_led_clear: o => { st.skip_led_clear = o.on; },
            suppress_sysex: o => { st.suppress_sysex = o.on; },
            vol_block: o => { st.vol_block = o.on; },
            edit_cc_block: o => { st.edit_cc_block = o.on; },
            pad_block: o => { st.pad_block = o.on; },
            canvas_input: o => { st.canvas_input = o.on; },
            passthrough: o => { st.passthrough = o.csv; },
        });
        return st;
    };
    const stacks = [
        [],
        [{ claims: { corun_target: 1, corun_id: 0, keep_mask: KEEP_CHAIN, led_keep_mask: LED_CHAIN, suppress_sysex: 0 } }],
        [{ claims: { corun_target: 2, corun_id: 3, keep_mask: KEEP, skip_led_clear: 1, suppress_sysex: 0 } }],
        [{ claims: { corun_target: 2, corun_id: 3, keep_mask: KEEP, skip_led_clear: 1, suppress_sysex: 0 } },
         { claims: { overlay: 1, overlay_keep_mask: PICKER } }],
        [{ claims: { vol_block: 1, edit_cc_block: 1 } }],
    ];
    const primaries = [null, PRIMARY, { overtake_mode: 2 }];
    let checked = 0;
    for (const pri of primaries) {
        for (const sa of stacks) {
            for (const sb of stacks) {
                const a = deriveClaims(pri, sa);
                const b = deriveClaims(pri, sb);
                const landed = machineFromOps(a, computeOps(a, b));
                for (const k of CLAIM_KEYS) {
                    if (k === "led_keep_mask" && b.corun_target === 0 && b.led_keep_mask === 0) continue;
                    if (landed[k] !== b[k]) {
                        failures++;
                        console.error(`FAIL sweep: pri=${JSON.stringify(pri)} ${JSON.stringify(sa)}→${JSON.stringify(sb)} key=${k}: ${landed[k]} != ${b[k]}`);
                    }
                }
                checked++;
            }
        }
    }
    ok(checked === primaries.length * stacks.length * stacks.length, "sweep: full grid ran");
}

if (failures) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
}
console.log("PASS: primary claims engine (derive/diff/apply + transition sweep)");
