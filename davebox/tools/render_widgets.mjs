// tools/render_widgets.mjs — one offline PNG per widget in the 2026-08-29
// style-port, so every one of them can be judged before it reaches hardware.
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
/* ⚠ NOT wrapped in a catch. An import that fails here would silently drop the
 * knob-ring case from the output, and a render set with a case missing looks
 * exactly like a render set that ran — which is how item 7 nearly shipped
 * unjudged. It needs the device-specifier loader (see render_loader.mjs); run
 * this script through it. */
const leds = await import('../ui/ui_knob_leds.mjs');

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

console.log(`\nwrote ${n} widget render${n === 1 ? '' : 's'} to ${OUT}/`);
