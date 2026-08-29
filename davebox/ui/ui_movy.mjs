/* ui_movy.mjs
 * Canvaskit/movy visual language for the track-view parameter pages: the
 * schwung-canvaskit v27 chassis (header font + page-indicator bar + inverted
 * touch header, movy widgets: arc knobs / bar toggles / enum + value squares,
 * proportional label strips with the name<->value touch swap, enum list
 * overlay) translated from the kit's ctx-based canvas contract onto davebox's
 * host draw globals (set_pixel / fill_rect). Pure drawing — NO imports, no S
 * access: callers pass precomputed cell descriptors, so this file also loads
 * standalone in node for the off-device previewer (tools/preview_movy.mjs).
 *
 * Provenance: widgets + label/5x3 fonts adapted from schwung-movy (MIT,
 * (c) 2026 megadake) via schwung-canvaskit; header font = "6x6 Pixel Font"
 * by asciimario (fontstruct.com/fontstructions/show/821131, CC BY-NC 3.0).
 *
 * Cell descriptor (everything precomputed by the caller — no param reads):
 *   { kind:  'blank' | 'arc' | 'arcbip' | 'hbar' | 'vbar' | 'enumsq' | 'valsq' | 'frac',
 *            ('valsq' = numeric / note read-out: big font, frameless — see
 *             drawBigNum; 'enumsq' = the framed micro-font square for NAMED
 *             enums, whose words don't fit the big font),
 *     label: short label strip text ("Stch"),
 *     name:  full param name for the touched header ("Beat Stretch"),
 *     text:  formatted value string ("x2", "1/16t", "OFF"),
 *     norm:  0..1 fill (arc / hbar),
 *     signed:-1..1 offset from center (arcbip),
 *     sq:    optional single-line square label (else derived from text),
 *     options / sel: enum option strings + selected index (enumsq overlay;
 *                    sel < 0 = unset, no overlay) }
 */

/* ---- layout (kit v27 vertical map, 128x64) ----
 * hdr 0-7 (text 1-6) | blank 8 | page bar 9 | gap 10-13 |
 * w0 14-29 | lbl0 30-36 | gap 37-40 | w1 41-56 | lbl1 57-63 */
export const MV_HDR_H = 8;
export const MV_BAR_Y = 9;
/* ⭑ Shifted UP 2px on 2026-08-25, into the space the header rule used to take.
 * The kit body used to end at row 62, flush against the panel edge; the latch
 * frame needs the bottom row, and content touching a frame reads as clipped
 * even when it is not. Josh: reclaim that space and bump things up. */
export const MV_ROW0_Y = 12, MV_LBL0_Y = 28, MV_ROW1_Y = 39, MV_LBL1_Y = 55;
export const MV_CELL_W = 32, MV_KW = 20, MV_KH = 16, MV_LBL_H = 7;
/* Centered overlay box shared by the turn-to-reveal value zoom (ui_render) and
 * the picker list overlay below — same footprint so both read as one control. */
export const MV_ZOOM_X = 32, MV_ZOOM_Y = 14, MV_ZOOM_W = 64, MV_ZOOM_H = 48;
const SCREEN_W = 128;
const SCREEN_H_LATCH = 64;   /* panel height, for the latch frame */

/* ===========================================================================
 * HDRFONT — davebox header font, full character set (v2)
 * Drop-in replacement for the HDR_G table + comment block in
 * davebox/ui/ui_movy.mjs (currently lines ~47-83, from "header font:" down
 * through the last override line before hdrGlyph()). Delete that whole span
 * and paste this in its place; hdrGlyph()/hdrWidth()/hdrPrint()/fitHdr() below
 * are unchanged and can stay as-is.
 *
 * What changed vs. the shipped font:
 *  - FIX '+': horizontal stroke was 2px thick, thinned to 1px.
 *  - REDESIGN '@': outer ring previously had no path into the inner swirl
 *    (col 4 dropped out for two rows running into it) — now continuous.
 *  - REDESIGN 'o': was an off-centre 4-wide ring; now a symmetric 1px ring,
 *    consistent with the 1px-stroke rule below.
 *  - FIX 'a' and 'q' in an earlier draft of this patch: 'a' had an orphan
 *    pixel disconnected from the rest of the glyph, 'q' rendered as two
 *    disconnected blobs. Both redrawn as clean single-story bowls (a: right
 *    foot stem; q mirrors g, its closed-bowl counterpart).
 *  - ADD full lowercase a-z. Straight-stem letters (b, f, h, i, k, l) reuse
 *    the 2px stem weight already used by d/t. Bowls and diagonals (a, c, e,
 *    g, m, n, p, q, r, s, u, v, w, y, z) use 1px strokes, same rule as the
 *    original x/o, to avoid blobbing at x-height. All are baseline-flush —
 *    g/j/p/q/y have no true descender (no row exists below baseline in a
 *    6-row cell); they're distinguished by silhouette only. Flag for design
 *    review if that reads ambiguous on hardware.
 *  - ADD punctuation previously unmapped: " ' & * ; = [ ] ^ _ ` { | } ~ \\
 *    Brackets are real glyphs now, but UI_LANGUAGE.md §2.1 still tells
 *    callers to prefer ( ) in headers — worth revisiting now that [ ] exist,
 *    otherwise no functional change needed there.
 *
 * Provenance unchanged: base design "6x6 Pixel Font" by asciimario
 * (fontstruct.com/fontstructions/show/821131, CC BY-NC 3.0); d/t/x/@ swap
 * lineage per prior comments in this file — @ and o glyph DATA changed above,
 * their reason-for-existing comments still apply.
 *
 * Glyph encoding unchanged: [advance, ...6 rowBits], bit0 = leftmost column;
 * [n] alone = blank glyph of that advance; null = unmapped (draws nothing).
 * =========================================================================== */
const HDR_G = [
  [7], [7,12,12,12,12,0,12], [7,10,10,0,0,0,0], [7,10,31,10,31,10,0], null, [7,51,48,12,12,3,51], [7,6,9,6,13,17,14], [5,4,4,0,0,0,0],
  [4,6,3,3,3,3,6], [4,3,6,6,6,6,3], [7,0,10,4,10,0,0], [7,0,12,63,12,12,0], [7,0,0,0,0,12,4], [7,0,0,30,30,0,0], [7,0,0,0,0,12,12], [7,48,48,12,12,3,3],
  [7,30,51,59,55,51,30], [7,12,14,12,12,12,30], [7,30,51,48,30,3,63], [7,30,48,28,48,51,30], [7,24,28,30,27,63,24], [7,31,3,31,48,51,30], [7,30,3,31,51,51,30], [7,63,51,48,24,12,12],
  [7,30,51,30,51,51,30], [7,30,51,51,62,48,30], [7,12,12,0,0,12,12], [7,12,12,0,0,12,4], [7,48,12,3,3,12,48], [7,0,30,0,0,30,0], [7,3,12,48,48,12,3], [7,30,51,24,12,0,12],
  [7,14,17,29,5,15,14], [7,30,51,51,63,51,51], [7,31,51,31,51,51,31], [7,30,51,3,3,51,30], [7,31,51,51,51,51,31], [7,63,3,31,3,3,63], [7,63,3,3,31,3,3], [7,30,51,3,59,51,62],
  [7,51,51,63,51,51,51], [7,30,12,12,12,12,30], [7,56,48,48,48,51,30], [7,51,27,15,15,27,51], [7,3,3,3,3,3,63], [7,35,55,63,43,35,35], [7,35,39,47,59,51,35], [7,30,51,51,51,51,30],
  [7,31,51,51,31,3,3], [7,30,51,51,59,19,46], [7,31,51,51,31,51,51], [7,30,3,30,48,51,30], [7,63,12,12,12,12,12], [7,51,51,51,51,51,30], [7,51,51,51,51,30,12], [7,35,35,43,63,55,35],
  [7,51,51,30,30,51,51], [7,51,51,51,30,12,12], [7,63,56,28,14,7,63], [5,6,2,2,2,2,6], [7,3,3,12,12,48,48], [5,12,8,8,8,8,12], [5,4,10,0,0,0,0], [7,0,0,0,0,0,63],
  [5,2,4,0,0,0,0], [7,0,0,14,17,30,16], [7,3,3,15,19,19,15], [7,0,0,14,1,1,14], [7,48,48,62,51,51,62], [7,0,0,14,17,31,14], [7,12,6,15,6,6,6], [7,0,0,14,17,30,24],
  [7,3,3,15,19,19,19], [7,0,3,0,3,3,3], [7,0,4,4,4,4,7], [7,3,3,19,15,11,19], [7,3,3,3,3,3,7], [7,0,0,31,21,21,21], [7,0,0,31,17,17,17], [7,0,0,14,17,17,14],
  [7,0,0,15,19,19,15], [7,0,0,14,17,15,3], [7,0,0,15,1,1,1], [7,0,0,14,2,8,14], [7,12,30,12,12,12,28], [7,0,0,17,17,17,31], [7,0,0,17,10,4,4], [7,0,0,17,21,21,10],
  [7,0,0,51,30,30,51], [7,0,0,17,10,4,6], [7,0,0,31,8,2,31], [5,6,2,2,3,2,6], [5,4,4,4,4,4,4], [5,12,8,8,24,8,12], [7,0,0,10,21,0,0]
];

/* ⚠⚠ WIRED IN 2026-08-26 from docs/incoming/hdrfont-full-v2.mjs, on Josh's word
 * ("let's get the expanded hdr font into the repo"). It had been parked since
 * 08-25 pending his spec for USES; the spec is still owed, but the font itself
 * is a drop-in and nothing calls the new glyphs until something asks for them.
 *
 * ⭑ The d/t/x/@/o overrides that used to sit BELOW this table are GONE — their
 * values are folded into the table above. Do not re-add them; a second
 * assignment would silently win over the table and re-open the exact drift the
 * old layout invited. Their design reasons, preserved:
 *   · 'd','t' — 2px stems, the weight straight-stem lowercase reuses.
 *   · 'x'     — 1px diagonals: a 2px x blobs at x-height.
 *   · '@'     — outer ring must keep a path into the inner swirl.
 *   · 'o'     — 1px symmetric ring, same anti-blob rule as 'x'.
 *
 * ⚠ KNOWN, FLAGGED BY THE FONT'S OWN AUTHOR, not yet judged on hardware:
 * g/j/p/q/y have NO TRUE DESCENDER — a 6-row cell has no row below the
 * baseline — so they are distinguished by silhouette alone. If that reads
 * ambiguous on the OLED, that is the thing to fix, and it is a design call
 * rather than a bug.
 *
 * ⚠ UI_LANGUAGE.md §2.1 still tells callers to prefer ( ) over [ ] in headers.
 * Brackets are REAL glyphs now rather than blanks, so that guidance is worth
 * revisiting — but it is guidance, not a constraint this table imposes. */

function hdrGlyph(cp) { return (cp < 0x20 || cp > 0x7E) ? null : HDR_G[cp - 0x20]; }

export function hdrWidth(text) {
    const s = String(text);
    let w = 0;
    for (let i = 0; i < s.length; i++) {
        const g = hdrGlyph(s.charCodeAt(i));
        w += g ? g[0] : 7;
    }
    return Math.max(0, w - 1);
}

export function hdrPrint(x, y, text, color) {
    const s = String(text);
    let cx = Math.round(x);
    const oy = Math.round(y), v = color ? 1 : 0;
    for (let i = 0; i < s.length; i++) {
        const g = hdrGlyph(s.charCodeAt(i));
        if (!g) { cx += 7; continue; }
        for (let r = 0; r < 6; r++) {
            const bits = g[1 + r] || 0;
            for (let c = 0; c < 15; c++) if (bits & (1 << c)) set_pixel(cx + c, oy + r, v);
        }
        cx += g[0];
    }
}

/* ALL-CAPS header text, trimmed from the end until it fits maxW px. */
export function fitHdr(text, maxW) {
    let t = String(text).toUpperCase();
    while (t.length > 0 && hdrWidth(t) > maxW) t = t.slice(0, -1);
    return t;
}

/* ---- movy main font (proportional, 5px tall; schwung-movy MIT) ----
 * Glyph: [advance, yOff, w, h, ...rowBits], bit0 = leftmost; -1px gap. */
const MV_G = [
  [6, 0, 0, 0],
  [3, 0, 3, 5, 2, 2, 2, 0, 2],
  [5, 0, 5, 2, 10, 10],
  [7, 0, 7, 5, 20, 62, 20, 62, 20],
  [7, 0, 7, 5, 60, 10, 28, 40, 30],
  [5, 0, 5, 5, 10, 8, 4, 2, 10],
  [5, 0, 5, 5, 4, 10, 4, 10, 12],
  [3, 0, 3, 2, 2, 2],
  [4, 0, 4, 5, 4, 2, 2, 2, 4],
  [4, 0, 4, 5, 2, 4, 4, 4, 2],
  [5, 1, 5, 3, 10, 4, 10],
  [5, 2, 5, 3, 4, 14, 4],
  [4, 4, 4, 3, 6, 4, 2],
  [5, 3, 5, 1, 14],
  [3, 4, 3, 1, 2],
  [5, 0, 5, 5, 8, 8, 4, 2, 2],
  [6, 0, 6, 5, 30, 18, 18, 18, 30],
  [5, 0, 5, 5, 6, 4, 4, 4, 14],
  [6, 0, 6, 5, 30, 16, 30, 2, 30],
  [6, 0, 6, 5, 30, 16, 28, 16, 30],
  [6, 0, 6, 5, 18, 18, 30, 16, 16],
  [6, 0, 6, 5, 30, 2, 30, 16, 30],
  [6, 0, 6, 5, 30, 2, 30, 18, 30],
  [6, 0, 6, 5, 30, 16, 8, 4, 4],
  [6, 0, 6, 5, 30, 18, 30, 18, 30],
  [6, 0, 6, 5, 30, 18, 30, 16, 30],
  [4, 1, 4, 3, 4, 0, 4],
  [4, 1, 4, 4, 4, 0, 4, 2],
  [5, 0, 5, 5, 8, 4, 2, 4, 8],
  [5, 2, 5, 3, 14, 0, 14],
  [5, 0, 5, 5, 2, 4, 8, 4, 2],
  [5, -1, 5, 6, 6, 8, 4, 4, 0, 4],
  [7, 0, 7, 5, 28, 32, 44, 42, 28],
  [6, 0, 6, 5, 12, 18, 30, 18, 18],
  [6, 0, 6, 5, 14, 18, 14, 18, 14],
  [6, 0, 6, 5, 12, 18, 2, 18, 12],
  [6, 0, 6, 5, 14, 18, 18, 18, 14],
  [6, 0, 6, 5, 30, 2, 14, 2, 30],
  [6, 0, 6, 5, 30, 2, 14, 2, 2],
  [6, 0, 6, 5, 12, 2, 26, 18, 12],
  [6, 0, 6, 5, 18, 18, 30, 18, 18],
  [3, 0, 3, 5, 2, 2, 2, 2, 2],
  [5, 0, 5, 5, 8, 8, 8, 10, 6],
  [5, 0, 5, 5, 10, 10, 6, 10, 10],
  [6, 0, 6, 5, 2, 2, 2, 2, 30],
  [7, 0, 7, 5, 30, 42, 42, 34, 34],
  [6, 0, 6, 5, 12, 18, 18, 18, 18],
  [6, 0, 6, 5, 12, 18, 18, 18, 12],
  [6, 0, 6, 5, 14, 18, 18, 14, 2],
  [6, 0, 6, 5, 12, 18, 18, 26, 28],
  [6, 0, 6, 5, 14, 18, 18, 14, 18],
  [6, 0, 6, 5, 28, 2, 12, 16, 14],
  [5, 0, 5, 5, 14, 4, 4, 4, 4],
  [6, 0, 6, 5, 18, 18, 18, 18, 12],
  [6, 0, 6, 5, 18, 18, 18, 10, 6],
  [7, 0, 7, 5, 34, 34, 42, 42, 30],
  [5, 0, 5, 5, 10, 10, 4, 10, 10],
  [6, 0, 6, 5, 18, 18, 28, 16, 14],
  [6, 0, 6, 5, 30, 16, 12, 2, 30],
  [4, 0, 4, 5, 6, 2, 2, 2, 6],
  [5, 0, 5, 5, 2, 2, 4, 8, 8],
  [4, 0, 4, 5, 6, 4, 4, 4, 6],
  [5, 0, 5, 2, 4, 10],
  [6, 5, 6, 1, 30],
  [4, 0, 4, 2, 2, 4],
  [6, 0, 6, 5, 12, 18, 30, 18, 18],
  [6, 0, 6, 5, 14, 18, 14, 18, 14],
  [6, 0, 6, 5, 12, 18, 2, 18, 12],
  [6, 0, 6, 5, 14, 18, 18, 18, 14],
  [6, 0, 6, 5, 30, 2, 14, 2, 30],
  [6, 0, 6, 5, 30, 2, 14, 2, 2],
  [6, 0, 6, 5, 12, 2, 26, 18, 12],
  [6, 0, 6, 5, 18, 18, 30, 18, 18],
  [3, 0, 3, 5, 2, 2, 2, 2, 2],
  [5, 0, 5, 5, 8, 8, 8, 10, 6],
  [5, 0, 5, 5, 10, 10, 6, 10, 10],
  [6, 0, 6, 5, 2, 2, 2, 2, 30],
  [7, 0, 7, 5, 30, 42, 42, 34, 34],
  [6, 0, 6, 5, 12, 18, 18, 18, 18],
  [6, 0, 6, 5, 12, 18, 18, 18, 12],
  [6, 0, 6, 5, 14, 18, 18, 14, 2],
  [6, 0, 6, 5, 12, 18, 18, 26, 28],
  [6, 0, 6, 5, 14, 18, 18, 14, 18],
  [6, 0, 6, 5, 28, 2, 12, 16, 14],
  [5, 0, 5, 5, 14, 4, 4, 4, 4],
  [6, 0, 6, 5, 18, 18, 18, 18, 12],
  [6, 0, 6, 5, 18, 18, 18, 10, 6],
  [7, 0, 7, 5, 34, 34, 42, 42, 30],
  [5, 0, 5, 5, 10, 10, 4, 10, 10],
  [6, 0, 6, 5, 18, 18, 28, 16, 30],
  [6, 0, 6, 5, 30, 16, 12, 2, 30],
  [5, 0, 5, 5, 12, 4, 2, 4, 12],
  [3, 0, 3, 5, 2, 2, 2, 2, 2],
  [5, 0, 5, 5, 6, 4, 8, 4, 6],
  [6, 0, 6, 2, 20, 10]
];

