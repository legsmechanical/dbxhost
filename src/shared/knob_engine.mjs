/**
 * knob_engine.mjs — THE knob model. One implementation, one file.
 *
 * Every physical knob turn in the UI comes through here: the Movy knob grid,
 * the hierarchy list editor and its overlay, the patch editor, the waveform
 * zoom and marker knobs.
 *
 * There used to be two. This file held a time-based divisor curve (16 / 8 / 4
 * by how fast you turned) stepping by the module's DECLARED step, while
 * param_pages/movy_knob.mjs held the ported Movy model, which normalises a
 * step to a fraction of the parameter's own RANGE. A knob therefore behaved
 * differently depending on which screen you touched it from, reported from
 * the device as knobs being "super slow in the overlay". The gap was not
 * subtle:
 *
 *     float 20..20000 step 1      overlay 79,917 detents      grid 200
 *     int   0..127                overlay    505 detents      grid 127
 *
 * ...and shift-fine, which is meant to work everywhere, was honoured for
 * floats in one and ignored for ints and enums, while in the other it could
 * not move an int at all.
 *
 * The Movy model won: it is the one the knob grid ships with, so it is the
 * feel already in people's hands, and normalising to the range is what makes
 * every knob cross in about the same wrist movement whatever its units. What
 * was lost is the time-based acceleration — the range normalisation replaces
 * what it existed to paper over.
 *
 * An intermediate version kept both files, with this one delegating to the
 * other. That is still two places to look and two things to keep in step, so
 * the model was moved here and movy_knob.mjs deleted. Upstream also collapsed
 * to a single ENTRY POINT -- knobStep, taking metadata -- and DELETED the
 * config-shaped knobTick / knobConfigFromMeta pair its older call sites used.
 *
 * ===================== FORK DEVIATION (dbxhost) =====================
 *
 * THIS FORK STILL HAS BOTH, AND THAT IS DELIBERATE FOR THIS PASS.
 *
 * Upstream could delete knobTick because it migrated its three shadow_ui call
 * sites to knobStep in the same change. This fork has not: `shadow_ui.js`
 * (hierarchy editor, overlay, waveform zoom) and `shadow_ui_patches.mjs`
 * still call knobTick/knobConfigFromMeta, and the TIME-BASED DIVISOR CURVE
 * they get is a shipped feel, not an accident -- `davebox/ui/ui_input_cc.mjs`
 * carries a hand-port of `tickDivisor` and `davebox/tests/
 * test_knob_curve_matches_host.sh` pins KNOB_ACCEL_FAST_MS /
 * KNOB_ACCEL_MED_MS / KNOB_STALE_MS / the enum divisor against THIS file by
 * name. dAVEBOx knob feel is frozen by directive, so deleting those constants
 * here silently unpins that port.
 *
 * So the file holds TWO models on purpose:
 *
 *   knobStep(state, meta, delta, now, fine)     the Movy range-normalised
 *                                               model -- what the param_pages
 *                                               knob grid turns
 *   knobTick(state, config, direction, now)     the legacy time-divisor
 *                                               model -- what the fork's list
 *                                               editor, overlay, patch editor
 *                                               and waveform knobs turn
 *
 * Upstream's warning about aliases stands and is why these are NOT aliases of
 * each other: they are two different curves under two different names, and
 * the entry point you pick decides the feel. Everything NEW goes through
 * knobStep.
 *
 * TODO(fork): migrate shadow_ui.js + shadow_ui_patches.mjs onto knobStep and
 * delete the legacy half. That is a knob-FEEL change to shipped screens and a
 * retune of the dAVEBOx port, so it is its own pass with hardware in hand --
 * not a side effect of adopting the knob grid.
 * ====================================================================
 *
 * ORIGIN: the model below is ported from schwung-movy
 * (`src/model/{knob-step,store,constants}.ts`, (c) 2026 megadake, MIT —
 * https://github.com/DimaDake/schwung-movy).
 *
 * The core idea: a float/int knob's per-detent step is a fixed FRACTION of
 * its own range (~1%, MIN_STEP_RANGE_FRAC) rather than the module's declared
 * `step`, which is a statement about precision and not about sweep. That is
 * what fixes both a wide-range knob crawling and a narrow one being a hair
 * trigger.
 */

import { isBooleanMeta } from "./param_pages/viz.mjs";

/*
 * The type tags the older call sites build their configs with. They name the
 * same three kinds the metadata does.
 */
export const KNOB_TYPE_FLOAT = "float";
export const KNOB_TYPE_INT = "int";
export const KNOB_TYPE_ENUM = "enum";

