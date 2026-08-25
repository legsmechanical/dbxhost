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