function mvGlyph(cp) { return (cp < 0x20 || cp > 0x7E) ? null : MV_G[cp - 0x20]; }

export function mvWidth(text) {
    const s = String(text);
    let w = 0;
    for (let i = 0; i < s.length; i++) {
        const g = mvGlyph(s.charCodeAt(i));
        w += g ? g[0] : 5;
        if (i < s.length - 1) w -= 1;
    }
    return w;
}

export function mvPrint(x, y, text, color) {
    const s = String(text);
    let cx = Math.round(x);
    const oy = Math.round(y), v = color ? 1 : 0;
    for (let i = 0; i < s.length; i++) {
        const g = mvGlyph(s.charCodeAt(i));
        if (!g) { cx += 5; continue; }
        const yOff = g[1], w = g[2], h = g[3];
        for (let r = 0; r < h; r++) {
            const bits = g[4 + r];
            for (let c = 0; c < w; c++) if (bits & (1 << c)) set_pixel(cx + c, oy + yOff + r, v);
        }
        cx += g[0];
        if (i < s.length - 1) cx -= 1;
    }
}

/* Integer-scaled movy print: each source pixel becomes a scale×scale block.
 * Width scales linearly, so mvWidth(text) * scale is the rendered width. */
export function mvPrintScaled(x, y, text, color, scale) {
    const s = String(text);
    let cx = Math.round(x);
    const oy = Math.round(y), v = color ? 1 : 0;
    for (let i = 0; i < s.length; i++) {
        const g = mvGlyph(s.charCodeAt(i));
        if (!g) { cx += 5 * scale; continue; }
        const yOff = g[1], w = g[2], h = g[3];
        for (let r = 0; r < h; r++) {
            const bits = g[4 + r];
            for (let c = 0; c < w; c++)
                if (bits & (1 << c))
                    fill_rect(cx + c * scale, oy + (yOff + r) * scale, scale, scale, v);
        }
        cx += g[0] * scale;
        if (i < s.length - 1) cx -= scale;
    }
}

/* ---- 5x3 micro font (schwung-movy glyphs5x3, MIT) — inside the squares ---- */
const PF3_CHARS = " !\"'()+,-./:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ%<>=?*";
const PF3_G = [
  [4,0,0,0],
  [4,0,3,5,1,1,1,0,1], [4,0,3,5,5,5,0,0,0], [4,0,3,5,2,2,0,0,0],
  [4,0,3,5,2,1,1,1,2], [4,0,3,5,1,2,2,2,1], [4,0,3,5,2,7,2,0,0],
  [4,0,3,5,0,0,3,3,2], [4,0,3,5,0,0,7,0,0], [4,0,3,5,0,0,0,3,3],
  [4,0,3,5,4,4,2,1,1], [4,0,3,5,3,3,0,3,3],
  [4,0,3,5,7,5,5,5,7], [4,0,3,5,2,3,2,2,7], [4,0,3,5,7,4,7,1,7],
  [4,0,3,5,7,4,6,4,7], [4,0,3,5,5,5,7,4,4], [4,0,3,5,7,1,7,4,7],
  [4,0,3,5,7,1,7,5,7], [4,0,3,5,7,4,4,4,4], [4,0,3,5,7,5,7,5,7],
  [4,0,3,5,7,5,7,4,7],
  [4,0,3,5,2,7,5,5,5], [4,0,3,5,7,5,3,5,7], [4,0,3,5,7,1,1,1,7],
  [4,0,3,5,3,5,5,5,3], [4,0,3,5,7,1,3,1,7], [4,0,3,5,7,1,3,1,1],
  [4,0,3,5,7,1,5,5,7], [4,0,3,5,5,5,7,5,5], [4,0,3,5,7,2,2,2,7],
  [4,0,3,5,4,4,4,5,7], [4,0,3,5,5,5,3,5,5], [4,0,3,5,1,1,1,1,7],
  [4,0,3,5,5,7,5,5,5], [4,0,3,5,5,3,5,5,5], [4,0,3,5,7,5,5,5,7],
  [4,0,3,5,7,5,7,1,1], [4,0,3,5,3,5,5,7,2], [4,0,3,5,7,5,3,5,5],
  [4,0,3,5,6,1,2,4,3], [4,0,3,5,7,2,2,2,2], [4,0,3,5,5,5,5,5,7],
  [4,0,3,5,5,5,5,5,2], [4,0,3,5,5,5,5,7,7], [4,0,3,5,5,5,2,5,5],
  [4,0,3,5,5,5,7,2,2], [4,0,3,5,7,4,2,1,7],
  [4,0,3,5,5,4,2,1,5], [4,0,3,5,4,2,1,2,4], [4,0,3,5,1,2,4,2,1],
  [4,0,3,5,7,0,7,0,0], [4,0,3,5,7,4,6,0,2], [4,0,3,5,2,7,2,5,0]
];

function pf3Glyph(ch) {
    const i = PF3_CHARS.indexOf(ch);
    return i >= 0 ? PF3_G[i] : null;
}

export function pf3Width(text) {
    const s = String(text).toUpperCase();
    let w = 0;
    for (let i = 0; i < s.length; i++) { const g = pf3Glyph(s[i]); w += g ? g[0] : 4; }
    return w;
}

export function pf3Print(x, y, text, color) {
    const s = String(text).toUpperCase();
    let cx = Math.round(x);
    const oy = Math.round(y), v = color ? 1 : 0;
    for (let i = 0; i < s.length; i++) {
        const g = pf3Glyph(s[i]);
        if (!g) { cx += 4; continue; }
        const yOff = g[1], w = g[2], h = g[3];
        for (let r = 0; r < h; r++) {
            const bits = g[4 + r];
            for (let c = 0; c < w; c++) if (bits & (1 << c)) set_pixel(cx + c, oy + yOff + r, v);
        }
        cx += g[0];
    }
}

/* ---- big font: 13pt Nokia bitmap (schwung-movy src/font/big.ts +
 * glyphs-big.ts, MIT) — cap-height 11px, ~9px-wide digits. The large numeric
 * readout movy uses for Tempo / Swing / Root / Condition / Length / Transpose.
 * Glyph format: [advance, yOff, w, h, ...rowBits], bit0 = leftmost pixel;
 * 1px inter-glyph gap (the source OTF leaves no side bearing). ---- */
export const MV_BIG_H = 11;
const BIG_GAP = 1;
const BIG_G = [
  [4, 0, 0, 0],// ' '
  [4, 0, 4, 11, 3, 3, 3, 3, 3, 3, 3, 3, 0, 3, 3],// '!'
  [7, 0, 7, 3, 27, 27, 9],// '"'
  [9, 1, 9, 10, 54, 54, 127, 127, 54, 54, 127, 127, 54, 54],// '#'
  [9, 0, 9, 12, 8, 62, 127, 11, 11, 63, 126, 104, 104, 127, 62, 8],// '$'
  [10, 0, 10, 11, 102, 101, 117, 51, 56, 24, 28, 204, 174, 166, 102],// '%'
  [10, 0, 10, 11, 30, 63, 3, 99, 254, 255, 99, 99, 99, 127, 62],// '&'
  [4, 0, 4, 3, 3, 3, 1],// "'"
  [6, 0, 6, 13, 12, 6, 6, 3, 3, 3, 3, 3, 3, 3, 6, 6, 12],// '('
  [6, 0, 6, 13, 3, 6, 6, 12, 12, 12, 12, 12, 12, 12, 6, 6, 3],// ')'
  [10, 2, 10, 9, 24, 24, 219, 255, 60, 255, 219, 24, 24],// '*'
  [8, 3, 8, 6, 12, 12, 63, 63, 12, 12],// '+'
  [5, 9, 5, 3, 6, 6, 3],// ','
  [7, 5, 7, 2, 31, 31],// '-'
  [4, 9, 4, 2, 3, 3],// '.'
  [6, 0, 6, 11, 12, 12, 12, 14, 6, 6, 6, 7, 3, 3, 3],// '/'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 99, 99, 127, 62],// '0'
  [8, 0, 8, 11, 48, 56, 60, 60, 48, 48, 48, 48, 48, 48, 48],// '1'
  [9, 0, 9, 11, 62, 127, 99, 96, 112, 56, 28, 14, 7, 127, 127],// '2'
  [9, 0, 9, 11, 62, 127, 99, 96, 60, 124, 96, 96, 99, 127, 62],// '3'
  [9, 0, 9, 11, 48, 56, 60, 54, 55, 51, 127, 127, 48, 48, 48],// '4'
  [9, 0, 9, 11, 63, 63, 3, 3, 63, 127, 96, 96, 99, 127, 62],// '5'
  [9, 0, 9, 11, 62, 127, 3, 63, 127, 99, 99, 99, 99, 127, 62],// '6'
  [9, 0, 9, 11, 127, 127, 48, 48, 24, 24, 12, 12, 12, 12, 12],// '7'
  [9, 0, 9, 11, 62, 127, 99, 99, 62, 127, 99, 99, 99, 127, 62],// '8'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 127, 126, 96, 99, 127, 62],// '9'
  [4, 5, 4, 6, 3, 3, 0, 0, 3, 3],// ':'
  [5, 5, 5, 7, 6, 6, 0, 0, 6, 6, 3],// ';'
  [8, 1, 8, 10, 48, 56, 28, 14, 7, 7, 14, 28, 56, 48],// '<'
  [7, 4, 7, 5, 31, 31, 0, 31, 31],// '='
  [8, 1, 8, 10, 3, 7, 14, 28, 56, 56, 28, 14, 7, 3],// '>'
  [9, 0, 9, 11, 62, 127, 99, 99, 120, 60, 12, 12, 0, 12, 12],// '?'
  [13, 0, 13, 11, 508, 1022, 1799, 1779, 1755, 1755, 2011, 1011, 7, 1022, 508],// '@'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 127, 127, 99, 99],// 'A'
  [9, 0, 9, 11, 63, 127, 99, 99, 63, 127, 99, 99, 99, 127, 63],// 'B'
  [9, 0, 9, 11, 62, 127, 3, 3, 3, 3, 3, 3, 3, 127, 62],// 'C'
  [9, 0, 9, 11, 63, 127, 99, 99, 99, 99, 99, 99, 99, 127, 63],// 'D'
  [9, 0, 9, 11, 127, 127, 3, 3, 31, 31, 3, 3, 3, 127, 127],// 'E'
  [9, 0, 9, 11, 127, 127, 3, 3, 31, 31, 3, 3, 3, 3, 3],// 'F'
  [9, 0, 9, 11, 62, 127, 3, 3, 115, 115, 99, 99, 99, 127, 126],// 'G'
  [9, 0, 9, 11, 99, 99, 99, 99, 127, 127, 99, 99, 99, 99, 99],// 'H'
  [4, 0, 4, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],// 'I'
  [7, 0, 7, 11, 24, 24, 24, 24, 24, 24, 24, 24, 24, 31, 15],// 'J'
  [9, 0, 9, 11, 99, 115, 59, 31, 15, 7, 15, 31, 59, 115, 99],// 'K'
  [8, 0, 8, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 63, 63],// 'L'
  [11, 0, 11, 11, 257, 387, 455, 495, 511, 443, 403, 387, 387, 387, 387],// 'M'
  [9, 0, 9, 11, 99, 99, 103, 103, 111, 111, 123, 123, 115, 115, 99],// 'N'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 99, 99, 127, 62],// 'O'
  [9, 0, 9, 11, 63, 127, 99, 99, 99, 127, 63, 3, 3, 3, 3],// 'P'
  [9, 0, 9, 12, 62, 127, 99, 99, 99, 99, 99, 99, 123, 127, 62, 96],// 'Q'
  [9, 0, 9, 11, 63, 127, 99, 99, 99, 63, 127, 99, 99, 99, 99],// 'R'
  [9, 0, 9, 11, 62, 127, 3, 3, 63, 126, 96, 96, 96, 127, 62],// 'S'
  [8, 0, 8, 11, 63, 63, 12, 12, 12, 12, 12, 12, 12, 12, 12],// 'T'
  [9, 0, 9, 11, 99, 99, 99, 99, 99, 99, 99, 99, 99, 127, 62],// 'U'
  [9, 0, 9, 11, 99, 99, 99, 99, 99, 99, 119, 54, 62, 28, 8],// 'V'
  [12, 0, 12, 11, 771, 771, 771, 771, 951, 438, 510, 510, 204, 204, 204],// 'W'
  [9, 0, 9, 11, 99, 99, 99, 54, 62, 28, 62, 54, 99, 99, 99],// 'X'
  [10, 0, 10, 11, 195, 195, 231, 102, 126, 60, 60, 24, 24, 24, 24],// 'Y'
  [9, 0, 9, 11, 127, 127, 96, 112, 56, 28, 14, 7, 3, 127, 127],// 'Z'
  [5, 0, 5, 13, 7, 7, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7],// '['
  [6, 0, 6, 11, 3, 3, 3, 7, 6, 6, 6, 14, 12, 12, 12],// '\\'
  [5, 0, 5, 13, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7],// ']'
  [5, 0, 5, 2, 2, 5],// '^'
  [9, 11, 9, 1, 127],// '_'
  [4, 0, 4, 2, 1, 2],// '`'
  [9, 3, 9, 8, 126, 127, 99, 99, 99, 99, 127, 126],// 'a'
  [9, 0, 9, 11, 3, 3, 3, 63, 127, 99, 99, 99, 99, 127, 63],// 'b'
  [8, 3, 8, 8, 30, 63, 3, 3, 3, 3, 63, 30],// 'c'
  [9, 0, 9, 11, 96, 96, 96, 126, 127, 99, 99, 99, 99, 127, 126],// 'd'
  [9, 3, 9, 8, 62, 127, 99, 127, 63, 3, 127, 62],// 'e'
  [7, 0, 7, 11, 28, 30, 6, 15, 15, 6, 6, 6, 6, 6, 6],// 'f'
  [9, 3, 9, 10, 126, 127, 99, 99, 99, 127, 126, 96, 126, 60],// 'g'
  [9, 0, 9, 11, 3, 3, 3, 63, 127, 99, 99, 99, 99, 99, 99],// 'h'
  [4, 0, 4, 11, 3, 3, 0, 3, 3, 3, 3, 3, 3, 3, 3],// 'i'
  [6, 0, 6, 13, 12, 12, 0, 12, 12, 12, 12, 12, 12, 12, 12, 15, 7],// 'j'
  [9, 0, 9, 11, 3, 3, 3, 99, 115, 63, 31, 51, 51, 99, 99],// 'k'
  [4, 0, 4, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],// 'l'
  [12, 3, 12, 8, 511, 1023, 819, 819, 819, 819, 819, 819],// 'm'
  [9, 3, 9, 8, 63, 127, 99, 99, 99, 99, 99, 99],// 'n'
  [9, 3, 9, 8, 62, 127, 99, 99, 99, 99, 127, 62],// 'o'
  [9, 3, 9, 10, 63, 127, 99, 99, 99, 99, 127, 63, 3, 3],// 'p'
  [9, 3, 9, 10, 126, 127, 99, 99, 99, 99, 127, 126, 96, 96],// 'q'
  [7, 3, 7, 8, 27, 31, 7, 3, 3, 3, 3, 3],// 'r'
  [8, 3, 8, 8, 62, 63, 3, 15, 60, 48, 63, 31],// 's'
  [6, 0, 6, 11, 6, 6, 6, 15, 15, 6, 6, 6, 6, 14, 12],// 't'
  [9, 3, 9, 8, 99, 99, 99, 99, 99, 99, 127, 126],// 'u'
  [9, 3, 9, 8, 99, 99, 99, 99, 119, 62, 28, 8],// 'v'
  [10, 3, 10, 8, 195, 195, 195, 219, 219, 255, 126, 102],// 'w'
  [9, 3, 9, 8, 99, 119, 62, 28, 28, 62, 119, 99],// 'x'
  [9, 3, 9, 10, 99, 99, 99, 99, 99, 127, 126, 96, 126, 60],// 'y'
  [9, 3, 9, 8, 127, 127, 56, 28, 14, 7, 127, 127],// 'z'
  [6, 0, 6, 13, 12, 6, 6, 6, 6, 6, 3, 6, 6, 6, 6, 6, 12],// '{'
  [4, 0, 4, 13, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],// '|'
  [6, 0, 6, 13, 3, 6, 6, 6, 6, 6, 12, 6, 6, 6, 6, 6, 3],// '}'
  [8, 6, 8, 3, 38, 63, 25],// '~'
];
function bigGlyph(cp) { return (cp < 0x20 || cp > 0x7E) ? null : BIG_G[cp - 0x20]; }

