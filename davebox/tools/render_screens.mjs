// tools/render_screens.mjs — render current dAVEBOx OLED screens to individual
// PNGs for the manual. Stubs the three host draw primitives into a 128x64
// framebuffer and drives the REAL draw code:
//   - bank/param pages: the real ui_constants BANKS defs mapped through a
//     verbatim copy of ui_render's kitCellForKnob(), then ui_movy's
//     drawKitBankPage — pixel-identical to the device.
//   - custom-drawn screens (REPEAT GROOVE): their exact draw block, replicated.
// The device-absolute imports in ui_constants are satisfied by render_loader.
// Run:  node --import ./tools/render_loader.mjs tools/render_screens.mjs [stem]
import { mkdirSync } from 'node:fs';
// ⭑ The framebuffer, the host-font port and the PNG writer live in render_fb.mjs
// so this script and tools/render_widgets.mjs cannot drift apart about what the
// device draws. Imported BEFORE the ui/*.mjs dynamic imports below, which is
// what installs set_pixel/fill_rect/print in time for them.
import { W, H, resetFb, currentFb, writePng, freezeClock } from './render_fb.mjs';

/* ⚠⚠ THE MANUAL IS RENDERED ON A FROZEN CLOCK, and it has to be.
 * A time-dependent renderer makes every run produce a different picture and the
 * committed PNGs come back dirty for no reason — which is exactly how a real
 * before/after check got eight false positives on 2026-08-29.
 * ⭑ drawKitPageBar was that renderer and no longer blinks (2026-08-30); the
 * latch frame still reads the clock, so this stays. Any instant
 * would do; this one is fixed so that a regenerated manual differs only where
 * the DRAWING changed. */
freezeClock();

// NOTE: globalThis.pixelPrint is the mcufont 5x5 (a davebox JS fn, NOT the host
// 5x7 print) — wired to the real C.pixelPrint just after the ui_constants import.

const kit = await import('../ui/ui_movy.mjs');
/* ⚠ The REAL split, not a copy of it. kitCellForKnob below is a verbatim copy
 * of ui_render's, and the one thing that must NOT be copied is the pill/bar
 * rule — a second regex here is a second idea of what a boolean is, and the
 * manual would document a widget the device does not draw. */
const { isBooleanPair } = await import('../ui/ui_cells.mjs');
const C = await import('../ui/ui_constants.mjs');   // real BANKS + fmt tables (via loader)
const { BANKS } = C;
globalThis.pixelPrint = C.pixelPrint;   // real mcufont 5x5 (used by Perf chips etc.)

// Replica of the REAL drawMenuHeader in src/shared/menu_layout.mjs, because the
// loader stubs that module (its own import graph reaches text_scroll /
// screen_reader / chain_ui_views, which is more of the host than this tool
// should drag in).
//
// ⚠⚠ IT WAS STALE, AND IT RENDERED THE WRONG HOST. This replica reproduced
// STOCK schwung's header — white text on black, with a rule under it — while
// the device draws OURS: a FILLED white bar with BLACK text and no separate
// rule (the bar's own bottom edge replaced it). davebox has been running our
// copy all along, because the host rewrites the shared-import prefix into this
// install's tree (see tests/test_install_paths.sh section 4), so every
// dialog-confirm render in the manual has been showing a header the device
// never draws. Fixed 2026-08-29; UI_LANGUAGE §4 has said this since P7.
//
// ⚠ A replica drifts. Keep it matching src/shared/menu_layout.mjs, and prefer
// resolving the real module here the day its import graph gets cheap enough.
const TITLE_Y = 2, TITLE_RULE_Y = 12;
function drawMenuHeader(title) {
    fill_rect(0, 0, W, TITLE_RULE_Y - 1, 1);
    globalThis.print(2, TITLE_Y, title, 0);
}
// Dialog button primitives (copied from ui_dialogs.mjs — fill/outline + centred label).
function drawDlgBtn(x, y, w, h, sel, label) {
    const lx = x + Math.round((w - label.length * 6) / 2);
    if (sel) { fill_rect(x, y, w, h, 1); globalThis.print(lx, y + 3, label, 0); }
    else { fill_rect(x, y, w, 1, 1); fill_rect(x, y + h - 1, w, 1, 1); fill_rect(x, y, 1, h, 1); fill_rect(x + w - 1, y, 1, h, 1); globalThis.print(lx, y + 3, label, 1); }
}
function drawYesNoRow(sel) { drawDlgBtn(6, 46, 46, 13, sel === 1, 'No'); drawDlgBtn(74, 46, 46, 13, sel === 0, 'Yes'); }
// Perf footer chip (copied from ui_render.mjs _perfChip — mcufont label).
function _perfChip(x, y, label, active) {
    const w = label.length * 6 + 3;
    if (active) { fill_rect(x, y, w, 9, 1); globalThis.pixelPrint(x + 2, y + 2, label, 0); }
    else { fill_rect(x, y, w, 1, 1); fill_rect(x, y + 8, w, 1, 1); fill_rect(x, y, 1, 9, 1); fill_rect(x + w - 1, y, 1, 9, 1); globalThis.pixelPrint(x + 2, y + 2, label, 1); }
    return w;
}

