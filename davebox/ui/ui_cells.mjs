/* ui_cells.mjs — layer C: param descriptor + live value -> ui_movy render cell.
 *
 * ui_movy.mjs draws from precomputed descriptors and reads nothing itself, so
 * this is the only place that knows how a canvaskit `kind` becomes pixels.
 * Pure functions — no engine access, no state. That makes it testable in node
 * and makes it survive the standalone port untouched.
 *
 * Render-cell shape expected by drawKitBankPage (see ui/ui_movy.mjs header):
 *   { kind: 'blank'|'arc'|'arcbip'|'hbar'|'pill'|'vbar'|'enumsq'|'valsq'
 *           |'frac'|'dirsq'|'opaque',
 *     label, name, text, norm, signed, sq, options, sel,
 *     modNorm, modulated }   <- the modulation dot + the label's `~`, both
 *                               off unless a caller passes a live value 
 */

/* ---- value parsing -----------------------------------------------------
 * Engine values arrive as strings. Enums are the awkward case: a module may
 * report the option NAME on read while accepting an INDEX on write (movy hit
 * this on Forge). So resolve names against the option list, and fall back to
 * numeric parsing. */
export function parseValue(cell, raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    if (cell.options && cell.options.length) {
        const idx = cell.options.indexOf(s);
        if (idx >= 0) return idx;
        /* case-insensitive second pass before giving up on a name match */
        const lower = s.toLowerCase();
        for (let i = 0; i < cell.options.length; i++) {
            if (String(cell.options[i]).toLowerCase() === lower) return i;
        }
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

/* Clamp + quantize to the cell's own grid. Discrete kinds CLAMP at the ends —
 * never wrap — which is canvaskit's rule and matters for feel: wrapping turns
 * an overshoot into a jump across the whole range. */
export function clampValue(cell, v) {
    if (v == null) return null;
    let out = v;
    if (out < cell.min) out = cell.min;
    if (out > cell.max) out = cell.max;
    if (cell.type !== 'float') out = Math.round(out);
    return out;
}

/* Move `steps` grid positions from `value`. Returns the new value, clamped. */
export function stepValue(cell, value, steps) {
    if (!steps) return value;
    const base = value == null ? cell.min : value;
    const inc = cell.step || (cell.type === 'float' ? (cell.max - cell.min) / 100 : 1);
    return clampValue(cell, base + inc * steps);
}

/* The string written back to the engine. Enums commit by INDEX — the numeric
 * form is what every module's set_param parses. */
export function commitString(cell, value) {
    if (value == null) return '';
    if (cell.type === 'enum' || cell.type === 'int') return String(Math.round(value));
    /* Trim float noise; the engine re-clamps anyway. */
    return String(Math.round(value * 10000) / 10000);
}

/* ---- the pill / bar split ----------------------------------------------
 *
 * ⭑⭑ WHICH TWO-STATE CELLS BECOME A SWITCH PILL, and it is a RULE rather than
 * a per-cell taste — mechanical, so a new param decides itself and nobody has
 * to remember.
 *
 * A pill says its state with AREA: the track filled is one state, the track
 * empty is the other, and the slug is a knockout in the first and ink in the
 * second. That is loud, readable across the room, and completely dumb — it
 * carries "which of two" and nothing else. So it is right for a param whose two
 * states ARE off and on, and wrong for one whose two states are WORDS, where
 * the word IS the information: a pill on Reverse Style says "the second one"
 * where the cell has to say "Audio".
 *
 * ⭑ SO A WORD PAIR GETS THE ENUM BOX, NOT THE BAR IT USED TO GET. This is the
 * part of the split that fixes something rather than merely restyling it. The
 * old two-state bar showed a FILL LEVEL for a pair of names — Step/Audio,
 * Mono/Poly, LP/HP all drew as "bar full" or "bar empty" and the word appeared
 * only while the knob was held. That is upstream's "widget that tells you
 * nothing" exactly: it does not say what the other state is, and it does not
 * say which one you are on. The box prints the word.
 *
 * Both members of the pair must be in the vocabulary. Half a pair is not a
 * boolean — "Off"/"Lock" is a toggle whose ON state is NAMED, and naming it was
 * a choice, so it takes the box and keeps its name.
 *
 * ⚠ Ported verbatim from upstream's BOOL_OPTION (src/shared/param_pages/viz.mjs)
 * so the two surfaces cannot drift to different ideas of what a boolean is.
 * Upstream needs the same rule for its knob FEEL as well as its picture, and
 * says so on the export: "the feel and the picture must agree on what a boolean
 * is". Here the feel is already settled in ui_discover (a <=2-option enum is
 * SENS_DELIBERATE whatever it is called), so this is the picture only.
 * ⚠ A pair of DIGITS counts: a module that spells its toggle ["0","1"] means a
 * boolean, and drawing that as a bar labelled "1" is the widget that tells you
 * nothing — it does not say what the other state is, or that there are only two.
 */
export const BOOL_OPTION = /^(off|on|no|yes|0|1|false|true|disabled|enabled)$/i;

export function isBooleanPair(a, b) {
    if (a == null || b == null) return false;
    return BOOL_OPTION.test(String(a).trim()) && BOOL_OPTION.test(String(b).trim());
}

/* ---- display formatting ---- */

export function formatValue(cell, value) {
    if (value == null) return '--';
    if (cell.options && cell.options.length) {
        const i = Math.round(value);
        if (i >= 0 && i < cell.options.length) return String(cell.options[i]);
        return String(i);
    }
    if (cell.kind === 'oct') return (value > 0 ? '+' : '') + String(Math.round(value));
    if (cell.type === 'int' || cell.type === 'enum') return String(Math.round(value));
    const span = Math.abs(cell.max - cell.min);
    if (span >= 1000) return String(Math.round(value));
    if (span >= 100)  return String(Math.round(value * 10) / 10);
    return String(Math.round(value * 100) / 100);
}

/* Everything this file hands to the header font must be UPPERCASE.
 *
 * That font carries TRUE lowercase glyphs for exactly 'd' and 't' — davebox
 * needs them for the triplet/dotted fraction suffixes ("1/4t", "1/4d"), so the
 * fix cannot live in hdrPrint. Every other lowercase letter falls back to its
 * capital, which is why raw module names render as "EdIt", "FILtER",
 * "PItch MOd" — the two odd letters out.
 *
 * Applied to the RENDER cell only. The param model keeps its original strings,
 * because parseValue matches DSP-reported enum names against them. */
function up(s) { return String(s == null ? '' : s).toUpperCase(); }

function basename(p) {
    const s = String(p || '');
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
}

/* ---- descriptor -> render cell ---- */

/* `modValue` — the param's LIVE value while a source is moving it, in the same
 * units as `value` (which stays the BASE, the number a knob turn edits).
 *
 * ⭑ THE DESCRIPTOR CARRIES A NUMBER, NOT A DECISION. Passing it lights two
 * things in ui_movy: the modulation dot riding the arc, and the `~` on the
 * label strip. Omitting it — which every davebox caller does today, because
 * davebox has no per-cell modulation source — leaves both off and every cell
 * renders exactly as before. That is the whole wiring: a bank that GAINS a
 * source needs a value here, not a widget anywhere.
 *
 * ⚠ null IS NOT zero. `undefined`/`null`/`''` mean "no source", and a bare
 * Number('') is 0 — which would confidently draw the dot pinned at the bottom
 * of the range on every unmodulated cell on the page.
 * ⚠ COINCIDENCE IS NOT ABSENCE. A source sitting exactly on the base still gets
 * the dot and the tilde, so the marks mean "modulated", not "moving right
 * now". */
export function toRenderCell(cell, value, rawValue, modValue) {
    if (!cell || cell.kind === 'blank' || !cell.key) return null;

    const label = up(cell.short || cell.label || '');
    const name = up(cell.label || cell.key);
    const span = cell.max - cell.min;
    const norm = (value == null || span <= 0) ? 0 : (value - cell.min) / span;
    const modulated = modValue != null && modValue !== '' && isFinite(Number(modValue));
    const modNorm = (!modulated || span <= 0) ? null
        : Math.max(0, Math.min(1, (Number(modValue) - cell.min) / span));
    const text = up(formatValue(cell, value));
    const sel = (cell.options && value != null) ? Math.round(value) : -1;
    /* Render-side option list for the picker overlay (hdrPrint). */
    const opts = cell.options ? cell.options.map(up) : null;

    switch (cell.kind) {
        case 'tog':
            /* ⚠ `tog` is EVERY two-option enum, not only a declared boolean —
             * ui_discover folds `type: 'enum'` with n <= 2 into it, so a
             * Mono/Poly or a Step/Audio arrives here looking exactly like an
             * Off/On. isBooleanPair is what tells them apart; without it the
             * pill would swallow every two-choice param in every module and
             * silently drop the word that names the choice. The options list is
             * the authority, and it is ALWAYS present for a tog (the toggle
             * branch of ui_discover synthesises ['Off','On'] when the module
             * declares none). */
            if (cell.options && cell.options.length === 2 &&
                    !isBooleanPair(cell.options[0], cell.options[1])) {
                /* A pair of WORDS: the framed micro-font square, same as any
                 * other named enum. It is the same widget a 3-option enum gets,
                 * which is right — "two named choices" and "five named choices"
                 * differ in count, not in kind. */
                return { kind: 'enumsq', label, name, text, options: opts, sel };
            }
            return { kind: 'pill', label, name, text, norm: value ? 1 : 0,
                     options: opts, sel };

        case 'enumc':
            return { kind: 'enumsq', label, name, text, options: opts, sel };

        case 'len':
            return { kind: 'frac', label, name, text, options: opts, sel };

        case 'dir':
            return { kind: 'dirsq', label, name, text, options: opts, sel };

        case 'count':
        case 'oct':
            /* valsq is frameless and spans the full cell — the big read-out.
             * Options are synthesized so the picker overlay still works: a
             * short numeric range browses exactly like a named enum. */
            return { kind: 'valsq', label, name, text,
                     options: numericOptions(cell), sel: numericSel(cell, value) };

        case 'file':
            /* ⭑⭑ THE TRI-STATE IS SPELLED OUT, and this is the cell where
             * collapsing it is most visible — a sample slot with no file used
             * to look exactly like a sample slot whose name had not arrived
             * yet. Both said "--".
             *
             *     a path      the basename
             *     ''          NONE — nothing is chosen. A real reading.
             *     null/undef  --   — the read has not answered. We do not know.
             *
             * ⚠ `rawValue === ''` ONLY means NONE. A failed read keeps "--",
             * because "there is no file" is a fact about the module and we do
             * not have it. The old `rawValue ? ... : '--'` collapsed both,
             * because '' is falsy.
             *
             * `opaque` (not `enumsq`): a file is a value you cannot TURN, so it
             * gets the chevron-broken box that says so. `opens` adds the corner
             * brackets — the door mark is a separate statement from the
             * chevron, which is the widget itself. */
            return { kind: 'opaque', label, name,
                     text: (rawValue === null || rawValue === undefined) ? '--'
                         : (rawValue === '' ? 'NONE' : up(basename(rawValue))),
                     options: null, sel: -1, opens: true };

        case 'bip': {
            const centre = (cell.min + cell.max) / 2;
            const half = span / 2;
            const signed = (value == null || half <= 0) ? 0 : (value - centre) / half;
            return { kind: 'arcbip', label, name, text, signed, modNorm, modulated };
        }

        case 'fader':
            /* Vertical bar, bottom-up — mix/level feel (canvaskit drawVBar). */
            return { kind: 'vbar', label, name, text, norm, modNorm, modulated };

        case 'uni':
        default:
            return { kind: 'arc', label, name, text, norm, modNorm, modulated };
    }
}

/* A count/oct cell's range as a browsable option list (<=16 entries by
 * construction — see ui_discover's span check). */
function numericOptions(cell) {
    const n = Math.round(cell.max - cell.min) + 1;
    if (n < 2 || n > 32) return null;
    const out = [];
    for (let i = 0; i < n; i++) {
        const v = cell.min + i;
        out.push(cell.kind === 'oct' && v > 0 ? '+' + v : String(v));
    }
    return out;
}

function numericSel(cell, value) {
    if (value == null) return -1;
    return Math.round(value - cell.min);
}

/* Build the 8-cell render array for a bank. `values` is keyed by param key. */
export function renderCellsForBank(bank, values, rawValues, modValues) {
    const out = [];
    for (let i = 0; i < 8; i++) {
        const cell = bank.cells[i];
        if (!cell || !cell.key) { out.push(null); continue; }
        out.push(toRenderCell(cell, values[cell.key], rawValues && rawValues[cell.key],
                              modValues && modValues[cell.key]));
    }
    return out;
}
