/* ui_cells.mjs — layer C: param descriptor + live value -> ui_movy render cell.
 *
 * ui_movy.mjs draws from precomputed descriptors and reads nothing itself, so
 * this is the only place that knows how a canvaskit `kind` becomes pixels.
 * Pure functions — no engine access, no state. That makes it testable in node
 * and makes it survive the standalone port untouched.
 *
 * Render-cell shape expected by drawKitBankPage (see ui/ui_movy.mjs header):
 *   { kind: 'blank'|'arc'|'arcbip'|'hbar'|'enumsq'|'valsq'|'frac'|'dirsq',
 *     label, name, text, norm, signed, sq, options, sel }
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

export function toRenderCell(cell, value, rawValue) {
    if (!cell || cell.kind === 'blank' || !cell.key) return null;

    const label = up(cell.short || cell.label || '');
    const name = up(cell.label || cell.key);
    const span = cell.max - cell.min;
    const norm = (value == null || span <= 0) ? 0 : (value - cell.min) / span;
    const text = up(formatValue(cell, value));
    const sel = (cell.options && value != null) ? Math.round(value) : -1;
    /* Render-side option list for the picker overlay (hdrPrint). */
    const opts = cell.options ? cell.options.map(up) : null;

    switch (cell.kind) {
        case 'tog':
            return { kind: 'hbar', label, name, text, norm: value ? 1 : 0,
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
            return { kind: 'enumsq', label, name,
                     text: rawValue ? up(basename(rawValue)) : '--', options: null, sel: -1 };

        case 'bip': {
            const centre = (cell.min + cell.max) / 2;
            const half = span / 2;
            const signed = (value == null || half <= 0) ? 0 : (value - centre) / half;
            return { kind: 'arcbip', label, name, text, signed };
        }

        case 'uni':
        case 'fader':
        default:
            return { kind: 'arc', label, name, text, norm };
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
export function renderCellsForBank(bank, values, rawValues) {
    const out = [];
    for (let i = 0; i < 8; i++) {
        const cell = bank.cells[i];
        if (!cell || !cell.key) { out.push(null); continue; }
        out.push(toRenderCell(cell, values[cell.key], rawValues && rawValues[cell.key]));
    }
    return out;
}