// ---- verbatim copy of ui_render.mjs cell mapping (pure; fmt refs come from C
//      so `knob.fmt === C.fmtBool` identity holds against the real BANKS defs) ----
/* ⚠⚠ THREE LISTS, NOT ONE — mirroring ui_render.mjs exactly. This file used to
 * lump all ten formatters into KIT_ENUM_FMTS, so the manual drew Res / Diq /
 * Len / Gate / Dly / ArpRate as ENUM SQUARES where the device draws STACKED
 * FRACTIONS and BIG READ-OUTS. Found by tests/js/test_cellkind_parity.mjs the
 * day it was written; it had been wrong for a long time and nothing noticed,
 * because a copy in a tool is a copy nothing runs. */
const KIT_ENUM_FMTS = [C.fmtPlayDir, C.fmtArpStyle, C.fmtArpSteps, C.fmtRevStyle];
/* True n/m fractions — resolutions, arp rates, gate rates, input quantize,
 * delay times. Non-fraction members ("1bar", "--") fall through to the big
 * read-out inside drawFracStack, so a set reads as one hierarchy. */
const KIT_FRAC_FMTS = [C.fmtDly, C.fmtRes, C.fmtArpRate, C.fmtGateMod, C.fmtDiq];
/* Numeric lengths that are NOT fractions — decimals and counts keep the big
 * read-out; stacking a decimal makes no sense. */
const KIT_RATE_FMTS = [C.fmtLen];
/* An "off"/empty value reads as "--" in a big read-out: the word OFF competes
 * with the numbers around it. Applies to the value AND its option list. */
const _offDash = (x) => {
    const t = x == null ? '' : String(x);
    return (t === '' || t.toLowerCase() === 'off') ? '--' : t;
};
const KIT_DIR_NAMES = ['Forward', 'Backward', 'Ping Pong', 'Rev Ping Pong'];
const KIT_ARP_STYLE_NAMES = ['Off', 'Up', 'Down', 'Up/Down', 'Down/Up',
                             'Converge', 'Diverge', 'Ordered', 'Random', 'Rnd Order'];
