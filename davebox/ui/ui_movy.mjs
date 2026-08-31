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
 * ⚠ THE TWO IMPORTS ARE PURE SIBLINGS, NOT AN EXCEPTION TO THE RULE. The rule
 * this file lives by is that it loads STANDALONE IN NODE (no device-absolute
 * specifiers, no state, no host globals at module scope) — which is what makes
 * tools/preview_movy.mjs, tools/render_screens.mjs and tools/render_widgets.mjs
 * possible. ui_fonts_pp.mjs is glyph data and ui_anim.mjs is a caller-owned
 * store; both satisfy every part of that. See UI_LANGUAGE §0.
 *
 * Cell descriptor (everything precomputed by the caller — no param reads):
 *   { kind:  'blank' | 'arc' | 'arcbip' | 'hbar' | 'pill' | 'vbar' | 'enumsq'
 *            | 'valsq' | 'frac' | 'opaque',
 *            ('opaque' = a value you cannot TURN — a file, a path, a string:
 *             a chevron-broken box showing the value's head, tri-stated
 *             value / NONE / -- . `opens: true` adds the corner brackets),
 *            ('pill' = the switch pill, for a toggle whose two states are
 *             literally off/on; 'hbar' remains the two-state bar for a pair of
 *             WORDS — see isBooleanPair in ui_cells.mjs. 'vbar' draws the fader
 *             column since 2026-08-29),
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

import {
    fontPrint4x5, fontWidth4x5, fit4x5, FONT4_HEIGHT, enumSquareLines,
    fontPrintBigNum, fontWidthBigNum, bigNumCanDraw, BIGNUM_H,
    fontPrintTamzen, fontWidthTamzen, TAMZEN_H,
} from './ui_fonts_pp.mjs';
import { observeLanded, easeOut, lerp } from './ui_anim.mjs';

/* ---- layout: the vertical map, 128x64 ----------------------------------
 *
 * ⭑⭑ RE-CUT 2026-08-29 TO BUY THE FOOTER. This SUPERSEDES the canvaskit v27
 * map, which had no room for one: its bottom label strip ran to row 63.
 *
 *   hdr    0-6    filled bar, 5-row glyph at y=1, one clear row each side
 *                 ⭑ RE-CUT 2026-08-30 (Josh): the title moved from the 6-row
 *                 header face to font4x5, so the band is 7 rather than 8. Same
 *                 look, one row cheaper, and it matches the face upstream's
 *                 param-pages header uses for the same job.
 *   dark   7      ⚠ LOAD-BEARING for the bar below: davebox's header is ALWAYS
 *                 inverted, so a white segment row touching the filled band
 *                 just becomes the band. Proven on device 2026-08-30 — the bar
 *                 was drawing at 123 ink and read as nothing at all.
 *   bar    8      page indicator, MODULE PARAM PAGES ONLY (MV_BAR_Y). The
 *                 track-view bank cards draw nothing here; see drawKitPageBar.
 *   gap    9
 *   w0     10-24  widget row 0            MV_ROW0_Y, MV_KH = 15
 *   lbl0   25-31  label strip 0           MV_LBL0_Y, MV_LBL_H = 7
 *   gap    32
 *   w1     33-47  widget row 1            MV_ROW1_Y
 *   lbl1   48-54  label strip 1           MV_LBL1_Y
 *   clear  55-56  ⭑ TWO clear rows above the footer now, not one — the row the
 *                 grid gave back by moving up. That is the separation upstream
 *                 relies on instead of a rule, and it is why ours could go.
 *   ftr    57-63  hint pills              MV_FOOTER_Y, MV_FOOTER_H = 7
 *
 * ⭑ THE GUTTERS ARE EQUAL (one row above each widget row). They were 4 and 2
 * before, which is the kind of asymmetry nothing reads as deliberate — it
 * reads as one row tight and one loose. One row rather than upstream's two,
 * because davebox spends two more rows up top than upstream does: its header
 * band is 8 (a 6-row glyph, not a 5-row one) and its bar needs the dark row
 * above.
 *
 * ⭑ THE ROWS CAME FROM THE WIDGET BOX, 16 -> 15, WHICH IS FREE. A viz body
 * occupies rowY+1..rowY+13 and a framed box is 15 tall, so 15 is all either
 * ever needed — this is upstream's BOX_H exactly, and every widget in this
 * file was already drawing inside it.
 *
 * ⚠⚠ THE LABEL BAND STAYS 7 AND MUST STAY ODD. It is the obvious place to
 * find two more rows and it is the wrong one: 5 glyph rows centred in an EVEN
 * band leave no clear row on one side, so a TOUCHED cell — which inverts the
 * strip — has its letters running straight into the top edge of their own
 * highlight and the whole strip reads as a smudge. Upstream cut it to 6, saw
 * that on hardware, and put it back. 7 gives one clear row on each side.
 *
 * ⚠ MV_ZOOM_Y is deliberately NOT re-cut with the rest. It used to coincide
 * with the widget-row top; it no longer does. The overlays it positions (the
 * picker, the stacked list) are MODALS whose row capacity is tuned against
 * this box, and moving them would change how many options fit — a separate
 * decision from making room for a footer. */
/* ============================================================================
 * TWO SURFACES, TWO ROW MAPS (Josh, 2026-08-30: "i want to branch off the
 * davebox bank UI from the sound mode UI so they can each be distinct").
 *
 * The knob-grid chassis is shared by two screens that are NOT the same screen:
 *
 *   BANK   davebox's own track-view bank cards. No position strip — the jog
 *          opens a named picker, so the card says the bank in words.
 *   SOUND  sound mode's module PARAM PAGES, which do scroll, and whose page bar
 *          therefore means what it says.
 *
 * They shared one map until now, so every geometry change had to be right for
 * both at once — and the bank cards could not use the rows the missing page bar
 * frees. Splitting them is what lets each move on its own.
 *
 * ⚠ THESE ARE `let`, NOT `const`, AND THAT IS LOAD-BEARING. ESM exports are live
 * bindings, so every importer sees the swap with no call-site changes — the
 * alternative was threading a layout object through ~100 internal uses. The cost
 * is module state, and it is bounded the only way it can be: kitUseLayout() is
 * called at the TOP OF EACH SURFACE'S ENTRY POINT (drawKitPage in ui_render for
 * BANK, drawKitBankPage below for SOUND), the draw path is synchronous and draws
 * one page per frame, and test_kit_layout_split pins both call sites so a new
 * surface cannot forget.
 * ⭑ Values here are the BANK map; kitUseLayout swaps them. Anything that must
 * NOT vary by surface stays `const` below. */
export let MV_HDR_H = 7;
export let MV_BAR_Y = 8;
/* ⚠ THE BRAND HEADER KEEPS THE 6-ROW FACE AND ITS 8-ROW BAND. font4x5 is
 * UPPERCASE-ONLY (see CHARS4 in ui_fonts_pp.mjs), and the wordmark IS its
 * minuscules — "dAVEBOx" is the mark, not a title. A 6-row glyph at y=1 needs
 * an 8-row band to keep a clear row below it, which is what stops the letters
 * running into the bottom edge of their own highlight. */
export const MV_BRAND_HDR_H = 8;
/* (The 2026-08-25 note that lived here — "shifted up 2px into the space the
 * header rule used to take, because the latch frame needs the bottom row" — is
 * SUPERSEDED. The bottom row now belongs to the footer, and the latch frame
 * ends above it: see drawKitLatchBox.) */
export let MV_ROW0_Y = 9, MV_LBL0_Y = 24, MV_ROW1_Y = 32, MV_LBL1_Y = 47;

/* The two maps. BANK gains the row SOUND spends on its page bar: with no strip
 * to clear, the grid starts one row higher and the footer gets a third clear row
 * above it. SOUND is exactly what both surfaces used before the split, so that
 * screen is unchanged by it. */
const KIT_LAYOUTS = {
    bank:  { hdrH: 7, barY: 8, row0Y:  9, lbl0Y: 24, row1Y: 32, lbl1Y: 47 },
    sound: { hdrH: 7, barY: 8, row0Y: 10, lbl0Y: 25, row1Y: 33, lbl1Y: 48 },
};
let kitLayoutName = 'bank';

/* Select the row map for the surface about to draw. Call it FIRST, before any
 * other kit draw call — everything below reads these bindings. */
export function kitUseLayout(name) {
    const L = KIT_LAYOUTS[name];
    if (!L) return;
    kitLayoutName = name;
    MV_HDR_H = L.hdrH; MV_BAR_Y = L.barY;
    MV_ROW0_Y = L.row0Y; MV_LBL0_Y = L.lbl0Y;
    MV_ROW1_Y = L.row1Y; MV_LBL1_Y = L.lbl1Y;
}
export function kitLayout() { return kitLayoutName; }
export const MV_CELL_W = 32, MV_KW = 20, MV_KH = 15, MV_LBL_H = 7;
/* The hint row sits on the LAST SCANLINE, not one row up. The panel is inset in
 * plastic, so a dark row at the bottom is not a margin — it is a margin on top
 * of a margin, and the bezel is already the ground a bottom notch reads
 * against. Same reason the header's band starts at row 0. */
export const MV_FOOTER_Y = 57;
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
/* ⚠⚠ THE DASHED PHASE CLEARS ITS GAPS, it does not merely skip them. The frame's
 * bottom edge lands on MV_RULE_Y, so from 2026-08-29 there is a solid hairline
 * underneath it: a dashed edge that only SETS ink leaves the rule showing
 * through every gap, the bottom edge reads solid in both phases, and the latch's
 * whole solid-vs-segmented animation dies on that edge with nothing to say so.
 * Knocking out is also the file's existing idiom for a mark on filled ground —
 * the switch slug, notchCorners, the envelope's section markers — and it makes
 * the frame correct over ANY ground rather than only over black. */
export function drawKitLatchBox(y, dashed) {
    /* ⚠ THE FRAME STOPS ABOVE THE FOOTER, not at the panel edge. It used to run
     * to row 63 because that row was spare; it is the hint row now, and a frame
     * drawn through the pills reads as corruption rather than as a latch. The
     * bottom edge lands on the one clear row between the last label strip and
     * the footer, so it encloses the PARAMS — which is what it is a frame
     * around — and touches neither. */
    const x = 0, w = SCREEN_W, h = MV_FOOTER_Y - y;
    if (!dashed) { rectOutline(x, y, w, h, 1); return; }
    for (let i = 0; i < w; i++) {
        const on = (i % 2) === 0 ? 1 : 0;
        set_pixel(x + i, y, on);
        set_pixel(x + i, y + h - 1, on);
    }
    for (let j = 0; j < h; j++) {
        const on = (j % 2) === 0 ? 1 : 0;
        set_pixel(x, y + j, on);
        set_pixel(x + w - 1, y + j, on);
    }
}

/* ---- widgets (movy language, kit v27 metrics: 16px tall in 32px cells) ---- */

/* ---- the arc knob (param-pages geometry) ---------------------------------
 *
 * Ported from schwung's src/shared/param_pages/render_page_movy.mjs
 * drawArcKnob, itself a port of schwung-movy renderer/knob.ts (MIT, (c) 2026
 * megadake). Adapted from the injected-ctx contract onto davebox's draw globals
 * and onto its own cell metrics; the angles, the proportions and the reasoning
 * are upstream's.
 *
 * ⭑⭑ THE TRACK IS AN OPEN ARC AND THE POINTER FLOATS CLEAR OF BOTH ENDS.
 * Both carry information a plain circle-plus-spoke does not:
 *
 *   - THE GAP MARKS THE ENDS OF TRAVEL. A full 360 ring under a pointer that
 *     only sweeps 270 leaves 90 degrees of track the value can never reach, and
 *     says the control WRAPS when it does not. (davebox's discrete kinds clamp
 *     and never wrap — see UI_LANGUAGE §8 — so the old closed ring was actively
 *     contradicting the input grammar.) The track reuses the pointer's own
 *     numbers, so the two agree by construction.
 *   - A POINTER WELDED FROM THE CENTRE TO THE RIM READS AS A CLOCK HAND, or as
 *     a pie slice. A short stroke floating between the hub and four-fifths of
 *     the radius reads as an indicator aimed at a scale.
 *
 * ⭑ THE FOUR ANGLES ARE NOT THE SAME PAIR TWICE:
 *     track    230 / 260 sweep — open at the bottom.
 *     pointer  225 / 270 sweep — travel bottoms out on the 225 diagonal, so a
 *              pointer at either extreme sits on a clean 45-degree run rather
 *              than on a rounding-dependent angle.
 *   The 5-degree inset is deliberate, not a rounding artefact: at either
 *   extreme the pointer aims just PAST the end of the track, into the gap, so
 *   "fully closed" and "fully open" are visibly ENDS rather than merely the last
 *   position before one.
 *
 * ⚠ THE POINTER TIP IS 0.68r, NOT MOVY'S 0.85r, and this is the one number
 * where the brief for this port and its own named source disagree — the source
 * wins, because 0.85 was tried and rejected upstream for two reasons that both
 * still apply here:
 *   · at 0.85 the tip is 6.8px from the centre against a track at 8 — one clear
 *     pixel at best, and none at the shoulders where the rasteriser thickens the
 *     ring. The marker merges with the rim and reads as a lump growing off it.
 *   · MV_MOD_DOT_INSET puts the modulation dot's plus across r-3..r-1, i.e.
 *     5..7. A 0.85r pointer runs STRAIGHT THROUGH that band; a 0.68r one stops
 *     at its inner edge. So 0.85 would break the very dot this port is required
 *     to keep working.
 *   The cost is real and is upstream's own note: a shorter pointer is a smaller
 *   marker, so the angle is carried by less ink across a page of eight. The
 *   number is a named constant and the offline renderer draws BOTH, so it is
 *   one edit to overrule.
 *
 * ⚠ NO `draw_arc`, THOUGH THIS FORK'S HOST BINDS ONE (js_display.c). One
 * rasteriser, in JS, deliberately: this file must load standalone in node for
 * the previewer and the two offline renderers, none of which have the C. A
 * native path plus a JS stub is TWO rasterisers that have to agree pixel for
 * pixel, and upstream's own comment records that exactly this gap — the
 * headless harness only ever exercising the fallback — is how a visible circle
 * defect survived review. A preview that disagrees with the OLED is worse than
 * a slower one. Cost, at the measured 490ns per binding crossing: ~0.27ms for
 * eight knobs against a whole-page budget of ~1.6ms, and no worse than the
 * midpoint walk it replaces.
 */
export const MV_KNOB_R = 8;
const ARC_START_DEG = 230, ARC_SWEEP_DEG = 260;
const PTR_START_DEG = 225, PTR_SWEEP_DEG = 270;
const PTR_INNER = 0.0, PTR_OUTER = 0.68;

/* Where a normalised value points, in radians. ⭑ ONE function, because the
 * POINTER and the MODULATION DOT must agree about it by construction: two
 * copies is a knob whose dot sits somewhere its own pointer can never reach,
 * and nothing on screen would say which of them was lying. */
function knobAngleRad(norm) {
    const n = norm < 0 ? 0 : (norm > 1 ? 1 : (norm || 0));
    return (PTR_START_DEG + n * PTR_SWEEP_DEG) * Math.PI / 180;
}

/* ⚠ A DISTANCE-ROUNDED RING, NOT A MIDPOINT WALK, and not a difference of two
 * filled discs. All three were tried upstream and the other two are visibly
 * wrong at this size:
 *   · the midpoint walk strands a lone pixel at each of the four compass
 *     points, one row proud of the run behind it — a spike on the outside of
 *     the circle. (The code this replaces papered over that by tucking the
 *     cardinal extremes to r-1, which is a dent instead of a spike.)
 *   · disc-minus-disc loses the pixel just inside each cardinal extreme and
 *     strands the extreme one over the gap: four detached dots. No integer
 *     radius escapes it.
 * One pixel per ROW and one per COLUMN, unioned. A plain distance-rounded
 * annulus is 1.41px wide at 45 degrees, which stacks into a blob at each
 * shoulder; taking the two scans separately keeps it 1px everywhere. */
function drawArcRing(cx, cy, r, startDeg, sweepDeg) {
    const start = ((startDeg % 360) + 360) % 360;
    const inSweep = (dx, dy) => {
        if (sweepDeg >= 360) return true;
        let a = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (a < 0) a += 360;
        let d = a - start;
        if (d < 0) d += 360;
        return d <= sweepDeg;
    };
    const plot = (dx, dy) => { if (inSweep(dx, dy)) set_pixel(cx + dx, cy + dy, 1); };
    for (let dy = -r; dy <= r; dy++) {
        const dx = Math.round(Math.sqrt(r * r - dy * dy));
        plot(dx, dy); if (dx !== 0) plot(-dx, dy);
    }
    for (let dx = -r; dx <= r; dx++) {
        const dy = Math.round(Math.sqrt(r * r - dx * dx));
        plot(dx, dy); if (dy !== 0) plot(dx, -dy);
    }
}

/* Arc knob at an explicit centre + radius (the zoom overlay reuses this to draw
 * the exact same shape, just larger — so the zoom is a magnification and not a
 * second widget).
 *
 * ⭑ THE BIPOLAR CENTRE TICK IS DAVEBOX'S OWN, ADAPTED — said plainly because
 * the rest of this function is upstream's. render_page_movy has NO bipolar arc
 * treatment at all: its arc takes a single 0..1 and a bipolar param is
 * normalised into it like any other, so there was nothing to port. davebox
 * draws a centre reference and should keep doing so — the meaning of a bipolar
 * value is its DISTANCE FROM CENTRE, so centre has to look like centre.
 *
 * It lands better on the new geometry than on the old one: the pointer's travel
 * is now symmetric about 12 o'clock (225 + 0.5*270 = 360), so the tick marks
 * the true midpoint of travel rather than approximately it, which the old
 * 210/300 sweep did not.
 *
 * ⚠ ACCEPTED: at exactly centre a modulation dot lands on the tick — the dot's
 * band is r-3..r-1 and the tick occupies r-1..r-2 at that one angle. Left as
 * is: the two coinciding IS the reading "the source is at the centre right
 * now", and moving the tick outside the ring is impossible in a 16-row box
 * whose ring already reaches the top edge. */
export function drawArcKnobAt(cx, cy, r, norm, bipolar) {
    drawArcRing(cx, cy, r, ARC_START_DEG, ARC_SWEEP_DEG);
    /* ⚠ THE TICK IS r/2 LONG, NOT r/3.5. The old ring's 2px stub was measured
     * against a MIDPOINT-walked circle; on the distance-rounded one the column
     * at 12 o'clock carries a single ring pixel while its neighbours carry one
     * a row lower, so a 2px stub under it reads as the ring being locally
     * thick rather than as a mark. Rendered at r=8 it was invisible. Half the
     * radius protrudes far enough inward to read as a tick at both this size
     * and the zoom overlay's r=12. */
    if (bipolar) fill_rect(cx, cy - r + 1, 1, Math.max(2, Math.round(r / 2)), 1);
    const rad = knobAngleRad(norm);
    const sin = Math.sin(rad), cos = Math.cos(rad);
    plotLine(Math.round(cx + r * PTR_INNER * sin), Math.round(cy - r * PTR_INNER * cos),
             Math.round(cx + r * PTR_OUTER * sin), Math.round(cy - r * PTR_OUTER * cos), 1);
}

/* Arc knob in a cell's 20x16 widget box.
 *
 * ⭑ r = 8, UP FROM 7, which is upstream's own proportion (its ring is the full
 * width of a 16px box) applied to davebox's wider 20px one. The open bottom is
 * what makes it fit: a CLOSED ring at r=8 needs 17 rows and the box is 16, but
 * the arc's lowest drawn pixel sits at about 0.64r below centre, so the shape
 * is 14 rows tall and clears the label strip. Opening the arc where the travel
 * already ends spends that constraint on something that means one thing. */
export function drawArcKnob(kx, ky, norm, bipolar) {
    drawArcKnobAt(kx + Math.round(MV_KW / 2), ky + MV_KNOB_R, MV_KNOB_R, norm, bipolar);
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
    const rr = Math.max(1, r - MV_MOD_DOT_INSET);
    /* ⚠ THE SAME knobAngleRad THE POINTER USES. The dot and the pointer are two
     * readings of one control, so a second copy of the sweep here would let the
     * dot sit at an angle the pointer can never reach — and with the track now
     * OPEN at the bottom, an out-of-sweep dot would float in the gap, outside
     * the scale it is supposed to be riding. */
    const rad = knobAngleRad(norm);
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
    drawModDotAt(kx + Math.round(MV_KW / 2), ky + MV_KNOB_R, MV_KNOB_R, norm);
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


/* Framed square with the enum value (1-2 micro-font lines, or `sq` label). */
/* ---- the opaque box + the "opens something" brackets ---------------------
 *
 * Ported from render_page_movy.mjs drawOpaqueBox / drawBrackets.
 *
 * A cell for a value you cannot turn — a file path, a canvas, a string. It
 * shows the value's head and a CHEVRON broken into its right edge.
 *
 * ⭑⭑ THE TRI-STATE IS SPELLED OUT, and collapsing it is the bug this widget
 * exists to prevent:
 *
 *     a value      the basename, set LEFT
 *     ''  NONE     nothing is chosen — a real reading about the module
 *     null '--'    the read has not answered — we do not know
 *
 * Both used to say "--", which is the tri-state collapsed in the place it is
 * most visible: a sample slot with no file looked exactly like a sample slot
 * whose name had not arrived yet.
 *
 * ⭑ A PLACEHOLDER IS CENTRED; A VALUE IS SET LEFT. Left is right for a
 * filename — it truncates from the tail, so the start is the part worth showing
 * and a ragged right edge is the truncation being honest. NONE and -- are
 * neither: the whole string is present, and set left they sit hard against the
 * frame with a gap to the chevron, which reads as a value that failed to fill.
 * Centred in the space BEFORE the chevron, not in the box.
 *
 * ⚠ "NONE", NOT "EMPTY", which is the word that was asked for and does not fit:
 * measured in this box's own 4x5 face EMPTY is 23px against a 21px budget and
 * renders as "EMPT" with the chevron jammed against it. NONE is 19px.
 *
 * ⚠ THE INSET AND THE BUDGET ARE ONE MEASUREMENT and must move together — the
 * frame occupies column x and the chevron x+w-4..x+w-2, so x+3 with a budget of
 * w-9 leaves 2px clear at each end. Do not narrow them for one string.
 *
 * ⚠ THE CHEVRON IS NOT A "THIS OPENS" MARK. It is the WIDGET for a cell with no
 * value-shape to show. The brackets are the door mark, and they are a different
 * statement — measured over upstream's fleet, corner brackets appeared on cells
 * that are ALSO turnable ("the knob works, AND it opens") and the chevron on
 * cells that are not ("there is no knob; only a door"). */
export function drawOpaqueBox(cellX, ky, text) {
    const x = cellX + 1, y = ky, w = MV_CELL_W - 2, h = MV_KH;
    const gapY = y + ((h - 5) >> 1);
    fill_rect(x, y, w, 1, 1);
    fill_rect(x, y + h - 1, w, 1, 1);
    fill_rect(x, y, 1, h, 1);
    fill_rect(x + w - 1, y, 1, gapY - y, 1);
    fill_rect(x + w - 1, gapY + 5, 1, y + h - (gapY + 5), 1);
    notchCorners(x, y, w, h);

    /* The chevron sits IN the gap, not beyond it — a mark outside the cell
     * lands on the neighbouring column, and this grid does not repaint a
     * neighbour when this cell changes. */
    const ax = x + w - 4;
    for (let i = 0; i < 3; i++) {
        set_pixel(ax + i, gapY + i, 1);
        set_pixel(ax + i, gapY + 4 - i, 1);
    }

    const budget = w - 9;
    const raw = String(text == null ? '' : text).toUpperCase();
    const t = fit4x5(raw, budget);
    if (!t) return;
    const placeholder = (raw === 'NONE' || raw === '--');
    const tw = fontWidth4x5(t);
    const tx = placeholder ? x + 3 + Math.max(0, Math.floor((budget - tw) / 2)) : x + 3;
    fontPrint4x5(tx, ky + Math.floor((h - FONT4_HEIGHT) / 2), t, 1);
}

/* Corner brackets around an arbitrary rect: "you can go into this."
 *
 * ⭑ DRAWN AROUND THE CELL, AFTER THE WIDGET, so the mark is independent of what
 * the widget IS — it reads the same over a box, over an arc knob, and over a
 * span graphic that covers the cell. That is what makes it a grammar rather
 * than a decoration on one widget type: every alternative tried upstream
 * (dashed frame, dog-ear, chevron) attaches to a FRAME, and a divable param
 * drawn as a waveform has not got one.
 *
 * REJECTED upstream: a "..." mark on the label — it collides with truncation,
 * and worst exactly here, where the value shown IS truncated, so "SMP.." reads
 * as a cut-off label. REJECTED: a box-with-arrow icon; at the ~8px of clear
 * corner a 32px cell has, it does not resolve into a box and an arrow, it
 * resolves into a smudge.
 *
 * ⚠ MUST stay inside the widget band. One row of overflow lands on the label
 * strip and the brackets merge into it. */
export const MV_BRACKET_LEN = 4;
export function drawBrackets(x, y, w, h, len) {
    const L = len || MV_BRACKET_LEN;
    for (let i = 0; i < L; i++) {
        set_pixel(x + i, y, 1);
        set_pixel(x + w - 1 - i, y, 1);
        set_pixel(x + i, y + h - 1, 1);
        set_pixel(x + w - 1 - i, y + h - 1, 1);
    }
    for (let i = 0; i < L - 1; i++) {
        set_pixel(x, y + i, 1);
        set_pixel(x + w - 1, y + i, 1);
        set_pixel(x, y + h - 1 - i, 1);
        set_pixel(x + w - 1, y + h - 1 - i, 1);
    }
}

/* ---- the enum square (param-pages `thin-frame`) --------------------------
 *
 * Ported from render_page_movy.mjs drawEnumSquare, itself schwung-movy
 * renderer/knob.ts (MIT, (c) 2026 megadake).
 *
 * ⭑⭑ THE WIDTH IS THE VALUE'S, NOT THE CELL'S. The box sizes to the word it
 * contains, floored at MV_ENUM_MIN_W and capped at MV_ENUM_W, and is centred in
 * the slot the caller reserved — so a shrinking box closes in from both sides
 * rather than sliding off its own cell.
 *
 * ⭑ THE SLOT IS 28 WIDE, NOT MV_KW's 20. That is upstream's proportion (28 in a
 * 32px cell) and it is what retires davebox's old blind 4/4 slice: "AUDIO"
 * measures 21px in the 4x5 face against a 24px interior, so it now fits on ONE
 * LINE where it used to render as AUDI over O. Cells butt together at 32 with
 * no gutter (§3), so a 28px box still leaves 2px of air each side.
 *
 * ⭑ A SINGLE LINE GETS 3px OF SIDE MARGIN, NOT 1. At 1px a word sits hard
 * against its own frame and reads as cramped — reported from the device
 * upstream. It costs nothing in use, because the box is already sized to its
 * value and centred, so a narrow value has the room lying idle either side of
 * it; and the cap enforces the degradation on its own rather than by a branch,
 * so the margin fades 3px -> 1px -> none as the text grows and the widest
 * values draw exactly as they would have. TWO-LINE values are excluded: a value
 * only wraps because it did not fit on one line, so it is at the cap already.
 *
 * ⚠ THE MARGIN SURVIVES EVERY WIDTH, including mid-animation. It is not
 * decoration — a bowl (O C G D) one pixel off the border touches it at a
 * glance. The text budget is w-4 at whatever w currently is, measured per
 * frame, which is also what makes a GROWING box safe: the text is served short
 * for the few frames the frame is still narrow and completes as it arrives.
 *
 * ⚠ CENTRED IN THE INTERIOR (w-2), NOT IN THE BUDGET (w-4). Those are two
 * different spans; centring in the budget puts every value two pixels left of
 * centre — uniformly, which reads as a drawing mistake rather than a rounding
 * one.
 *
 * ⚠ THE CORNERS ARE NOTCHED, which is the house idiom and the only part of this
 * widget that is not upstream's. ACCEPTED COLLISION: the fader is also a
 * notched framed box, so a page mixing faders with enums distinguishes them by
 * CONTENT, not by silhouette. Taken deliberately upstream with the escape (a
 * frameless square) available and declined.
 */
export const MV_ENUM_W = 28;
export const MV_ENUM_MIN_W = 15;
const MV_ENUM_TEXT_W = MV_ENUM_W - 4;
const MV_ENUM_PAD_1LINE = 8;   /* 1px frame + 3px margin, both sides */
const MV_ENUM_PAD_2LINE = 4;   /* 1px frame + 1px margin, both sides */
export const MV_ENUM_ANIM_MS = 120;

/* ⚠ THE LINE COUNT IS A FUNCTION OF THE VALUE ALONE — always measured against
 * the FULL budget, never against whatever width the frame happens to be this
 * frame. Measuring against the animating width would split "POLY" onto two
 * lines for the few frames the box is narrower than its target and rejoin it on
 * arrival, so a line count would flicker mid-flight on a value that has not
 * changed since the swap. Only TRUNCATION knows the current width. */
function enumNaturalLines(text) {
    const pair = enumSquareLines(text, (t) => fontWidth4x5(t) <= MV_ENUM_TEXT_W);
    return [fit4x5(pair[0], MV_ENUM_TEXT_W), fit4x5(pair[1], MV_ENUM_TEXT_W)];
}

/* How wide this value's square wants to be. A two-line value sizes to the WIDER
 * of its lines; the narrower one is centred in the same interior. */
export function enumSquareWidth(text) {
    const L = enumNaturalLines(text);
    const tw = Math.max(fontWidth4x5(L[0]), fontWidth4x5(L[1]));
    const w = tw + (L[1] ? MV_ENUM_PAD_2LINE : MV_ENUM_PAD_1LINE);
    return w < MV_ENUM_MIN_W ? MV_ENUM_MIN_W : (w > MV_ENUM_W ? MV_ENUM_W : w);
}

/* `slotX` is the left edge of the nominal MV_ENUM_W slot the caller centred in
 * the cell; the narrower box is centred inside it.
 *
 * `anim`/`nowMs`/`animKey`/`raw` are OPTIONAL and TRAILING, and that ordering is
 * the contract: without them the square draws at its natural width and NOTHING
 * MOVES. The static sizing is the improvement; the motion is a by-product. A
 * missing `anim` is the normal case, not an error — do not "fix" it by
 * defaulting to a fresh store, which would make this stateful and every first
 * frame animate.
 *
 * ⚠ ONLY THE FRAME TRAVELS; the glyphs swap outright. There is no between-state
 * for a letterform at this size, so what animates is the one thing that has a
 * continuum. */
export function drawEnumSquare(slotX, ky, text, sq, anim, nowMs, animKey, raw) {
    const shown = sq != null ? String(sq) : String(text == null ? '' : text);
    const target = enumSquareWidth(shown);
    const h = MV_KH;

    let w = target;
    if (anim && typeof nowMs === 'number' && animKey) {
        /* ⚠ `raw` is the value BEHIND the text, and the text alone cannot stand
         * in for it: an unread key renders as "--", a perfectly ordinary string
         * with a perfectly ordinary width, so the box would grow out of it on
         * ARRIVAL. See observeLanded — a value arriving is not a value
         * changing. */
        const a = observeLanded(anim, 'enumw:' + animKey, raw, target, nowMs, MV_ENUM_ANIM_MS);
        if (a.moving && typeof a.from === 'number') {
            w = Math.round(lerp(a.from, target, easeOut(a.t)));
            if (w < MV_ENUM_MIN_W) w = MV_ENUM_MIN_W;
            if (w > MV_ENUM_W) w = MV_ENUM_W;
        }
    }

    const bx = slotX + Math.floor((MV_ENUM_W - w) / 2);
    fill_rect(bx, ky, w, 1, 1);
    fill_rect(bx, ky + h - 1, w, 1, 1);
    fill_rect(bx, ky, 1, h, 1);
    fill_rect(bx + w - 1, ky, 1, h, 1);
    notchCorners(bx, ky, w, h);

    const budget = w - 4;
    const nat = enumNaturalLines(shown);
    const line1 = fit4x5(nat[0], budget);
    const line2 = fit4x5(nat[1], budget);
    const totalH = line2.length > 0 ? 11 : FONT4_HEIGHT;
    const startY = ky + 1 + Math.floor((h - 2 - totalH) / 2);
    const tx = (lw) => bx + 1 + Math.floor(((w - 2) - lw) / 2);
    fontPrint4x5(tx(fontWidth4x5(line1)), startY, line1, 1);
    if (line2.length > 0) fontPrint4x5(tx(fontWidth4x5(line2)), startY + 6, line2, 1);
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
/* ---- the trigger button (param-pages drawButton) -------------------------
 *
 * Ported from render_page_movy.mjs. A raised physical button with a cap, sides
 * and a base arc, which presses DOWN and throws a burst of impact stubs.
 *
 * ⭑ THREE STATES, and the middle one earns its keep: idle is a raised outline;
 * SELECTED fills the cap; FIRED presses it down BTN_TRAVEL, shortens the sides
 * and radiates stubs. The affordance has to be ON the control — a trigger has
 * no value to read, so nothing else on the cell says it is pressable.
 *
 * ⚠⚠ THE FLASH IS DISPLAY ONLY. `phase` is computed by buttonPhase() from
 * timestamps the caller already has; NOTHING here fires anything, and the port
 * deliberately does not add a knob-turn trigger path. What makes the flash
 * happen is the existing click, unchanged.
 *
 * ⚠ A PRESS DOES NOT CLEAR THE BURSTS ALREADY TRAVELLING. Overwriting a single
 * timestamp made a rapid second press swallow the first ring and restart from
 * the centre, which reads as an animation glitch rather than as two events. Every
 * press still inside BTN_FLASH_MS keeps its own ring, and the cap is pressed if
 * ANY of them is recent.
 *
 * ⚠ The fill and the outline are BOTH drawn on a highlighted cap, in that
 * order. Filling alone left the rim a pixel short at the shallow top and
 * bottom, so the disk looked like it was missing a line. */
const BTN_RX = 7, BTN_RY = 3, BTN_DEPTH = 6, BTN_TRAVEL = 2;
export const BTN_PRESS_MS = 120;
export const BTN_FLASH_MS = 300;
const BTN_RAYS = 8, BTN_RAY_GAP = 2, BTN_RAY_LEN = 2, BTN_RAY_TRAVEL = 4;

function ellipseOutline(cx, cy, rx, ry, bottomOnly) {
    const put = (x, y) => { if (!(bottomOnly && y < cy)) set_pixel(x, y, 1); };
    for (let dx = -rx; dx <= rx; dx++) {
        const dy = Math.round(ry * Math.sqrt(Math.max(0, 1 - Math.pow(dx / rx, 2))));
        put(cx + dx, cy + dy); put(cx + dx, cy - dy);
    }
    for (let dy = -ry; dy <= ry; dy++) {
        const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - Math.pow(dy / ry, 2))));
        put(cx + dx, cy + dy); put(cx - dx, cy + dy);
    }
}