/* Tight punctuation. The source font gives '.' the same ~4px advance a letter
 * gets, so a decimal ate most of a digit's worth of a 32px cell and pushed
 * values like "0.25" over the fallback threshold. These advance by their INK
 * width instead, and tuck up against the character on their LEFT — which is
 * free, because every digit already carries ~2px of right side bearing.
 * The gap on their RIGHT is kept: the next character starts at its own left
 * edge with no bearing, so without it a "0.25" reads as "0.2 5".
 * Keyed by codepoint; the value is the advance. */
const BIG_TIGHT = { 0x2E: 2, 0x3A: 2, 0x2C: 3, 0x3B: 3, 0x2F: 5 };   /* . : , ; / */

/* Ink bounds per glyph, measured once: [leftmostCol, inkWidth]. Drives the
 * CONDENSED variant below. */
const BIG_INK = BIG_G.map((g) => {
    const w = g[2], h = g[3];
    let lo = 99, hi = -1;
    for (let r = 0; r < h; r++) {
        const bits = g[4 + r];
        for (let c = 0; c < w; c++) if (bits & (1 << c)) { if (c < lo) lo = c; if (c > hi) hi = c; }
    }
    return hi < 0 ? [0, 0] : [lo, hi - lo + 1];
});

/* CONDENSED: same glyphs, same 11px height, advances trimmed to ink width + 1
 * and the glyph shifted left onto its own ink. The source font is generously
 * spaced (a digit is 9px advance for 7px of ink), so this buys ~15% width with
 * no loss of legibility — enough for a 4-character value like "1/16" or a
 * 5-character "1/16T" in a 32px cell, which the normal spacing can't hold.
 * It is NOT a smaller font: mixing the two on a page reads as tracking, not
 * as two type sizes. */
const bigAdv = (cp, g, cond) => {
    const ink = BIG_INK[cp - 0x20][1];
    if (!cond) return BIG_TIGHT[cp] ?? g[0];
    if (!ink) return g[0];                      /* space */
    /* punctuation advances by its exact ink — it already gets a zero gap on
     * the left, and this is what lets "1/16T" hold a 32px cell */
    return BIG_TIGHT[cp] ? ink : ink + 1;
};
const bigGapAt = (a, b) => BIG_TIGHT[b] ? 0 : BIG_GAP;

/* Width of `text` in the big font (no trailing gap). `cond` = condensed. */
export function bigWidth(text, cond) {
    const s = String(text);
    let w = 0;
    for (let i = 0; i < s.length; i++) {
        const cp = s.charCodeAt(i);
        const g = bigGlyph(cp);
        w += g ? bigAdv(cp, g, cond) : 7;
        if (i < s.length - 1) w += bigGapAt(cp, s.charCodeAt(i + 1));
    }
    return w;
}

export function bigPrint(x, y, text, color, cond) {
    const s = String(text);
    let cx = Math.round(x);
    const oy = Math.round(y), v = color ? 1 : 0;
    for (let i = 0; i < s.length; i++) {
        const cp = s.charCodeAt(i);
        const g = bigGlyph(cp);
        if (!g) { cx += 7; continue; }
        const yOff = g[1], w = g[2], h = g[3];
        const shift = cond ? BIG_INK[cp - 0x20][0] : 0;   /* sit on the ink */
        for (let r = 0; r < h; r++) {
            const bits = g[4 + r];
            let c = 0;
            while (c < w) {
                if (bits & (1 << c)) {
                    const st = c;
                    while (c < w && (bits & (1 << c))) c++;
                    fill_rect(cx + st - shift, oy + yOff + r, c - st, 1, v);
                } else c++;
            }
        }
        cx += bigAdv(cp, g, cond);
        if (i < s.length - 1) cx += bigGapAt(cp, s.charCodeAt(i + 1));
    }
}

/* Largest form of `text` that fits `maxW`: normal spacing, else condensed,
 * else null (caller drops to the label font). Returns { w, cond }. */
export function bigFit(text, maxW) {
    const n = bigWidth(text, false);
    if (n <= maxW) return { w: n, cond: false };
    const c = bigWidth(text, true);
    if (c <= maxW) return { w: c, cond: true };
    return null;
}

/* ---- primitive helpers ---- */

export function plotLine(x1, y1, x2, y2, fg) {
    const dx = x2 - x1, dy = y2 - y1;
    const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        set_pixel(Math.round(x1 + dx * t), Math.round(y1 + dy * t), fg);
    }
}

/* The level card: a boxed read-out with a fill bar under it.
 *
 * ⭑ ONE drawer, because it is ONE control seen from several places (Josh,
 * 2026-08-24: Shift+Volume should "show everywhere as an overlay with the same
 * card we use for track volume adjustment in sound mode"). Sound mode's own
 * read-out and the global Shift+Volume overlay both come through here, so they
 * cannot drift into two cards that mean the same thing.
 *
 * `frac` is 0..1 — the caller owns the unit, because the units genuinely
 * differ: a chain slot or Move bus level is 0..2x, a MIDI track's volume is
 * CC 7 at 0..127. The card shows a proportion either way.
 */
export function drawLevelCard(valueText, frac) {
    const w = 100, h = 22, x = (128 - w) >> 1, y = 21;
    fill_rect(x, y, w, h, 0);          /* punch a hole in whatever is under us */
    draw_rect(x, y, w, h, 1);
    mvPrint(x + 5, y + 4, valueText, 1);
    const bw = w - 10;
    draw_rect(x + 5, y + 14, bw, 4, 1);
    const f = Math.max(0, Math.min(1, frac));
    const fillw = Math.round(bw * f);
    if (fillw > 0) fill_rect(x + 5, y + 14, fillw, 4, 1);
}

export function rectOutline(x, y, w, h, fg) {
    fill_rect(x, y, w, 1, fg);
    fill_rect(x, y + h - 1, w, 1, fg);
    fill_rect(x, y, 1, h, fg);
    fill_rect(x + w - 1, y, 1, h, fg);
}

/* The LATCH box: a 1px frame around the param area of a bank card, alternating
 * SOLID and SEGMENTED so it reads as live without blinking out (Josh,
 * 2026-08-25). A frame that vanishes on the off phase makes the whole page
 * twitch; one that changes texture animates without moving anything.
 *
 * It lives in the row the header rule used to occupy — the rule went with the
 * bank walk, and this is what the space was reclaimed FOR.
 *
 * ⚠ Drawn LAST, over the cells: the frame is 1px on the outer edge of the
 * panel, and a widget that reaches the edge would otherwise punch holes in it. */
export function drawKitLatchBox(y, dashed) {
    const x = 0, w = SCREEN_W, h = SCREEN_H_LATCH - y;
    if (!dashed) { rectOutline(x, y, w, h, 1); return; }
    for (let i = 0; i < w; i += 2) {
        set_pixel(x + i, y, 1);
        set_pixel(x + i, y + h - 1, 1);
    }
    for (let j = 0; j < h; j += 2) {
        set_pixel(x, y + j, 1);
        set_pixel(x + w - 1, y + j, 1);
    }
}

/* ---- widgets (movy language, kit v27 metrics: 16px tall in 32px cells) ---- */

