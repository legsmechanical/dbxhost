// tools/render_widgets.mjs — one offline PNG per widget in the 2026-08-29
// style-port, so every one of them can be judged before it reaches hardware.
//
// Cases are prefixed `w` (the style-CALL renders Josh judged the port from) and
// `a` (the ADOPTION renders: what the approved looks do to a live screen). An
// `a` case's BEFORE is drawn through the primitive's own escape hatch — the
// plain `drawVBar`, `filt.fill:false`, `dottedRail:false`, a literal `hbar`
// kind — so the two frames come out of ONE process and one build, and the pair
// is a genuine A/B rather than two runs of two trees that might differ in
// something else as well.
//
// ⭑⭑ RENDERS ARE THE DELIVERABLE. The port is "pixels on, behaviour off": every
// item here is either a look that an existing screen ADOPTS (in which case
// there is a BEFORE and an AFTER pair, and the pair is the argument) or a
// MOCKUP of a look nothing adopts yet (in which case the render is the whole
// point — Josh picks per widget, and the primitive is deleted if the answer is
// no). Nothing here is wired into a shipping screen by being drawn here.
//
// ⚠ THE CLOCK IS FROZEN. drawKitPageBar blinks its active segment off
// Date.now(), so two runs of the same case produce two different PNGs and any
// diff between a before and an after is noise. Discovered the hard way while
// checking this port for regressions: eight "changed" manual screens, all of
// them the blink phase.
//
// Run:  node tools/render_widgets.mjs [outDir]
// Default outDir: docs/working/img/widgets
import { mkdirSync } from 'node:fs';
import { W, H, resetFb, currentFb, writePng, freezeClock } from './render_fb.mjs';

freezeClock();
const kit = await import('../ui/ui_movy.mjs');
const cellsMod = await import('../ui/ui_cells.mjs');
/* ⚠ NOT wrapped in a catch. An import that fails here would silently drop the
 * knob-ring case from the output, and a render set with a case missing looks
 * exactly like a render set that ran — which is how item 7 nearly shipped
 * unjudged. It needs the device-specifier loader (see render_loader.mjs); run
 * this script through it. */
const leds = await import('../ui/ui_knob_leds.mjs');
const anim = await import('../ui/ui_anim.mjs');

const OUT = process.argv[2] || 'docs/working/img/widgets';
mkdirSync(OUT, { recursive: true });

let n = 0;
const emit = (file, note, drawFn) => {
    resetFb();
    drawFn();
    writePng(currentFb(), `${OUT}/${file}.png`);
    console.log(`  ${(file + '.png').padEnd(34)} ${note}`);
    n++;
};

/* ---------------------------------------------------------------- helpers */
const arc = (label, name, text, norm, extra) =>
    Object.assign({ kind: 'arc', label, name, text, norm }, extra || {});
const arcbip = (label, name, text, signed, extra) =>
    Object.assign({ kind: 'arcbip', label, name, text, signed }, extra || {});
const blank = () => ({ kind: 'blank', label: '' });

/* A plain 8-cell page in the shape of a real davebox bank, so a widget is
 * judged in the company it will keep rather than alone on a black field. */
function page(header, cells, opts) {
    kit.drawKitBankPage(cells, Object.assign({
        headerText: header, pageIdx: 2, pageCount: 6, touchedIdx: -1,
    }, opts || {}));
}

/* ============================ 1. MODULATION DOT ========================== */
const MOD_CELLS_BASE = [
    arc('Cutf', 'Cutoff', '62', 0.62),
    arc('Reso', 'Resonance', '18', 0.18),
    arcbip('Pan', 'Pan', '-20', -0.2),
    arc('Drive', 'Drive', '90', 0.90),
    arc('Amt', 'LFO Amount', '45', 0.45),
    arc('Rate', 'LFO Rate', '30', 0.30),
    arcbip('Tune', 'Fine Tune', '+0', 0),
    arc('Mix', 'Dry / Wet', '75', 0.75),
];
/* ⚠ Cell 3 (Drive) carries a dot at EXACTLY its own value. That is the case
 * the port exists to get right: the mark must still be drawn, because its
 * absence has to mean "nothing is modulating this" and never "the source
 * happens to be sitting on the base right now". */
const MOD_CELLS_AFTER = [
    Object.assign({}, MOD_CELLS_BASE[0], { modNorm: 0.86, modulated: true }),
    Object.assign({}, MOD_CELLS_BASE[1], { modNorm: 0.04, modulated: true }),
    Object.assign({}, MOD_CELLS_BASE[2], { modNorm: 0.75, modulated: true }),
    Object.assign({}, MOD_CELLS_BASE[3], { modNorm: 0.90, modulated: true }),
    MOD_CELLS_BASE[4], MOD_CELLS_BASE[5], MOD_CELLS_BASE[6], MOD_CELLS_BASE[7],
];
emit('w1-moddot-before', 'item 1 — arcs today (no descriptor field set)',
     () => page('FILTER', MOD_CELLS_BASE));
emit('w1-moddot-after', 'item 1 — top row modulated; cell 4 dot coincides with the pointer',
     () => page('FILTER', MOD_CELLS_AFTER));
/* The dot's full travel, so the "hugs the ring, never touches it" claim can be
 * checked at every angle rather than at the four the page happens to show. */
