import { readFileSync } from 'node:fs';
import HFONT from '../../tools/host_font_5x7.json';
/* The kit's list overlay sizes itself to its longest label (Josh, 2026-08-25).
 *
 * ⚠ The failure this pins is truncation that still LOOKS like a word:
 * 'AUTOMATION' came back as 'AUTOMAT' and 'SOUND + CONFIG' as 'SOUND +'. A
 * reader does not see a bug, they see a bank whose name they do not recognise.
 * So the observable is ink: render the row and measure how far the text
 * actually reaches, against how wide that string is in the same font.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const W = 128, H = 64;
let fb = new Uint8Array(W * H);
const px = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.set_pixel = px;
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, v); };
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};

/* ⚠⚠ THE REAL 5x7 ATLAS, not a fake. This file's whole method is to compare INK
 * drawn on the framebuffer against the font's own width function — so the two
 * must be the SAME font. A placeholder stub (say 6px per char) would draw one
 * width and measure another, and every assertion here would be comparing two
 * unrelated numbers while still going green.
 *
 * The overlay moved to the stock Schwung font on 2026-08-27, so the rig has to
 * provide it: proportional advance, each glyph trimmed to its ink, exactly as
 * js_display renders it on device and as tools/render_screens.mjs does offline. */
/* ⚠ Imported, not read from disk: esbuild bundles this test to CJS in /tmp,
 * where `import.meta.url` does not survive and a relative path resolves
 * nowhere. The import inlines the atlas into the bundle. */
const CHAR_SPACING = 1, CELL_W = 5;
function _inkBounds(rows) {
    let mn = 5, mx = -1;
    for (const b of rows) for (let x = 0; x < 5; x++) if (b & (1 << (4 - x))) { if (x < mn) mn = x; if (x > mx) mx = x; }
    return mx < 0 ? null : { mn, mx };
}
function _glyph(ch) { return HFONT[ch] ?? HFONT[ch.toUpperCase?.()] ?? null; }
globalThis.print = (x, y, t, col) => {
    let cx = x;
    for (const ch of String(t)) {
        const rows = _glyph(ch), b = rows ? _inkBounds(rows) : null;
        if (b) { for (let r = 0; r < 7; r++) for (let c = b.mn; c <= b.mx; c++)
                     if (rows[r] & (1 << (4 - c))) px(cx + (c - b.mn), y + r, col); }
        cx += b ? (b.mx - b.mn + 1) + CHAR_SPACING : CELL_W + CHAR_SPACING;
    }
};
globalThis.text_width = (t) => {
    let w = 0;
    for (const ch of String(t)) {
        const rows = _glyph(ch), b = rows ? _inkBounds(rows) : null;
        w += b ? (b.mx - b.mn + 1) + CHAR_SPACING : CELL_W + CHAR_SPACING;
    }
    return Math.max(0, w - CHAR_SPACING);
};