function ellipseFill(cx, cy, rx, ry) {
    for (let dy = -ry; dy <= ry; dy++) {
        const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - Math.pow(dy / ry, 2))));
        if (w > 0) fill_rect(cx - w, cy + dy, w * 2 + 1, 1, 1);
    }
}

/* Impact stubs, following the cap's ELLIPSE rather than a circle, so they sit
 * an even gap off the rim instead of bunching at the flat top and bottom. */
function buttonRays(cx, cy, progress) {
    const out = BTN_RAY_GAP + Math.round(progress * BTN_RAY_TRAVEL);
    for (let i = 0; i < BTN_RAYS; i++) {
        const a = (Math.PI * 2 * i) / BTN_RAYS;
        const ux = Math.cos(a), uy = Math.sin(a);
        plotLine(Math.round(cx + ux * (BTN_RX + out)),
                 Math.round(cy + uy * (BTN_RY + out)),
                 Math.round(cx + ux * (BTN_RX + out + BTN_RAY_LEN)),
                 Math.round(cy + uy * (BTN_RY + out + BTN_RAY_LEN)), 1);
    }
}

/* Idle / highlighted / pressed, resolved from the press timestamps alone.
 *
 * PURE — `now` is passed in, never read. Accepts a bare number as well as a
 * list, so a caller that has only ever stamped one time still works. */