emit('w1-moddot-sweep', 'item 1 — one knob, dot at 0/12/25/.../100%', () => {
    kit.drawKitHeader('MOD DOT SWEEP', false);
    for (let i = 0; i < 8; i++) {
        const col = i % 4, rowY = i < 4 ? kit.MV_ROW0_Y : kit.MV_ROW1_Y;
        const kx = col * kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
        kit.drawArcKnob(kx, rowY, 0.5, false);
        kit.drawModDot(kx, rowY, i / 7);
    }
});

/* ============================ 2. FILTER + EQ ============================= */
const FILT_CELLS = [
    arc('Cutf', 'Cutoff', '58', 0.58), arc('Reso', 'Resonance', '40', 0.40),
    blank(), blank(),
    arc('Env', 'Env Amount', '30', 0.30), arc('Key', 'Key Track', '50', 0.5),
    blank(), blank(),
];
const FILT_VIZ = { start: 0, cutoffNorm: 0.58, resoNorm: 0.4, mode: 'lp' };
emit('w2-filter-before', 'item 2 — the filter curve as it ships (stroke only)',
     () => page('FILTER', FILT_CELLS, { filt: FILT_VIZ }));
emit('w2-filter-after-fill', 'item 2 — same curve, ghost fill opted in (viz.fill)',
     () => page('FILTER', FILT_CELLS, { filt: Object.assign({ fill: true }, FILT_VIZ) }));

const EQ_CELLS = [
    arcbip('Low', 'Low Gain', '+4', 0.4), arcbip('Mid', 'Mid Gain', '-6', -0.6),
    arcbip('High', 'High Gain', '+7', 0.7), arc('Out', 'Output', '70', 0.7),
    blank(), blank(), blank(), blank(),
];
emit('w2-eq-stroke', 'item 2 — NEW: the EQ curve, stroke only (3 bands over 3 cells)',
     () => page('EQ', EQ_CELLS, { eq: { start: 0, count: 3, low: 0.4, mid: -0.6, high: 0.7 } }));
emit('w2-eq-fill', 'item 2 — the EQ curve with the shared ghost fill (bipolar: cuts fill down)',
     () => page('EQ', EQ_CELLS, { eq: { start: 0, count: 3, low: 0.4, mid: -0.6, high: 0.7, fill: true } }));
emit('w2-eq-flat', 'item 2 — all three bands at 0: the centre line and nothing else',
     () => page('EQ', EQ_CELLS.map((c, i) => (i < 3 ? arcbip(c.label, c.name, '0', 0) : c)),
                { eq: { start: 0, count: 3, low: 0, mid: 0, high: 0, fill: true } }));

/* ============================== 3. SAMPLE =============================== */
/* Deterministic pseudo-peaks — a decaying hit with a second transient, so the
 * cursor complement can be seen crossing both a loud and a quiet column. */
const PEAKS = Array.from({ length: 62 }, (_, i) => {
    const t = i / 61;
    const a = Math.exp(-t * 3.2) * (0.55 + 0.45 * Math.abs(Math.sin(t * 19)));
    const b = t > 0.55 ? Math.exp(-(t - 0.55) * 9) * 0.8 : 0;
    return Math.min(1, a + b);
});
const SAMP_CELLS = [
    { kind: 'enumsq', label: 'File', name: 'Sample File', text: 'KICK 03', options: null, sel: -1 },
    arc('Start', 'Sample Start', '20', 0.20),
    blank(), blank(),
    arc('Spray', 'Spray', '12', 0.12), arc('Pitch', 'Pitch', '50', 0.5),
    arc('Lvl', 'Level', '80', 0.8), arc('Mix', 'Dry / Wet', '100', 1),
];
emit('w3-sample-empty', 'item 3 — NO peaks and NO markers: draws NOTHING (no placeholder art)',
     () => page('SAMPLE', SAMP_CELLS, { samp: { start: 2, count: 2 } }));
emit('w3-sample-peaks', 'item 3 — body + playhead (cursor is the body’s complement)',
     () => page('SAMPLE', SAMP_CELLS, { samp: { start: 2, count: 2, peaks: PEAKS, pos: 0.34 } }));
emit('w3-sample-spray-loop', 'item 3 — dotted spray fences either side of the cursor, loop brackets pointing inward',
     () => page('SAMPLE', SAMP_CELLS, { samp: { start: 2, count: 2, peaks: PEAKS,
          pos: 0.45, spray: 0.14, loopStart: 0.12, loopEnd: 0.82 } }));
emit('w3-sample-basemark', 'item 3 — coarse 2-on-2-off dash = where the knob is SET while a source moves the cursor',
     () => page('SAMPLE', SAMP_CELLS, { samp: { start: 2, count: 2, peaks: PEAKS,
          pos: 0.62, basePos: 0.30, spray: 0.10 } }));
emit('w3-sample-markers-only', 'item 3 — markers with no file: the empty track is still two real controls',
     () => page('SAMPLE', SAMP_CELLS, { samp: { start: 2, count: 2, pos: 0.4, spray: 0.2 } }));

/* =========================== 4. LABEL TILDE ============================= */
emit('w4-label-before', 'item 4 — label strips today',
     () => page('LFO TARGETS', MOD_CELLS_BASE));