function drawCircleBorder(cx, cy, r) {
    let x = r, y = 0, err = 0;
    while (x >= y) {
        if (y === 0) {
            /* cardinal extremes tucked to r-1 so the circle sits flush */
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
}

/* Arc knob at an explicit center + radius (the zoom overlay reuses this to draw
 * the exact same shape, just larger). */
export function drawArcKnobAt(cx, cy, r, norm, bipolar) {
    drawCircleBorder(cx, cy, r);
    if (bipolar) fill_rect(cx, cy - r + 1, 1, Math.max(2, Math.round(r / 3.5)), 1);
    const rad = (210 + norm * 300) * Math.PI / 180;
    const ex = Math.round(cx + (r - 1) * Math.sin(rad));
    const ey = Math.round(cy - (r - 1) * Math.cos(rad));
    plotLine(cx, cy, ex, ey, 1);
}

/* Arc knob: circle + pointer sweeping 300 degrees; bipolar adds a center tick. */
export function drawArcKnob(kx, ky, norm, bipolar) {
    drawArcKnobAt(kx + 10, ky + 7, 7, norm, bipolar);
}

/* ---- shared fill / curve treatment (upstream param-pages port) ------------
 *
 * Ported from schwung's src/shared/param_pages/{render_page,viz_draw}.mjs,
 * themselves ports of schwung-movy's renderer geometry (MIT, (c) 2026
 * megadake). Adapted from the injected-ctx contract onto davebox's bare draw
 * globals; the geometry and the reasoning are upstream's.
 *
 * ⭑ THERE IS EXACTLY ONE `fillCurveMass` AND ITS CALLERS SHARE IT. The filter
 * response, the EQ curve and the sample body are pictures of the maths; they
 * are allowed to differ in SHAPE and must not differ in TREATMENT. Upstream
 * enforced that by construction (one function, four callers) after a widget
 * catalog in which `ghost-fill` won all four of its sets. Do not give one graph
 * its own copy to tune.
 *
 * ⚠ CHECKER is 50%, the densest lattice at which a 1px stroke drawn on top of
 * it stays visibly separate from its own fill. */
export const MV_CHECKER = (x, y) => ((x + y) % 2) === 0;
export const MV_DIAG_HEAVY = (x, y) => (((x + y) % 4) !== 0);

/* Fill a rect through a pattern. Only ever SETS pixels — a dithered fill
 * composites over what is beneath it rather than punching a hole in it. */
export function fillDithered(x, y, w, h, pattern) {
    for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
            if (pattern(x + dx, y + dy)) set_pixel(x + dx, y + dy, 1);
}

/* Dashed vertical rule — the fader's rails. */
export function dashedVRule(x, y, h, dash, gap) {
    const d = dash || 1, g = (gap == null) ? 1 : gap, cycle = d + g;
    for (let i = 0; i < h; i++) if ((i % cycle) < d) set_pixel(x, y + i, 1);
}

/* Clear the four corners of a box — the house softening for every filled or
 * framed shape on the grid. */
export function notchCorners(x, y, w, h) {
    set_pixel(x, y, 0);
    set_pixel(x + w - 1, y, 0);
    set_pixel(x, y + h - 1, 0);
    set_pixel(x + w - 1, y + h - 1, 0);
}

/* Fill the mass of a column-defined curve through CHECKER, between the curve
 * and its zero line.
 *
 *   yAt      (px) => y, the SAME closure the stroke is drawn from, so the fill
 *            can never disagree with the line about where the curve is
 *   baseY    the graph's zero row — the floor for a unipolar graph (filter),
 *            the centre for a bipolar one (EQ, sample)
 *   mirrorAt optional (px) => y for a graph symmetric about its zero line (the
 *            sample body), so the mass spans crest to trough
 *
 * ⚠ Runs BEFORE the stroke at every call site. The stroke is solid and the fill
 * is not, so drawing the fill second punches its lattice through the line. */
export function fillCurveMass(x0, xEnd, yAt, baseY, topY, botY, mirrorAt) {
    const clip = (y) => (y < topY ? topY : (y > botY ? botY : y));
    for (let x = x0; x < xEnd; x++) {
        const a = clip(yAt(x));
        const b = clip(mirrorAt ? mirrorAt(x) : baseY);
        const lo = a < b ? a : b, hi = a < b ? b : a;
        for (let y = lo; y <= hi; y++) if (MV_CHECKER(x, y)) set_pixel(x, y, 1);
    }
}

/* ---- modulation dot ------------------------------------------------------
 *
 * Where a modulated param actually IS right now, riding the arc, while the
 * POINTER keeps showing the base you dialled in. Ported from param-pages'
 * drawModDot; the reasoning is carried because it is not recoverable from the
 * pixels:
 *
 * ⭑ Two values on one knob is the point. With the pointer chasing an LFO you
 *   lose sight of what you set — and turning the knob edits the base, not what
 *   you were watching.
 * ⭑ DRAWN EVEN WHEN IT COINCIDES with the pointer. The mark's absence must mean
 *   "nothing is modulating this", never "it happens to be at the base".
 * ⚠ A FIVE-PIXEL PLUS, not a 2x2 block: an even-sized mark cannot be centred on
 *   a pixel, so at the cardinal angles it rounds a whole pixel off its own
 *   track. An odd mark centres exactly at every angle; a full 3x3 is a blob on
 *   a knob this small, and one bare pixel is too faint against the ring.
 * ⚠ INSIDE the ring, not on it — MV_MOD_DOT_INSET is the dot's half-width plus
 *   a pixel of clearance, which is what stops it touching the ring at any angle
 *   and breaking the circle's silhouette. */
const MV_MOD_DOT_INSET = 2;

export function drawModDotAt(cx, cy, r, norm) {
    const n = norm < 0 ? 0 : (norm > 1 ? 1 : norm);
    const rr = Math.max(1, r - MV_MOD_DOT_INSET);
    const rad = (210 + n * 300) * Math.PI / 180;
    const x = Math.round(cx + rr * Math.sin(rad));
    const y = Math.round(cy - rr * Math.cos(rad));
    set_pixel(x, y, 1);
    set_pixel(x - 1, y, 1);
    set_pixel(x + 1, y, 1);
    set_pixel(x, y - 1, 1);
    set_pixel(x, y + 1, 1);
}

/* Cell-sized modulation dot — same centre/radius as drawArcKnob. */
export function drawModDot(kx, ky, norm) {
    drawModDotAt(kx + 10, ky + 7, 7, norm);
}

/* Horizontal bar filling left->right (toggles / 2-state enums). */
export function drawHBar(kx, ky, norm) {
    fill_rect(kx + 1, ky + 4, 18, 1, 1);
    fill_rect(kx + 1, ky + 10, 18, 1, 1);
    fill_rect(kx + 1, ky + 4, 1, 7, 1);
    fill_rect(kx + 18, ky + 4, 1, 7, 1);
    const fillW = Math.round(norm * 16);
    if (fillW > 0) fill_rect(kx + 2, ky + 5, fillW, 5, 1);
}

/* Vertical bar filling bottom->up — mix/level feel. The `fader` cell's widget
 * (canvaskit drawVBar): same 20x16 box as the arc, bar centred inside it. */
export function drawVBar(kx, ky, norm) {
    fill_rect(kx + 6, ky + 1, 8, 1, 1);
    fill_rect(kx + 6, ky + 14, 8, 1, 1);
    fill_rect(kx + 6, ky + 1, 1, 14, 1);
    fill_rect(kx + 13, ky + 1, 1, 14, 1);
    const fillH = Math.round(norm * 12);
    if (fillH > 0) fill_rect(kx + 7, ky + 2 + (12 - fillH), 6, fillH, 1);
}

/* FREE-SIZED vertical fader — the mixer-strip form of drawVBar, which is fixed
 * at one cell (8x16) and is far too small to read eight of at a glance.
 *
 * `markNorm` (0..1, or <0 for none) draws a reference tick — unity on a level
 * fader. ⚠ It is drawn as ears OUTSIDE the channel, not a line inside it: a
 * mark within the track is swallowed by the fill at exactly the moment you are
 * sitting on it, which is the moment it has to be visible. (Same reasoning, and
 * the same bug once, as the session gauge popup's unity tick.)
 *
 * Pure geometry, no state — the caller owns layout. */
export function drawVFader(x, y, w, h, norm, markNorm) {
    /* Channel: full-height outline, so an empty fader still reads as a fader
     * rather than as blank space. */
    rectOutline(x, y, w, h, 1);
    const innerH = h - 2;
    const n = norm < 0 ? 0 : norm > 1 ? 1 : norm;
    const fillH = Math.round(n * innerH);
    if (fillH > 0) fill_rect(x + 1, y + 1 + (innerH - fillH), w - 2, fillH, 1);
    if (markNorm >= 0 && markNorm <= 1) {
        const my = y + 1 + Math.round((1 - markNorm) * (innerH - 1));
        fill_rect(x - 2, my, 2, 1, 1);
        fill_rect(x + w, my, 2, 1, 1);
    }
}

/* Framed box with a big diagonal cross — DRAWN, not a font glyph (movy
 * drawXBox). "This modulation target is None": an empty-slot affordance that
 * reads as "nothing routed here" at a glance. */
export function drawXBox(kx, ky) {
    rectOutline(kx, ky, MV_KW, MV_KH, 1);
    const a = 3, b = MV_KW - 1 - 3;          /* inset the cross from the frame */
    plotLine(kx + a, ky + a, kx + b, ky + MV_KH - 1 - a, 1);
    plotLine(kx + b, ky + a, kx + a, ky + MV_KH - 1 - a, 1);
}

/* Two <=3-char 5x3 lines for the enum square. Single line when it fits;
 * musical rates split after the "n/m" group ("1/16T" -> "1/16" + "T"). */
function sqLines(text) {
    const t = String(text).toUpperCase();
    if (pf3Width(t) <= MV_KW - 2) return [t, ''];
    const m = t.match(/^(\d+\/\d+)(.+)$/);
    if (m && pf3Width(m[1]) <= MV_KW - 2 && pf3Width(m[2]) <= MV_KW - 2) return [m[1], m[2]];
    const parts = t.replace(/[_\-]/g, ' ').trim().split(/\s+/);
    if (parts.length >= 2) return [parts[0].substring(0, 4), parts[1].substring(0, 4)];
    return [t.substring(0, 4), t.substring(4, 8)];
}

/* Framed square with the enum value (1-2 micro-font lines, or `sq` label). */
export function drawEnumSquare(kx, ky, text, sq) {
    rectOutline(kx, ky, MV_KW, MV_KH, 1);
    const lines = sq != null ? [String(sq), ''] : sqLines(text);
    const inner = MV_KW - 2;
    const totalH = lines[1].length > 0 ? 11 : 5;
    const startY = ky + 1 + Math.floor((MV_KH - 2 - totalH) / 2);
    pf3Print(kx + 1 + Math.floor((inner - pf3Width(lines[0])) / 2), startY, lines[0], 1);
    if (lines[1].length > 0)
        pf3Print(kx + 1 + Math.floor((inner - pf3Width(lines[1])) / 2), startY + 6, lines[1], 1);
}

/* Musical length as a STACKED FRACTION — frameless, centred across the FULL
 * 32px cell: numerator, rule, denominator in the 6x6 header font. The sibling
 * of drawBigNum for values that are true fractions, and the answer for the
 * delay times, whose 5-character labels don't fit the big read-out even
 * condensed.
 *
 * A triplet/dotted suffix modifies the WHOLE fraction, not the denominator,
 * so it sits OUTSIDE the stack: the rule spans only numerator/denominator and
 * the suffix sits to its right on the denominator's line. Stacking it INTO
 * the denominator (the first cut) read as "one over sixteen-d".
 *
 * Vertical budget is the whole story: 6 + rule + 6 = 13px of ink in a 16px
 * row, so the parts sit at ky+0 and ky+9 with the rule at ky+7 — the only
 * arrangement leaving clear space on both sides of the rule. The BOXED 5x3
 * version (movy's drawLengthSquare) failed here: the frame stole 2px a side
 * and its parts touched the rule outright. */
export function drawFracStack(cellX, ky, text) {
    const t = String(text);
    const m = t.match(/^(\d+)\/(\d+)([A-Za-z]*)$/);
    /* Not an n/m fraction ("1bar", "--"): these sets are mixed, so fall back
     * to the big read-out rather than a small centred string — the two forms
     * then read as one hierarchy instead of two different widgets. */
    if (!m) return drawBigNum(cellX, ky, t);
    const num = m[1], den = m[2], sfx = m[3];
    const nw = hdrWidth(num), dw = hdrWidth(den);
    const fracW = Math.max(nw, dw) + 2;     /* rule overhangs the wider part */
    const sw = sfx ? hdrWidth(sfx) : 0;
    const total = fracW + (sfx ? SFX_GAP + sw : 0);
    const left = cellX + Math.round((MV_CELL_W - total) / 2);
    hdrPrint(left + Math.round((fracW - nw) / 2), ky, num, 1);
    fill_rect(left, ky + 7, fracW, 1, 1);
    hdrPrint(left + Math.round((fracW - dw) / 2), ky + 9, den, 1);
    /* suffix on the denominator's line, past the rule's right end — it sits
     * WITH the value rather than floating beside it, while the rule still
     * stops short of it (the mark modifies the fraction, not the denominator) */
    if (sfx) hdrPrint(left + fracW + SFX_GAP, ky + 9, sfx, 1);
}
const SFX_GAP = 2;

/* One-shot / relative action square. Resting: just "< >" ("turn either way").
 * While its knob is touched the VALUE takes over the box (mirroring the
 * label<->value swap). `oneWay` (Lgto-style destructive actions) stays "< >"
 * even while touched — there is no value to show. */
export function drawActionSquare(kx, ky, text, oneWay, touched) {
    rectOutline(kx, ky, MV_KW, MV_KH, 1);
    const t = (touched && !oneWay) ? String(text) : '< >';
    const w = pf3Width(t);
    pf3Print(kx + 1 + Math.floor((MV_KW - 2 - w) / 2), ky + 1 + Math.floor((MV_KH - 2 - 5) / 2), t, 1);
}

/* Playback-direction square: arrow glyphs per mode —
 * 0 Fwd ►, 1 Bwd ◄, 2 PPf ◄ ► (outward), 3 PPb ► ◄ (inward). */
export function drawDirSquare(kx, ky, mode) {
    rectOutline(kx, ky, MV_KW, MV_KH, 1);
    const cy = ky + Math.floor(MV_KH / 2);
    const tri = (x, dir) => {   /* 4-col solid triangle; dir 1 = points right */
        for (let c = 0; c < 4; c++) {
            const h = dir > 0 ? 7 - 2 * c : 1 + 2 * c;
            fill_rect(x + c, cy - (h >> 1), 1, h, 1);
        }
    };
    const mid = kx + Math.floor(MV_KW / 2);
    if (mode === 0)      tri(mid - 2, 1);
    else if (mode === 1) tri(mid - 2, -1);
    else if (mode === 2) { tri(mid - 7, -1); tri(mid + 3, 1); }   /* outward */
    else                 { tri(mid - 7, 1);  tri(mid + 3, -1); }  /* inward */
}

/* Big numeric readout (movy's 'preset' render style): the value in the 13pt
 * font, NO frame, centered across the FULL 32px cell — it spills into the side
 * margins the 20px widget box leaves, which is what buys the extra digits.
 * `cellX` is the cell's left edge, not the widget box's. Falls back to the
 * label font when the text is too wide (4+ digits) so it always fits. */
export function drawBigNum(cellX, ky, text) {
    const t = String(text);
    const fit = bigFit(t, MV_CELL_W);
    if (fit) {
        bigPrint(cellX + Math.round((MV_CELL_W - fit.w) / 2),
                 ky + Math.floor((MV_KH - MV_BIG_H) / 2), t, 1, fit.cond);
    } else {
        const sw = mvWidth(t);
        mvPrint(cellX + Math.round((MV_CELL_W - sw) / 2),
                ky + Math.floor((MV_KH - 5) / 2), t, 1);
    }
}

/* ---- chrome ---- */

/* Resting header (davebox flavor — colors inverted vs kit v27, Josh's call):
 * filled white bar, black text, left-aligned, ALL CAPS. `invert` = the
 * secondary-bank variant (ARP IN / AUTO): white-on-black. */
export function drawKitHeader(text, invert, maxW) {
    /* UPPERCASE for the same reason drawKitList does it: this font keeps true
     * lowercase `d` and `t` glyphs and maps every other lowercase letter to its
     * capital, so mixed-case titles come out with two odd letters. A no-op for
     * everything else.
     *
     * ⚠ maxW exists because the header band is not empty on the right: a bank
     * page draws the alt-param arrow at x=121 INSIDE this band, so trimming to
     * the full width lets a long title slide under it (Josh spotted the
     * omission). Callers that share the band pass their real budget. */
    const t = fitHdr(String(text).toUpperCase(), maxW || (SCREEN_W - 4));
    if (invert) {
        hdrPrint(2, 1, t, 1);
    } else {
        fill_rect(0, 0, SCREEN_W, MV_HDR_H, 1);
        hdrPrint(2, 1, t, 0);
    }
}

/* Touched header: the bar drops out and the param NAME renders centered in
 * white — the state flip is the touch feedback; the label strip below shows
 * the VALUE. No page bar in this state. */
export function drawKitTouchedHeader(name) {
    const t = fitHdr(name, SCREEN_W - 4);
    hdrPrint(Math.max(2, Math.round((SCREEN_W - hdrWidth(t)) / 2)), 1, t, 1);
    fill_rect(0, MV_BAR_Y, SCREEN_W, 1, 1);   /* same rule as the resting header */
}

/* Brand header: the kit header bar carrying the wordmark VERBATIM.
 * drawKitHeader uppercases — right for screen titles, wrong for "dAVEBOx",
 * whose minuscules are the mark (the font carries true 'd' and 'x' for it). */
export function drawKitBrandHeader() {
    const t = 'dAVEBOx';
    fill_rect(0, 0, SCREEN_W, MV_HDR_H, 1);
    hdrPrint(Math.max(2, Math.round((SCREEN_W - hdrWidth(t)) / 2)), 1, t, 0);
}

/* Page-indicator bar (row 9, resting only) — kit v28 port: one segment per
 * bank split by 1px dividers; the ACTIVE segment FLASHES between solid and
 * dotted (every other px) at ~1.3Hz; the rest stay solid. Rounding remainder
 * is spread across the first segments so every segment reads the same width.
 * (Redraw cadence: pollDSP dirties the screen every few ticks, which keeps
 * the flash animating on resting views.) */
/* ⚠ There is NO header rule on a bank card. It used to be drawKitPageBar — a
 * scroll position for a jog that stepped through banks one at a time — and when
 * the jog became a named list the segments described navigation that no longer
 * happens. Josh then took the line itself: the header is a filled white bar, so
 * it already separates itself, and a rule under it was drawing a boundary that
 * was not in question.
 *
 * The segmented bar is NOT retired — module param PAGES still scroll, and there
 * it means what it says. */

export function drawKitPageBar(idx, count) {
    if (count <= 1) { fill_rect(0, MV_BAR_Y, SCREEN_W, 1, 1); return; }
    const blinkOn = Math.floor(Date.now() / 375) % 2 === 0;
    const usable = SCREEN_W - (count - 1);
    const base = Math.floor(usable / count), rem = usable % count;
    for (let b = 0, sx = 0; b < count; b++) {
        const sw = base + (b < rem ? 1 : 0);
        if (b !== idx || blinkOn) {
            fill_rect(sx, MV_BAR_Y, sw, 1, 1);
        } else {
            for (let x = sx; x < sx + sw; x += 2) set_pixel(x, MV_BAR_Y, 1);
        }
        sx += sw + 1;
    }
}

/* ---- envelope graphic --------------------------------------------------
 * An ADSR drawn ACROSS a run of cells in place of their individual widgets —
 * the shape is the control. Kit v27 port of core/engine.js drawEnvelopeRow.
 *
 * `env` = { start, count, roles } where `start` is a CELL index (0-7) and
 * roles names the stages present in column order: "adsr" | "ad" | "ar" |
 * "asr" | "ads". Sustain is always a LEVEL, never a time.
 *
 * Geometry derives from the span, never the screen, so the same code draws a
 * 2-cell AD and a 4-cell ADSR. Stage fractions are movy's hand-tuned
 * full-line values re-expressed as fractions of the span (A .21, D .194,
 * gate-off .694, R .266 — at a 4-cell span these reproduce the original
 * 26/24/88/33 pixel values). With fewer time stages each gets a roomier
 * share, so a short envelope reads at its width instead of huddling left. */
function dottedV(x, y0, y1) {
    const a = Math.min(y0, y1), b = Math.max(y0, y1);
    for (let y = a; y <= b; y += 2) set_pixel(x, y, 1);
}

function envNorm(cell) {
    if (!cell) return 0;
    if (cell.kind === 'arcbip') return 0.5 + (cell.signed || 0) / 2;
    return cell.norm || 0;
}

export function drawKitEnvelopeRow(rowY, cells, env) {
    const roles = env.roles || 'adsr';
    const has = (r) => roles.indexOf(r) >= 0;
    const col = env.start % 4;                 /* column within this row */

    const leftX = col * MV_CELL_W + 2;
    const rightX = (col + env.count) * MV_CELL_W - 2;
    const span = rightX - leftX;
    const baseY = rowY + MV_KH - 2, topY = rowY + 1;
    const usableH = baseY - topY;

    /* One value per stage, read from the cell at that stage's column. */
    const val = {};
    for (let k = 0; k < roles.length; k++) val[roles[k]] = envNorm(cells[env.start + k]);

    const timeStages = (has('a') ? 1 : 0) + (has('d') ? 1 : 0) + (has('r') ? 1 : 0);
    const k = timeStages >= 3 ? 1 : (timeStages === 2 ? 1.7 : 2.2);
    const GAP = Math.max(2, Math.round(span * 0.032));
    const A_F = 0.21 * k, D_F = 0.194 * k, R_F = 0.266 * k;
    const gateX = leftX + Math.round(span * 0.694);

    const susY = has('s') ? baseY - Math.round((val['s'] || 0) * usableH) : baseY;
    const pts = [[leftX, baseY]];

    const peakX = Math.min(rightX - 2, leftX + Math.round((val['a'] || 0) * span * A_F));
    pts.push([peakX, topY]);
    let cur = peakX;
    if (has('d')) {
        cur = Math.min(rightX - 2, cur + GAP + Math.round((val['d'] || 0) * span * D_F));
        if (has('s') && has('r') && cur > gateX - 2) cur = gateX - 2;
        pts.push([cur, susY]);
    } else if (has('s')) {
        pts.push([cur, susY]);
    }
    let plateauEnd = cur;
    if (has('s')) {
        plateauEnd = has('r') ? gateX : rightX;
        if (plateauEnd > cur) { pts.push([plateauEnd, susY]); cur = plateauEnd; }
    }
    if (has('r')) {
        const endX = Math.min(rightX, cur + GAP + Math.round((val['r'] || 0) * span * R_F));
        pts.push([endX, baseY]);
    }

    for (let i = 0; i < pts.length - 1; i++)
        plotLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1);
    /* Dotted verticals highlight the plateau timing (the two middle corners). */
    if (has('s')) {
        if (has('d')) dottedV(pts[2][0], susY, baseY);
        if (has('r')) dottedV(plateauEnd, susY, baseY);
    }
    /* Bold vertex dots, nudged so the 2x2 marker straddles the vertex. */
    for (const p of pts) {
        fill_rect(Math.min(SCREEN_W - 2, Math.max(0, p[0] - 1)),
                  Math.max(rowY, p[1] - 1), 2, 2, 1);
    }
}

/* ---- filter response curve ---------------------------------------------
 * A filter curve drawn across TWO cells (cutoff + resonance) in place of their
 * knobs — the response IS the control. Kit v27 port of core/engine.js
 * drawFilterCurve (itself from movy filter-curve.ts v0.23.0). The corner sits
 * at the cutoff's x-position; resonance sets the bump magnitude.
 *
 * `viz` = { start, cutoffNorm, resoNorm, mode, steep } where `start` is the
 * left CELL index and mode is lp | hp | bp | notch | peak | ap | off.
 *
 * Unlike the kit this takes normalised values directly rather than reading
 * params — the render cells already carry `norm`, and layer C owns all value
 * access. */
const FILT_PASS = 0.62;   /* nominal pass-band gain (0..1 of the cell height) */
/* Keep the corner this far inside the span so the roll-off stays visible even
 * fully open/closed — never a bare flat line. */
const FILT_EDGE = 0.10;

function filtBump(u, c, w) { return Math.exp(-Math.pow((u - c) * w, 2)); }

function dottedH(x0, x1, y) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 2) set_pixel(x, y, 1);
}

