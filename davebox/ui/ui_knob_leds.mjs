/* ui_knob_leds.mjs — the KNOB RING colour rule, and nothing else.
 *
 * Ported from schwung's src/shared/param_pages/knob_leds.mjs (itself
 * schwung-movy src/renderer/knob-leds.ts, MIT (c) 2026 megadake, used with
 * permission), adapted to davebox's own bank pages.
 *
 * ⭑ WHY THIS IS ITS OWN FILE. `docs/UI_LANGUAGE.md` §9 lists `ui_leds.mjs` as
 * the one surface still doing direct LED writes with no shared helpers, and the
 * knob rings are the piece of it that is a pure function of a value. Pure, no
 * imports of state, no sends — so it is testable in node, and so the ring rule
 * has exactly one home the way the knob FEEL got one (`ui_discover.mjs`).
 * ui_leds.mjs keeps the sending and the caching; this file decides the colour.
 *
 * ⭑ VALUE RIDES ON TOP AS INTENSITY, AND THE FLOOR IS NOT ZERO. Every BOUND
 * knob stays lit however low its value, because the row identity has to survive
 * a parameter sitting at its minimum. Colour 0 is reserved for "nothing is
 * bound here" — a dark ring is a ring that will do nothing if you turn it.
 * ⭑⭑ AND THERE ARE THREE STATES, NOT TWO (2026-09-19). A knob can be bound and
 * still have no value: an ACTION knob whose turn fires an event, a custom-handled
 * one the generic store never sees, a step-edit knob before a step is held. Those
 * sit at the ramp's FLOOR (`RING_FLOOR`). So the ring answers "does this knob do
 * anything", and only then "where is it" — OFF is the promise, the floor is not.
 * ⚠ That is a real change from what davebox's param banks did before, which was
 * White when the value differed from its default and OFF otherwise. That rule
 * lit a bank on arrival at exactly zero knobs and could not say where anything
 * sat; the ramp says both. It is OUTPUT ONLY — no input path reads this.
 *
 * ⭑ KNOBS 1-4 WHITE, KNOBS 5-8 AMBER. The grid draws 8 params as two rows of
 * four; the hardware is one row of eight encoders, and nothing on the device
 * says which physical knob drives which drawn cell. The hue does.
 *
 * ⚠⚠ THE TWO RAMPS ARE ORDERED BY LUMINANCE, WHICH IS NOT THE SAME AS BY NAME.
 * Upstream's first version picked constants by what they were called and got
 * DarkBrown2 -> Mustard -> Ochre -> BrightOrange, i.e.
 * #250E05 -> #876700 -> #491804 -> #C93C00: the third step is DARKER than the
 * second, so a knob swept minimum to maximum went dim, bright, dark, bright.
 * Reported from the device as "the LEDs work but the curve is off / weird".
 * A ramp is ONE HUE's dark -> dim -> full. Verify a change by reading the hex
 * out of the palette header in constants.mjs, never by the name:
 *
 *     white  #141414  #404040  #595959  #CCCCCC  #FFFFFF
 *     amber  #200D00  #5D1700  #AC1F00  #C93C00
 *
 * (DarkGrey #1A1A1A is skipped: it is within 2% of DarkGrey2 #141414, so it
 * costs a step of the ramp and shows nothing for it.) The rows still differ by
 * HUE at every level, which is the property that has to survive — a white knob
 * at minimum must not be mistakable for an amber one at minimum.
 *
 * ⚠ CC 71-78 AND NOTHING ELSE. The same CC carries encoder rotation IN and the
 * indicator ring colour OUT. Notes 0-9 are the capacitive TOUCH sensors, input
 * only; movy wrote both and said the LED type was unconfirmed. It is confirmed,
 * so the notes half is dropped — it was eight wasted packets per change into a
 * buffer that holds about 64.
 */
import {
    White, LightGrey, DarkGrey2, DarkGrey3, OffWhite,
    BrightOrange, BurntSienna, DarkBrown, Tan,
} from '/data/UserData/schwung/shared/constants.mjs';

export const KNOB_LED_CC_BASE = 71;
export const NUM_KNOB_LEDS = 8;

export const KNOB_WHITE_LEVELS = [DarkGrey2, DarkGrey3, LightGrey, OffWhite, White];
export const KNOB_AMBER_LEVELS = [DarkBrown, BurntSienna, Tan, BrightOrange];

/* "This knob is BOUND, but there is no value to show" — see knobRingColor.
 * A string rather than a number so it can never be mistaken for a norm, and
 * never arrive by arithmetic. */
export const RING_FLOOR = 'floor';

/* The colour for one knob ring.
 *
 * @param k  physical knob index 0-7 (which picks the hue, not the level)
 * @param nv normalised 0..1; null/undefined when the knob is UNBOUND or its
 *           value could not be read (both colour 0 — an unlit ring already reads
 *           as "nothing to turn here", which is true of a key we could not read
 *           too, and lighting it at the bottom of its range would be a confident
 *           lie about where the value sits); or RING_FLOOR when the knob is bound
 *           but has no value at all.
 */