emit('w4-label-after-tilde', 'item 4 — `~` on the four modulated cells; the touched cell (5) still shows its VALUE',
     () => page('LFO TARGETS', MOD_CELLS_AFTER, { touchedIdx: 4 }));

/* ============================ 5. ENUM PEEK ============================== */
const ENUM_OPTS = ['SINE', 'TRIANGLE', 'SAW UP', 'SAW DOWN', 'SQUARE', 'S & H', 'SWISHY'];
const PEEK_CELLS = [
    { kind: 'enumsq', label: 'Shape', name: 'LFO Shape', text: 'SAW UP',
      options: ENUM_OPTS, sel: 2 },
    arc('Rate', 'LFO Rate', '30', 0.30), arc('Amt', 'Amount', '45', 0.45),
    arc('Fade', 'Fade In', '10', 0.10),
    blank(), blank(), blank(), blank(),
];
emit('w5-peek-visible', 'item 5 — the list while turning (davebox today, and the peek at t<700ms)',
     () => page('LFO', PEEK_CELLS, { touchedIdx: 0, overlayIdx: 0 }));
emit('w5-peek-expired', 'item 5 — the SAME turn after 700ms: list down, knob still held (peekExpired)',
     () => page('LFO', PEEK_CELLS, { touchedIdx: 0, overlayIdx: 0, peekExpired: true }));

/* ====================== 6. MOCKUPS: PILL + FADER ======================== */
/* ⚠ MOCKUP ONLY. `pill` and `faderail` are kinds nothing in ui_cells.mjs
 * emits; these pages are the only place they are reachable. */
emit('w6-mock-switch-pill', 'item 6 MOCKUP — the switch pill, both states, beside today’s hbar toggle', () => {
    kit.drawKitBankPage([
        { kind: 'pill', label: 'Sync', name: 'Sync', text: 'ON', norm: 1 },
        { kind: 'pill', label: 'Retrig', name: 'Retrigger', text: 'OFF', norm: 0 },
        { kind: 'hbar', label: 'Sync', name: 'Sync', text: 'ON', norm: 1 },
        { kind: 'hbar', label: 'Retrig', name: 'Retrigger', text: 'OFF', norm: 0 },
        { kind: 'pill', label: 'Loop', name: 'Loop', text: 'ON', norm: 1 },
        { kind: 'enumsq', label: 'Mode', name: 'Mode', text: 'POLY', options: ['MONO', 'POLY'], sel: 1 },
        { kind: 'pill', label: 'Hold', name: 'Hold', text: 'OFF', norm: 0 },
        { kind: 'hbar', label: 'Hold', name: 'Hold', text: 'OFF', norm: 0 },
    ], { headerText: 'PILL vs HBAR', pageIdx: 0, pageCount: 4, touchedIdx: -1 });
});
emit('w6-mock-fader-column', 'item 6 MOCKUP — fader rails/column/head (top row) vs today’s vbar (bottom)', () => {
    const v = [0.15, 0.42, 0.68, 0.95];
    kit.drawKitBankPage([
        { kind: 'faderail', label: 'Osc1', name: 'Osc 1 Level', text: '19', norm: v[0] },
        { kind: 'faderail', label: 'Osc2', name: 'Osc 2 Level', text: '53', norm: v[1], modNorm: 0.30 },
        { kind: 'faderail', label: 'Sub', name: 'Sub Level', text: '87', norm: v[2] },
        { kind: 'faderail', label: 'Nois', name: 'Noise Level', text: '121', norm: v[3] },
        { kind: 'vbar', label: 'Osc1', name: 'Osc 1 Level', text: '19', norm: v[0] },
        { kind: 'vbar', label: 'Osc2', name: 'Osc 2 Level', text: '53', norm: v[1] },
        { kind: 'vbar', label: 'Sub', name: 'Sub Level', text: '87', norm: v[2] },
        { kind: 'vbar', label: 'Nois', name: 'Noise Level', text: '121', norm: v[3] },
    ], { headerText: 'FADER vs VBAR', pageIdx: 0, pageCount: 4, touchedIdx: -1 });
});
/* The sub-row lattice phase is the entire argument for the fader over the vbar,
 * and it is invisible in a single frame. Four values one detent apart, which on
 * a 13-row band the vbar cannot tell apart at all. */
emit('w6-mock-fader-detents', 'item 6 MOCKUP — four values ~1 detent apart: the lattice re-phases where the bar cannot move', () => {
    kit.drawKitHeader('SUB-ROW PHASE', false);
    const vals = [0.500, 0.512, 0.524, 0.536];
    for (let i = 0; i < 4; i++) {
        const kx = i * kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
        kit.drawFaderColumn(kx, kit.MV_ROW0_Y, vals[i]);
        kit.drawVBar(kx, kit.MV_ROW1_Y, vals[i]);
        const t = String(Math.round(vals[i] * 1000) / 10);
        kit.mvPrint(i * kit.MV_CELL_W + Math.round((kit.MV_CELL_W - kit.mvWidth(t)) / 2),
                    kit.MV_LBL0_Y + 1, t, 1);
    }
});

/* ========================= 7. KNOB RING LEDS ============================ */
/* Not a screen — the rings are hardware. This chart is the offline stand-in:
 * one column per knob, the RAMP STEP each value lands on as a bar height, so a
 * non-monotonic ramp (the failure this port's ordering rule exists for) would
 * show as a dip. Knobs 1-4 read the 5-step white ramp, 5-8 the 4-step amber. */