/** Physical clicks per value step for a narrow int range, and for every enum. */
export const ENUM_DELTA_DIV = 4;
/** Sensitivity multiplier for a continuous arc-rendered knob — every knob in
 * the Movy layout is one, so this always applies to float/int. */
export const ARC_DELTA_SCALE = 0.5;
/** A float/int knob's per-detent step, as a fraction of its own range. */
export const MIN_STEP_RANGE_FRAC = 0.01;
/**
 * An int range this narrow or narrower is stepped like an enum.
 *
 * SIXTEEN, because that is where "which one of N things" stops and "a sweep"
 * begins on this hardware. It was 8, which left every 1..16 selector at one
 * value per detent -- and one flick of an encoder is a dozen detents, so a pad
 * index or a MIDI channel flew past its whole range before you could read it.
 * Reported from the device against mrdrums` Current Pad: "these numbers move
 * crazy fast on a single detent".
 *
 * Measured over the fleet, the 9..16 band is 72 params and is ENTIRELY
 * discrete identities -- `midi_ch[1..16]`, `ui_current_pad[1..16]`,
 * `choke_group[0..16]`. The next band up (17..24, 17 params) is
 * `pb_range[0..24]`, `pitch_env_depth[0..24]`: quantities you sweep, where
 * four detents per unit would be an obstacle. So the boundary is evidence,
 * not a round number.
 *
 * Deliberately NOT a second detent count. ENUM_DELTA_DIV stays 4 and is shared,
 * for the reason the two-way latch pins its constant equal to the trigger`s: an
 * enum and a pad index are the same gesture over the same kind of choice, and a
 * user cannot learn two feels for controls that look alike.
 *
 * Note this does NOT align with shouldDrawBigNumber`s span of 24, and should
 * not: how a value is DRAWN and how it STEPS are different questions, and the
 * 17..24 band answers them differently on purpose.
 */
export const NARROW_RANGE_MAX = 16;

/** schwung-movy model/knob-step.ts detentsPerStep, ported. */
export function detentsPerStep(meta) {
    if (meta.type !== "int" || meta.knobAcceleration === "wide") return 1;
    const range = meta.max - meta.min;
    return (range >= 2 && range <= NARROW_RANGE_MAX) ? ENUM_DELTA_DIV : 1;
}

/** schwung-movy model/knob-step.ts perDetentStep, ported. */
export function perDetentStep(meta) {
    const arcScale = ARC_DELTA_SCALE;
    if (!(meta.max > meta.min)) return (meta.step > 0 ? meta.step : 0.01) * arcScale;
    const rangeStep = (meta.max - meta.min) * MIN_STEP_RANGE_FRAC;
    if (meta.type === "int") return Math.round(Math.max(meta.step > 0 ? meta.step : 1, rangeStep) * arcScale);
    return rangeStep * arcScale;   // float
}

/**
 * schwung-movy model/store.ts wideStepCount, ported. Velocity multiplier for
 * a param that opts into `knobAcceleration: "wide"` — see the module doc:
 * nothing in the fleet declares this today.
 */
function wideStepCount(state, direction, nowMs) {
    let multiplier = 1;
    const elapsed = state.lastTurnMs > 0 ? nowMs - state.lastTurnMs : Infinity;
    if (direction === state.lastDirection) {
        if (elapsed <= 35) multiplier = 250;
        else if (elapsed <= 90) multiplier = 50;
        else if (elapsed <= 180) multiplier = 10;
    }
    state.lastTurnMs = nowMs;
    state.lastDirection = direction;
    return direction * multiplier;
}

/**
 * A two-state boolean, i.e. exactly what viz.mjs `detectSwitch` draws as a
 * switch. Kept on the same BOOL_OPTION test so a control cannot be drawn as a
 * switch but turned like a list (or the reverse).
 */
function isSwitchMeta(meta) {
    return isBooleanMeta(meta);
}

/**
 * Minimum still time before a knob can flip a two-way control again.
 *
 * The same number and the same rule as `TRIGGER_KNOB_GESTURE_GAP_MS` in
 * page_controller.mjs: ONE FLICK IS ONE GESTURE. A trigger fires once per
 * flick; a two-way flips once per flick. Both would otherwise act a dozen
 * times across a single twist of the encoder.
 *
 * It is a LATCH, not a rate limit, and that is the distinction the trigger
 * shipped wrong first: the stamp is the last DETENT, so every detent extends
 * the gesture and the clock only runs while the knob is STILL.
 */