function _discreteOpts(knob) { const o = []; for (let i = knob.min; i <= knob.max; i++) o.push(_offDash(knob.fmt(i))); return o; }
function kitCellForKnob(knob, val) {
    if (!knob || !knob.abbrev) return { kind: 'blank', label: '' };
    const v = val | 0;
    const text = knob.fmt(v);
    const base = { label: knob.abbrev, name: knob.full, text };
    if (knob.fmt === C.fmtBool) {
        base.kind = isBooleanPair(C.fmtBool(1), C.fmtBool(0)) ? 'pill' : 'enumsq';
        base.norm = v ? 1 : 0;
        return base;
    }
    if (knob.fmt === C.fmtLgto) { base.kind = 'action'; base.oneWay = true; return base; }
    /* ⚠ MIRRORS ui_render's rule, which is `valsq` since 2026-08-29: only Lgto
     * (above) is a real fire-action. Strch and Shift hold signed values, so a
     * pushbutton is the wrong picture for them — see the long note at
     * ui_render.mjs's copy of this branch for why they are not arcbip either.
     * Pinned by tests/js/test_cellkind_parity.mjs, because this whole function
     * is a COPY and a copy drifts. */
    if (knob.scope === 'action') { base.kind = 'valsq'; return base; }
    if (knob.fmt === C.fmtPlayDir) { base.kind = 'dirsq'; base.options = KIT_DIR_NAMES; base.sel = v; return base; }
    if (KIT_FRAC_FMTS.indexOf(knob.fmt) >= 0) {
        base.kind = 'frac'; base.text = _offDash(text);
        base.options = _discreteOpts(knob); base.sel = v - knob.min;
        return base;
    }
    if (KIT_RATE_FMTS.indexOf(knob.fmt) >= 0) {
        base.kind = 'valsq'; base.text = _offDash(text);
        base.options = _discreteOpts(knob); base.sel = v - knob.min;
        return base;
    }
    if (KIT_ENUM_FMTS.indexOf(knob.fmt) >= 0) {
        base.kind = 'enumsq';
        if (knob.fmt === C.fmtArpStyle) base.options = KIT_ARP_STYLE_NAMES;
        else { base.options = []; for (let i = knob.min; i <= knob.max; i++) base.options.push(knob.fmt(i)); }
        base.sel = v - knob.min;
        return base;
    }
    if (knob.min < 0) {
        if (knob.max <= 24) { base.kind = 'valsq'; base.text = _offDash(text); base.options = _discreteOpts(knob); base.sel = v - knob.min; return base; }
        base.kind = 'arcbip';
        const halfR = Math.max(1, Math.max(knob.max, -knob.min));
        base.signed = Math.max(-1, Math.min(1, v / halfR));
        return base;
    }
    if (knob.fmt === C.fmtPlain && knob.max <= 16) { base.kind = 'valsq'; base.text = _offDash(text); base.options = _discreteOpts(knob); base.sel = v - knob.min; return base; }
    if (knob.fmt === C.fmtPitchRnd) { base.kind = 'valsq'; base.text = _offDash(text); base.options = _discreteOpts(knob); base.sel = v - knob.min; return base; }
    base.kind = 'arc';
    base.norm = Math.max(0, Math.min(1, (v - knob.min) / ((knob.max - knob.min) || 1)));
    return base;
}

// Build a bank page's cells from the real BANKS[bank].knobs + a values array.
// vals defaults to each knob's `def`; overrides let a screen show a "used" state.
const bankCells = (bank, overrides = {}) =>
    BANKS[bank].knobs.map((k, i) => kitCellForKnob(k, i in overrides ? overrides[i] : (k ? k.def : 0)));

// ---- screen catalog ----
// Generic bank pages: {bank, section, over?, touchedIdx?, altArrowShow?}.
// header always = BANKS[bank].name, inverted=false (matches drawKitPage on device).
/* ⭑ THE HINT ROWS ARE THE ONES ui_render.bankPageHints WOULD BUILD for this
 * bank, spelled out here because this tool drives the draw layer directly and
 * never runs the state machine that derives them. Keep them in step with
 * bankPageHints — a manual page promising a gesture the device does not offer
 * is worse than one with no footer at all.
 *   CLK STEPS  banks 4/5 on a MELODIC track (the Arp-Steps interval overlay)
 *   CLK ALT    a bank that HAS alt params (the two with altArrowShow here)
 *   no CLK     a bank with neither */