emit('w7-knob-ring-ramp', 'item 7 — ramp STEP per knob at 0/25/50/75/100%; a dip here is a broken ramp', () => {
    kit.drawKitHeader('KNOB RING RAMP', false);
    const vals = [0, 0.25, 0.5, 0.75, 1];
    for (let k = 0; k < 8; k++) {
        const ramp = k < 4 ? leds.KNOB_WHITE_LEVELS : leds.KNOB_AMBER_LEVELS;
        const x0 = k * 16 + 1;
        for (let i = 0; i < vals.length; i++) {
            const c = leds.knobRingColor(k, vals[i]);
            const step = ramp.indexOf(c) + 1;              /* 1-based; 0 = unlit */
            const h = step * 5;
            fill_rect(x0 + i * 3, 50 - h, 2, h, 1);
        }
        const lbl = String(k + 1);
        kit.mvPrint(x0 + 5, 53, lbl, 1);
    }
    /* The unbound case, which must be colour 0 for every knob — a dark ring is
     * "nothing here to turn", and it is NOT the bottom of the ramp. */
    const unbound = [0, 1, 2, 3, 4, 5, 6, 7].every((k) => leds.knobRingColor(k, null) === 0);
    kit.mvPrint(2, 58, 'UNBOUND -> 0: ' + (unbound ? 'YES' : 'NO'), 1);
});

/* ========================== 8. SCROLLBAR RULE =========================== */
const LIST_ROWS = ['REVERB', 'DELAY', 'CHORUS', 'PHASER', 'FLANGER',
                   'BITCRUSH', 'SATURATE', 'COMPRESS', 'FILTER', 'EQ'];
emit('w8-scrollbar-before', 'item 8 — the list scrollbar as it ships (solid rail, solid thumb)', () => {
    kit.drawKitHeader('EFFECTS', false);
    kit.drawKitList(LIST_ROWS, 3, {});
});
emit('w8-scrollbar-after-dotted', 'item 8 MOCKUP — dotted rail, solid thumb, no arrows (opts.dottedRail)', () => {
    kit.drawKitHeader('EFFECTS', false);
    kit.drawKitList(LIST_ROWS, 3, { dottedRail: true });
});

/* ======================= ADOPTED (2026-08-29) ============================
 *
 * The four looks Josh approved, each as the pair that shows what changed on a
 * surface the MANUAL renderer does not reach: sound mode's own banks (which are
 * built from ui_cells, not from BANKS), the filter curve, and the kit list.
 * The six changed manual screens are captured separately, from render_screens
 * run against both trees.
 */

/* --- the pill / bar split, driven through the REAL ui_cells rule ---------
 * ⭑ Built with toRenderCell rather than with literal descriptors, because the
 * whole point of this pair is the SPLIT and a literal would be me asserting the
 * answer instead of the code deciding it. */
const togDesc = (key, label, options) => ({
    key, label, short: label, kind: 'tog', type: 'enum',
    min: 0, max: 1, step: 1, options,
});
const SPLIT_DESCS = [
    [togDesc('sync', 'Sync', ['Off', 'On']), 1],
    [togDesc('retrig', 'Retrg', ['Off', 'On']), 0],
    [togDesc('legacy', 'Bypas', ['Disabled', 'Enabled']), 1],
    [togDesc('raw', 'Raw', ['0', '1']), 1],
    [togDesc('revstyle', 'Revrs', ['Step', 'Audio']), 1],
    [togDesc('voice', 'Voice', ['Mono', 'Poly']), 1],
    [togDesc('lock', 'CdLk', ['Off', 'Lock']), 1],
    [togDesc('filt', 'Filt', ['LP', 'HP']), 0],
];
const splitCells = () => SPLIT_DESCS.map(([d, v]) => cellsMod.toRenderCell(d, v));
emit('a1-toggles-after', 'ADOPTED — top row is off/on (PILL), bottom row is words (BAR). One rule, no per-cell taste',
     () => page('TOGGLE SPLIT', splitCells()));
emit('a1-toggles-before', 'before — every two-state cell was the same bar, and the word never showed',
     () => page('TOGGLE SPLIT', splitCells().map((c) => Object.assign({}, c, { kind: 'hbar' }))));

/* --- the fader column on a real level bank ------------------------------- */
const LEVELS = [0.15, 0.42, 0.68, 0.95, 0.55, 0.30, 0.80, 1.00];
const faderDesc = (i) => ({ key: 'lvl' + i, label: 'Lvl ' + (i + 1), short: 'Lvl' + (i + 1),
                            kind: 'fader', type: 'float', min: 0, max: 1, step: 0.01 });
const faderCells = () => LEVELS.map((v, i) => cellsMod.toRenderCell(faderDesc(i), v));
emit('a2-fader-after', 'ADOPTED — a `fader` cell draws rails + framed column + head',
     () => page('LEVELS', faderCells()));