export const TWO_WAY_GESTURE_GAP_MS = 270;

/**
 * A control with exactly TWO values and no travel between them.
 *
 * Both spellings count — an Off/On (or int 0..1) boolean, which is drawn as a
 * switch, and a two-way CHOICE like Mix/Reverb or Saw/Square, which is drawn
 * as an enum square. They behave identically under the hand even though they
 * are drawn differently, because the question a detent asks is the same one:
 * there is nowhere to go but the other value.
 *
 * A TRIGGER is excluded. It is a two-option enum on the wire (["—","Rnd!"])
 * and toggling it would write "do nothing" on every other flick — which for
 * euclidrum's rnd_preset is the write that destroys a kit. Callers that route
 * triggers away before reaching here (page_controller does) are unaffected;
 * this is for the ones that do not.
 */
function isTwoWayMeta(meta) {
    if (!meta) return false;
    if (meta.writeOnly || meta.access === "write") return false;
    if (isSwitchMeta(meta)) return true;
    return (meta.kind === "enum" || meta.type === "enum")
        && Array.isArray(meta.options) && meta.options.length === 2;
}

/**
 * Reversing direction drops whatever partial turn was banked the other way.
 * Without it the residue is spent cancelling the new direction first, so a
 * reversal costs up to div + (div - 1) detents — 7 at ENUM_DELTA_DIV 4 — and
 * how many depends on where the previous turn happened to stop, which is why
 * the same knob feels inconsistent from one reversal to the next.
 */
function clearOnReversal(state, delta) {
    if (state.detentAccum !== 0 && Math.sign(state.detentAccum) !== Math.sign(delta))
        state.detentAccum = 0;
}

/*
 * ONE initialiser for BOTH models -- the returned state is the union of the
 * two field sets, so a caller does not have to know which entry point it is
 * about to use (and shadow_ui.js seeds states it later hands to either).
 * The extra fields are inert to whichever model does not read them.
 */
export function knobInit(initialValue) {
    return {
        value: initialValue,
        /* knobStep (Movy model) */
        detentAccum: 0, lastTurnMs: 0, lastDirection: 0,
        /* knobTick (fork's legacy time-divisor model) */
        lastTickMs: 0, tickAccum: 0,
    };
}

/**
 * @param {object} state   from movyKnobInit, mutated in place
 * @param {object} meta    param_meta.mjs metadata (min/max/step/type/options)
 * @param {number} delta   ±1 per physical detent (this library always decodes
 *                         one CC message to one detent — see page_input.mjs)
 * @param {number} nowMs
 * @param {boolean} [fine] Shift-held precision mode. Not part of Movy's own
 *                 model (no equivalent was found in its source); grafted on
 *                 so the gesture works everywhere.
 *
 *                 THE RULE, in two clauses, both of which matter:
 *
 *                   1. the step becomes a TENTH of the coarse step, floored
 *                      at one whole unit for an int (a tenth of a 1-unit step
 *                      is 0.1, which rounds straight back — that was an int
 *                      knob that could not be moved at all under shift); and
 *                   2. the detent GATE is lifted, so every detent moves
 *                      something.
 *
 *                 Clause 2 is why shift can make a control FASTER rather than
 *                 slower, which looks contradictory on a stopwatch: an enum
 *                 and a narrow int are gated at ENUM_DELTA_DIV detents per
 *                 option in the coarse feel, so lifting the gate is a
 *                 fourfold speed-up. It is still precision — with shift held
 *                 one click is exactly one option, instead of four clicks
 *                 being one option and a partial turn being nothing at all.
 *                 That is what you want when placing a value rather than
 *                 sweeping to one.
 * @returns {number} the new value
 */