/* ⚠ THIS LIST IS A COPY of bankPageHints() in ui/ui_render.mjs, and nothing
 * pins the two together — SHFT/TRK was removed from the device on 2026-08-30
 * and survived HERE, so the regenerated manual still showed a hint the
 * instrument no longer gives. Keep them in step by hand until a parity test
 * exists (test_cellkind_parity.mjs is the pattern for one). */
const F_JOG = ['JOG', 'BANK'], F_BACK = ['BACK', 'OUT'];
const hintsAlt   = [F_JOG, ['CLK', 'ALT'],  F_BACK];
const hintsSteps = [F_JOG, ['CLK', 'STEP'], F_BACK];
const hintsPlain = [F_JOG, F_BACK];

const BANK_SCREENS = [
    { file: 'bank-clip',      bank: 0, section: '9.1 CLIP bank',      over: { 0: 1, 6: 2 }, altArrowShow: true, footer: hintsAlt },
    { file: 'bank-notefx',    bank: 1, section: '10.1 NOTE FX bank',  over: { 0: 1, 1: 7, 2: -23, 3: 50 }, touchedIdx: 2, footer: hintsPlain },
    { file: 'bank-harmony',   bank: 2, section: '10.2 HARMONY bank',  over: { 0: 1, 1: 7, 2: 12, 3: -5 }, footer: hintsPlain },
    { file: 'bank-delay',     bank: 3, section: '10.3 DELAY bank',    over: { 0: 10, 2: 4, 4: 12, 7: 3 }, footer: hintsPlain },
    { file: 'bank-seqarp',    bank: 4, section: '10.4 SEQ ARP bank',  over: { 0: 1, 1: 3, 2: 1 }, footer: hintsSteps },
    { file: 'bank-livearp',   bank: 5, section: '10.5 LIVE ARP bank', over: { 0: 1, 1: 2, 2: 2 }, altArrowShow: true, footer: hintsAlt },
];

// Custom cell grids (drawn via drawKitBankPage but not from BANKS knobs).
const enumC = (label, name, options, sel) => ({ kind: 'enumsq', label, name, text: options[sel], options, sel });
const DIR = ['Fwd', 'Bwd', 'PPf', 'PPb'], RES = ['1/32','1/16','1/8','1/4','1/2','1bar'];
const DIQ = ['Off','1/64','1/32','1/16','1/16T','1/8','1/8T','1/4','1/4T'];
const CUSTOM_KIT = [
    {
        file: 'bank-drumlane', section: '9.2 DRUM LANE bank', header: 'DRUM LANE',
        footer: hintsAlt,
        cells: [
            enumC('Res', 'Resolution', RES, 1),
            { kind: 'valsq', label: 'Strch', name: 'Beat Stretch', text: '1x' },
            { kind: 'valsq', label: 'Shift', name: 'Clock Shift', text: '+0' },
            { kind: 'action', oneWay: true, label: 'Lgto', name: 'Apply Legato', text: '->' },
            { kind: 'valsq', label: 'Eucld', name: 'Euclid Fill', text: '0' },
            { kind: 'blank', label: '' },
            { kind: 'dirsq', label: 'Dir', name: 'Playback Dir', text: 'Fwd', options: DIR, sel: 0 },
            { kind: 'pill', label: 'SeqFl', name: 'Seq Follow', text: 'ON', norm: 1 },
        ],
    },
    {
        file: 'bank-alllanes', section: '9.3 ALL LANES bank', header: 'ALL LANES',
        footer: hintsAlt,
        cells: [
            { kind: 'valsq', label: 'Res', name: 'Resolution', text: '--' },
            { kind: 'valsq', label: 'Strch', name: 'Beat Stretch', text: '1x' },
            { kind: 'valsq', label: 'Shift', name: 'Clock Shift', text: '+0' },
            { kind: 'valsq', label: 'Quant', name: 'Quantize', text: '--' },
            { kind: 'valsq', label: 'VelIn', name: 'Velocity Input', text: 'Live' },
            enumC('InQnt', 'Input Quantize', DIQ, 0),
            { kind: 'dirsq', label: 'Dir', name: 'Playback Dir', text: 'Fwd', options: DIR, sel: 0 },
            { kind: 'pill', label: 'RSync', name: 'Repeat Sync', text: 'ON', norm: 1 },
        ],
    },
    {
        file: 'bank-conductor-octave', section: '8.3 Conductor banks (C-OCTAVE)', header: 'C-OCTAVE',
        footer: hintsPlain,
        cells: [
            { kind: 'valsq', label: 'Tr1', name: 'Track 1', text: '+1' },
            { kind: 'blank', label: 'Cndct' },
            { kind: 'valsq', label: 'Tr3', name: 'Track 3', text: '--' },
            { kind: 'valsq', label: 'Tr4', name: 'Track 4', text: '-2' },
            { kind: 'valsq', label: 'Tr5', name: 'Track 5', text: '--' },
            { kind: 'valsq', label: 'Tr6', name: 'Track 6', text: '--' },
            { kind: 'valsq', label: 'Tr7', name: 'Track 7', text: '+3' },
            { kind: 'valsq', label: 'Tr8', name: 'Track 8', text: '--' },
        ],
        opts: { pageIdx: 3, pageCount: 5 },
    },
];