emit('a2-fader-before', 'before — the plain vertical bar (drawVBar, still exported)', () => {
    kit.drawKitHeader('LEVELS', false);
    kit.drawKitPageBar(2, 6);
    const cs = faderCells();
    for (let k = 0; k < 8; k++) {
        const col = k % 4, rowY = k < 4 ? kit.MV_ROW0_Y : kit.MV_ROW1_Y;
        const kx = col * kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
        kit.drawVBar(kx, rowY, cs[k].norm);
        const t = cs[k].label;
        kit.mvPrint(col * kit.MV_CELL_W + Math.round((kit.MV_CELL_W - kit.mvWidth(t)) / 2),
                    (k < 4 ? kit.MV_LBL0_Y : kit.MV_LBL1_Y) + 1, t, 1);
    }
});

/* --- the filter fill, now the default ----------------------------------- */
emit('a3-filter-after', 'ADOPTED — the passband is MASS (filt.fill defaults on)',
     () => page('FILTER', FILT_CELLS, { filt: FILT_VIZ }));
emit('a3-filter-before', 'before — the bare stroke (filt.fill:false, the surviving escape hatch)',
     () => page('FILTER', FILT_CELLS, { filt: Object.assign({ fill: false }, FILT_VIZ) }));

/* --- the kit-list scrollbar ---------------------------------------------- */
const LONG_LIST = ['REVERB', 'DELAY', 'CHORUS', 'PHASER', 'FLANGER', 'BITCRUSH',
                   'SATURATE', 'COMPRESS', 'FILTER', 'EQ', 'GATE', 'WIDENER'];
emit('a4-list-after', 'ADOPTED — dotted rail, solid thumb, no arrows (every kit list)', () => {
    kit.drawKitHeader('EFFECTS', false);
    kit.drawKitList(LONG_LIST, 4, {});
});
emit('a4-list-before', 'before — solid rail, so the thumb was a thicker piece of the same object', () => {
    kit.drawKitHeader('EFFECTS', false);
    kit.drawKitList(LONG_LIST, 4, { dottedRail: false });
});

/* ====================== ARC GEOMETRY (adopted 2026-08-29) ================
 *
 * The knob repaint. Every davebox arc changes, so the pair that matters is a
 * SWEEP — a single frame cannot show what the ends of travel now look like,
 * and the ends are the entire argument for an open track.
 *
 * ⚠ `legacyArc` below is a HISTORICAL REPLICA of the arc this replaced, kept
 * in the RENDERER rather than left behind in ui_movy.mjs as dead code. It is a
 * copy and copies drift — that is acceptable here and only here, because its
 * one job is to be the BEFORE of a comparison taken now. Do not import it, do
 * not fix it, and delete it once the renders have been judged.
 */
function legacyArc(cx, cy, r, norm, bipolar) {
    /* midpoint walk with the cardinal extremes tucked to r-1 */
    let x = r, y = 0, err = 0;
    while (x >= y) {
        if (y === 0) {
            set_pixel(cx + x - 1, cy, 1); set_pixel(cx - x + 1, cy, 1);
            set_pixel(cx, cy + x - 1, 1); set_pixel(cx, cy - x + 1, 1);
        } else {
            set_pixel(cx + x, cy + y, 1); set_pixel(cx + y, cy + x, 1);
            set_pixel(cx - y, cy + x, 1); set_pixel(cx - x, cy + y, 1);
            set_pixel(cx - x, cy - y, 1); set_pixel(cx - y, cy - x, 1);
            set_pixel(cx + y, cy - x, 1); set_pixel(cx + x, cy - y, 1);
        }
        y++;
        if (err <= 0) err += 2 * y + 1;
        if (err > 0) { x--; err -= 2 * x + 1; }
    }
    if (bipolar) fill_rect(cx, cy - r + 1, 1, Math.max(2, Math.round(r / 3.5)), 1);
    const rad = (210 + norm * 300) * Math.PI / 180;          /* the OLD sweep */
    kit.plotLine(cx, cy, Math.round(cx + (r - 1) * Math.sin(rad)),
                 Math.round(cy - (r - 1) * Math.cos(rad)), 1);
}

const SWEEP = [0, 0.25, 0.5, 0.75, 1];
const cellKx = (col) => col * kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
const sweepLabels = (y) => SWEEP.forEach((v, i) => {
    const t = String(v * 100 | 0) + '%';
    kit.mvPrint(i * kit.MV_CELL_W / 1.25 + Math.round((25 - kit.mvWidth(t)) / 2), y, t, 1);
});

emit('arc-sweep-after', 'ADOPTED — open track, floating pointer, at 0/25/50/75/100%', () => {
    kit.drawKitHeader('ARC  NEW', false);
    for (let i = 0; i < 5; i++)
        kit.drawArcKnobAt(14 + i * 25, 26, kit.MV_KNOB_R, SWEEP[i], false);
    sweepLabels(38);
    /* The same five with a modulation dot one step ahead, so the dot can be
     * checked against the OPEN track: it must stay on the arc and never float
     * in the gap. */
    for (let i = 0; i < 5; i++) {
        kit.drawArcKnobAt(14 + i * 25, 52, kit.MV_KNOB_R, SWEEP[i], false);
        kit.drawModDotAt(14 + i * 25, 52, kit.MV_KNOB_R, Math.min(1, SWEEP[i] + 0.18));
    }
});
emit('arc-sweep-before', 'before — closed ring, pointer welded hub-to-rim, 300-degree sweep', () => {
    kit.drawKitHeader('ARC  OLD', false);
    for (let i = 0; i < 5; i++) legacyArc(14 + i * 25, 26, 7, SWEEP[i], false);
    sweepLabels(38);
    for (let i = 0; i < 5; i++) legacyArc(14 + i * 25, 52, 7, SWEEP[i], false);
});