export function buttonPhase(fired, now, held) {
    const stamps = Array.isArray(fired) ? fired : (fired > 0 ? [fired] : []);
    const bursts = [];
    let pressed = false;
    if (typeof now === 'number') {
        for (const t of stamps) {
            const age = now - t;
            if (age < 0 || age >= BTN_FLASH_MS) continue;
            bursts.push(age / BTN_FLASH_MS);
            if (age < BTN_PRESS_MS) pressed = true;
        }
    }
    return { pressed, filled: !!held || bursts.length > 0, bursts };
}

/* `phase` omitted => idle, which is what every caller that has not opted into
 * the flash gets. */
export function drawTriggerButton(kx, ky, phase) {
    const ph = phase || { pressed: false, filled: false, bursts: [] };
    const cx = kx + Math.round(MV_KW / 2);
    const travel = ph.pressed ? BTN_TRAVEL : 0;
    const capY = ky + 1 + BTN_RY + travel;
    const baseY = capY + BTN_DEPTH - travel;

    ellipseOutline(cx, baseY, BTN_RX, BTN_RY, true);          /* base arc */
    plotLine(cx - BTN_RX, capY, cx - BTN_RX, baseY, 1);       /* sides */
    plotLine(cx + BTN_RX, capY, cx + BTN_RX, baseY, 1);
    if (ph.filled) ellipseFill(cx, capY, BTN_RX, BTN_RY);
    ellipseOutline(cx, capY, BTN_RX, BTN_RY, false);
    for (const b of ph.bursts) buttonRays(cx, capY, b);
}