export function knobRingColor(k, nv) {
    const ramp = (k % NUM_KNOB_LEDS) < 4 ? KNOB_WHITE_LEVELS : KNOB_AMBER_LEVELS;
    /* ⭑⭑ THE THIRD STATE (Josh, 2026-09-19). A knob can DO something and still
     * have no value to report — an `action` knob that fires on a turn rather
     * than holding a position, a custom-handled one the generic store never
     * sees, a step-edit knob before a step is held. Those light at the ramp's
     * FLOOR: "there is something here", without a claim about where it sits.
     *
     * ⚠ So the rule is now about FUNCTION, not about VALUE:
     *     OFF    — this knob does nothing on this page
     *     floor  — it does something; nothing to say about its value
     *     above  — it has a value, and this is where it sits
     * A bound knob resting at its minimum is therefore indistinguishable from a
     * valueless one. Accepted deliberately: the banks that needed this never
     * reported values at all, and Josh asked for orientation, not readout
     * ("they don't need to respond to the param values there, but they do need
     * the 4 (white) / 4 (orange) coloring ... so it's easier to orient
     * yourself"). What must NOT blur is OFF against lit — that one is a
     * promise. */
    if (nv === RING_FLOOR) return ramp[0];
    if (nv === null || nv === undefined || !isFinite(nv)) return 0;
    const v = nv < 0 ? 0 : (nv > 1 ? 1 : nv);
    /* ⚠ The step boundaries are DERIVED from the ramp, not written beside it.
     * Upstream wrote them beside it — `v < 0.33` / `v < 0.67` against a 3-entry
     * white ramp and quarters against a 4-entry amber one — so lengthening
     * either ramp silently left its last entries unreachable. The ramp and its
     * thresholds are ONE fact and belong in one place. */
    return ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
}

/* A bank knob's value as 0..1 — or null when the knob is ABSENT, or RING_FLOOR
 * when it is there but has no value.
 *
 * ⚠ NULL IS NOT ZERO, and this is where that distinction is made for davebox:
 * an empty slot has no value, and returning 0 would light its ring at the floor
 * of the ramp — indistinguishable from a real param sitting at its minimum.
 * ⚠ A degenerate range (min === max) is NOT unbound, which is what it used to be
 * treated as: it is an action knob, and turning it does something. */
export function knobRingNorm(knob, value) {
    /* ⚠⚠ `scope: 'stub'` DOES NOT MEAN "does nothing" — it means "the generic
     * handler skips it". Bank 7's K1/K4/K5/K6/K7 are stubs AND fully working
     * knobs, handled by their own code. Reading the flag as "absent" is how
     * five live knobs came out dark. The `custom` flag says which is which. */
    if (knob && knob.custom) return RING_FLOOR;
    if (!knob || !knob.abbrev || knob.scope === 'stub') return null;
    if (value === null || value === undefined || !isFinite(Number(value))) return null;
    const span = knob.max - knob.min;
    /* A degenerate range is an ACTION knob (Beat Stretch, Clock Shift, Legato):
     * the turn fires an event, so there is no position to report — but it is
     * emphatically not "nothing here". */
    if (!(span > 0)) return RING_FLOOR;
    const n = (Number(value) - knob.min) / span;
    return n < 0 ? 0 : (n > 1 ? 1 : n);
}


/* ---- rings for the KIT-PAGE banks (STEP, SOUND + CONFIG, MACROS) --------
 *
 * Those banks draw their eight cells themselves (ui_render, ui_sound), so the
 * rings read the SAME cells: a provider per bank, registered at module init
 * (a registry, because ui_leds must not import either of them — both import
 * ui_leds). A cell's norm: arc/vbar/pill → norm, arcbip → the signed value
 * re-centred, a list (valsq/enumsq with options) → sel over its span; a cell
 * with nothing to say (blank, `--`, a text-only value) is null → unlit.
 * `auto` on a cell (an ACTIVE automation) asks for the BLINK (Josh,
 * 2026-09-03: "blink any knob that has automation"). */
const ringCellProviders = {};
export function registerRingCells(bank, fn) { ringCellProviders[bank] = fn; }
export function ringCellsFor(bank) {
    const fn = ringCellProviders[bank];
    if (!fn) return null;
    try { return fn() || null; } catch (e) { return null; }
}
export function ringNormOfCell(cell) {
    if (!cell) return null;
    /* ⚠⚠ AN EXPLICIT MARKER, BECAUSE THE CELL SHAPE LIES (Josh, 2026-09-19:
     * "the step each work to set pitch so should be lit"). `kind: 'blank'` was
     * doing two incompatible jobs: a knob that genuinely is not there (the drum
     * step page's K4/K8) and a knob whose VALUE is drawn as big text instead of
     * an arc (the melodic step page's Note and Oct, which nudge every note in
     * the step by a scale degree and by an octave respectively). Believing the
     * shape made the ring promise those two do nothing.
     *
     * ⭐ `ringBound` is a FALLBACK, not an override: it answers only where there
     * is no value to read. An override would flatten a cell that HAS a value to
     * its dimmest step the moment someone marked it — the marker says "this knob
     * exists", never "ignore where it sits". */
    const n = ringNormOfCellValue(cell);
    if (n !== null) return n;
    return cell.ringBound ? RING_FLOOR : null;
}
function ringNormOfCellValue(cell) {
    if (cell.kind === 'blank') return null;
    if (cell.text === '--' && !cell.options) return null;
    switch (cell.kind) {
        case 'arc': case 'vbar': case 'faderail': case 'hbar':
            return (typeof cell.norm === 'number') ? Math.max(0, Math.min(1, cell.norm)) : null;
        case 'pill':
            return cell.norm ? 1 : 0;
        case 'arcbip':
            return (typeof cell.signed === 'number') ? Math.max(0, Math.min(1, (cell.signed + 1) / 2)) : null;
        case 'valsq': case 'enumsq': case 'frac': case 'dirsq':
            if (cell.options && cell.options.length > 1 && typeof cell.sel === 'number' && cell.sel >= 0)
                return Math.max(0, Math.min(1, cell.sel / (cell.options.length - 1)));
            return null;
        default:
            return null;
    }
}