emit('arc-bipolar-after', 'ADOPTED — bipolar at -100/-50/0/+50/+100%. Centre tick is now the TRUE midpoint of travel', () => {
    kit.drawKitHeader('ARCBIP  NEW', false);
    for (let i = 0; i < 5; i++)
        kit.drawArcKnobAt(14 + i * 25, 26, kit.MV_KNOB_R, SWEEP[i], true);
    sweepLabels(38);
    const t = 'TICK AT 12 = CENTRE';
    kit.mvPrint(Math.round((128 - kit.mvWidth(t)) / 2), 48, t, 1);
});
emit('arc-bipolar-before', 'before — same five values on the old ring; the 300-degree sweep put centre off 12 o’clock', () => {
    kit.drawKitHeader('ARCBIP  OLD', false);
    for (let i = 0; i < 5; i++) legacyArc(14 + i * 25, 26, 7, SWEEP[i], true);
    sweepLabels(38);
});

/* ⚠ THE ONE PLACE THE BRIEF AND ITS OWN NAMED SOURCE DISAGREE. The brief says
 * a 0.85r pointer (Movy's original); render_page_movy.mjs ships 0.68r and
 * documents why it moved. Rendered side by side so the call is Josh's and not
 * mine — note the tip merging with the rim on the 0.85 row, and that it runs
 * straight through the band the modulation dot occupies. */
emit('arc-pointer-length', 'DECISION — 0.68r (shipped upstream, top) vs 0.85r (Movy’s original, bottom), both with a mod dot', () => {
    kit.drawKitHeader('PTR 68 TOP / 85 BOT', false);
    const R = kit.MV_KNOB_R;
    for (let i = 0; i < 5; i++) {
        const cx = 14 + i * 25;
        kit.drawArcKnobAt(cx, 24, R, SWEEP[i], false);
        kit.drawModDotAt(cx, 24, R, Math.min(1, SWEEP[i] + 0.18));
        /* 0.85r drawn by hand on the SAME ring — the pointer angle is the
         * documented 225 + n*270, replicated here only so the two rows differ
         * in nothing but the tip radius. */
        kit.drawArcKnobAt(cx, 46, R, SWEEP[i], false);
        const rad = (225 + SWEEP[i] * 270) * Math.PI / 180;
        kit.plotLine(cx, 46, Math.round(cx + R * 0.85 * Math.sin(rad)),
                     Math.round(46 - R * 0.85 * Math.cos(rad)), 1);
        kit.drawModDotAt(cx, 46, R, Math.min(1, SWEEP[i] + 0.18));
    }

});

/* ================== THE 2026-08-29 SECOND BATCH (adopted) ================
 *
 * ⚠ EVERY ANIMATED CASE PASSES ITS OWN `now`, never Date.now(). That is the
 * whole contract from ui_anim.mjs, and it is what makes a mid-flight frame
 * RENDERABLE at all: an animation that read the clock could only ever be
 * photographed at whatever instant the tool happened to run.
 */

/* --- item 2: the enum square ------------------------------------------- */
const ENUM_WORDS = ['AUDIO', 'POLY', 'STEP', 'LOW PASS', 'I+II', 'SINE', 'BANDPASS', '1/16T'];
const enumCells = () => ENUM_WORDS.map((w, i) => ({
    kind: 'enumsq', label: 'P' + (i + 1), name: 'Param ' + (i + 1), text: w,
    options: [w], sel: 0,
}));
emit('b2-enumsq-after', 'ADOPTED — box sized to its value, 4x5 face, notched. AUDIO fits on ONE line now',
     () => page('ENUM SQUARES', enumCells()));
/* The mid-flight frame the animation exists for. Two draws: the first records
 * the old value, the second retargets and is caught 60ms into a 120ms move. */
emit('b2-enumsq-anim-mid', 'ADOPTED — the frame resize caught mid-flight (t=60ms of 120ms). Only the FRAME travels; glyphs swap outright', () => {
    const st = anim.createAnimState();
    const narrow = ENUM_WORDS.map((w, i) => ({ kind: 'enumsq', label: 'P' + (i + 1),
        name: 'P', text: 'ON', options: ['ON'], sel: 0, raw: 'ON' }));
    /* First frame at t=0 records ON as a settled first sighting. */
    resetFb();
    page('ENUM SQUARES', narrow, { anim: st, nowMs: 0 });
    /* Now the values change; 60ms later the boxes are half-grown. */
    resetFb();
    page('ENUM SQUARES', ENUM_WORDS.map((w, i) => ({ kind: 'enumsq', label: 'P' + (i + 1),
        name: 'P', text: w, options: [w], sel: 0, raw: w })), { anim: st, nowMs: 60 });
});