async function main() {
const kit = await import('../../ui/ui_movy.mjs');

/* ⚠ Two different measurements, and conflating them is what made the first
 * version of this file wrong: the BOX outline is ink, and so is the selected
 * row's filled highlight, so "widest ink anywhere" just reports the box.
 *
 * boxWidth() reads the top outline row; rowInk() reads ONE text row, inside the
 * outline, on a row that is not the selected one (so no fill underneath it). */
function span(y0, y1, x0, x1) {
    let lo = -1, hi = -1;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
            if (fb[y * W + x]) { if (lo < 0 || x < lo) lo = x; if (x > hi) hi = x; }
    return lo < 0 ? null : { lo, hi, w: hi - lo + 1 };
}
function boxWidth() {
    const s = span(kit.MV_ZOOM_Y, kit.MV_ZOOM_Y, 0, W - 1);
    return s ? s.w : 0;
}
/* The first list row's text, measured strictly inside the outline. */
function firstRowInk() {
    const box = span(kit.MV_ZOOM_Y, kit.MV_ZOOM_Y, 0, W - 1);
    if (!box) return 0;
    const n = 2, ROW_H = 9;
    const listTop = kit.MV_ZOOM_Y + Math.floor((kit.MV_ZOOM_H - n * ROW_H) / 2);
    const s = span(listTop, listTop + ROW_H - 2, box.lo + 1, box.hi - 1);
    return s ? s.w : 0;
}
function render(options, sel) {
    fb.fill(0);
    kit.drawKitListOverlay(options, sel);
}

const LONG = 'SOUND + CONFIG';

/* ⭑⭑ BOTH FONT PATHS ARE PINNED, because measuring in one font while drawing in
 * the other is this overlay's characteristic failure: the host font is
 * PROPORTIONAL and the kit's are fixed-cell, so a mismatched pair sizes the box
 * for one and truncates for the other — and the result still looks like a word,
 * which is the bug this whole file exists for.
 *
 * DEFAULT = the stock Schwung font: every overlay matches the menu it floats
 * over — the selection overlays and the enum value picker alike.
 * `hdrFont` = the BANK picker ONLY. It previews BANK NAMES, and a bank's own
 * header is always the header font, so the picker matches what you are about to
 * land on (Josh, 2026-08-27: "hdr in pickers is only for banks"). */
step('⭑ a long label renders in FULL, not cut to the old fixed box', () => {
    /* sel is the OTHER row, so LONG draws as plain text with no fill beneath. */
    render([LONG, 'CLIP'], 1);
    const got = firstRowInk();
    const want = globalThis.text_width(LONG);
    /* Within a pixel: the last glyph's advance carries no trailing gap. */
    if (got < want - 1)
        throw new Error('"' + LONG + '" drew ' + got + 'px of ink but needs ' + want +
                        'px — it is being truncated');
});

step('⚠ control: that label really is wider than the old 64px box', () => {
    /* Without this the assertion above would pass on a label that never needed
     * the growth, and the whole file would be measuring nothing. */
    if (globalThis.text_width(LONG) + 12 <= kit.MV_ZOOM_W)
        throw new Error('the fixture label fits the default box — it cannot detect ' +
                        'a regression to the fixed width');
});

step('⭑ hdrFont (the BANK picker) draws AND measures in the header font', () => {
    fb.fill(0);
    kit.drawKitListOverlay([LONG, 'CLIP'], 1, { hdrFont: true });
    const got = firstRowInk();
    const want = kit.hdrWidth(LONG);
    if (got < want - 1)
        throw new Error('"' + LONG + '" drew ' + got + 'px but needs ' + want +
                        'px in the header font — measured in one font, drawn in another');
    /* ⚠ Control: the two fonts must actually DIFFER on this label, or the step
     * above would pass while hdrFont silently drew the stock font. */
    if (Math.abs(globalThis.text_width(LONG) - want) < 4)
        throw new Error('the fixture is the same width in both fonts (' +
                        globalThis.text_width(LONG) + ' vs ' + want + ') — this step ' +
                        'cannot tell them apart, so pick a label that can');
});

/* ⚠⚠ AND THE BANK PICKER MUST ACTUALLY ASK FOR IT. The step above proves the
 * hdrFont PATH works; it says nothing about whether the one caller that needs it
 * passes it. Deleting `hdrFont: true` from ui_render left all 460 assertions
 * green — the mechanism was pinned, the call site was not.
 *
 * Source-pinned because drawBankPicker needs a live track/bank cycle to drive,
 * and the thing under test is one argument at one call site.
 * ⚠ Bounded by the call's own closing paren, never a character count — a pin
 * whose window is a magic number reports on how much prose sits inside it.
 * [[source-pins-window-must-be-structural]] */
step('⭑ the BANK picker call site passes hdrFont', () => {
    const src = readFileSync('ui/ui_render.mjs', 'utf8');
    const i = src.indexOf('drawKitListOverlay(');
    if (i < 0)
        throw new Error('no drawKitListOverlay call in ui_render — the bank picker moved, ' +
                        'so this pin is blind and must be re-anchored');
    const close = src.indexOf(');', i);
    if (close < 0) throw new Error('cannot find the end of the bank picker call');
    const call = src.slice(i, close);
    if (!/hdrFont\s*:\s*true/.test(call))
        throw new Error('the bank picker no longer passes hdrFont — it would draw bank ' +
                        'names in the stock font while the bank header it previews uses ' +
                        'the header font');
});

step('⭑ a SHORT enum keeps the kit footprint exactly — the box only GROWS', () => {
    /* The overlay is shared with every enum param picker. Growing where needed
     * is the fix; moving something that already fitted is a regression. */
    render(['Saw', 'Square', 'Tri'], 0);
    const got = boxWidth();
    if (got !== kit.MV_ZOOM_W)
        throw new Error('a short enum box is ' + got + 'px, expected the unchanged ' +
                        kit.MV_ZOOM_W + 'px');
});

step('⭑ ...and the long list DOES grow past it', () => {
    render([LONG, 'CLIP'], 1);
    const got = boxWidth();
    if (got <= kit.MV_ZOOM_W)
        throw new Error('the box stayed at ' + got + 'px — it never grew, so the ' +
                        'long label can only be fitting by being cut');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
