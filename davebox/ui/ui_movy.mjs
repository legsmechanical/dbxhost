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
export const MV_ROW0_Y = 14, MV_LBL0_Y = 30, MV_ROW1_Y = 41, MV_LBL1_Y = 57;
export const MV_CELL_W = 32, MV_KW = 20, MV_KH = 16, MV_LBL_H = 7;
/* Centered overlay box shared by the turn-to-reveal value zoom (ui_render) and
 * the picker list overlay below — same footprint so both read as one control. */
export const MV_ZOOM_X = 32, MV_ZOOM_Y = 14, MV_ZOOM_W = 64, MV_ZOOM_H = 48;
const SCREEN_W = 128;

/* ---- header font: "6x6 Pixel Font" by asciimario (CC BY-NC 3.0) ----
 * Glyph: [advance, ...6 rowBits], bit0 = leftmost; [n] alone = blank;
 * null = unmapped. Uppercase-only (lowercase rows repeat caps). */
const HDR_G = [
  [7], [7,12,12,12,12,0,12], null, [7,10,31,10,31,10,0], null, [7,51,48,12,12,3,51], null, null,
  [4,6,3,3,3,3,6], [4,3,6,6,6,6,3], null, [7,0,12,63,63,12,0], [7,0,0,0,0,12,4], [7,0,0,30,30,0,0], [7,0,0,0,0,12,12], [7,48,48,12,12,3,3],
  [7,30,51,59,55,51,30], [7,12,14,12,12,12,30], [7,30,51,48,30,3,63], [7,30,48,28,48,51,30], [7,24,28,30,27,63,24], [7,31,3,31,48,51,30], [7,30,3,31,51,51,30], [7,63,51,48,24,12,12],
  [7,30,51,30,51,51,30], [7,30,51,51,62,48,30], [7,12,12,0,0,12,12], null, [7,48,12,3,3,12,48], null, [7,3,12,48,48,12,3], [7,30,51,24,12,0,12],
  null, [7,30,51,51,63,51,51], [7,31,51,31,51,51,31], [7,30,51,3,3,51,30], [7,31,51,51,51,51,31], [7,63,3,31,3,3,63], [7,63,3,3,31,3,3], [7,30,51,3,59,51,62],
  [7,51,51,63,51,51,51], [7,30,12,12,12,12,30], [7,56,48,48,48,51,30], [7,51,27,15,15,27,51], [7,3,3,3,3,3,63], [7,35,55,63,43,35,35], [7,35,39,47,59,51,35], [7,30,51,51,51,51,30],
  [7,31,51,51,31,3,3], [7,30,51,51,59,19,46], [7,31,51,51,31,51,51], [7,30,3,30,48,51,30], [7,63,12,12,12,12,12], [7,51,51,51,51,51,30], [7,51,51,51,51,30,12], [7,35,35,43,63,55,35],
  [7,51,51,30,30,51,51], [7,51,51,51,30,12,12], [7,63,56,28,14,7,63], null, null, null, null, null,
  null, [7,30,51,51,63,51,51], [7,31,51,31,51,51,31], [7,30,51,3,3,51,30], [7,31,51,51,51,51,31], [7,63,3,31,3,3,63], [7,63,3,3,31,3,3], [7,30,51,3,59,51,62],
  [7,51,51,63,51,51,51], [7,30,12,12,12,12,30], [7,56,48,48,48,51,30], [7,51,27,15,15,27,51], [7,3,3,3,3,3,63], [7,35,55,63,43,35,35], [7,35,39,47,59,51,35], [7,30,51,51,51,51,30],
  [7,31,51,51,31,3,3], [7,30,51,51,59,19,46], [7,31,51,51,31,51,51], [7,30,3,30,48,51,30], [7,63,12,12,12,12,12], [7,51,51,51,51,51,30], [7,51,51,51,51,30,12], [7,35,35,43,63,55,35],
  [7,51,51,30,30,51,51], [7,51,51,51,30,12,12], [7,63,56,28,14,7,63], null, null, null, null
];

