/* ui_anim.mjs — the animation store, ported from schwung's
 * src/shared/param_pages/anim_state.mjs.
 *
 * ⭑⭑ TIME IS PASSED IN, NEVER READ. There is no Date.now() in this file and
 * there must be none in any draw path that uses it. That is not tidiness: it is
 * the property that lets the offline renderers draw exactly what the device
 * draws, and this campaign has already paid for the alternative — a page bar
 * that blinks off Date.now() reported EIGHT manual screens as changed by a
 * change that altered none of them. An animated widget reading the clock in
 * draw would make every render in davebox/tools non-reproducible at once.
 *
 * ⭑⭑ A VALUE ARRIVING IS NOT A VALUE CHANGING, and the store cannot tell the
 * difference on its own — by the time a widget calls in, an absent value has
 * already been turned into a concrete picture ("--" has a perfectly ordinary
 * width; shape 0 is a perfectly ordinary waveform). Recorded as a first
 * sighting, the real value then arrives as a TRANSITION and the whole page
 * animates itself in from values nobody set. `observeLanded` takes the RAW
 * value alongside the token being animated for exactly this reason: every
 * derivation a widget animates is total, so only the raw value still carries
 * the absence. This is the tri-state read rule one layer below where it is
 * usually enforced.
 *
 * ⚠ `undefined` ONLY counts as absent. Widening it to falsy would swallow 0,
 * which is a legitimate reading of every switch, shape and enum there is.
 *
 * PURE: no imports, no state outside the store the caller owns, no host
 * globals. Loads standalone in node.
 */

/** A fresh store. One per screen that animates; never global. */
export function createAnimState() {
    return { prev: new Map(), from: new Map(), since: new Map() };
}

/**
 * Record `value` for `key` at `now`, and report the transition.
 * Returns { from, to, t, moving } — `t` is 0..1 through `durationMs`.
 *
 * ⚠ `from` is the value before the CHANGE, not before the frame: a knob turned
 * three detents in three frames is ONE transition from where it started, not
 * three. Retargeting mid-flight re-bases to where the value visually IS right
 * now, so a fast sweep does not snap backwards.
 */
export function observe(state, key, value, now, durationMs) {
    const dur = (durationMs === undefined) ? 120 : durationMs;
    if (!state) return { from: null, to: value, t: 1, moving: false };

    const prev = state.prev.get(key);
    if (prev === undefined) {
        state.prev.set(key, value);
        state.from.set(key, value);
        /* ⚠ ALREADY PAST, not `now`. A key seen for the first time has not
         * changed — it has arrived. Stamping it with the current time makes the
         * whole page animate on its first frame, and holds `settled()` false so
         * an idle page keeps redrawing. */
        state.since.set(key, now - dur);
        return { from: null, to: value, t: 1, moving: false };
    }

    if (!Object.is(prev, value)) {
        const inflight = progress(state, key, now, dur);
        state.from.set(key, inflight < 1 ? interpolatedOrPrev(state, key, inflight) : prev);
        state.prev.set(key, value);
        state.since.set(key, now);
    }

    const t = progress(state, key, now, dur);
    return { from: state.from.get(key), to: value, t, moving: t < 1 };
}

/**
 * `observe`, but only once the value has actually been READ.
 *
 * ⚠ NOTHING IS RECORDED while `raw` is undefined. That is the point: leaving
 * the key out of the store entirely makes the first real value a FIRST
 * SIGHTING, which `observe` stamps as already-past. Recording the placeholder
 * and merely suppressing the animation would leave `from` set to it, so the
 * next genuine change would animate out of a value that was never on screen.
 */
export function observeLanded(state, key, raw, value, now, durationMs) {
    if (raw === undefined) return { from: null, to: value, t: 1, moving: false };
    return observe(state, key, value, now, durationMs);
}

function progress(state, key, now, durationMs) {
    const since = state.since.get(key);
    if (since === undefined || !(durationMs > 0)) return 1;
    const dt = now - since;
    if (!(dt >= 0)) return 1;              /* clock went backwards: settle */
    return dt >= durationMs ? 1 : dt / durationMs;
}

function interpolatedOrPrev(state, key, t) {
    const a = Number(state.from.get(key)), b = Number(state.prev.get(key));
    if (isFinite(a) && isFinite(b)) return a + (b - a) * t;
    return state.prev.get(key);
}

/**
 * Is anything still moving?
 *
 * ⚠ The gate on redrawing an idle screen. A caller that does not consult this
 * pays a full draw every tick forever, which is the single largest cost of
 * animating anything.
 */
export function settled(state, now, durationMs) {
    const dur = (durationMs === undefined) ? 120 : durationMs;
    if (!state) return true;
    for (const since of state.since.values()) {
        const dt = now - since;
        if (dt >= 0 && dt < dur) return false;
    }
    return true;
}

/** Ease-out. Fast off the mark, settling rather than arriving. */
export function easeOut(t) { return 1 - (1 - t) * (1 - t); }

/** Clamped linear interpolation, so a caller cannot overshoot by accident. */
export function lerp(a, b, t) {
    const u = t < 0 ? 0 : (t > 1 ? 1 : t);
    return a + (b - a) * u;
}