/* --- item 3: the trigger button ---------------------------------------- */
const ACT = (label, name) => ({ kind: 'action', label, name, text: '->' });
emit('b3-button-after', 'ADOPTED — idle / held / fired+burst / late burst (the four phases, left to right)', () => {
    kit.drawKitHeader('TRIGGERS', false);
    const now = 1000;
    const phases = [
        kit.buttonPhase(0, now, false),          /* idle */
        kit.buttonPhase(0, now, true),           /* held: cap filled */
        kit.buttonPhase(now - 40, now, false),   /* just fired: pressed + burst */
        kit.buttonPhase(now - 220, now, false),  /* burst still travelling */
    ];
    for (let i = 0; i < 4; i++) {
        const kx = i * kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
        kit.drawTriggerButton(kx, kit.MV_ROW0_Y, phases[i]);
    }
    /* ⚠ TWO PRESSES IN FLIGHT AT ONCE — the case a single timestamp got wrong,
     * swallowing the first ring and restarting from the centre. */
    const kx2 = kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
    kit.drawTriggerButton(kx2, kit.MV_ROW1_Y, kit.buttonPhase([now - 40, now - 240], now, false));
    kit.mvPrint(2, kit.MV_LBL1_Y + 1, 'DOUBLE TAP: TWO RINGS', 1);
});
emit('b3-button-before', 'before — the framed "< >" action square',
     () => { kit.drawKitHeader('TRIGGERS', false);
             for (let i = 0; i < 4; i++) {
                 const kx = i * kit.MV_CELL_W + Math.floor((kit.MV_CELL_W - kit.MV_KW) / 2);
                 kit.rectOutline(kx, kit.MV_ROW0_Y, kit.MV_KW, kit.MV_KH, 1);
                 kit.mvPrint(kx + 4, kit.MV_ROW0_Y + 5, '< >', 1);
             } });

/* --- item 4: the opaque box tri-state ---------------------------------- */
const fileDesc = { key: 'sample_path', kind: 'file', type: 'file', label: 'Sample', short: 'Smpl',
                   min: 0, max: 0 };
emit('b4-opaque-tristate', 'ADOPTED — a value / NONE / -- , and the brackets that say it OPENS something', () => {
    const cells = [
        cellsMod.toRenderCell(fileDesc, null, '/Samples/kick_01.wav'),
        cellsMod.toRenderCell(fileDesc, null, ''),          /* NONE: nothing chosen */
        cellsMod.toRenderCell(fileDesc, null, null),        /* --  : not answered  */
        cellsMod.toRenderCell(fileDesc, null, '/a/very_long_sample_name.wav'),
        null, null, null, null,
    ];
    page('SAMPLE', cells);
});
emit('b4-opaque-before', 'before — an enum square, and `` collapsed to the same "--" as an unread key', () => {
    const mk = (t) => ({ kind: 'enumsq', label: 'SMPL', name: 'Sample', text: t, options: [t], sel: 0 });
    page('SAMPLE', [mk('KICK_01.WAV'), mk('--'), mk('--'), mk('VERY_LONG'), null, null, null, null]);
});

/* --- item 5: the waveform morph ---------------------------------------- */
emit('b5-wave-morph', 'ADOPTED — SINE to SAW at t=0 / 25 / 50 / 75 / 100ms of the 100ms morph', () => {
    kit.drawKitHeader('WAVE MORPH', false);
    const ts = [0, 25, 50, 75, 100];
    for (let i = 0; i < 5; i++) {
        const st = anim.createAnimState();
        const kx = i * 25 + 2;
        /* Settle on SINE, then retarget to SAW and catch it at ts[i]. */
        resetFb === null;
        kit.drawWaveBox(kx, kit.MV_ROW0_Y, 'sine', st, 0, 'w', 'sine');
        kit.drawWaveBox(kx, kit.MV_ROW1_Y, 'saw', st, ts[i], 'w', 'saw');
    }
    kit.mvPrint(2, kit.MV_LBL0_Y + 1, 'TOP: SINE (SETTLED)', 1);
    kit.mvPrint(2, kit.MV_LBL1_Y + 1, '0 / 25 / 50 / 75 / 100 MS', 1);
});

/* --- item 6: the overlay scrollbar ------------------------------------- */
const OVL = ['SINE', 'TRIANGLE', 'SAW UP', 'SAW DOWN', 'SQUARE', 'S & H', 'SWISHY', 'NOISE'];
emit('b6-overlay-scrollbar', 'ADOPTED — the picker overlay now carries the same dotted rail as the list under it', () => {
    kit.drawKitHeader('LFO', false);
    kit.drawKitList(LONG_LIST, 4, {});
    kit.drawKitListOverlay(OVL, 2);
});

/* --- item 7: the footer hint row --------------------------------------- */
emit('b7-footer-hints', 'ADOPTED — one primitive. TOP fits; BOTTOM is over-asked and BACK still survives', () => {
    kit.drawKitHeader('FOOTER', false);
    const y1 = 20, y2 = 44;
    kit.drawKitHintRow(y1, [['JOG', 'PAGE'], ['CLK', 'MENU'], ['BACK', 'OUT']]);
    kit.mvPrint(2, y1 + 10, '3 HINTS, ALL FIT', 1);
    /* ⚠ THE FIT RULE: BACK's room is reserved FIRST, so the middles drop and
     * the way out survives. A naive left-to-right loop drops exactly BACK. */
    const drawn = kit.drawKitHintRow(y2, [['JOG', 'PAGE'], ['CLK', 'MENU'], ['SHFT', 'ALT'],
                                          ['MUTE', 'BYPASS'], ['KNB', 'EDIT'], ['BACK', 'EXIT']]);
    kit.mvPrint(2, y2 + 10, '6 ASKED, ' + drawn + ' DRAWN, BACK KEPT', 1);
});