// Fully custom-drawn screens: replicate the exact draw block from ui_render.mjs.
const CUSTOM_DRAW = [
    {
        // Font validation only (not wired into the manual): exercises the host
        // print() port so its glyphs/spacing can be eyeballed vs the device.
        file: '_fonttest', section: '(host-font self-test)',
        draw: () => {
            fill_rect(0, 0, 128, 12, 1);
            print(4, 3, 'PERFORMANCE', 0);
            print(2, 16, 'ABCDEFGHIJKLM', 1);
            print(2, 26, 'NOPQRSTUVWXYZ', 1);
            print(2, 36, 'abcdefg 0123456789', 1);
            print(2, 46, 'STEP 5  Track 8  +12', 1);
            print(2, 55, 'Suspend session?', 1);
        },
    },
    {
        file: 'step-editor', section: '6.3 Step edit (melodic)',
        // ui_render.mjs drawStepEditKitPage(title, cells, noteBox) — pure ui_movy.
        draw: () => {
            const noteBox = 'E 3';
            const cells = [
                { kind: 'blank', label: 'Note', name: 'Note', bigText: noteBox },
                { kind: 'blank', label: 'Oct',  name: 'Note', bigText: noteBox },
                { kind: 'valsq', label: 'Leng', name: 'Length', text: '1' },
                { kind: 'arc', label: 'Vel', name: 'Velocity', text: '100', norm: 100 / 127 },
                { kind: 'arcbip', label: 'Nudg', name: 'Nudge', text: '+0', signed: 0 },
                { kind: 'enumsq', label: 'Iter', name: 'Iteration', text: '--', options: ['--'], sel: 0 },
                { kind: 'arc', label: 'Prob', name: 'Probability', text: '100%', norm: 1 },
                { kind: 'valsq', label: 'Ratch', name: 'Ratchet', text: '--', options: ['--','2','3','4'], sel: 0 },
            ];
            kit.drawKitHeader('STEP 5', false);
            fill_rect(0, 9, 128, 1, 1);
            kit.drawKitCells(cells, -1);
            const BX = 6, BW = 52, BY = kit.MV_ROW0_Y, BH = kit.MV_KH;
            kit.rectOutline(BX, BY, BW, BH, 1);
            kit.mvPrint(BX + Math.round((BW - kit.mvWidth(noteBox)) / 2), BY + Math.floor((BH - 5) / 2), noteBox, 1);
        },
    },
    {
        file: 'bank-drum-notefx', section: '10.1 NOTE FX bank (drum lane box)',
        // ui_render.mjs drum bank===1: K1+K2 merged Oct/Note box + Vel/Quant/Len/Gate.
        draw: () => {
            const noteStr = 'C1 36';
            const cells = [
                { kind: 'blank', label: 'Oct',  name: 'Lane Note' },
                { kind: 'blank', label: 'Note', name: 'Lane Note' },
                { kind: 'arcbip', label: 'Vel', name: 'Velocity Offset', text: '+0', signed: 0 },
                { kind: 'arc', label: 'Quant', name: 'Quantize', text: '0%', norm: 0 },
                { kind: 'enumsq', label: 'Len>', name: 'Note Length', text: '1', options: ['--','.25','.50','.75','1','2','4','8','16'], sel: 4 },
                { kind: 'arc', label: '>Gate', name: 'Gate Time', text: '100%', norm: 100 / 400 },
                { kind: 'blank', label: '' },
                { kind: 'blank', label: '' },
            ];
            kit.drawKitHeader('NOTE FX', false);
            kit.drawKitCells(cells, -1);
            const BX = 6, BW = 52, BY = kit.MV_ROW0_Y, BH = kit.MV_KH;
            kit.rectOutline(BX, BY, BW, BH, 1);
            kit.mvPrint(BX + Math.round((BW - kit.mvWidth(noteStr)) / 2), BY + Math.floor((BH - 5) / 2), noteStr, 1);
        },
    },
    {
        file: 'bank-auto', section: '11.1 AUTO bank',
        // ui_render.mjs bank===6: inverted header, 2x4 lane cells (CC#/AT/Sch
        // label + value, active lane highlighted), automation graph + playhead.
        draw: () => {
            const lbl = ['CC74', 'CC71', 'AT', 'Sch1', 'CC1', '--', '--', '--'];
            const val = ['64', '40', '90', '100', '0', '--', '--', '--'];
            const activeLane = 0;
            kit.drawKitHeader('AUTOMATION', true);   // drawBankHeadingInverted
            for (let k = 0; k < 8; k++) {
                const colX = 4 + (k % 4) * 31, rowY = 11 + (k < 4 ? 0 : 18);
                const hi = (k === activeLane);
                if (hi) fill_rect(colX - 1, rowY - 1, 29, 18, 1);
                kit.mvPrint(colX, rowY + 1, lbl[k], hi ? 0 : 1);
                kit.mvPrint(colX, rowY + 10, val[k], hi ? 0 : 1);
            }
            // automation graph of the active lane (literal curve)
            const gY = 46, gH = 12;
            fill_rect(0, gY, 128, 1, 1); fill_rect(0, gY + gH - 1, 128, 1, 1);
            fill_rect(0, gY, 1, gH, 1); fill_rect(127, gY, 1, gH, 1);
            const dY = gY + 2, dH = gH - 4;
            let prevPy = -1;
            for (let gc = 1; gc < 127; gc++) {
                const gv = Math.round(64 + 60 * Math.sin(gc / 127 * Math.PI * 2));  // illustrative curve
                const py = dY + dH - 1 - Math.round(gv * (dH - 1) / 127);
                if (prevPy >= 0 && prevPy !== py) fill_rect(gc, Math.min(prevPy, py), 1, Math.abs(py - prevPy) + 1, 1);
                else fill_rect(gc, py, 1, 1, 1);
                prevPy = py;
            }
            fill_rect(48, gY + 1, 1, gH - 2, 1);   // playhead
        },
    },
    {
        file: 'view-perf', section: '12.2 Performance Mode',
        // ui_render.mjs drawPerfModeOled() — header bar, active-mods list
        // (mcufont), footer Hold/Sync/Latch chips + rate.
        draw: () => {
            clear_screen();
            fill_rect(0, 0, 128, 12, 1);
            globalThis.print(4, 3, 'PERFORMANCE', 0);
            globalThis.pixelPrint(4, 16, 'Oct +1  Vel Hf', 1);      // active mods (mcufont)
            globalThis.pixelPrint(4, 24, 'Gate 1/4  Reverse', 1);
            const fy = 53; let fx = 2;
            fx += _perfChip(fx, fy, 'Hold', false) + 3;
            fx += _perfChip(fx, fy, 'Sync', true) + 3;
            fx += _perfChip(fx, fy, 'Latch', false) + 3;
            const lab = '1/8', w = lab.length * 6 + 3, rx = 128 - w - 2;   // rate (right)
            fill_rect(rx, fy, w, 9, 1); globalThis.pixelPrint(rx + 2, fy + 2, lab, 0);
        },
    },
    {
        file: 'dialog-confirm', section: '(exemplar Yes/No confirm dialog)',
        // ui_dialogs.mjs drawStateWipeConfirm() — the standard confirm layout:
        // drawMenuHeader + prompt lines + No-left / Yes-right button row.
        draw: () => {
            clear_screen();
            drawMenuHeader('INCOMPATIBLE STATE');
            globalThis.print(4, 16, 'This session is from', 1);
            globalThis.print(4, 25, 'a different dAVEBOx', 1);
            globalThis.print(4, 34, 'version. Erase it?', 1);
            drawYesNoRow(0);   // Yes highlighted
        },
    },
    {
        file: 'bank-repeatgroove', section: '9.4 REPEAT GROOVE bank',
        // ui_render.mjs drum bank===5 (RPT GROOVE): 8-col velocity bar row.
        draw: () => {
            const gLen = 6;
            const vel = [127, 100, 84, 127, 116, 90, 0, 0];  // per-step velocity (illustrative)
            const gate = 0b00111101;                          // filled vs outline per step
            kit.drawKitHeader('REPEAT GROOVE', true);         // drawBankHeadingInverted
            const colW = 16, barW = 10, top = 14, bot = 54, numY = 57;
            fill_rect(0, bot + 1, 128, 1, 1);                 // velocity baseline
            for (let k = 0; k < 8; k++) {
                const x = k * colW + 3;
                if (k >= gLen) { fill_rect(x + 3, bot - 1, 4, 1, 1); continue; }
                const gateOn = !!(gate & (1 << k));
                const mag = Math.round(vel[k] / 127 * (bot - top));
                const y = bot - mag;
                if (gateOn) fill_rect(x, y, barW, mag, 1);
                else { kit.rectOutline(x, y, barW, Math.max(1, mag), 1); }
                const num = String(k + 1);
                kit.mvPrint(x + Math.round((barW - kit.mvWidth(num)) / 2), numY, num, 1);
            }
        },
    },
];


