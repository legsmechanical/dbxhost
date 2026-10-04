/* tests/js/test_pf3_glyphs.mjs — six letters of the micro face were redrawn
 * for the bank pad map (Josh, 2026-10-02) because each read as another
 * character: N (as K), A, B (as 8), G (as 6), K (as H), O (identical to 0).
 * Pins the approved shapes by printing each letter and reading the pixels. */
let failed = 0;
const W = 16, H = 8;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = () => {};
async function main() {
const kit = await import('../../ui/ui_movy.mjs');
const shape = (ch) => { fb.fill(0); kit.pf3Print(0, 0, ch, 1);
    return [0, 1, 2, 3, 4].map((y) => [0, 1, 2].map((x) => (fb[y * W + x] ? '#' : '.')).join('')).join(' '); };
const want = {
    A: '.#. #.# ### #.# #.#',
    B: '##. #.# ##. #.# ##.',
    G: '.## #.. #.# #.# .##',
    K: '#.# ##. #.. ##. #.#',
    N: '##. #.# #.# #.# #.#',
    O: '.#. #.# #.# #.# .#.',
    M: '#.# ### #.# #.# #.#',   /* kept as Movy drew it (Josh: "original m") */
    0: '### #.# #.# #.# ###',   /* the digit stays square — O is no longer the same */
};
for (const [ch, w] of Object.entries(want)) {
    const got = shape(String(ch));
    if (got === w) console.log(`  ok   — ${ch}: ${got}`);
    else { console.error(`  FAIL — ${ch}: got ${got}, want ${w}`); failed = 1; }
}
if (shape('O') === shape('0')) { console.error('  FAIL — O and 0 are the same glyph'); failed = 1; }
if (failed) { console.error('test_pf3_glyphs: FAIL'); process.exit(1); }
console.log('test_pf3_glyphs: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
