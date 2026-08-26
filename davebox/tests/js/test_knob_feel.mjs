/* tests/js/test_knob_feel.mjs — the bank-param knobs must read the batch
 * MAGNITUDE, not just its sign.
 *
 * Josh, 2026-08-25, on hardware: dAVEBOx's bank knobs feel "slow as hell" while
 * the host's generated canvas editors feel right, on the same hardware and the
 * same physical knob.
 *
 * The cause is a false premise in the old curve's own comment: "The Move knobs
 * fire ~2-4 ±1 detent messages per physical click ... so timing can't tell slow
 * from fast." That is the RAW HARDWARE STREAM. A tool never sees it. shadow_ui
 * accumulates encoder CCs and flushes ONE synthetic message per knob per FRAME
 * carrying the summed detent count -- "modules reading the raw value get the
 * magnitude for acceleration" (shadow_ui.js, overtake flush). ccKnobDelta() read
 * only the SIGN of that sum, so six detents landing in one frame moved a
 * parameter exactly as far as one did. Measured on the device 2026-08-26: a fast
 * flick sends values up to +-6, and 48% of detents carry more than 1.
 *
 * ⚠ THE ASSERTION IS DELIBERATELY RELATIVE, not a tuned number. Pinning "a
 * batch of 6 moves 6 steps" would freeze a curve Josh may still want retuned;
 * pinning "a batch of 6 moves FARTHER than a batch of 1, for the same number of
 * events" is the property that was broken and the one that must never regress.
 * Under the old code those two were IDENTICAL, so this fails against it.
 *
 * ⚠ This covers the bank-param path (ccKnobDelta / knobPick). dAVEBOx has a
 * THIRD knob accumulator -- knobAccumSteps/KNOB_SENS, used by the session mixer
 * strips and sound mode's level -- which already reads the magnitude and is
 * tuned separately. test_session_level_knob covers that one. A green suite there
 * says nothing about this one; that is why this file exists.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const writes = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { writes.push(k + '=' + v); };
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }

function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* Drive the REAL entry point the host calls, exactly as the overtake flush does:
 * one message per knob per frame, value = the frame's summed detent count. */
/* NOTE FX bank, K3 = Velocity Offset: range -127..127 with no picker format, so
 * knobClass() calls it 'cont' — the class the report was about. Chosen over a
 * small-range param deliberately: a 'pick' knob would mask the magnitude behind
 * its fixed divisor. */
const KNOB_CC = 73;
/* ⚠ The write does NOT land on the bank's dspKey. A NOTE FX knob writes the
 * ACTIVE CLIP's per-clip override: `t0_l0_pfx_set=velocity_offset <n>`. Asserting
 * the dspKey name here would report "the knob never moved" while it was moving
 * perfectly — measure the key the code actually writes. */
const PARAM = 'velocity_offset';
function flick(magnitude, frames) {
    for (let i = 0; i < frames; i++) {
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, KNOB_CC, magnitude]));
        ticks(1);
    }
}

/* Total absolute movement the turn produced, read off the params it wrote.
 * Keyed by param name so an unrelated write cannot inflate the measurement. */
function travel(before, after, filterKey = PARAM) {
    /* Two write shapes reach here: `key=<number>` and the per-clip override
     * `key=<name> <number>`. Fold the name into the key for the second, so two
     * different overrides on one key cannot be differenced against each other. */
    const num = (arr) => {
        const last = {};
        for (const w of arr) {
            const eq = w.lastIndexOf('=');
            if (eq < 0) continue;
            let k = w.slice(0, eq);
            const rhs = w.slice(eq + 1).trim().split(/\s+/);
            const v = parseFloat(rhs[rhs.length - 1]);
            if (!isFinite(v)) continue;
            if (rhs.length > 1) k += ':' + rhs.slice(0, -1).join(' ');
            last[k] = v;
        }
        return last;
    };
    const a = num(before), b = num(after);
    let sum = 0;
    for (const k of Object.keys(b))
        if (k.indexOf(filterKey) >= 0 && a[k] !== undefined) sum += Math.abs(b[k] - a[k]);
    return sum;
}

let slowTravel = 0, fastTravel = 0;

step('setup: the NOTE FX bank live, melodic pads, knobs unlocked', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeBank = 1;
    S.activeTrack = 0;
    S.knobLocked.fill(false);
    ticks(16);
    /* Prove the stimulus lands on the param before measuring how FAR it lands —
     * a test that measures nothing reports "no movement" for both curves and
     * would pass the equality check by accident. */
    const before = writes.slice();
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, KNOB_CC, 1]));
    ticks(1);
    if (!writes.slice(before.length).some((w) => w.indexOf(PARAM) >= 0))
        throw new Error('the knob never reached ' + PARAM + '; last writes=' +
                        JSON.stringify(writes.slice(-3)));
});

step('a SLOW turn: one detent per frame', () => {
    /* Settle first so the gesture starts cold, the way a real one does. */
    ticks(64);
    const before = writes.slice();
    flick(1, 24);
    slowTravel = travel(before, writes);
    if (slowTravel === 0) throw new Error('a 24-frame turn moved nothing at all: ' + JSON.stringify(writes.slice(-4)));
});

step('a FAST turn: six detents per frame, SAME number of frames', () => {
    ticks(64);
    const before = writes.slice();
    flick(6, 24);
    fastTravel = travel(before, writes);
    if (fastTravel === 0) throw new Error('a fast turn moved nothing: ' + JSON.stringify(writes.slice(-4)));
});

/* THE REGRESSION PIN. Same event count, six times the physical motion. Under the
 * sign-only curve these two were equal, which is precisely the reported bug. */
step('the fast turn travels FARTHER — the magnitude is not discarded', () => {
    if (!(fastTravel > slowTravel))
        throw new Error('fast=' + fastTravel + ' slow=' + slowTravel +
                        ' — equal or worse means the batch magnitude is being thrown away');
});

step('...and by a real margin, not a rounding crumb', () => {
    if (!(fastTravel >= slowTravel * 2))
        throw new Error('fast=' + fastTravel + ' slow=' + slowTravel +
                        ' — a 6x faster spin should cover appreciably more ground');
});

/* Exact dialing must SURVIVE the change: that was the whole point of the trade
 * this replaces (1738ffdd, "slow turns always ±1 so exact values are dialable").
 * The engine's cold-start divisor of 1 is what preserves it.
 *
 * ⚠ Uses a DIFFERENT knob on purpose. The acceleration state is per knob, and
 * "cold start" means that knob's own state is untouched — CC 73 has been spun
 * hard by the steps above and is mid-curve, so asking it for a cold single
 * detent measures the leftover accumulator, not the rule. Simulating the 2 s
 * staleness reset instead would put a real 2 s sleep in the suite for the same
 * assertion.
 * NOTE FX K4 = Quantize (0-100), also a 'cont' knob, never touched until here. */
step('a FRESH knob moves on its very first detent — exact dialing survives', () => {
    const FRESH_CC = 74;
    const before = writes.slice();
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, FRESH_CC, 1]));
    ticks(1);
    /* A WRITE is the observable here, not a difference: this knob has never
     * been turned, so there is no earlier value to difference against — and
     * travel() would report 0 for "no baseline" exactly as it does for "did not
     * move". Two different facts must not share one reading. */
    const moved = writes.slice(before.length).filter((w) => w.indexOf('quantize') >= 0);
    if (moved.length === 0)
        throw new Error('a deliberate single detent did nothing — exact dialing is gone; ' +
                        'writes=' + JSON.stringify(writes.slice(before.length).slice(-3)));
});

if (failed) process.exit(1);
console.log('test_knob_feel: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
