/* ui_strip.mjs — THE CHANNEL STRIP's controls: a one-knob comp, then a 3-band
 * EQ with a swept mid, on every track's bus (the host's mix_strip.h runs it,
 * after the track's FX and before its fader).
 *
 * Josh, 2026-11-15: "3 band eq (with mid freq) and single knob bus compressor
 * on each track bus ... work like typical analog mixer channel controls" ·
 * placement "second page of mix" · Session View "2 new mixer banks: EQ, and
 * Compress" (EQ "4 pages - Low, Mid, Mid Freq, High", "just jog to switch
 * pages") · "a pop-up visual EQ curve display ... when any of those are
 * adjusted" · gain reduction as "a point that moves on the knob itself" ·
 * "yamaha voicing" · "comp before eq".
 *
 * One table for every surface (MIX page 2, the Session mixer's EQ / COMPRESS
 * modes, automation, snapshots, morphs, export): the keys, ranges, steps and
 * readouts, and the EQ's response for the curve card — the same RBJ formulas
 * mix_strip.h runs, so the picture is the sound. */

/* Constants mirrored from src/host/mix_strip.h (pinned by
 * tests/js/test_channel_strip.mjs against the header). */
export const STRIP_SR = 44100;
export const STRIP_EQ_DB_MAX = 15;
export const STRIP_LOW_HZ = 80;
export const STRIP_HIGH_HZ = 12000;
export const STRIP_MID_LO_HZ = 125;
export const STRIP_MID_SPAN = 64;
export const STRIP_MID_Q = 0.9;
/* gain reduction a full arc of the comp's dot stands for */
export const STRIP_GR_ARC_DB = 12;

export const stripMidHz = (p) => STRIP_MID_LO_HZ * Math.pow(STRIP_MID_SPAN, Math.max(0, Math.min(1, p)));

export const STRIP_DB_FMT = (v) => {
    const r = Math.round((v || 0) * 10) / 10;
    if (r === 0) return '0dB';
    return (r > 0 ? '+' : '') + r.toFixed(1) + 'dB';
};
/* Hz to three figures, so one detent (~2 %) always moves the readout:
 * "125Hz" .. "999Hz", "1.02k" .. "8.00k". */
export const STRIP_HZ_FMT = (p) => {
    const f = stripMidHz(p);
    return f < 999.5 ? Math.round(f) + 'Hz' : (f / 1000).toFixed(2) + 'k';
};
export const STRIP_COMP_FMT = (v) => (v > 0 ? Math.max(1, Math.round(v * 100)) + '%' : 'OFF');

/* The five controls, in mix_strip.h's field order. `step` is one detent
 * (Shift: a fifth of it); a gain stops at 0 dB on its way across (a console's
 * centre detent). */
export const STRIP_SPECS = [
    { key: 'eq_low',      label: 'Low',  name: 'Low',      sess: 'EQ LOW',  widget: 'arcbip', def: 0,   min: -15, max: 15, step: 0.5,   fmt: STRIP_DB_FMT, detent: 0 },
    { key: 'eq_mid',      label: 'Mid',  name: 'Mid',      sess: 'EQ MID',  widget: 'arcbip', def: 0,   min: -15, max: 15, step: 0.5,   fmt: STRIP_DB_FMT, detent: 0 },
    { key: 'eq_mid_freq', label: 'Freq', name: 'Mid Freq', sess: 'EQ FREQ', widget: 'arc',    def: 0.5, min: 0,   max: 1,  step: 0.005, fmt: STRIP_HZ_FMT },
    { key: 'eq_high',     label: 'High', name: 'High',     sess: 'EQ HIGH', widget: 'arcbip', def: 0,   min: -15, max: 15, step: 0.5,   fmt: STRIP_DB_FMT, detent: 0 },
    { key: 'comp',        label: 'Comp', name: 'Compress', sess: 'COMPRESS', widget: 'arc',   def: 0,   min: 0,   max: 1,  step: 0.01,  fmt: STRIP_COMP_FMT },
];
export const STRIP_KEYS = STRIP_SPECS.map((s) => s.key);
export const STRIP_EQ_KEYS = STRIP_KEYS.slice(0, 4);
export const stripSpec = (key) => STRIP_SPECS.find((s) => s.key === key) || null;
export const isStripKey = (key) => STRIP_KEYS.includes(String(key || '').replace(/^.*:/, ''));
export const isStripEqKey = (key) => STRIP_EQ_KEYS.includes(String(key || '').replace(/^.*:/, ''));