/* TRUE lowercase 'd' and 't' — the only two in this font. Everything else in
 * the lowercase range duplicates its capital (the font is a caps design), but
 * a capital D is a 0 with the diagonal removed, so "1/64D" reads as "1/640"
 * in the stacked-fraction read-out. Triplet/dotted suffixes therefore use
 * real minuscules: 'd' = bowl + right ascender, 't' = stem + crossbar + tail.
 * 6 columns, 6 rows, bit0 = leftmost — same encoding as HDR_G above. */
HDR_G[0x64 - 0x20] = [7, 48, 48, 62, 51, 51, 62];   /* 'd' */
HDR_G[0x74 - 0x20] = [7, 12, 30, 12, 12, 12, 28];   /* 't' */
/* TRUE lowercase 'x' — added for the brand mark "dAVEBOx" (the set manager's
 * always-on header): both minuscules in the wordmark now render as themselves.
 * x-height only (rows 2-5), two strokes crossing without a shared centre —
 * at 4px tall a centre pixel welds the strokes into a blob. */
HDR_G[0x78 - 0x20] = [7, 0, 0, 51, 30, 30, 51];     /* 'x' */

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
export function drawKitHeader(text, invert) {
    /* UPPERCASE for the same reason drawKitList does it: this font keeps true
     * lowercase `d` and `t` glyphs and maps every other lowercase letter to its
     * capital, so mixed-case titles come out with two odd letters. A no-op for
     * everything else. */
    const t = fitHdr(String(text).toUpperCase(), SCREEN_W - 4);
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
    /* Skip runs lying flat on the bottom axis so the curve ends where it
     * reaches the floor rather than continuing along it. */
    let prevX = x0, prevY = yAt(x0);
    for (let px = x0 + 1; px <= x0 + spanW; px++) {
        const y = yAt(px);
        if (prevY < botY || y < botY) plotLine(prevX, prevY, px, y, 1);
        prevX = px; prevY = y;
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

/* ---- grid ---- */

function drawCellWidget(col, rowY, cell, touched) {
    const kx = col * MV_CELL_W + Math.floor((MV_CELL_W - MV_KW) / 2);
    switch (cell.kind) {
        case 'arc':    return drawArcKnob(kx, rowY, cell.norm || 0, false);
        case 'arcbip': return drawArcKnob(kx, rowY, 0.5 + (cell.signed || 0) / 2, true);
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
        default:       return; /* blank */
    }
}

/* Label strip cell: the short NAME normally; while touched the cell inverts
 * and shows the live VALUE (movy's signature swap). */
function drawCellLabel(col, lblY, cell, touched) {
    let text = String(touched && cell.text != null ? cell.text : (cell.label || ''));
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
export function drawKitCells(cells, touchedIdx, env, filt) {
    const envFirst = env ? env.start : -1;
    const envLast = env ? env.start + env.count - 1 : -2;
    const filtFirst = filt ? filt.start : -1;
    const filtLast = filt ? filt.start + 1 : -2;   /* always a 2-cell span */
    for (let k = 0; k < 8; k++) {
        const cell = cells[k];
        if (!cell) continue;
        const col = k % 4;
        const rowY = k < 4 ? MV_ROW0_Y : MV_ROW1_Y;
        const lblY = k < 4 ? MV_LBL0_Y : MV_LBL1_Y;
        const covered = (k >= envFirst && k <= envLast) ||
                        (k >= filtFirst && k <= filtLast);
        if (!covered) drawCellWidget(col, rowY, cell, k === touchedIdx);
        drawCellLabel(col, lblY, cell, k === touchedIdx);
    }
    if (env) {
        drawKitEnvelopeRow(env.start < 4 ? MV_ROW0_Y : MV_ROW1_Y, cells, env);
    }
    if (filt) {
        drawKitFilterCurve(filt.start < 4 ? MV_ROW0_Y : MV_ROW1_Y, filt);
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

    const X = MV_ZOOM_X, Y = MV_ZOOM_Y, W = MV_ZOOM_W, H = MV_ZOOM_H;
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
        while (label.length > 1 && hdrWidth(label) > availW) label = label.slice(0, -1);
        if (idx === sel) {
            fill_rect(rowX, y, rowW, ROW_H, 1);
            hdrPrint(rowX + 3, y + 1, label, 0);
        } else {
            hdrPrint(rowX + 3, y + 1, label, 1);
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
    drawKitCells(cells, t, opts.env, opts.filt);
    /* The option-list overlay covers the 3 cells away from the touched knob, so
     * it must NOT appear on a bare orienting touch — only once that knob is
     * actually TURNED (see enumOverlayIdx in ui_render.mjs). Callers pass the
     * turn-gated index separately; omitting it keeps the old touch-gated
     * behaviour for existing call sites. */
    const ov = (opts.overlayIdx != null) ? opts.overlayIdx : t;
    drawKitEnumOverlay(cells, ov);
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
 * rows: strings, or { label, value?, chevron? ('>'), editing?, hdr? }.
 *   `hdr` prints the label in the header font (caps chrome rows).
 * sel: selected index. opts: { topY=11, rowH=10, visible (derived), emptyMsg }.
 * Pure: no state reads; returns the first visible index (for callers that
 * align auxiliary drawing with the window). */
export function drawKitList(rows, sel, opts) {
    const o = opts || {};
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
            const x = Math.max(0, Math.round((SCREEN_W - w) / 2));
            const y = topY + Math.round(((64 - topY) - MV_LBL_H) / 2);
            if (o.emptyHdr) hdrPrint(x, y, t, 1); else mvPrint(x, y, t, 1);
        }
        return 0;
    }
    const visible = o.visible != null ? o.visible
                                      : Math.max(1, Math.floor((64 - topY - 1) / rowH));
    /* sel < 0 means NOTHING is selectable on this screen — a prompt whose only
     * inputs are a pad or Back, not a list you move a cursor through. Without
     * it the clamp turned -1 into 0 and highlighted the first row, which reads
     * as "this row is selected" on a screen where nothing can be. */
    const none = (sel | 0) < 0;
    const s = none ? -1 : Math.max(0, Math.min(n - 1, sel | 0));
    const start = none ? 0
        : Math.max(0, Math.min(s - Math.floor(visible / 2), n - visible));
    const hasScroll = n > visible;
    const rightEdge = hasScroll ? SCREEN_W - 5 : SCREEN_W - 3;   /* value right-align x */
    const fillW = hasScroll ? SCREEN_W - 4 : SCREEN_W;
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
        if (row.divider) { fill_rect(0, y + (rowH >> 1) - 1, fillW, 1, 1); continue; }
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
            const nx = Math.max(0, Math.round((fillW - nw) / 2));
            if (row.hdr === false) mvPrint(nx, y + 1, t, 1); else hdrPrint(nx, y, t, 1);
            continue;
        }
        if (on) fill_rect(0, y - 1, fillW, rowH, 1);
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
        let label = String(row.label || '').toUpperCase();
        const availW = rightEdge - 3 - (vw ? vw + 4 : 0);
        if (row.hdr) {
            while (label.length > 1 && hdrWidth(label) > availW) label = label.slice(0, -1);
            hdrPrint(3, y, label, ink);
        } else {
            while (label.length > 1 && mvWidth(label) > availW) label = label.slice(0, -1);
            mvPrint(3, y + 1, label, ink);
        }
        if (val) mvPrint(rightEdge - vw, y + 1, val, ink);
    }
    if (hasScroll) {
        const trackH = visible * rowH;
        const thumbH = Math.max(3, Math.round(trackH * visible / n));
        const thumbY = topY - 1 + Math.round((trackH - thumbH) * start / Math.max(1, n - visible));
        fill_rect(SCREEN_W - 2, topY - 1, 1, trackH, 1);
        fill_rect(SCREEN_W - 3, thumbY, 2, thumbH, 1);
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