export function knobStep(state, meta, delta, nowMs, fine = false) {
    if (!state || !delta) return state ? state.value : 0;

    /*
     * Fill in a missing range. Call sites hand us metadata straight off
     * chain_params, and a module is not obliged to declare min/max -- an
     * absent one used to arrive as undefined, and the clamp at the bottom
     * turned the value into NaN, which is then written to the device as the
     * string "NaN". The old config-shaped entry point defaulted these on the
     * way in; now that there is only one entry point, it has to do it here.
     */
    if (typeof meta.min !== "number" || typeof meta.max !== "number") {
        const isInt = meta.type === "int";
        meta = {
            ...meta,
            min: typeof meta.min === "number" ? meta.min : 0,
            max: typeof meta.max === "number" ? meta.max : (isInt ? 127 : 1),
        };
    }

    /*
     * TWO VALUES: A DETENT TOGGLES, WHICHEVER WAY IT WENT.
     *
     * It used to be direction-ABSOLUTE — right meant option 1, left meant
     * option 0 — and a two-way choice like Mix/Reverb instead fell through to
     * the enum branch below and CLAMPED behind a four-detent gate. Three
     * spellings of one control, two of them with a dead direction:
     *
     *   Off/On at Off, turned left     nothing, forever
     *   Mix/Reverb at Mix, turned left nothing, forever
     *
     * Reported from the device: "if there are only two, why not let it wrap
     * otherwise you have to know which way is off and which way is on, in
     * which case you need some knowledge you dont have." There is no way to
     * acquire that knowledge from the screen — the cell shows a state, not a
     * direction — so half of every reach for the knob reads as a dead control.
     * That is the same argument that makes a trigger fire in either direction.
     *
     * WRAPPING ALONE WOULD NOT DO, and this is the part worth keeping. With
     * two values, "wrap" and "toggle on every detent" are the same thing, and
     * one flick of an encoder is a dozen detents — so a flick would land on
     * whichever value the detent count happened to be even or odd about. The
     * LATCH is what makes the gesture legible: one flick, one flip, and the
     * clock runs on STILLNESS because the stamp is the last detent rather than
     * the last flip.
     *
     * Hoisted above the enum branch for the reason it always was: an int 0..1
     * never enters that branch and would accumulate on the numeric path.
     */
    if (isTwoWayMeta(meta)) {
        const t = typeof nowMs === "number" ? nowMs : 0;
        const last = state.lastTwoWayMs;
        const startsGesture = last === undefined
            || (t - last) >= TWO_WAY_GESTURE_GAP_MS;
        state.lastTwoWayMs = t;
        state.detentAccum = 0;
        if (!startsGesture) return state.value;
        state.value = Math.round(Number(state.value)) === 0 ? 1 : 0;
        return state.value;
    }

    if (meta.kind === "enum" || meta.type === "enum") {
        /* THREE OR MORE options only — anything with exactly two was taken by
         * the branch above. That is what the four-detent gate is for: a long
         * list wants a sweep, and a two-way has nothing to sweep through, so
         * running one through this gate cost 4 detents to move at all (and up
         * to 7 to come back), which reads as a dead control — the drawn knob
         * simply does not move when you turn it. */
        const div = fine ? 1 : ENUM_DELTA_DIV;
        clearOnReversal(state, delta);
        state.detentAccum += delta;
        const steps = Math.trunc(state.detentAccum / div);
        if (steps === 0) return state.value;
        state.detentAccum -= steps * div;
        const count = Array.isArray(meta.options) ? meta.options.length : (meta.max - meta.min + 1);
        let iv = Math.round(state.value) + steps;
        iv = Math.max(0, Math.min(Math.max(0, count - 1), iv));
        state.value = iv;
        return state.value;
    }

    if (meta.knobAcceleration === "wide") {
        const scaled = wideStepCount(state, delta > 0 ? 1 : -1, nowMs) * (meta.step > 0 ? meta.step : 1);
        let next = state.value + scaled;
        next = Math.max(meta.min, Math.min(meta.max, next));
        if (meta.type === "int") next = Math.round(next);
        state.value = next;
        return next;
    }

    const div = fine ? 1 : detentsPerStep(meta);
    let steps = delta;
    if (div > 1) {
        clearOnReversal(state, delta);
        state.detentAccum += delta;
        steps = Math.trunc(state.detentAccum / div);
        if (steps === 0) return state.value;
        state.detentAccum -= steps * div;
    }
    /*
     * FINE is a tenth of the coarse step -- except an int, where a tenth of a
     * 1-unit step is 0.1 and Math.round below puts it straight back. That was
     * not "fine is subtle", it was an int knob that could not be moved AT ALL
     * with shift held: measured at 400,000 detents without crossing 0..127.
     * An int's finest meaningful move is 1.
     */
    const coarseStep = perDetentStep(meta);
    const stepSize = !fine ? coarseStep
        : (meta.type === "int" ? Math.max(1, Math.round(coarseStep * 0.1))
                               : coarseStep * 0.1);
    let next = state.value + steps * stepSize;
    next = Math.max(meta.min, Math.min(meta.max, next));
    if (meta.type === "int") next = Math.round(next);
    state.value = next;
    return next;
}


