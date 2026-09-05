/* tests/js/test_display_unpack.mjs — the display segment's 1-bpp packing,
 * pinned so grab-screen.mjs cannot silently drift from js_display_pack. */
import { unpackDisplay, packDisplay, DISPLAY_W, DISPLAY_H, DISPLAY_BYTES } from '../../tools/display_unpack.mjs';
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`), bad = (l, e) => { console.error(`  FAIL — ${l}: ${e}`); failed = 1; };
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

step('one set bit lands where js_display_pack puts it: byte page*128+x, bit j = row page*8+j', () => {
    const buf = new Uint8Array(DISPLAY_BYTES);
    buf[1 * DISPLAY_W + 5] = 1 << 3;                 /* page 1, x 5, bit 3 → (5, 11) */
    const fb = unpackDisplay(buf);
    if (fb[11 * DISPLAY_W + 5] !== 1) throw new Error('pixel (5,11) not set');
    if (fb.reduce((a, b) => a + b, 0) !== 1) throw new Error('more than one pixel set');
});
step('the top-left and bottom-right corners', () => {
    const buf = new Uint8Array(DISPLAY_BYTES);
    buf[0] = 1; buf[7 * DISPLAY_W + 127] = 1 << 7;
    const fb = unpackDisplay(buf);
    if (fb[0] !== 1 || fb[63 * DISPLAY_W + 127] !== 1) throw new Error('corners wrong');
});
step('pack(unpack(x)) is the identity over a pseudo-random frame', () => {
    const buf = new Uint8Array(DISPLAY_BYTES); let s = 12345;
    for (let i = 0; i < DISPLAY_BYTES; i++) { s = (s * 1103515245 + 12345) >>> 0; buf[i] = s >>> 24; }
    const back = packDisplay(unpackDisplay(buf));
    for (let i = 0; i < DISPLAY_BYTES; i++) if (back[i] !== buf[i]) throw new Error('byte ' + i + ' differs');
});
step('a short buffer is refused, not read past its end', () => {
    let threw = false; try { unpackDisplay(new Uint8Array(100)); } catch (e) { threw = true; }
    if (!threw) throw new Error('accepted a 100-byte buffer');
});
/* control: a wrong packing law must fail the first step */
step('control: a ROW-major reading of the same byte lands elsewhere', () => {
    const buf = new Uint8Array(DISPLAY_BYTES); buf[1 * DISPLAY_W + 5] = 1 << 3;
    const rowMajorPixel = (1 * DISPLAY_W + 5) * 8 + 3;          /* what a row-major law would say */
    const fb = unpackDisplay(buf);
    if (fb[rowMajorPixel] === 1) throw new Error('the two laws agree here — the control is not a control');
});
if (!failed) console.log('PASS: test_display_unpack.mjs');
process.exit(failed);