/* --- item 8: the big-number face --------------------------------------- */
emit('b8-bignum-after', 'ADOPTED — the ported face for numerics; davebox’s own font still serves NOTE NAMES', () => {
    kit.drawKitHeader('BIG NUMBERS', false);
    const vals = ['+2', '-12', '127', '0'];
    for (let i = 0; i < 4; i++) kit.drawBigNum(i * kit.MV_CELL_W, kit.MV_ROW0_Y, vals[i]);
    /* ⚠ THE FALLBACK, which is not optional: the ported table is 12 glyphs, so
     * anything with a letter in it MUST take davebox's own big font. Drawing a
     * missing glyph as nothing would turn "C1 36" into "1 36". */
    const words = ['E 3', 'C1', '--', 'OFF'];
    for (let i = 0; i < 4; i++) kit.drawBigNum(i * kit.MV_CELL_W, kit.MV_ROW1_Y, words[i]);
    kit.mvPrint(2, kit.MV_LBL0_Y + 1, 'PORTED FACE', 1);
    kit.mvPrint(2, kit.MV_LBL1_Y + 1, 'FALLBACK (HAS LETTERS)', 1);
});

/* --- item 9: MOCKUP, the header comparison ----------------------------- */
const DELAY_CELLS = [
    arc('Time', 'Delay Time', '3/16', 0.45), arc('Fdbk', 'Feedback', '62', 0.62),
    { kind: 'enumsq', label: 'Mode', name: 'Mode', text: 'PING', options: ['PING'], sel: 0 },
    arc('Mix', 'Dry / Wet', '38', 0.38),
    arc('LoCut', 'Low Cut', '20', 0.2), arc('HiCut', 'High Cut', '80', 0.8),
    { kind: 'pill', label: 'Sync', name: 'Sync', text: 'ON', norm: 1 },
    { kind: 'pill', label: 'Frez', name: 'Freeze', text: 'OFF', norm: 0 },
];
emit('hdr-ours', 'MOCKUP A — davebox’s header today: filled bar, black text, page bar under it', () => {
    kit.drawKitHeader('DELAY', false);
    kit.drawKitPageBar(3, 6);
    kit.drawKitCells(DELAY_CELLS, -1);
});
emit('hdr-parampages', 'MOCKUP B — param-pages: Tamzen breadcrumb left, page name right, plain ground', () => {
    kit.drawKitHeaderParamPages('DAVEBOX / FX', 'DELAY');
    kit.drawKitCells(DELAY_CELLS, -1);
});

/* =================== THE HINT ROW, per screen family ====================
 *
 * The manual renderer covers the track-view bank cards. Sound mode's editor is
 * built from ui_cells and never reaches that tool, so its row is rendered here
 * — and the two are deliberately DIFFERENT, because the gestures are.
 */
const SND_CELLS = [
    arc('Cutf', 'Cutoff', '62', 0.62), arc('Reso', 'Resonance', '18', 0.18),
    { kind: 'enumsq', label: 'Mode', name: 'Filter Mode', text: 'LP24', options: ['LP24'], sel: 0 },
    arc('Env', 'Env Amount', '45', 0.45),
    arc('Atk', 'Attack', '10', 0.10), arc('Dec', 'Decay', '40', 0.40),
    arc('Sus', 'Sustain', '70', 0.70), arc('Rel', 'Release', '30', 0.30),
];
emit('ftr-sound-multisection', 'FOOTER — sound-mode editor, module WITH sections and presets',
     () => page('FILTER', SND_CELLS, { pageIdx: 1, pageCount: 5,
        footer: [['CLK', 'PRESET'], ['SHFT', 'SECT'], ['JOG', 'PAGE'], ['BACK', 'OUT']] }));
/* ⚠ Both conditional hints gone: a single-section module has no Shift+jog
 * section jump, and an EMPTY block has no presets to offer, so the click
 * browses MODULES instead. The row shrinks rather than lying. */
emit('ftr-sound-empty', 'FOOTER — same screen, single-section EMPTY block: SECT gone, CLK says BROWSE',
     () => page('FILTER', SND_CELLS, { pageIdx: 0, pageCount: 1,
        footer: [['CLK', 'BROWSE'], ['JOG', 'PAGE'], ['BACK', 'OUT']] }));
/* The fit rule, on the row that actually over-asks in the product: a track-view
 * card wants four pairs and the panel holds three. SHFT TRACK is the one that
 * drops, and BACK survives because its room is reserved first. */
emit('ftr-trackview-fit', 'FOOTER — track view asks for 4 pairs; SHFT drops, BACK keeps the right edge', () => {
    kit.drawKitHeader('LIVE ARP', false);
    kit.drawKitPageBar(5, 7);
    kit.drawKitCells(SND_CELLS, -1);
    const asked = [['JOG', 'BANK'], ['CLK', 'ALT'], ['SHFT', 'TRK'], ['BACK', 'OUT']];
    const drawn = kit.drawKitHintRow(kit.MV_FOOTER_Y, asked);
    console.log(`      (asked ${asked.length} pairs, drew ${drawn})`);
});

console.log(`\nwrote ${n} widget render${n === 1 ? '' : 's'} to ${OUT}/`);