/* ==========================================================================
 * FORK-ONLY: the legacy time-divisor model.
 *
 * Verbatim from this fork's pre-import knob_engine.mjs (the JS port of
 * schwung-rewrite/src/domains/knob_engine.c). Upstream v1.0.0 deleted all of
 * it; see the FORK DEVIATION block at the top of this file for why it stays,
 * and do not retune any number below without retuning
 * davebox/ui/ui_input_cc.mjs with it.
 *
 * Divisor curve (gap = nowMs - lastTickMs):
 *   gap >  150ms -> divisor 16   (fine control)
 *   gap >   50ms -> divisor 8
 *   gap == 0 or <= 50ms -> divisor 4   (fast sweep)
 *   first tick (lastTickMs == 0) -> divisor 1   ("click" on motion start)
 *
 * Float: step / divisor per tick.
 * Int:   accumulate ticks; emit +-1 once accum reaches divisor.
 * Enum:  fixed enum_divisor = 10 ticks per option, regardless of count.
 *
 * Staleness: gap > 2000ms resets the engine to cold-start (lastTickMs = 0).
 * ========================================================================== */

const KNOB_ACCEL_FAST_MS = 50;
const KNOB_ACCEL_MED_MS = 150;
const KNOB_STALE_MS = 2000;   // gap above this → treat as cold start (engine self-resets)

function clampf(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

function tickDivisor(state, nowMs) {
    if (state.lastTickMs === 0) return 1;
    const delta = nowMs > state.lastTickMs ? nowMs - state.lastTickMs : 0;
    /* Stale state — engine self-resets so re-entry feels like a fresh edit. */
    if (delta > KNOB_STALE_MS) {
        state.lastTickMs = 0;
        state.tickAccum = 0;
        return 1;
    }
    if (delta > KNOB_ACCEL_MED_MS) return 16;
    if (delta > KNOB_ACCEL_FAST_MS) return 8;
    return 4;
}

export function knobTick(state, config, direction, nowMs) {
    const divisor = tickDivisor(state, nowMs);
    state.lastTickMs = nowMs;

    if (config.type === KNOB_TYPE_FLOAT) {
        const step = config.step > 0 ? config.step : 0.01;
        const delta = (step / divisor) * direction;
        state.value = clampf(state.value + delta, config.min, config.max);
    } else if (config.type === KNOB_TYPE_INT) {
        /* Accumulator must drain before reversing — eats first N reverse ticks (anti-jitter). */
        state.tickAccum += direction;
        const steps = Math.trunc(state.tickAccum / divisor);
        if (steps !== 0) {
            state.value = clampf(state.value + steps, config.min, config.max);
            state.tickAccum -= steps * divisor;
        }
    } else if (config.type === KNOB_TYPE_ENUM) {
        if (!config.enumCount || config.enumCount <= 0) {
            state.tickAccum = 0;
            return state.value;
        }
        /* Fixed ticks-per-option for enums — independent of count so binary
         * toggles feel as snappy as 47-option pickers. Tunable single number. */
        const enumDivisor = 10;
        /* Accumulator must drain before reversing — eats first N reverse ticks (anti-jitter). */
        state.tickAccum += direction;
        const steps = Math.trunc(state.tickAccum / enumDivisor);
        if (steps !== 0) {
            let iv = Math.round(state.value) + steps;
            if (iv < 0) iv = 0;
            if (iv >= config.enumCount) iv = config.enumCount - 1;
            state.value = iv;
            state.tickAccum -= steps * enumDivisor;
        }
    }
    return state.value;
}

/* Convert a chain_params metadata entry → KnobConfig accepted by knobTick(). */
export function knobConfigFromMeta(meta) {
    if (!meta) return { type: KNOB_TYPE_FLOAT, min: 0, max: 1, step: 0.01 };
    if (meta.type === "int") {
        return {
            type: KNOB_TYPE_INT,
            min: typeof meta.min === "number" ? meta.min : 0,
            max: typeof meta.max === "number" ? meta.max : 127,
            step: meta.step > 0 ? meta.step : 1,
        };
    }
    if (meta.type === "enum") {
        const opts = Array.isArray(meta.options) ? meta.options : [];
        return {
            type: KNOB_TYPE_ENUM,
            min: 0,
            max: Math.max(0, opts.length - 1),
            step: 1,
            enumCount: opts.length,
        };
    }
    return {
        type: KNOB_TYPE_FLOAT,
        min: typeof meta.min === "number" ? meta.min : 0,
        max: typeof meta.max === "number" ? meta.max : 1,
        step: meta.step > 0 ? meta.step : 0.01,
    };
}