/* One detent of `spec` from v (Shift: fine), clamped, with the gains' centre
 * detent: a turn that would cross 0 dB stops on it. Values land on the step
 * grid, so a turn back returns exactly. */
export function stripStep(spec, v, delta, fine) {
    const st = spec.step * (fine ? 0.2 : 1);
    let nv = Math.round(((v || 0) + delta * st) / st) * st;
    if (spec.detent !== undefined && v !== spec.detent && (v - spec.detent) * (nv - spec.detent) < 0) nv = spec.detent;
    nv = Math.max(spec.min, Math.min(spec.max, nv));
    return Math.round(nv * 10000) / 10000;
}

/* The cell a knob shows. `gr` (dB, <= 0) puts the comp's dot on its arc. */
export function stripCell(spec, v, gr) {
    const cell = { label: spec.label, name: spec.name.toUpperCase(), text: spec.fmt(v) };
    if (spec.widget === 'arcbip') { cell.kind = 'arcbip'; cell.signed = Math.max(-1, Math.min(1, v / spec.max)); }
    else { cell.kind = 'arc'; cell.norm = Math.max(0, Math.min(1, (v - spec.min) / (spec.max - spec.min))); }
    /* the kit's modulation dot (drawModDot) is the mark that rides an arc:
     * here it says how far the comp is pulling down now */
    if (spec.key === 'comp' && v > 0 && isFinite(gr)) cell.dot = cell.modNorm = Math.max(0, Math.min(1, -gr / STRIP_GR_ARC_DB));
    return cell;
}

/* ---- the EQ's response (the curve card) --------------------------------- */

/* RBJ cookbook, as mix_strip.h's mix_biquad_design: kind 0 low shelf, 1 peak,
 * 2 high shelf; the shelves at slope 1. */
export function stripBiquad(kind, hz, db, q) {
    const A = Math.pow(10, db / 40);
    const w = 2 * Math.PI * hz / STRIP_SR;
    const cw = Math.cos(w), sw = Math.sin(w);
    let b0, b1, b2, a0, a1, a2;
    if (kind === 1) {
        const al = sw / (2 * q);
        b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A;
        a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
    } else {
        const al = sw * Math.SQRT1_2, sa = 2 * Math.sqrt(A) * al;
        if (kind === 0) {
            b0 = A * ((A + 1) - (A - 1) * cw + sa); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sa);
            a0 = (A + 1) + (A - 1) * cw + sa;      a1 = -2 * ((A - 1) + (A + 1) * cw);    a2 = (A + 1) + (A - 1) * cw - sa;
        } else {
            b0 = A * ((A + 1) + (A - 1) * cw + sa); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sa);
            a0 = (A + 1) - (A - 1) * cw + sa;      a1 = 2 * ((A - 1) - (A + 1) * cw);      a2 = (A + 1) - (A - 1) * cw - sa;
        }
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function biquadDb(c, hz) {
    const w = 2 * Math.PI * hz / STRIP_SR;
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2);
    const dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/* The EQ's gain in dB at `hz` for values {eq_low, eq_mid, eq_mid_freq, eq_high}. */
export function stripEqDb(v, hz) {
    let db = 0;
    if (v.eq_low)  db += biquadDb(stripBiquad(0, STRIP_LOW_HZ, v.eq_low, 0), hz);
    if (v.eq_mid)  db += biquadDb(stripBiquad(1, stripMidHz(v.eq_mid_freq ?? 0.5), v.eq_mid, STRIP_MID_Q), hz);
    if (v.eq_high) db += biquadDb(stripBiquad(2, STRIP_HIGH_HZ, v.eq_high, 0), hz);
    return db;
}

/* The curve as `n` points across 20 Hz .. 20 kHz (log), each in dB. */
export function stripEqCurve(v, n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = stripEqDb(v, 20 * Math.pow(1000, i / (n - 1)));
    return out;
}

/* Values from a host `strip` read ("low mid freq high comp"); defaults for
 * anything missing. */
export function stripParseWire(raw) {
    const parts = String(raw || '').trim().split(/\s+/);
    const out = {};
    STRIP_SPECS.forEach((s, k) => { const v = parseFloat(parts[k]); out[s.key] = isFinite(v) ? Math.max(s.min, Math.min(s.max, v)) : s.def; });
    return out;
}