// ---- drive ----
const OUT = 'docs/working/img';
mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
let n = 0;
const emit = (file, section, name, drawFn) => {
    if (only && file !== only) return;
    if (!only && file.startsWith('_')) return;   // dev-only artifacts (e.g. _fonttest) unless named
    resetFb();
    drawFn();
    writePng(currentFb(), `${OUT}/${file}.png`);
    console.log(`  ${(file + '.png').padEnd(30)} ${section} — ${name}`);
    n++;
};
for (const s of BANK_SCREENS) {
    emit(s.file, s.section, BANKS[s.bank].name, () => {
        const cells = bankCells(s.bank, s.over || {});
        const pos = { pageIdx: s.bank, pageCount: 7 };
        kit.drawKitBankPage(cells, { headerText: BANKS[s.bank].name, ...pos,
            touchedIdx: s.touchedIdx ?? -1, altArrowShow: !!s.altArrowShow,
            footer: s.footer });
    });
}
for (const s of CUSTOM_KIT) {
    emit(s.file, s.section, s.header, () =>
        kit.drawKitBankPage(s.cells, { headerText: s.header, pageIdx: 0, pageCount: 6, touchedIdx: -1,
                                       footer: s.footer, ...(s.opts || {}) }));
}
for (const s of CUSTOM_DRAW) emit(s.file, s.section, 'custom draw', s.draw);
console.log(`\nwrote ${n} screen${n === 1 ? '' : 's'} to ${OUT}/`);