/* Gain 0..1 at horizontal position u (0..1 across the span). The lp/hp
 * roll-off is a quarter-ellipse: rounded at the corner, near-vertical where it
 * meets the floor, and 0 beyond — so the line ENDS at the bottom axis instead
 * of running on along it as a false floor. */
function filtGainAt(u, mode, c, r, steep) {
    const cx = FILT_EDGE + c * (1 - 2 * FILT_EDGE);
    const dropW = steep ? 0.07 : 0.11;
    const pk = r * (1 - FILT_PASS);
    const top = FILT_PASS + pk;
    const ellipse = (dist) => {
        const t = dist / dropW;
        return t >= 1 ? 0 : top * Math.sqrt(1 - t * t);
    };
    const shoulder = (dist) => FILT_PASS + pk * filtBump(dist, 0, 8);
    switch (mode) {
        case 'lp': return u <= cx ? shoulder(cx - u) : ellipse(u - cx);
        case 'hp': return u >= cx ? shoulder(u - cx) : ellipse(cx - u);
        case 'bp': return Math.min(1, top * filtBump(u, cx, 5 + r * 4));
        case 'notch':
            return Math.max(0, FILT_PASS - FILT_PASS * (0.5 + 0.5 * r) * filtBump(u, cx, 7));
        case 'peak':
            return Math.min(1, FILT_PASS * 0.7 +
                (0.3 + 0.6 * r) * (1 - FILT_PASS * 0.7) * filtBump(u, cx, 6));
        default: return FILT_PASS;   /* ap / off — flat */
    }
}

export function drawKitFilterCurve(rowY, viz) {
    const col = viz.start % 4;
    const x0 = col * MV_CELL_W + 1;
    const spanW = 2 * MV_CELL_W - 2;
    const topY = rowY + 1, botY = rowY + MV_KH - 2;
    const h = botY - topY;

    const mode = viz.mode || 'lp';
    const cutoff = Math.max(0, Math.min(1, viz.cutoffNorm || 0));
    const reso = Math.max(0, Math.min(1, viz.resoNorm || 0));

    dottedH(x0, x0 + spanW, botY);            /* frequency axis */
    if (mode === 'ap' || mode === 'off') {
        dottedH(x0, x0 + spanW, Math.round(botY - FILT_PASS * h));
        return;
    }
    const yAt = (px) => {
        const g = filtGainAt((px - x0) / spanW, mode, cutoff, reso, !!viz.steep);
        return Math.max(topY, Math.min(botY, Math.round(botY - g * h)));
    };
    /* ⭑ GHOST FILL is OPT-IN (`viz.fill`), and the default is off because this
     * curve already ships on davebox's own bank pages: turning it on for every
     * existing caller would restyle a live screen nobody asked to change. A
     * bank that wants the passband as MASS says so. See fillCurveMass — the
     * treatment is shared with the EQ curve and the sample body, deliberately.
     *
     * Unipolar: the zero line is the floor, so this is literally the area under
     * the curve. A column already on the floor fills nothing, which is what
     * keeps a stopband empty rather than giving it a one-row lid. */
    if (viz.fill) fillCurveMass(x0, x0 + spanW, yAt, botY, topY, botY);
    /* Skip runs lying flat on the bottom axis so the curve ends where it
     * reaches the floor rather than continuing along it. */
    let prevX = x0, prevY = yAt(x0);
    for (let px = x0 + 1; px <= x0 + spanW; px++) {
        const y = yAt(px);
        if (prevY < botY || y < botY) plotLine(prevX, prevY, px, y, 1);
        prevX = px; prevY = y;
    }
}

/* ---- EQ response curve -------------------------------------------------
 *
 * Ported from param-pages' viz_draw.mjs drawEq, itself schwung-movy's
 * renderer/eq-curve.ts (MIT, (c) 2026 megadake). Three weighted bands summed
 * into one signed curve about a dotted centre line: two shelves and a bell.
 *
 * ⭑ OPT-IN, LIKE THE ENVELOPE AND THE FILTER. Nothing detects an EQ — a bank
 * declares `eq` and names the cells the graphic covers. davebox has no metadata
 * to detect from and upstream's detector is engine-side; a renderer that
 * guesses would restyle a page as a side effect of renaming a param.
 *
 * `viz` = { start, count (default 2), low, mid, high, fill } where the three
 * gains are SIGNED -1..1 (each band's value normalised against its OWN declared
 * range) and any of them may be omitted. Pure — layer C resolves the values. */
const EQ_SHELF_LO = (u) => 1 / (1 + Math.exp((u - 0.28) * 11));
const EQ_SHELF_HI = (u) => 1 / (1 + Math.exp((0.72 - u) * 11));
const EQ_BELL_MID = (u) => Math.exp(-Math.pow((u - 0.5) / 0.20, 2));

export function drawKitEqCurve(rowY, viz) {
    const col = viz.start % 4;
    const count = viz.count || 2;
    const x0 = col * MV_CELL_W + 1;
    const spanW = count * MV_CELL_W - 2;
    const topY = rowY + 1, botY = rowY + MV_KH - 2;
    const midY = Math.round((topY + botY) / 2);
    const amp = (botY - topY) / 2;

    dottedH(x0, x0 + spanW, midY);            /* 0 dB */

    const clampS = (v) => (v == null ? 0 : (v < -1 ? -1 : (v > 1 ? 1 : v)));
    const lo = clampS(viz.low), mid = clampS(viz.mid), hi = clampS(viz.high);
    const gainAt = (u) => {
        const v = lo * EQ_SHELF_LO(u) + mid * EQ_BELL_MID(u) + hi * EQ_SHELF_HI(u);
        return v < -1 ? -1 : (v > 1 ? 1 : v);
    };
    const yAt = (px) => Math.round(midY - gainAt((px - x0) / spanW) * amp);

    /* ⚠ BIPOLAR mass: the zero line is the CENTRE, so a cut fills downward and
     * a boost upward. Filling to the floor instead would detach the shape from
     * its own ink on every cut, which is the honest reading inverted. */
    if (viz.fill) fillCurveMass(x0, x0 + spanW, yAt, midY, topY, botY);

    let prevX = x0, prevY = yAt(x0);
    for (let px = x0 + 1; px <= x0 + spanW; px++) {
        const y = yAt(px);
        plotLine(prevX, prevY, px, y, 1);
        prevX = px; prevY = y;
    }
}

/* ---- sample track ------------------------------------------------------
 *
 * Ported from param-pages' viz_draw.mjs drawSample (schwung-movy
 * renderer/wav-form.ts, MIT (c) 2026 megadake). A mirrored waveform body with a
 * playback cursor, loop brackets, granular spray fences and a base mark.
 *
 * ⚠⚠ REAL PEAKS OR NOTHING — and an EMPTY CELL WITH NO MARKERS DRAWS NOTHING AT
 * ALL. Upstream shipped a synthetic `sin(t*PI) * (0.55 + 0.35*sin(t*23))`
 * whenever peaks were missing and deleted it: a read that did not produce an
 * answer must never produce a PICTURE. It cost a flagship granular module a
 * picture of a sample that had never been loaded, reported from the device as
 * "no sample was loaded, not sure why it was showing a waveform". davebox goes
 * one step further than upstream's baseline-only fallback, because a davebox
 * bank has no separate "NONE" cell to report the emptiness on unless the caller
 * gives it one: with no peaks AND no markers this returns without a pixel, so
 * the cells fall back to whatever the caller drew (or to nothing).
 * ⚠ The FILE NAME is a separate cell. It is never written across the graphic —
 * centred on a two-cell span it lands on the spray cell and reads as that
 * param's value.
 *
 * `viz` = { start, count (default 2),
 *           peaks: number[] 0..1 (per-column half-amplitude, already
 *                  normalised — this file reads no files and does no I/O),
 *           pos, basePos, spray, loopStart, loopEnd  (all 0..1, optional) }
 */
export function drawKitSampleSpan(rowY, viz) {
    const col = viz.start % 4;
    const count = viz.count || 2;
    const x0 = col * MV_CELL_W + 1;
    const w = count * MV_CELL_W - 2;
    const topY = rowY + 1, botY = rowY + MV_KH - 2;
    const midY = Math.round((topY + botY) / 2);
    const amp = (botY - topY) / 2;

    const pts = (viz.peaks && viz.peaks.length) ? viz.peaks : null;
    const num = (v) => (typeof v === 'number' && isFinite(v))
        ? (v < 0 ? 0 : (v > 1 ? 1 : v)) : undefined;
    const pos = num(viz.pos), basePos = num(viz.basePos), spray = num(viz.spray);
    const loopStart = num(viz.loopStart), loopEnd = num(viz.loopEnd);

    /* ⚠ Nothing to say — say nothing. No frame, no baseline, no placeholder. */
    if (!pts && pos === undefined && loopStart === undefined &&
        loopEnd === undefined) return;

    const halfAt = (i) => {
        if (!pts) return 0;
        const v = pts[Math.min(pts.length - 1, Math.max(0, i))];
        const c = (typeof v === 'number' && isFinite(v)) ? (v < 0 ? 0 : (v > 1 ? 1 : v)) : 0;
        return Math.round(c * amp);
    };
    const crestAt = (px) => midY - halfAt(px - x0);
    const troughAt = (px) => midY + halfAt(px - x0);

    if (pts) {
        /* Same ghost fill as the filter and the EQ — one treatment, three
         * graphs. The body is symmetric about the centre, so the mass spans
         * crest to trough rather than down to a floor. */
        fillCurveMass(x0, x0 + w, crestAt, midY, topY, botY, troughAt);
        /* Both flanks stroked, as a step curve: at a steep transient adjacent
         * columns differ by several rows, and a bare pixel each reads as a
         * dotted outline rather than as the edge of a body. */
        let py = crestAt(x0), qy = troughAt(x0);
        for (let px = x0; px < x0 + w; px++) {
            const cy = crestAt(px), ty = troughAt(px);
            fill_rect(px, Math.min(py, cy), 1, Math.abs(cy - py) + 1, 1);
            fill_rect(px, Math.min(qy, ty), 1, Math.abs(ty - qy) + 1, 1);
            py = cy; qy = ty;
        }
    }

    /* Column i covers frames [i/w, (i+1)/w), so a marker belongs in
     * floor(p*w). The obvious round(p*(w-1)) disagrees for a quarter of all
     * positions and lands a pixel off the column that will actually play. */
    const colOf = (p) => Math.min(w - 1, Math.floor(p * w));

    /* ⚠ LOOP BOUNDS FIRST, so the cursor draws on top of them — the cursor is
     * the thing that moves and the thing you are looking for. Tips point INWARD,
     * at the region that repeats: that is how a start is told from an end with
     * no room for a label, and reversing it still draws two brackets and still
     * satisfies any "are there brackets" check. */
    const bracket = (p, opening) => {
        if (p === undefined) return;
        const bx = x0 + colOf(p);
        fill_rect(bx, topY, 1, botY - topY + 1, 1);
        const tipX = bx + (opening ? 1 : -1);
        if (tipX >= x0 && tipX < x0 + w) {
            fill_rect(tipX, topY, 1, 2, 1);
            fill_rect(tipX, botY - 1, 1, 2, 1);
        }
    };
    bracket(loopStart, true);
    bracket(loopEnd, false);

    /* GRANULAR SPREAD: the region grains are drawn from, as a dotted fence
     * either side of the cursor. Dotted rather than solid so it reads as a
     * boundary the cursor may wander past, not as a second cursor. Because the
     * offset is symmetric, +-0.5 already reaches every frame — past that the
     * fences stop at the file edges instead of implying a spread the DSP never
     * applies. */
    if (pos !== undefined && spray !== undefined && spray > 0) {
        const wrap = (f) => f - Math.floor(f);
        const full = spray >= 0.5;
        for (const side of [-1, 1]) {
            const at = full ? (side < 0 ? 0 : 1 - 1 / w) : wrap(pos + side * spray);
            const fx = x0 + colOf(at);
            const fh = halfAt(fx - x0);
            for (let yy = topY; yy <= botY; yy++) {
                if (((yy + fx) & 1) !== 0) continue;
                /* ⚠ Inside the body the fence must be CUT, not added: a lit
                 * pixel over a lit body is invisible. */
                const inWave = yy >= midY - fh && yy <= midY + fh;
                set_pixel(fx, yy, inWave ? 0 : 1);
            }
        }
    }

    /* THE BASE MARK: where the knob is SET, when a source is moving it. A span
     * graphic COVERS its cells, so the modulation dot has no way onto the
     * screen and the cursor alone would be a mark moving on its own. A COARSE
     * dash — 2 on, 2 off — because it has to be told apart from the solid
     * cursor and the fine spray dither; phased from topY, an ABSOLUTE
     * coordinate, so it does not crawl as the base moves between columns. */
    if (basePos !== undefined && pos !== undefined && colOf(basePos) !== colOf(pos)) {
        const bi = colOf(basePos), bh = halfAt(bi), bx = x0 + bi;
        for (let yy = topY; yy <= botY; yy++) {
            if (((yy - topY) & 3) >= 2) continue;
            const inWave = yy >= midY - bh && yy <= midY + bh;
            set_pixel(bx, yy, inWave ? 0 : 1);
        }
    }

    /* The cursor is the body's COMPLEMENT in its own column: the sample is
     * cleared there and the space around it is lit. That inverts it over the
     * waveform without ever reading the framebuffer back, and it is
     * self-correcting — a tall bright line through a quiet passage, a dark
     * notch cut into the body through a loud one. Either way it is the
     * highest-contrast thing in the column. */
    if (pos !== undefined) {
        const mi = colOf(pos), h = halfAt(mi), mx = x0 + mi;
        fill_rect(mx, midY - h, 1, 2 * h + 1, 0);
        if (midY - h > topY) fill_rect(mx, topY, 1, (midY - h) - topY, 1);
        if (midY + h < botY) fill_rect(mx, midY + h + 1, 1, botY - (midY + h), 1);
    }
}

/* ---- waveform previews (movy lfo-wave.ts via canvaskit, MIT megadake) ----
 * Bipolar (-1..1) sample of an LFO shape at phase t (one cycle = 1). s&h and
 * swishy use fixed deterministic patterns so frames are stable. */
export function shapeSample(shape, t) {
    const ph = t - Math.floor(t);
    switch (shape) {
        case 'tri':
            if (ph < 0.25) return ph * 4;
            if (ph < 0.75) return 1 - (ph - 0.25) * 4;
            return -1 + (ph - 0.75) * 4;
        case 'saw': return ph * 2 - 1;
        case 'square': return ph < 0.5 ? 1 : -1;
        case 'sh': {
            const steps = [0.3, -0.7, 0.85, -0.35];
            return steps[Math.floor(ph * steps.length) % steps.length];
        }
        case 'swishy': {
            const pts = [0, 0.7, -0.4, 0.55, -0.8, 0.2, 0];
            const x = ph * (pts.length - 1);
            const i = Math.floor(x), f = x - i;
            return pts[i] + (pts[Math.min(i + 1, pts.length - 1)] - pts[i]) * f;
        }
        default: return Math.sin(ph * 2 * Math.PI); /* sine */
    }
}

/* Single-cell waveform box (wave-select cells): one cycle of the live shape
 * with a dotted center baseline, in place of an enum square. */
export function drawWaveBox(kx, ky, shape) {
    const x0 = kx + 1, spanW = MV_KW - 2;
    const topY = ky + 2, botY = ky + MV_KH - 3;
    const baseY = Math.round((topY + botY) / 2);
    const amp = (botY - topY) / 2;
    for (let x = x0; x <= x0 + spanW; x += 2) set_pixel(x, baseY, 1);
    let px = x0, py = Math.round(baseY - shapeSample(shape, 0) * amp);
    for (let i = 1; i <= spanW; i++) {
        const y = Math.round(baseY - shapeSample(shape, i / spanW) * amp);
        plotLine(px, py, x0 + i, y, 1);
        px = x0 + i; py = y;
    }
}

/* Two-cell LFO waveform span: replaces the widgets of cells viz.cell and
 * viz.cell+1 (same row) with two cycles of the live shape. Pure — the caller
 * resolves every value first (this file reads no params):
 *   viz = { cell (0-7), shape ('sine'|'tri'|'saw'|'square'|'sh'|'swishy'),
 *           phase (0..1, default 0), bipolar (default true), retrig (bool) }
 * Baseline: dotted center line when bipolar, bottom line when unipolar;
 * retrigger on -> bold 3x3 dot at the start of the line. */