/* The action cell. ⚠ `oneWay` and `touched` are kept in the signature and are
 * no longer read for the GLYPH — the button's own three states say everything
 * the '< >' placeholder and the touched text swap used to. The label strip
 * still carries the name and swaps to the value on touch, unchanged. */
export function drawActionSquare(kx, ky, text, oneWay, touched, phase) {
    drawTriggerButton(kx, ky, phase);
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
/* ⭑ THE PARAM-PAGES FACE FIRST, DAVEBOX'S OWN AS THE FALLBACK — and the
 * fallback is not optional. The ported table (ui_fonts_pp.mjs) is TWELVE
 * GLYPHS: the digits, `+` and `-`, which is everything upstream's big-number
 * cell can emit. davebox's `valsq` is wider than that — it draws note names
 * ("E 3"), percentages, "--" and arbitrary short enum text — so the face is
 * asked whether it can draw the WHOLE string before it is chosen. Drawing a
 * missing glyph as nothing would silently turn "C1 36" into "1 36", which is a
 * different value rather than a worse-looking one.
 *
 * ⚠ Josh accepted the provenance on 2026-08-29: movy rasterised this from an
 * OTF it does not vendor, identified only as "Nokia". An earlier pass of this
 * campaign declined the face on exactly that ground; it is in now, and
 * ui_fonts_pp.mjs states what it is.
 *
 * The face is 11 rows, the same MV_BIG_H the davebox font uses, so the two sit
 * on one baseline and a page mixing them does not shift. */
export function drawBigNum(cellX, ky, text) {
    const t = String(text);
    if (bigNumCanDraw(t)) {
        const w = fontWidthBigNum(t);
        if (w <= MV_CELL_W) {
            fontPrintBigNum(cellX + Math.round((MV_CELL_W - w) / 2),
                            ky + Math.floor((MV_KH - BIGNUM_H) / 2), t, 1);
            return;
        }
    }
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
    const t = fit4x5(String(text).toUpperCase(), maxW || (SCREEN_W - 4));
    if (invert) {
        fontPrint4x5(2, 1, t, 1);
    } else {
        fill_rect(0, 0, SCREEN_W, MV_HDR_H, 1);
        fontPrint4x5(2, 1, t, 0);
    }
}

/* Touched header: the bar drops out and the param NAME renders centered in
 * white — the state flip is the touch feedback; the label strip below shows
 * the VALUE. No page bar in this state. */
export function drawKitTouchedHeader(name) {
    const t = fit4x5(String(name).toUpperCase(), SCREEN_W - 4);
    fontPrint4x5(Math.max(2, Math.round((SCREEN_W - fontWidth4x5(t)) / 2)), 1, t, 1);
    fill_rect(0, MV_BAR_Y, SCREEN_W, 1, 1);   /* same rule as the resting header */
}

/* Brand header: the kit header bar carrying the wordmark VERBATIM.
 * drawKitHeader uppercases — right for screen titles, wrong for "dAVEBOx",
 * whose minuscules are the mark (the font carries true 'd' and 'x' for it). */
export function drawKitBrandHeader() {
    const t = 'dAVEBOx';
    fill_rect(0, 0, SCREEN_W, MV_BRAND_HDR_H, 1);
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

/* The page-position bar for MODULE PARAM PAGES — sound mode's editor, which is
 * the only caller. Restored verbatim 2026-08-30 after the bank-indicator
 * experiment was abandoned (below); this screen was never the thing under
 * discussion and had no reason to change with it.
 *
 * ⚠ THE TRACK-VIEW BANK CARDS DELIBERATELY HAVE NO INDICATOR. That was tried
 * three ways in one sitting — segments under the band, segments with a
 * separator row, notches cut into the band's edge — and Josh ended it: "let's
 * just get rid of the indicator row altogether." The jog opens a NAMED bank
 * picker, so the card already says which bank you are on in words; a position
 * strip repeats that in a form you have to count. Do not re-add it without him
 * asking. */
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
    /* ⭑ GHOST FILL IS THE DEFAULT (Josh, 2026-08-29). It shipped opt-in for one
     * commit, purely so this curve — the only one of the three already live on
     * davebox bank pages — could be judged from a render before it changed. It
     * was, and the passband is now MASS. `fill: false` still opts out, so a
     * caller that wants the bare stroke has a way to say so; nothing passes it.
     * See fillCurveMass — one treatment, three graphs, deliberately.
     *
     * Unipolar: the zero line is the floor, so this is literally the area under
     * the curve. A column already on the floor fills nothing, which is what
     * keeps a stopband empty rather than giving it a one-row lid. */
    if (viz.fill !== false) fillCurveMass(x0, x0 + spanW, yAt, botY, topY, botY);
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
export const MV_WAVE_MORPH_MS = 100;

/* Single-cell waveform box: one cycle of the live shape with a dotted centre
 * baseline, in place of an enum square.
 *
 * ⭑ THE MORPH LIVES INSIDE THE SAMPLE CLOSURE, blended before the curve is
 * derived — port of viz_draw.mjs drawWaveCell. Everything about where the curve
 * is comes from one closure, so blending at the SAMPLE keeps stroke and any
 * fill in agreement for free; computing the morph a second time anywhere else
 * breaks that silently, and only at intermediate frames, which is the hardest
 * kind of wrong picture to notice.
 *
 * ⚠⚠ THE ANIMATION TOKEN IS TAGGED ("s2"), NEVER THE BARE NUMBER 2. observe()
 * re-bases a NUMERIC value to where it visually sits when retargeted mid-flight
 * — right for a box width, catastrophic for a shape id: a fast scroll hands
 * back 2.4, shapeSample falls through its default at anything unrecognised, and
 * the cell morphs out of a SINE that was never on screen. A non-numeric token
 * makes the re-base return the previous shape untouched.
 *
 * ⚠ `raw` is the value off the wire, NOT the shape name: shapeSample defaults
 * to a sine for anything it does not recognise, so an unread key resolves to a
 * perfectly ordinary shape and a morph out of it looks exactly like a real one.
 * See observeLanded — a value ARRIVING is not a value changing.
 *
 * With `anim`/`nowMs` omitted this draws byte-for-byte what it drew before. */
export function drawWaveBox(kx, ky, shape, anim, nowMs, animKey, raw) {
    const x0 = kx + 1, spanW = MV_KW - 2;
    const topY = ky + 2, botY = ky + MV_KH - 3;
    const baseY = Math.round((topY + botY) / 2);
    const amp = (botY - topY) / 2;

    let morphFrom = null, morphT = 1;
    if (anim && typeof nowMs === 'number' && animKey) {
        const tr = observeLanded(anim, 'wave:' + animKey, raw, 's' + String(shape),
                                 nowMs, MV_WAVE_MORPH_MS);
        if (tr.moving && typeof tr.from === 'string') {
            const f = tr.from.slice(1);
            if (f && f !== String(shape)) { morphFrom = f; morphT = easeOut(tr.t); }
        }
    }
    const sampleAt = (ph) => {
        const to = shapeSample(shape, ph);
        return morphFrom === null ? to : lerp(shapeSample(morphFrom, ph), to, morphT);
    };

    for (let x = x0; x <= x0 + spanW; x += 2) set_pixel(x, baseY, 1);
    let px = x0, py = Math.round(baseY - sampleAt(0) * amp);
    for (let i = 1; i <= spanW; i++) {
        const y = Math.round(baseY - sampleAt(i / spanW) * amp);
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

/* ---- the footer hint row (param-pages drawFooter) ------------------------
 *
 * Ported from render_page_movy.mjs. ONE primitive for every key-hint row, which
 * is the point of the item: davebox draws footer affordances in at least one
 * bespoke place (`_perfChip` in ui_render.mjs) and had no shared drawer at all.
 *
 * ⚠ THE VISUALS DIFFER FROM davebox's PERF CHIP, and they are not the same
 * object, so nothing is being replaced by force:
 *
 *     _perfChip    a MODE INDICATOR — one word, filled when the mode is ON and
 *                  outlined when it is off. mcufont 5x5, 9px tall, square
 *                  corners, w = len*6+3.
 *     hintRow      a KEY HINT — a PAIR (key, action). The key is inverted into
 *                  a pill and the action is plain beside it, so the pair reads
 *                  as one thing: without the pill a row of hints is an
 *                  unparseable run, "JOG PAGE CLK MENU BACK EXIT". 4x5 face,
 *                  7px tall, notched corners.
 *
 *   Measured difference for the same word: `HOLD` is 27px as a perf chip and
 *   21px as a hint pill, and 9 rows against 7. They are legitimately different
 *   controls saying different things, so the perf chips are LEFT ALONE and this
 *   is the drawer every new hint row uses.
 *
 * ⭑⭑ THE FIT RULE IS THE REASON THIS IS A PRIMITIVE AND NOT A LOOP. BACK's room
 * is RESERVED BEFORE anything else is laid out, so on a narrow row the MIDDLE
 * hints lose the fight and BACK does not. A footer that silently drops the one
 * hint telling you how to leave is worse than a footer with three hints on it,
 * and a naive left-to-right loop drops exactly that one.
 *
 * ⚠ ALL FOUR corners are notched, the bottom pair included. They sit on the
 * last row of the panel, and the ground a bottom corner reads against is the
 * BEZEL — the panel is inset in plastic — so a notch there reads exactly as a
 * notch against a dark row.
 *
 * ⚠ NO RULE ABOVE IT. Upstream's `no-rule` won its set: three clear rows and a
 * row of inverted pills is unmistakably a different kind of thing, and a
 * hairline across all 128 columns on a screen this dense is a tax.
 */
export const MV_HINT_PAD = 2, MV_HINT_GAP = 4;
export const MV_FOOTER_H = FONT4_HEIGHT + 2;

/* ---- the footer RULE: RETIRED (Josh, 2026-08-30) -------------------------
 *
 * There is no hairline above the footer any more. It was added 2026-08-29 on
 * the argument that davebox's vertical map is tighter than upstream's, so the
 * clear rows upstream relies on as a separator do not exist here — and that a
 * touched (inverted) label strip sitting one row above a row of solid white
 * pills would read as a single block.
 *
 * Josh looked at it on the device and does not want it. That is the whole
 * reason; it is a taste call about his own instrument, and it outranks the
 * argument above. Upstream reached the same place independently (SCH-50
 * `no-rule`, "THE RULE IS GONE"), so the two stacks now agree.
 *
 * MV_RULE_Y survives as the TOP OF THE BAND THE FOOTER OWNS — it is still the
 * boundary the layout is measured against — but nothing draws on it. Keeping
 * the constant is deliberate: the row is spoken for either way, and a later
 * widget that treats 56 as free would collide with the pill band below.
 *
 * ⚠ ROW 56 IS STILL RESERVED. 49..55 is the label band (filled edge to edge
 * when touched); 57..63 is the pill band. */
export const MV_RULE_Y = MV_FOOTER_Y - 1;

/* ⭑ THE CANON, so the row cannot drift into verb soup the way this tree's
 * older text footer did. KEYS name the physical control and are fixed by the
 * hardware, not by taste. ACTIONS are free EXCEPT after BACK, where the word
 * says WHERE BACK GOES and the two are not synonyms:
 *     EXIT  leaves this view entirely
 *     OUT   rises one level, staying in the view
 * Collapsing them would tell the user "back" does one thing when it does two,
 * and that difference is the one thing they cannot see before pressing it. */
export const MV_FOOTER_CANON = Object.freeze({
    keys: Object.freeze(['JOG', 'CLK', 'BACK', 'SHFT', 'MUTE', 'KNB']),
    backActions: Object.freeze(['EXIT', 'OUT']),
});

/* ⚠⚠ THE FLOW BUDGET IS 86px, NOT 128. BACK/OUT is 42px and its room is
 * reserved first, so everything else competes for what is left — which in
 * practice is TWO short pairs, or one long one. Measured:
 *
 *     JOG BANK 43 · JOG PAGE 43 · CLK ALT 37 · CLK STEP 42 · SHFT SECT 46
 *     SHFT TRK 41 · SHFT TRACK 51 · CLK PRESET 52 · CLK PRESETS 57
 *
 * So a four-pair row is normal and the drop is not a failure — but the ORDER
 * and the WORD LENGTH decide what survives, and both are the caller's. Put the
 * gesture with no on-screen trace first, and keep the action to one short word:
 * "PRESETS" costs 15px more than "PRESET" and takes a second hint down with it.
 * Do not add a fifth pair expecting it to show. */
export function hintPairWidth(key, action) {
    return fontWidth4x5(String(key).toUpperCase()) + MV_HINT_PAD + MV_HINT_GAP
         + fontWidth4x5(String(action).toUpperCase()) + MV_HINT_GAP;
}

/** Is this hint the BACK affordance? The one hint with a fixed home. */
export function isBackHint(h) {
    return !!h && /^back$/i.test(String(h[0]).trim());
}

/* `hints` = [key, action] pairs, MOST IMPORTANT FIRST. Returns how many were
 * drawn, so a caller can tell that it over-asked. */
export function drawKitHintRow(y, hints) {
    if (!hints || !hints.length) return 0;
    const ty = (y == null ? MV_FOOTER_Y : y) + Math.floor((MV_FOOTER_H - FONT4_HEIGHT) / 2);
    const list = hints.filter(Boolean);
    /* Exactly one back hint is pinned; a second stays an ordinary hint rather
     * than fighting for the same x. */
    let backIdx = -1;
    for (let i = 0; i < list.length; i++) if (isBackHint(list[i])) { backIdx = i; break; }
    const back = backIdx >= 0 ? list[backIdx] : null;
    const flow = backIdx >= 0 ? list.filter((_, i) => i !== backIdx) : list;

    const drawPair = (x, h) => {
        const key = String(h[0]).toUpperCase(), action = String(h[1]).toUpperCase();
        const kw = fontWidth4x5(key);
        const pw = kw + MV_HINT_PAD * 2, ph = MV_FOOTER_H;
        fill_rect(x, ty - 1, pw, ph, 1);
        if (pw >= 3) notchCorners(x, ty - 1, pw, ph);
        fontPrint4x5(x + MV_HINT_PAD, ty, key, 0);
        fontPrint4x5(x + kw + MV_HINT_PAD + MV_HINT_GAP, ty, action, 1);
    };

    let drawn = 0;
    const backW = back ? hintPairWidth(back[0], back[1]) : 0;
    const backX = back ? SCREEN_W - backW : SCREEN_W;
    const limit = back ? backX : SCREEN_W;
    let x = 1;
    for (const h of flow) {
        const w = hintPairWidth(h[0], h[1]);
        if (x + w > limit) break;             /* the fit rule: middles lose */
        drawPair(x, h);
        x += w;
        drawn++;
    }
    if (back) { drawPair(Math.max(x, backX), back); drawn++; }
    return drawn;
}

/* ---- MOCKUP: the param-pages header ------------------------------------
 *
 * ⚠⚠ DORMANT. Nothing calls this. It exists so tools/render_widgets.mjs can put
 * upstream's header next to davebox's own for a side-by-side decision, and it
 * must NOT be wired into any screen — davebox's filled-bar header is normative
 * (UI_LANGUAGE §4) until Josh says otherwise.
 *
 * Upstream's is a Tamzen 6x12 breadcrumb set left with the page name right, on
 * a plain (uninverted) ground — the opposite weight to davebox's inverted bar,
 * which is exactly what makes the comparison worth rendering rather than
 * describing. */
/* The param-pages header, drawn as upstream actually draws it.
 *
 * ⚠⚠ THE FIRST VERSION OF THIS MOCKUP WAS WRONG AND FLATTERED THE WRONG THING.
 * It set both sides in Tamzen 6x12 — double the height of the real face, and
 * specifically the face upstream TRIED AND REJECTED: Tamzen advances by its ink
 * width so adjacent glyphs touch, and the header string overflowed 124px of
 * usable width at 129, where font4x5 measures the same string at 106. Josh
 * spotted it from the render ("doesn't param-pages use a smaller font?").
 *
 * The real thing: font4x5, a 5-row glyph at y=1 inside a 7-row band, one clear
 * row above and one below. Both clear rows are load-bearing for the INVERTED
 * state — touched, the band fills solid and the glyphs are knocked out of it,
 * and a glyph flush to either edge bleeds its ink into the boundary.
 *
 * The split is MEASURED, not fixed: the right side is laid out first and the
 * left takes the remainder, with a floor so a long page name cannot squeeze the
 * title to nothing. A fixed 55/60 split summed to 115% and the two sides drew
 * through each other.
 *
 * Mockup only — nothing calls it. See docs/UI_LANGUAGE.md. */
export function drawKitHeaderParamPages(left, right, inverted) {
    const H = 7, GAP = 4, MIN_LEFT = Math.floor(SCREEN_W * 0.55);
    const l = String(left == null ? '' : left).toUpperCase();
    const r = String(right == null ? '' : right).toUpperCase();
    if (inverted) {
        fill_rect(0, 0, SCREEN_W, H, 1);
        /* the same 1px notch every other filled shape wears — TOP TWO ONLY,
         * because the band is the top EDGE of the screen, not a floating shape */
        fill_rect(0, 0, 1, 1, 0);
        fill_rect(SCREEN_W - 1, 0, 1, 1, 0);
    }
    const ink = inverted ? 0 : 1;
    const rw = Math.min(fontWidth4x5(r), SCREEN_W - 4 - MIN_LEFT);
    const rt = fit4x5(r, rw);
    const rtw = fontWidth4x5(rt);
    const lt = fit4x5(l, SCREEN_W - 4 - rtw - GAP);
    fontPrint4x5(2, 1, lt, ink);
    if (rtw > 0) fontPrint4x5(SCREEN_W - 2 - rtw, 1, rt, ink);
    if (!inverted) fill_rect(0, H, SCREEN_W, 1, 1);
}

/* ---- grid ---- */

function drawCellWidget(col, rowY, cell, touched, anim, nowMs) {
    const kx = col * MV_CELL_W + Math.floor((MV_CELL_W - MV_KW) / 2);
    /* ⭑ THE ENUM SQUARE HAS ITS OWN, WIDER SLOT (28 vs the 20px widget box), so
     * it gets its own origin. Centred in the same 32px cell, so a page of mixed
     * widgets still lines up on one axis. */
    const ex = col * MV_CELL_W + Math.floor((MV_CELL_W - MV_ENUM_W) / 2);
    /* An animation key must be STABLE for the cell and UNIQUE across the page.
     * The column index is both; the param name is neither (two banks can share
     * one, and an alt-mode swap changes it under a value that did not move). */
    const ak = anim ? ('c' + col + (rowY < MV_ROW1_Y ? 'a' : 'b')) : null;
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
        case 'enumsq': return drawEnumSquare(ex, rowY, cell.text, cell.sq,
                                            anim, nowMs, ak, cell.raw);
        case 'frac':   return drawFracStack(col * MV_CELL_W, rowY, cell.text);
        case 'valsq':  return drawBigNum(col * MV_CELL_W, rowY,
                                         cell.sq != null ? cell.sq : cell.text);
        case 'action': return drawActionSquare(kx, rowY, cell.text, cell.oneWay, touched,
                                              cell.btnPhase);
        case 'dirsq':  return drawDirSquare(kx, rowY, cell.sel | 0);
        /* ⭑ A `vbar` CELL DRAWS THE FADER COLUMN (Josh, 2026-08-29). Adopted at
         * the DISPATCH rather than by renaming the kind at each call site: the
         * descriptor still says "this is a level, bottom-up", which is the
         * caller's business, and what that looks like is this file's. That is
         * the property Rule 0 exists for — restyle once, change everywhere.
         * `drawVBar` stays exported and is still the honest plain bar for
         * anything that wants one; nothing on a cell grid does. */
        case 'vbar':   return drawFaderColumn(kx, rowY, cell.norm || 0, cell.modNorm);
        case 'wavesq': return drawWaveBox(kx, rowY, cell.shape, anim, nowMs, ak, cell.raw);
        case 'xbox':   return drawXBox(kx, rowY);
        /* A value you cannot turn — a file, a path, a string. Spans the CELL,
         * not the widget box, because its job is to show as much of a name as
         * it can. */
        case 'opaque': return drawOpaqueBox(col * MV_CELL_W, rowY, cell.text);
        /* ⭑ ADOPTED 2026-08-29 for PURE ON/OFF toggles only — see isBooleanPair
         * in ui_cells.mjs for the split, which is the rule and not a taste.
         * A two-state cell whose states are WORDS keeps the bar: the pill says
         * "on or off" with its area and cannot say "Step or Audio". */
        case 'pill':   return drawSwitchPill(kx, rowY, !!cell.norm);
        /* Kept as an alias of `vbar` so the offline renderer can draw the two
         * side by side. Nothing else emits it. */
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
/* The modulation mark, DRAWN rather than typed.
 *
 * ⚠⚠ IT WAS A '~' CHARACTER AND THE 4x5 FACE HAS NO TILDE. When the label strip
 * moved to that face the mark silently stopped drawing — the glyph lookup
 * returns null, the blitter advances and draws nothing, so the third state
 * (UI_LANGUAGE §3.2) vanished with no error anywhere. Four pixels, the shape
 * upstream's drawWaveMark uses, is not a font problem. */
function drawWaveMark(x, y, on) {
    set_pixel(x, y, on);
    set_pixel(x + 2, y, on);
    set_pixel(x + 1, y + 1, on);
    set_pixel(x + 3, y + 1, on);
}

function drawCellLabel(col, lblY, cell, touched) {
    /* ⚠⚠ UPPERCASE BEFORE MEASURING OR PRINTING. The 4x5 face is CAPS-ONLY —
     * it has no lowercase glyphs at all, and a missing glyph is silent: it
     * advances the cursor and draws nothing. A mixed-case abbrev like "Style"
     * came out as "S" followed by four blank cells, and the blanks pushed the
     * measured width past the budget so the trim ate the rest. Doing it HERE
     * rather than at each call site is UI_LANGUAGE §2.1's rule, and it is a
     * visual no-op for text that is already capitals. */
    let text = String(touched && cell.text != null ? cell.text : (cell.label || '')).toUpperCase();
    if (!text) return;
    /* ⭑ THE 4x5 FACE, not the movy label font — this is what paid for the
     * footer. Both are 5 rows tall, so the band did not change; what changed is
     * that the 4x5 face is the one the enum square, the opaque box and the hint
     * pills already use, so the page now has ONE small face instead of two.
     * ⚠ Trim MEASURED, never by character count: the face is proportional
     * (I is 1px, W is 5), so "six characters" is not a width. */
    while (text.length > 0 && fontWidth4x5(text) > MV_CELL_W - 2) text = text.slice(0, -1);
    const tw = fontWidth4x5(text);
    const tx = Math.round(col * MV_CELL_W + MV_CELL_W / 2 - tw / 2);
    /* One clear row above and below the glyphs inside the band — see MV_LBL_H,
     * which is odd for exactly this. */
    const ty = lblY + Math.floor((MV_LBL_H - FONT4_HEIGHT) / 2);
    const inverted = !!touched;
    if (inverted) {
        fill_rect(col * MV_CELL_W, lblY, MV_CELL_W, MV_LBL_H, 1);
        fontPrint4x5(tx, ty, text, 0);
    } else {
        fontPrint4x5(tx, ty, text, 1);
    }
    /* The third state rides the NAME, never the touched VALUE — while your
     * finger is on the knob the strip is answering "what number is this", and a
     * modulation mark there competes with the answer. Placed left of the run,
     * clamped into the cell; polarity follows the ground it lands on. */
    if (cell.modulated && !touched) {
        const wx = Math.max(col * MV_CELL_W, tx - 6);
        drawWaveMark(wx, ty + 1, inverted ? 0 : 1);
    }
}

/* The 8-cell grid: two 16px widget rows, each with its label strip beneath.
 *
 * `env` (optional) = { start, count, roles }: those cells surrender their
 * individual widgets to one envelope graphic drawn across the span. Their
 * LABEL strips still render, so A/D/S/R stay named and touch-swap to their
 * values as usual. Omitted by davebox, which has no env banks. */
export function drawKitCells(cells, touchedIdx, env, filt, eq, samp, anim, nowMs) {
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
        if (!covered) drawCellWidget(col, rowY, cell, k === touchedIdx, anim, nowMs);
        /* ⭑ THE DOOR MARK GOES ON LAST AND AROUND THE CELL, so it reads the
         * same over a box, an arc, or a span graphic that covered this cell —
         * which is why it is here and not inside any widget. */
        if (cell.opens) drawBrackets(col * MV_CELL_W, rowY, MV_CELL_W, MV_KH);
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
    /* ⭑ ONE predicate, shared with the footer's stand-down test — see
     * enumOverlayWouldDraw. Two copies would let the footer vanish under
     * nothing, or survive under a picker, and both read as a rendering bug. */
    if (!enumOverlayWouldDraw(cells, touchedIdx)) return;
    drawKitListOverlay(cell.options, cell.sel | 0);
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
    /* Scroll indicator: right-edge rail + thumb, only when there's overflow.
     *
     * ⭑ THE SAME RULE drawKitList follows since 2026-08-29 — DOTTED rail, SOLID
     * thumb, no arrows (UI_LANGUAGE §5). This overlay drew its own solid rail
     * for one commit, which was flagged then as a deliberate inconsistency
     * waiting on a decision; the decision came. It matters more here than
     * anywhere: a picker floats DIRECTLY OVER a kit list, so two rails a few
     * pixels apart in different textures is the one place the mismatch is
     * visible in a single glance. */
    if (hasScroll) {
        const trackH = VISIBLE * ROW_H;
        const thumbH = Math.max(3, Math.round(trackH * VISIBLE / n));
        const thumbY = listTop + Math.round((trackH - thumbH) * start / Math.max(1, n - VISIBLE));
        for (let ry = listTop; ry < listTop + trackH; ry += 2) set_pixel(X + W - 2, ry, 1);
        fill_rect(X + W - 3, thumbY, 2, thumbH, 1);
    }
}

/* ---- full page ----
 * opts: { headerText, headerInvert, pageIdx, pageCount (bar; omit to skip),
 *         touchedIdx, altArrowShow, altArrowOn, altArrowHidden (blink phase) }
 * Touched non-blank cell with a `name` swaps the header to the inverted
 * centered param name and suppresses the page bar. */
/* ⚠ THIS FUNCTION DOES NOT CHOOSE A LAYOUT, deliberately. It is SHARED — sound
 * mode draws its param pages with it, and tools/render_screens.mjs draws the
 * manual's BANK cards with it too (the manual reimplements the device's draw
 * calls by hand). Forcing 'sound' here made the manual render bank cards with
 * sound's row map, which is the same documentation-diverges-from-device trap
 * that has already bitten twice today. The CALLER selects. */
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
    drawKitCells(cells, t, opts.env, opts.filt, opts.eq, opts.samp,
                 opts.anim, opts.nowMs);
    /* The option-list overlay covers the 3 cells away from the touched knob, so
     * it must NOT appear on a bare orienting touch — only once that knob is
     * actually TURNED (see enumOverlayIdx in ui_render.mjs). Callers pass the
     * turn-gated index separately; omitting it keeps the old touch-gated
     * behaviour for existing call sites. */
    /* ⭑ THE HINT ROW, and it is the LAST thing before the overlay.
     *
     * ⚠⚠ SUPPRESSED WHILE A PICKER IS UP, and that is a design statement rather
     * than a layout dodge. The option list is a MODAL: it owns the screen and
     * states its own affordance (turn to browse, release to commit). It also
     * covers only the middle of the panel, so a footer drawn under it survives
     * as the two pills that happen to stick out either side — a half-eaten row
     * of hints describing a gesture that is not the one in progress. Either
     * none or all; none is correct here.
     *
     * `footer` is the caller's, per screen: this file has no idea what a bank
     * responds to, and a hint invented here would be a promise the input code
     * never made. See drawKitHintRow for the fit rule that keeps BACK. */
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
    const overlayUp = !opts.peekExpired && enumOverlayWouldDraw(cells, ov);
    if (opts.footer && !overlayUp) drawKitHintRow(MV_FOOTER_Y, opts.footer);
    if (!opts.peekExpired) drawKitEnumOverlay(cells, ov);
}

/* Would drawKitEnumOverlay put something on screen for this cell? Asked so the
 * footer can stand down BEFORE the overlay draws over it — and it IS
 * drawKitEnumOverlay's own guard, called by both, so the two cannot drift. */
export function enumOverlayWouldDraw(cells, idx) {
    const cell = idx >= 0 ? cells[idx] : null;
    return !!(cell && cell.options && cell.options.length > 2 && (cell.sel | 0) >= 0);
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
        /* ⭑ THE RULE, and the DEFAULT since 2026-08-29: a DOTTED rail with a
         * SOLID thumb, and no arrows. The rail is the extent of the list and
         * the thumb is where you are in it; drawing both solid makes the thumb
         * a thicker piece of the same object, so the eye has to measure widths
         * to read a position. Arrows say "there is more" twice — the rail
         * already does, permanently, and an arrow that appears and disappears
         * reflows the row it sits on.
         * ⚠ This is EVERY kit list at once: sound mode's lists, the knob/LFO
         * editors, global settings, the project screens and the snapshot
         * picker. `dottedRail: false` restores the solid rail; nothing passes
         * it. ⚠ A list that FITS draws no rail at all — the flag is inert
         * there, and a rail with nothing to say would be worse than none. */
        if (o.dottedRail !== false) {
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