export function drawLfoWave(viz) {
    const col = viz.cell % 4;
    const rowY = viz.cell < 4 ? MV_ROW0_Y : MV_ROW1_Y;
    const x0 = col * MV_CELL_W + 1;
    const spanW = 2 * MV_CELL_W - 2;
    const topY = rowY + 1, botY = rowY + MV_KH - 2;
    const bipolar = viz.bipolar !== false;
    const baseY = bipolar ? Math.round((topY + botY) / 2) : botY;
    const amp = bipolar ? (botY - topY) / 2 : (botY - topY);
    const shape = viz.shape || 'sine';
    const phase = viz.phase || 0;
    for (let x = x0; x <= x0 + spanW; x += 2) set_pixel(x, baseY, 1);
    const yAt = (i) => {
        const v = shapeSample(shape, (i / spanW) * 2 + phase);
        return bipolar ? Math.round(baseY - v * amp)
                       : Math.round(botY - ((v + 1) / 2) * amp);
    };
    let px = x0, py = yAt(0);
    for (let i = 1; i <= spanW; i++) {
        const y = yAt(i);
        plotLine(px, py, x0 + i, y, 1);
        px = x0 + i; py = y;
    }
    if (viz.retrig) {
        fill_rect(x0, Math.max(topY, Math.min(botY - 2, yAt(0) - 1)), 3, 3, 1);
    }
}

/* ---- MOCKUP widgets (style calls, not adopted) --------------------------
 *
 * ⭑⭑ NOTHING ROUTES TO THESE. `ui_cells.mjs` never emits `pill` or `faderail`,
 * so no existing cell changes shape; they exist so the offline renderer can put
 * them in front of Josh, per widget, before anything adopts them. Delete them
 * if the answer is no — do NOT quietly wire one in.
 *
 * Both are ports of param-pages' SCH-50 winners (viz_draw.mjs drawSwitch
 * `pill-inverted` and drawFader `outline-fill`), themselves descended from
 * schwung-movy (MIT, (c) 2026 megadake). */

/* THE SWITCH PILL. Two states, no animation.
 *
 * ⭑ THE TRACK CARRIES THE STATE, NOT THE SLUG. ON fills the whole track and
 * knocks the slug out of it; OFF leaves an empty frame with a solid slug. So
 * the two states differ by most of the widget's AREA rather than by where a 5px
 * block sits, and the cell stays legible at a distance where a slug-only pill
 * is a lozenge with a bump.
 * ⚠ THE 2px INSET IS THE FLOOR, NOT A PREFERENCE. At 1px the slug is
 * 8-connected to the wall on its own row and the two merge: OFF stops reading
 * as "a block parked at one end of a track" and starts reading as "the left
 * half of this box is thick" — the same picture at both seats, and therefore no
 * switch at all. That defect had to be fixed once already upstream.
 * ⚠ IT DOES NOT ANIMATE. Both the slug's 120ms slide and the 160ms fill were
 * removed upstream after a device report of "distracting": a switch is the
 * control you flip most often and least deliberately, and no calibration of a
 * duration fixes a thing that should not be moving.
 * ACCEPTED COST: ON is a dark cell, so a row of switches on is a row of blocks.
 */
const MV_PILL_H = 9, MV_SLUG_W = 5, MV_SLUG_H = 5, MV_SLUG_INSET = 2;

export function drawSwitchPill(kx, ky, on) {
    const w = 16;
    const x = kx + Math.round((MV_KW - w) / 2);
    const y = ky + Math.round((MV_KH - MV_PILL_H) / 2), h = MV_PILL_H;
    const seat = on ? (x + w - MV_SLUG_INSET - MV_SLUG_W) : (x + MV_SLUG_INSET);
    const sy = y + MV_SLUG_INSET;
    if (on) {
        fill_rect(x, y, w, h, 1);
    } else {
        fill_rect(x, y, w, 1, 1);
        fill_rect(x, y + h - 1, w, 1, 1);
        fill_rect(x, y, 1, h, 1);
        fill_rect(x + w - 1, y, 1, h, 1);
    }
    notchCorners(x, y, w, h);
    /* The slug takes the colour of the ground it stands on: a knockout on a
     * filled track, ink on an empty one. */
    fill_rect(seat, sy, MV_SLUG_W, MV_SLUG_H, on ? 0 : 1);
    /* Its own corners, softened in whichever direction the ground demands —
     * notchCorners CLEARS, which rounds a solid slug; a knockout needs the
     * reverse or the hole is the only square-cornered shape on the page. */
    for (const c of [[seat, sy], [seat + MV_SLUG_W - 1, sy],
                     [seat, sy + MV_SLUG_H - 1], [seat + MV_SLUG_W - 1, sy + MV_SLUG_H - 1]])
        set_pixel(c[0], c[1], on ? 1 : 0);
}

/* THE FADER: dashed rails, a framed column, a notched head.
 *
 * ⭑ THE INTERIOR LATTICE IS PHASED BY THE SUB-ROW REMAINDER, and that is the
 * whole reason to prefer this to drawVBar. A 7px bar in a 13-row band gives a
 * 128-step param about ten detents per row, so NINE IN TEN MOVE NOTHING —
 * measured upstream at 12 distinct pictures out of 128. DIAG_HEAVY has a period
 * of 4, so four phases sit between one row and the next and a detent too small
 * to move the boundary still moves the texture: 44 of 127.
 * ⚠ SUBTRACTED, not added, so a rising value shifts the lattice the way the
 * boundary is heading. Adding it reads as the texture sliding DOWN while the
 * bar grows up, which looks like a defect rather than a finer scale.
 * ⚠ This KNOWINGLY breaks the absolute-coordinate rule the fills follow. Here
 * the re-phasing IS the signal, and there is a rail and a gap between adjacent
 * faders so there is no seam for the mismatch to show at.
 *
 * `baseNorm` (0..1, or omitted) is the fader's modulation base — two stubs
 * OUTSIDE the rails, which is the only part of the cell nothing else draws in.
 * A mark inside the column would have to fight the lattice, whose whole point
 * is that it re-phases as the value moves. */
export function drawFaderColumn(kx, ky, norm, baseNorm) {
    const cx = kx + Math.round(MV_KW / 2);
    const top = ky + 1, bot = ky + MV_KH - 2, h = bot - top;
    const n = norm < 0 ? 0 : (norm > 1 ? 1 : (norm || 0));

    dashedVRule(cx - 4, top, h + 1, 1, 1);
    dashedVRule(cx + 4, top, h + 1, 1, 1);

    const exact = n * h;
    const phase = Math.floor((exact - Math.floor(exact)) * 4) % 4;
    const pattern = (px, py) => ((((px + py - phase) % 4) + 4) % 4) !== 0;

    const y = Math.round(bot - exact);
    const bh = bot - y + 1, bx = cx - 3, bw = 7;
    fill_rect(bx, y, bw, 1, 1);
    fill_rect(bx, bot, bw, 1, 1);
    fill_rect(bx, y, 1, bh, 1);
    fill_rect(bx + bw - 1, y, 1, bh, 1);
    /* At very low values there is no interior left, so it degrades to a 7x2 bar
     * rather than to a frame with a hole punched in it — and the notch goes
     * with it, because notching a 2-row box eats half of it. */
    if (bh >= 3) {
        fillDithered(bx + 1, y + 1, bw - 2, bh - 2, pattern);
        notchCorners(bx, y, bw, bh);
    }
    if (typeof baseNorm === 'number' && isFinite(baseNorm)) {
        const b = baseNorm < 0 ? 0 : (baseNorm > 1 ? 1 : baseNorm);
        const byy = Math.round(bot - b * h);
        if (byy >= top && byy <= bot) {
            fill_rect(cx - 6, byy, 2, 1, 1);
            fill_rect(cx + 5, byy, 2, 1, 1);
        }
    }
}

/* ---- grid ---- */

function drawCellWidget(col, rowY, cell, touched) {
    const kx = col * MV_CELL_W + Math.floor((MV_CELL_W - MV_KW) / 2);
    /* ⭑ THE MODULATION DOT IS A DESCRIPTOR FIELD, NOT A DETECTION. A cell whose
     * caller never sets `modNorm` draws exactly the pixels it drew before — and
     * davebox sets it nowhere today, so nothing on any shipping page moves.
     * It is here so a bank that GAINS a modulation source needs a value, not a
     * widget. Drawn even when it coincides with the pointer: the mark's absence
     * has to mean "nothing is modulating this", never "it is at the base". */
    const mod = (typeof cell.modNorm === 'number' && isFinite(cell.modNorm))
        ? cell.modNorm : null;
    switch (cell.kind) {
        case 'arc':
            drawArcKnob(kx, rowY, cell.norm || 0, false);
            if (mod !== null) drawModDot(kx, rowY, mod);
            return;
        case 'arcbip':
            drawArcKnob(kx, rowY, 0.5 + (cell.signed || 0) / 2, true);
            if (mod !== null) drawModDot(kx, rowY, mod);
            return;
        case 'hbar':   return drawHBar(kx, rowY, cell.norm || 0);
        case 'enumsq': return drawEnumSquare(kx, rowY, cell.text, cell.sq);
        case 'frac':   return drawFracStack(col * MV_CELL_W, rowY, cell.text);
        case 'valsq':  return drawBigNum(col * MV_CELL_W, rowY,
                                         cell.sq != null ? cell.sq : cell.text);
        case 'action': return drawActionSquare(kx, rowY, cell.text, cell.oneWay, touched);
        case 'dirsq':  return drawDirSquare(kx, rowY, cell.sel | 0);
        case 'vbar':   return drawVBar(kx, rowY, cell.norm || 0);
        case 'wavesq': return drawWaveBox(kx, rowY, cell.shape);
        case 'xbox':   return drawXBox(kx, rowY);
        /* MOCKUP kinds — see the primitives above. ui_cells.mjs emits neither;
         * only the offline renderer reaches them. */
        case 'pill':   return drawSwitchPill(kx, rowY, !!cell.norm);
        case 'faderail': return drawFaderColumn(kx, rowY, cell.norm || 0,
                                                cell.modNorm);
        default:       return; /* blank */
    }
}

/* Label strip cell: the short NAME normally; while touched the cell inverts
 * and shows the live VALUE (movy's signature swap). */
/* The label strip: the short NAME normally, the live VALUE while touched, and
 * a THIRD state — a trailing `~` — while a source is moving the param.
 *
 * ⭑ The tilde rides the NAME, not the value. A modulated param's value is
 * already moving on its own on the widget; what the strip has to say is WHY,
 * and it has to say it in the one or two pixels a 32px cell has spare. The
 * touched state is untouched: while your finger is on the knob the strip is
 * answering "what number is this", and a modulation mark there would be
 * competing with the answer.
 * ⚠ Appended BEFORE the fit-to-cell trim, so a label long enough to be clipped
 * loses a character rather than losing the tilde — the mark is the information
 * the plain label does not already carry.
 * ⚠ Opt-in by descriptor field (`modulated`). davebox sets it nowhere today, so
 * every existing label strip renders identically. */
function drawCellLabel(col, lblY, cell, touched) {
    let text = String(touched && cell.text != null ? cell.text : (cell.label || ''));
    if (!touched && cell.modulated && text) text += '~';
    if (!text) return;
    while (text.length > 0 && mvWidth(text) > MV_CELL_W - 2) text = text.slice(0, -1);
    const tw = mvWidth(text);
    const tx = Math.round(col * MV_CELL_W + MV_CELL_W / 2 - tw / 2);
    if (touched) {
        fill_rect(col * MV_CELL_W, lblY, MV_CELL_W, MV_LBL_H, 1);
        mvPrint(tx, lblY + 1, text, 0);
    } else {
        mvPrint(tx, lblY + 1, text, 1);
    }
}

/* The 8-cell grid: two 16px widget rows, each with its label strip beneath.
 *
 * `env` (optional) = { start, count, roles }: those cells surrender their
 * individual widgets to one envelope graphic drawn across the span. Their
 * LABEL strips still render, so A/D/S/R stay named and touch-swap to their
 * values as usual. Omitted by davebox, which has no env banks. */
export function drawKitCells(cells, touchedIdx, env, filt, eq, samp) {
    /* ⭑ EVERY SPAN IS DECLARED, NONE IS DETECTED. env / filt / eq / samp all
     * arrive from the caller with an explicit start (and count where it can
     * vary); this file never sniffs a param name to decide a bank has an EQ.
     * Upstream's detector is engine-side and metadata-corroborated, and there
     * is no equivalent metadata here — a renderer that guessed would restyle a
     * page as a side effect of renaming a knob. */
    const envFirst = env ? env.start : -1;
    const envLast = env ? env.start + env.count - 1 : -2;
    const filtFirst = filt ? filt.start : -1;
    const filtLast = filt ? filt.start + 1 : -2;   /* always a 2-cell span */
    const eqFirst = eq ? eq.start : -1;
    const eqLast = eq ? eq.start + (eq.count || 2) - 1 : -2;
    const sampFirst = samp ? samp.start : -1;
    const sampLast = samp ? samp.start + (samp.count || 2) - 1 : -2;
    for (let k = 0; k < 8; k++) {
        const cell = cells[k];
        if (!cell) continue;
        const col = k % 4;
        const rowY = k < 4 ? MV_ROW0_Y : MV_ROW1_Y;
        const lblY = k < 4 ? MV_LBL0_Y : MV_LBL1_Y;
        const covered = (k >= envFirst && k <= envLast) ||
                        (k >= filtFirst && k <= filtLast) ||
                        (k >= eqFirst && k <= eqLast) ||
                        (k >= sampFirst && k <= sampLast);
        if (!covered) drawCellWidget(col, rowY, cell, k === touchedIdx);
        drawCellLabel(col, lblY, cell, k === touchedIdx);
    }
    if (env) {
        drawKitEnvelopeRow(env.start < 4 ? MV_ROW0_Y : MV_ROW1_Y, cells, env);
    }
    if (filt) {
        drawKitFilterCurve(filt.start < 4 ? MV_ROW0_Y : MV_ROW1_Y, filt);
    }
    if (eq) {
        drawKitEqCurve(eq.start < 4 ? MV_ROW0_Y : MV_ROW1_Y, eq);
    }
    if (samp) {
        drawKitSampleSpan(samp.start < 4 ? MV_ROW0_Y : MV_ROW1_Y, samp);
    }
}

/* Picker overlay: the option list, revealed while a >2-option enum/dir cell is
 * turned. Centered in the shared zoom box (same footprint as the value zoom),
 * standard system font, with a scrollbar whenever the options don't all fit. */
export function drawKitEnumOverlay(cells, touchedIdx) {
    const cell = touchedIdx >= 0 ? cells[touchedIdx] : null;
    /* Any cell carrying a discrete option list (named enum, direction, OR a
     * numeric value-box) uses the picker — they're the same thing, limited
     * values vs limited enums. */
    if (!cell || !cell.options || cell.options.length <= 2) return;
    const sel = cell.sel | 0;
    if (sel < 0) return; /* unset value ("--") — nothing to browse */
    drawKitListOverlay(cell.options, sel);
}

/* How long an enum peek stays up, in ms. Upstream's ENUM_PEEK_MS, carried
 * verbatim so the two surfaces cannot drift to different numbers. */
export const MV_ENUM_PEEK_MS = 700;

/* Has the peek raised at `turnedAtMs` decayed by `nowMs`?
 *
 * PURE, and the timer lives in the caller — this file holds no state and reads
 * no clock, which is what lets it load standalone in node. A caller that wants
 * the peek passes `peekExpired: enumPeekExpired(S.lastTurnMs, Date.now())` to
 * drawKitBankPage; one that does not passes nothing and keeps today's
 * hold-to-show list.
 *
 * ⚠ A NULL `turnedAtMs` IS "NEVER TURNED", NOT "TURNED AT ZERO". Number(null)
 * is 0, which against any real clock is expired — so a caller that had not yet
 * recorded a turn would suppress the list forever. Refused explicitly. */
export function enumPeekExpired(turnedAtMs, nowMs) {
    if (typeof turnedAtMs !== 'number' || !isFinite(turnedAtMs)) return false;
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) return false;
    return (nowMs - turnedAtMs) > MV_ENUM_PEEK_MS;
}

/* ── the overlay STACK ─────────────────────────────────────────────────────
 *
 * A picker opened from a picker sits one step to the RIGHT of the one beneath
 * it, and the ones underneath survive as a sliver on the left. Josh's geometry
 * (2026-08-27), and it is the one that works: every layer keeps the FULL 108px
 * width and the full height, so nothing narrows and nothing truncates however
 * deep the stack goes.
 *
 * ⭑ The under-layers are drawn as EMPTY FRAMES. A 4px sliver shows an outline
 * and black — never content — so the stack does not need to re-render the
 * screens beneath it, which is what keeps this cheap: no ancestor renderer, no
 * saved framebuffer, no per-layer state.
 *
 * ⚠ The step is 4px because the whole horizontal slack is 20px (128 - 108), and
 * at 4px that is 6 distinct positions against a deepest real chain of 4. It is
 * also below the 6px at which the layer beneath starts showing GLYPHS: a row's
 * text begins at x+5.
 *
 * The stack stays centred while it fits in the left margin and then drifts
 * right into the right margin, capped at the edge — so the top box is always
 * whole, and the oldest slivers march off the left rather than squeezing it. */
const STACK_STEP = 4, STACK_W = 108, STACK_Y = MV_ZOOM_Y;
const stackTopX = (d) => Math.min(SCREEN_W - STACK_W,
                                  10 + Math.max(0, d - 3) * STACK_STEP);

/* Where the top box of a stack of `depth` sits. Exported so a screen that draws
 * INSIDE its own box — the LFO's waveform strip is the one — takes the geometry
 * from the same place the box does, rather than keeping a second copy that
 * drifts the first time the step or the width changes. */
export function kitStackBox(depth) {
    const d = Math.max(1, depth | 0);
    return { x: stackTopX(d), y: STACK_Y, w: STACK_W, h: SCREEN_H_LATCH - 1 - STACK_Y };
}

export function drawKitStackedList(depth, rows, sel, opts) {
    const o = opts || {};
    const d = Math.max(1, depth | 0);
    const h = SCREEN_H_LATCH - 1 - STACK_Y;
    const tx = stackTopX(d);
    for (let k = 0; k < d; k++) {
        const x = tx - (d - 1 - k) * STACK_STEP;
        /* Blank first: the box is opaque, and the dimmed screen behind it must
         * not read through the rows. */
        fill_rect(x, STACK_Y, STACK_W, h, 0);
        rectOutline(x, STACK_Y, STACK_W, h, 1);
    }
    /* Only the top layer carries content.
     * ⚠ rowH is the app's standard 10, NOT a tighter 9. The selection band runs
     * from y-1 for rowH rows while a host glyph inks y+1..y+7, so at rowH 9 the
     * band's bottom edge IS the glyph's bottom row — 2px of clear above and 0
     * below, which reads as off-centre (Josh spotted it on device). At 10 it is
     * 2 and 1, the same as every other list in the app. */
    const rowH = o.rowH != null ? o.rowH : 10;
    const listTop = STACK_Y + 6;
    /* `footer` reserves space at the box's foot for a caller drawing its own
     * thing there (the LFO's waveform). It comes off the list's height, so the
     * rows can never run into it. */
    drawKitList(rows, sel, {
        x: tx + 2, w: STACK_W - 4,
        topY: listTop, rowH,
        h: (STACK_Y + h - 2) - listTop - (o.footer || 0),
        visible: o.visible,
        emptyMsg: o.emptyMsg,
    });
}

/* ── knocking the backdrop back, and saying where you are ──────────────────
 *
 * An overlay covers part of a screen, and on 1 bit there is no dim to say the
 * rest is behind it. `drawKitBackdropDim` writes every other pixel black, which
 * removes half the ink and reads as "still there, not in play".
 *
 * ⭑ ONE host call. The display API has no pattern fill, so doing this from JS
 * costs a call per pixel — 4096 for a full screen against roughly 2400 for all
 * the text on a busy one, i.e. it would more than triple a frame's drawing cost.
 * `stipple_rect` exists for exactly this (see docs/API.md, src/host/stipple.h).
 *
 * ⚠ Call it AFTER the backdrop is drawn and BEFORE the overlay: it operates on
 * whatever ink is already down, and anything drawn afterwards is untouched. */
export function drawKitBackdropDim(x, y, w, h) {
    stipple_rect(x != null ? x : 0, y != null ? y : 0,
                 w != null ? w : SCREEN_W, h != null ? h : SCREEN_H_LATCH, 0, 0);
}

/* The breadcrumb bar: where you are, in the smallest type, over the header band.
 *
 * `parts` is the path TO the current screen — the screen you are ON is in front
 * of you, so it is not a crumb. The FIRST part is PINNED and never dropped
 * (Josh: "keep the track head - that's useful"); overflow drops whole crumbs
 * from the HEAD of the remainder, and the gap is marked with an ellipsis that
 * takes a separator of its own, so a shortened path reads as a path with a
 * MISSING SEGMENT rather than as truncation.
 *
 * ⚠ The header font cannot be used here: `T3 > Sound Control` alone measures
 * 125px against a 124px header limit. Movy small is what makes a path fit.
 * ⚠ 2px of air each side of the chevron, not a space: a movy space advances 5px
 * and each pixel of padding costs 6px across three separators, so a full space
 * costs a whole crumb at depth. 2 is the widest that still fits the deepest
 * real path. */
const CRUMB_MAXW = 126, CRUMB_PAD = 4, CRUMB_H = 11, CRUMB_SEP = '>', CRUMB_SEP_PAD = 2;
/* Three 1px dots on a 2px pitch = 5px of ink, against 7px for movy's own "...".
 * Drawn rather than typed because U+2026 is not in a 5x7 ASCII atlas, and three
 * typed dots are wider than the mark needs to be. */
const CRUMB_ELL_W = 5;
const crumbSepW = () => mvWidth(CRUMB_SEP) + CRUMB_SEP_PAD * 2;
function crumbPieceW(p) { return p === null ? CRUMB_ELL_W : mvWidth(String(p).toUpperCase()); }
function crumbRunW(pieces) {
    let w = 0;
    for (const p of pieces) w += crumbPieceW(p);
    return w + Math.max(0, pieces.length - 1) * crumbSepW();
}
export function drawKitCrumbs(parts) {
    const all = (parts || []).filter((p) => p != null && String(p) !== '');
    if (!all.length) return;
    const room = CRUMB_MAXW - 2 - CRUMB_PAD * 2;
    const head = all[0];
    let tail = all.slice(1);
    let pieces = [head, ...tail];
    /* ⚠ Test the WHOLE path with NO ellipsis first. Charging the marker's width
     * before anything has been dropped makes a path that FITS lose a crumb. */
    if (crumbRunW(pieces) > room) {
        while (tail.length > 1 && crumbRunW([head, null, ...tail]) > room) tail = tail.slice(1);
        pieces = [head, null, ...tail];
    }
    const w = crumbRunW(pieces) + 2 + CRUMB_PAD * 2;
    const x = Math.round((SCREEN_W - w) / 2);
    fill_rect(x, 0, w, CRUMB_H, 0);
    fill_rect(x, 0, w, 1, 1); fill_rect(x, CRUMB_H - 1, w, 1, 1);
    fill_rect(x, 0, 1, CRUMB_H, 1); fill_rect(x + w - 1, 0, 1, CRUMB_H, 1);
    const textY = 2, dotY = textY + MV_LBL_H - 2;
    let cx = x + 1 + CRUMB_PAD;
    pieces.forEach((p, i) => {
        if (i) {
            cx += CRUMB_SEP_PAD;
            mvPrint(cx, textY, CRUMB_SEP, 1);
            cx += mvWidth(CRUMB_SEP) + CRUMB_SEP_PAD;
        }
        if (p === null) {
            for (let d = 0; d < 3; d++) set_pixel(cx + d * 2, dotY, 1);
            cx += CRUMB_ELL_W;
        } else {
            const t = String(p).toUpperCase();
            mvPrint(cx, textY, t, 1);
            cx += mvWidth(t);
        }
    });
}

/* The kit's centred list overlay: the box, the rows, the selection, and the
 * scroll indicator. Factored out of drawKitEnumOverlay so anything that needs
 * "pick one of these" looks identical to an enum picker without re-deriving the
 * layout — the bank picker (Shift+jog in track view) is the second caller.
 * ⚠ One implementation on purpose: two copies of this maths drift by a pixel
 * and then read as two different controls. */
export function drawKitListOverlay(options, sel, opts) {
    /* ⭑ The box AUTO-SIZES to its longest label (Josh, 2026-08-25). It starts at
     * the kit's zoom footprint — so a short enum looks exactly as it always has,
     * sharing its outline with the value zoom — and grows only when the text
     * would otherwise be cut. It never shrinks below that.
     *
     * ⚠ Truncation is the failure this removes, and it is a bad one because the
     * result still looks like a word: 'AUTOMATION' came back as 'AUTOMAT' and
     * 'SOUND + CONFIG' as 'SOUND +'. Derived from the labels rather than set to
     * a number, so a renamed or added option carries its own width with it.
     *
     * The +12 is what the list spends around the text: the 2px box inset and a
     * 3px row pad on each side, plus the 4px scrollbar gutter. */
    const o = opts || {};
    let natural = 0;
    /* ⭑ THE STOCK SCHWUNG FONT IS THE DEFAULT, and exactly ONE caller opts out.
     * Josh, 2026-08-27: "hdr in pickers is only for banks."
     *   · every overlay uses the stock font, so a picker looks like the menu it
     *     floats over — the selection overlays and the enum value picker alike.
     *   · the BANK picker passes `hdrFont`, because it previews BANK NAMES and a
     *     bank's own header is always drawn in the header font, so the picker
     *     matches the thing you are about to land on.
     * ⚠ MEASURE AND DRAW MUST USE THE SAME FONT. The host font is proportional
     * and the kit's are fixed-cell, so a mismatched pair sizes the box for one
     * and truncates for the other — which is why these are ONE pair of locals
     * rather than two independent choices. */
    const _tw = o.hdrFont ? hdrWidth : ((t) => text_width(t));
    const _tp = o.hdrFont ? hdrPrint : ((x, y, t, c) => print(x, y, t, c));
    for (const opt of options) natural = Math.max(natural, _tw(String(opt)));
    /* ⭑ `maxW` caps the auto-size. Default SCREEN_W keeps the two original
     * callers (the enum value picker, the bank picker) exactly as they were;
     * the selection overlays pass a narrower cap so they sit inset from both
     * edges and read as floating. */
    const maxW = o.maxW || SCREEN_W;
    const W = o.w || Math.max(MV_ZOOM_W, Math.min(maxW, natural + 12));
    const X = (o.x != null) ? o.x : Math.round((SCREEN_W - W) / 2);
    /* ⚠⚠ `tall` is OPT-IN, and the default is not laziness — MV_ZOOM_H is
     * SHARED with the turn-to-reveal value zoom so that a short enum picker and
     * the zoom draw the SAME outline (see the auto-size note above). Growing
     * this box unconditionally would break that pairing on a screen nobody asked
     * to change.
     *
     * ⭑ The tall box grows DOWNWARD ONLY, and that is the whole available gain:
     * a 6th row needs H >= 58, i.e. a top edge at y <= 6, which is inside the
     * header band (rows 0-7). So 5 rows is the ceiling while the header stays
     * visible, and raising the top buys nothing. Keeping the top at MV_ZOOM_Y
     * leaves rows 8-13 showing the screen underneath, which is what makes it
     * read as an overlay rather than as another page. */
    const Y = MV_ZOOM_Y;
    const H = o.tall ? (SCREEN_H_LATCH - 1 - Y) : MV_ZOOM_H;
    const cell = { options: options, sel: sel };
    fill_rect(X, Y, W, H, 0);
    rectOutline(X, Y, W, H, 1);

    const n = cell.options.length;
    const ROW_H = 9;                                  /* standard-font line */
    const VISIBLE = Math.max(1, Math.min(n, Math.floor((H - 4) / ROW_H)));
    const hasScroll = n > VISIBLE;
    const half = Math.floor(VISIBLE / 2);
    const start = Math.max(0, Math.min(sel - half, n - VISIBLE));
    const listTop = Y + Math.floor((H - VISIBLE * ROW_H) / 2);
    const rowX = X + 2, rowW = W - 4 - (hasScroll ? 4 : 0);
    const availW = rowW - 4;
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= n) break;
        const y = listTop + i * ROW_H;
        let label = String(cell.options[idx]);
        while (label.length > 1 && _tw(label) > availW) label = label.slice(0, -1);
        if (idx === sel) {
            fill_rect(rowX, y, rowW, ROW_H, 1);
            _tp(rowX + 3, y + 1, label, 0);
        } else {
            _tp(rowX + 3, y + 1, label, 1);
        }
    }
    /* Scroll indicator: right-edge track + thumb, only when there's overflow. */
    if (hasScroll) {
        const trackH = VISIBLE * ROW_H;
        const thumbH = Math.max(3, Math.round(trackH * VISIBLE / n));
        const thumbY = listTop + Math.round((trackH - thumbH) * start / Math.max(1, n - VISIBLE));
        fill_rect(X + W - 2, listTop, 1, trackH, 1);
        fill_rect(X + W - 3, thumbY, 2, thumbH, 1);
    }
}

/* ---- full page ----
 * opts: { headerText, headerInvert, pageIdx, pageCount (bar; omit to skip),
 *         touchedIdx, altArrowShow, altArrowOn, altArrowHidden (blink phase) }
 * Touched non-blank cell with a `name` swaps the header to the inverted
 * centered param name and suppresses the page bar. */
export function drawKitBankPage(cells, opts) {
    const t = opts.touchedIdx != null ? opts.touchedIdx : -1;
    const touched = t >= 0 && cells[t] && cells[t].name ? cells[t] : null;
    if (touched) {
        drawKitTouchedHeader(touched.name);
    } else {
        drawKitHeader(opts.headerText, opts.headerInvert);
        if (opts.pageCount > 0) drawKitPageBar(opts.pageIdx | 0, opts.pageCount);
        if (opts.altArrowShow) drawKitAltArrow(SCREEN_W - 7, !opts.headerInvert, !!opts.altArrowOn, opts.altArrowHidden);
    }
    drawKitCells(cells, t, opts.env, opts.filt, opts.eq, opts.samp);
    /* The option-list overlay covers the 3 cells away from the touched knob, so
     * it must NOT appear on a bare orienting touch — only once that knob is
     * actually TURNED (see enumOverlayIdx in ui_render.mjs). Callers pass the
     * turn-gated index separately; omitting it keeps the old touch-gated
     * behaviour for existing call sites. */
    const ov = (opts.overlayIdx != null) ? opts.overlayIdx : t;
    /* ⭑ THE PEEK: `peekExpired` takes the option list down while the knob is
     * still held. Upstream raises the list on the TURN and decays it after
     * ENUM_PEEK_MS because its grid has no touch sensor to release; davebox
     * does, so its list already stays up exactly as long as the finger does and
     * this is a DIFFERENT offer — uncovering the three neighbouring cells while
     * you keep turning.
     * ⚠⚠ OFF UNLESS A CALLER OPTS IN, and no davebox caller does. Adopting it
     * unasked would REMOVE a display that currently works, which is not what
     * "pixels on, behaviour off" buys. See enumPeekExpired() for the timer half;
     * Josh judges it from the offline renders first. */
    if (!opts.peekExpired) drawKitEnumOverlay(cells, ov);
}

/* Turn-to-reveal value zoom — the non-picker counterpart to drawKitEnumOverlay.
 * Same reveal lifecycle (via enumOverlayIdx): appears only once the physically-
 * held knob is turned, stays until release. It's just a visual zoom of the cell
 * that's already on screen — the same widget graphic scaled up with the value
 * beneath it — shown in a box below the (unchanged) param-name header.
 *
 * Applies to sustained-value widgets (arc / bipolar arc / value-box). Skips
 * pickers (their scrolling list overlay already does this), on/off toggles,
 * one-shot actions, and blanks. */
export function drawKitValueOverlay(cells, idx) {
    if (idx < 0) return;
    const cell = cells[idx];
    if (!cell || !cell.name) return;
    if (cell.options && cell.options.length > 2) return;   /* discrete lists → picker overlay */
    /* bigText = a text-only value with no widget graphic (the step editor's
     * merged Oct/Note box, whose value is the note name). */
    const bigText = cell.bigText;
    if (bigText == null && cell.kind !== 'arc' && cell.kind !== 'arcbip' && cell.kind !== 'valsq') return;

    /* Floating overlay box below the header: only the box itself is cleared,
     * so the surrounding params stay visible around its borders. */
    const BX = MV_ZOOM_X, BW = MV_ZOOM_W, boxTop = MV_ZOOM_Y, boxH = MV_ZOOM_H;
    fill_rect(BX, boxTop, BW, boxH, 0);
    rectOutline(BX, boxTop, BW, boxH, 1);

    /* Zoomed read-outs use the big font, dropping to the header font only when
     * the text outgrows the box (long note labels, long formatted values). */
    const zoomPrint = (text, y) => {
        const t = String(text);
        const fit = bigFit(t, BW - 6);
        if (fit) bigPrint(Math.round(64 - fit.w / 2), y, t, 1, fit.cond);
        else     hdrPrint(Math.round(64 - hdrWidth(t) / 2), y + 3, t, 1);
    };

    if (bigText != null) {
        zoomPrint(bigText, boxTop + 17);
        return;
    }

    const _vt = String(cell.text);
    if (cell.kind === 'arc' || cell.kind === 'arcbip') {
        /* Zoomed arc (same shape, larger), value in the header font beneath. */
        const norm = cell.kind === 'arcbip'
            ? 0.5 + (cell.signed || 0) / 2
            : (cell.norm || 0);
        drawArcKnobAt(64, boxTop + 18, 12, norm, cell.kind === 'arcbip');
        hdrPrint(Math.round(64 - hdrWidth(_vt) / 2), boxTop + 35, _vt, 1);
    } else {
        /* valsq — no graphic; the value IS the widget, centered in the box. */
        zoomPrint(_vt, boxTop + 17);
    }
}

/* Section-picker overlay — drawn ONLY while SHIFT is held. One row per SECTION
 * (coarse jumps; plain jog still browses every bank overlay-free), so a module
 * with 49 banks is crossable in a few steps instead of 49. Shift+jog moves the
 * highlight; releasing shift leaves you on that section's first bank.
 *
 * Kit v27 port of core/engine.js drawBankPicker. The kit takes its rows from a
 * hand-authored CONFIG.sections + per-row icons; callers here pass sections
 * derived at runtime and there are no icons to draw, so the icon column is
 * omitted and the name gets the full row width.
 *
 * `sections`: [{ name }] — already ordered. `activeIdx`: highlighted row. */
export function drawKitSectionPicker(sections, activeIdx) {
    if (!sections || !sections.length) return;
    const x = 4, y = 2, w = SCREEN_W - 8, h = 64 - 4;
    fill_rect(x, y, w, h, 0);          /* clear the page underneath */
    rectOutline(x, y, w, h, 1);        /* popup frame */

    const rowH = 8, listY = y + 3, visible = 7;
    const n = sections.length;
    const active = Math.max(0, Math.min(n - 1, activeIdx | 0));
    /* Scroll so the active row stays in view, centred where possible. */
    let top = active - Math.floor(visible / 2);
    top = Math.max(0, Math.min(Math.max(0, n - visible), top));

    const hasScroll = n > visible;
    const availW = w - 8 - (hasScroll ? 4 : 0);
    for (let r = 0; r < visible; r++) {
        const i = top + r;
        if (i >= n) break;
        const ry = listY + r * rowH;
        const sel = (i === active);
        if (sel) fill_rect(x + 2, ry - 1, w - 6, rowH, 1);
        /* UPPERCASE before printing. The header font carries TRUE lowercase
         * glyphs for exactly 'd' and 't'; every other lowercase letter falls
         * back to its capital. Module level names are mixed case, so printing
         * them raw yields "FILtER" / "LFO DESt" / "PItch MOd" — the two odd
         * letters out. Matches the ALL-CAPS chrome elsewhere either way. */
        let label = String(sections[i].name || '').toUpperCase();
        while (label.length > 1 && hdrWidth(label) > availW) label = label.slice(0, -1);
        hdrPrint(x + 4, ry, label, sel ? 0 : 1);
    }

    if (hasScroll) {
        const trackY = listY - 1, trackH = visible * rowH;
        const thumbH = Math.max(4, Math.round(trackH * visible / n));
        const denom = Math.max(1, n - visible);
        const thumbY = trackY + Math.round((trackH - thumbH) * top / denom);
        fill_rect(x + w - 2, trackY, 1, trackH, 1);
        fill_rect(x + w - 3, thumbY, 2, thumbH, 1);
    }
}

/* Framed HUD popup card (canvaskit hudCard): clears + frames a near-full-width
 * card, prints title left + value right in the header font over a 1px rule,
 * and returns the body rect for the caller to fill with arbitrary content
 * (waveform preview, meter, custom read-out). The reusable value-HUD frame —
 * new HUD work composes on this instead of hand-drawing a third bespoke box.
 * (drawKitValueOverlay keeps its own zoom-box lifecycle; it predates this.) */
export function hudCard(title, valueText) {
    const x = 6, y = 11, w = SCREEN_W - 12, h = 42;
    fill_rect(x, y, w, h, 0);
    rectOutline(x, y, w, h, 1);
    hdrPrint(x + 3, y + 2, fitHdr(String(title || ''), w - 40), 1);
    if (valueText != null) {
        const vtxt = String(valueText);
        hdrPrint(x + w - 3 - hdrWidth(vtxt), y + 2, vtxt, 1);
    }
    fill_rect(x + 1, y + 9, w - 2, 1, 1);
    return { x: x + 2, y: y + 11, w: w - 4, h: h - 13 };
}

/* ---- shared full-screen list ----
 * The one list body for every row-based screen under a drawKitHeader (slot
 * settings, block lists, pickers, preset browsers, menus). Label font, full-
 * width inverse-video selection, windowed scroll with a right-edge scrollbar
 * on overflow, and the normative edit grammar: an editing row's value renders
 * in [brackets] (UI_LANGUAGE §6) — not a '*' marker.
 *
 * rows: strings, or { label, value?, qual?, chevron? ('>'), editing?, hdr? }.
 *   `hdr` prints the label in the header font (caps chrome rows).
 *   `qual` is a small qualifier drawn just after the label — see the row loop.
 * sel: selected index. opts: { x=0, w=SCREEN_W, topY=11, rowH=10, visible
 *   (derived), emptyMsg }. `x`/`w` bound the list horizontally so the same
 *   renderer serves a full screen and an overlay box.
 * Pure: no state reads; returns the first visible index (for callers that
 * align auxiliary drawing with the window). */
/* Clear between a label and its `qual`. 3px reads as "attached to the name"
 * rather than as a second column — a full space (5px in the movy font) starts
 * to look like a value. */
const QUAL_GAP = 3;
export function drawKitList(rows, sel, opts) {
    const o = opts || {};
    /* ⭑ THE LIST'S HORIZONTAL BOUNDS. Defaults are the full screen, so every
     * existing caller is byte-identical; pass `x`/`w` to render the same list
     * inside an overlay box instead. Before this the right edge and the label
     * inset were hard-coded to SCREEN_W and 3, which is the only reason this
     * renderer could not be reused inside a box — the rows themselves never
     * cared. Everything below is expressed relative to these two. */
    const boxX = o.x != null ? o.x : 0;
    const boxW = o.w != null ? o.w : SCREEN_W;
    const topY = o.topY != null ? o.topY : 11;
    const rowH = o.rowH != null ? o.rowH : 10;
    const n = rows.length;
    if (!n) {
        if (o.emptyMsg) {
            /* Centred in the BODY, both axes — the body runs topY..63, not
             * 0..63, so a fixed y=30 sat noticeably high under the header.
             * `hdr` prints it in the header font, for an empty state that is a
             * statement about the screen rather than a piece of prose. */
            const t = String(o.emptyMsg).toUpperCase();
            const w = o.emptyHdr ? hdrWidth(t) : mvWidth(t);
            const x = boxX + Math.max(0, Math.round((boxW - w) / 2));
            const y = topY + Math.round(((64 - topY) - MV_LBL_H) / 2);
            if (o.emptyHdr) hdrPrint(x, y, t, 1); else mvPrint(x, y, t, 1);
        }
        return 0;
    }
    /* ⚠ The row count is bounded by the BOX's bottom, not the screen's. Until
     * this took `h`, a boxed list derived `visible` from the full 64px height
     * and only fitted by coincidence — a shorter box would have drawn rows out
     * through its own bottom edge onto whatever it covers. Default is the
     * screen, so every full-screen caller is unchanged. */
    const bottom = o.h != null ? topY + o.h : 64;
    const visible = o.visible != null ? o.visible
                                      : Math.max(1, Math.floor((bottom - topY - 1) / rowH));
    /* sel < 0 means NOTHING is selectable on this screen — a prompt whose only
     * inputs are a pad or Back, not a list you move a cursor through. Without
     * it the clamp turned -1 into 0 and highlighted the first row, which reads
     * as "this row is selected" on a screen where nothing can be. */
    const none = (sel | 0) < 0;
    const s = none ? -1 : Math.max(0, Math.min(n - 1, sel | 0));
    const start = none ? 0
        : Math.max(0, Math.min(s - Math.floor(visible / 2), n - visible));
    const hasScroll = n > visible;
    const rightEdge = boxX + boxW - (hasScroll ? 5 : 3);   /* value right-align x */
    const fillW = hasScroll ? boxW - 4 : boxW;
    const labelX = boxX + 3;
    for (let i = 0; i < visible; i++) {
        const idx = start + i;
        if (idx >= n) break;
        const r = rows[idx];
        const row = (typeof r === 'string') ? { label: r } : r;
        const y = topY + i * rowH;
        const on = (idx === s);
        /* A GROUPING RULE, occupying a whole row of its own.
         *
         * It was first drawn as a 1px line inside a neighbouring row's band,
         * which does not work here: the highlight fills are contiguous (row i
         * covers y-1 .. y+rowH-2, row i+1 starts at y+rowH-1), so such a line
         * always sits inside SOME row — clipping that row's glyph tops, and
         * disappearing whenever that row was selected. Its own row has neither
         * problem and needs no ink flip.
         *
         * ⚠ Callers must make these UNSELECTABLE — the cursor has to step over
         * them, or the list has stops on nothing. Centred in the band, width
         * follows fillW so it stays clear of the scroll indicator. */
        if (row.divider) { fill_rect(boxX, y + (rowH >> 1) - 1, fillW, 1, 1); continue; }
        /* A STATUS line: centred, never selected, and occupying a full row.
         *
         * 1-bit has no dim, so "this is information, not a control" cannot be
         * said with styling (UI_LANGUAGE §6) — it is said by centring the text
         * and by the cursor stepping over it. Full row height because these
         * REPLACE an action row (the project menu swaps Load for `(CURRENT)`),
         * and a shorter one would shift every row below it as the state
         * changed, moving the menu under the user's thumb.
         *
         * ⚠ Callers must make these unselectable — same contract as `divider`. */
        if (row.note) {
            const t = String(row.note).toUpperCase();
            const nw = row.hdr === false ? mvWidth(t) : hdrWidth(t);
            const nx = boxX + Math.max(0, Math.round((fillW - nw) / 2));
            if (row.hdr === false) mvPrint(nx, y + 1, t, 1); else hdrPrint(nx, y, t, 1);
            continue;
        }
        if (on) fill_rect(boxX, y - 1, fillW, rowH, 1);
        const ink = on ? 0 : 1;
        /* ---- UPPERCASE before measuring or printing ----
         *
         * Both fonts are effectively caps-only, but each keeps a HANDFUL of true
         * lowercase glyphs, so mixed-case text comes out with a few odd letters
         * rather than uniformly capitalised — it reads as a typo. Measured, not
         * assumed: the header font (labels) has real `d` and `t`; the small font
         * (values) has a real `y`. Hence `Track to` -> "TRACK tO",
         * `Generator` -> "GENERAtOR", `Poly` -> "POLy".
         *
         * ⭑ Uppercasing is a VISUAL NO-OP for every other character, because
         * they already render as their capital — so this only ever corrects
         * those glyphs, and no caller has to remember to do it. Same fix
         * drawKitSectionPicker already applies to its own labels.
         * ⚠ Before the width/truncation loops: the string measured has to be
         * the string drawn. */
        let val = row.chevron ? '>' : (row.value != null ? String(row.value).toUpperCase() : '');
        if (row.editing && val) val = '[' + val + ']';
        const vw = val ? mvWidth(val) : 0;
        /* ⭑ hostLabels: draw the LEFT column in the STOCK SCHWUNG font (the
         * host's own proportional 5x7 `print`), leaving the right-hand values on
         * the small movy font and the header untouched. Opt-in per call — this
         * list renderer is shared by a dozen screens and Josh is trying the look
         * on ONE (sound + config top level, 2026-08-27).
         *
         * ⚠ Its own measurement, `text_width()`: the host font is PROPORTIONAL
         * (advance = each glyph's ink width + 1), so hdrWidth/mvWidth — both of
         * which assume this font's fixed cells — would mis-measure it and the
         * truncation loop would cut in the wrong place.
         * ⚠ `mixedCase` rides with it: the upper-casing below exists because
         * BOTH davebox fonts are effectively caps-only. The stock font is not,
         * so the reason does not apply to it. */
        /* ⭑⭑ THE MENU TYPE RULE (Josh, 2026-08-27): "Header is always HDRfont.
         * Listings under header are always schwung stock. params, anything else
         * to the right are always movy small."
         *
         * So this is the DEFAULT, not an opt-in — "always" means a list added
         * next year inherits it without anyone remembering. The two PICKERS opt
         * OUT by name (`hostLabels: false`); Josh: "Do not make any changes to
         * canvas kit, pickers or anything like that."
         *
         * ⚠ NOT gated on `row.hdr`. That flag chose between the header font and
         * the small font for a LABEL, and `hdr: false` appears nowhere in the
         * tree — rows either ask for the header font or fall through to the
         * small one. Both are listings, so both become stock; `hdr` now only
         * steers the centred `note` rows above. Gating on it would have left
         * every unflagged row in the small font and made the rule a coin-flip
         * per row. */
        const _hostLabel = o.hostLabels !== false;
        let label = String(row.label || '');
        if (!(_hostLabel && o.mixedCase !== false)) label = label.toUpperCase();
        /* ⭑ `qual`: a DISAMBIGUATOR that rides with the label in the movy small
         * font, so the name stays the listing font and the qualifier reads as
         * secondary without needing brackets.
         *
         * ⚠ It is NOT a value. The right-hand column belongs to `value` /
         * `chevron`, and a row can have both — a module row is "NAME  fx1  >".
         * That is the whole reason this is not simply another `value`: a door
         * already spends the right edge on its chevron, so a qualifier that
         * needs to sit next to the NAME has nowhere else to go. */
        const qual = row.qual ? String(row.qual).toUpperCase() : '';
        const qw = qual ? mvWidth(qual) + QUAL_GAP : 0;
        const availW = rightEdge - labelX - (vw ? vw + 4 : 0) - qw;
        let labelEnd = 3;
        if (_hostLabel) {
            while (label.length > 1 && text_width(label) > availW) label = label.slice(0, -1);
            /* +1: the 7-row host glyph sits one lower than the 6-row header
             * glyph in the same band, so the baselines agree with the values. */
            print(labelX, y + 1, label, ink);
            labelEnd = labelX + text_width(label);
        } else if (row.hdr) {
            while (label.length > 1 && hdrWidth(label) > availW) label = label.slice(0, -1);
            hdrPrint(labelX, y, label, ink);
            labelEnd = labelX + hdrWidth(label);
        } else {
            while (label.length > 1 && mvWidth(label) > availW) label = label.slice(0, -1);
            mvPrint(labelX, y + 1, label, ink);
            labelEnd = labelX + mvWidth(label);
        }
        if (qual) mvPrint(labelEnd + QUAL_GAP, y + 1, qual, ink);
        if (val) mvPrint(rightEdge - vw, y + 1, val, ink);
    }
    if (hasScroll) {
        const trackH = visible * rowH;
        const thumbH = Math.max(3, Math.round(trackH * visible / n));
        const thumbY = topY - 1 + Math.round((trackH - thumbH) * start / Math.max(1, n - visible));
        /* ⭑ THE RULE (upstream's, mocked here): a DOTTED rail with a SOLID
         * thumb, and no arrows. The rail is the extent of the list and the
         * thumb is where you are in it; drawing both solid makes the thumb a
         * thicker piece of the same object, so the eye has to measure widths to
         * read a position. Arrows say "there is more" twice — the rail already
         * does, permanently, and an arrow that appears and disappears reflows
         * the row it sits on.
         * ⚠⚠ OPT-IN (`dottedRail`) BECAUSE IT CHANGES EVERY LIST AT ONCE. Sound
         * mode's lists, the knob/LFO editors, global settings, the project
         * screens, the snapshot picker and every picker overlay come through
         * here. Josh judges the mockup render first; flipping the default is a
         * one-word change once he has. */
        if (o.dottedRail) {
            for (let ry = topY - 1; ry < topY - 1 + trackH; ry += 2)
                set_pixel(boxX + boxW - 2, ry, 1);
        } else {
            fill_rect(boxX + boxW - 2, topY - 1, 1, trackH, 1);
        }
        fill_rect(boxX + boxW - 3, thumbY, 2, thumbH, 1);
    }
    return start;
}

/* Down-arrow affordance for banks with alt params, in the header's top-right.
 * `onFill` = header background is filled white (arrow draws black). */
export function drawKitAltArrow(x, onFill, on, blinkHidden) {
    if (on && blinkHidden) return;
    const fg = onFill ? 0 : 1;
    fill_rect(x,     2, 5, 1, fg);
    fill_rect(x + 1, 3, 3, 1, fg);
    fill_rect(x + 2, 4, 1, 1, fg);
}
