/* tests/js/test_kitlist_box.mjs — drawKitList takes its horizontal bounds from
 * a box, so one renderer serves a full screen and an overlay.
 *
 * Before this the right edge (`SCREEN_W - 3`, `- 5` with a scrollbar), the
 * label inset (a bare `3`), the selection fill, the divider, the centred `note`
 * row and the scrollbar were all written against the SCREEN. The rows never
 * cared — that hard-coding was the only reason the list could not be reused
 * inside a box.
 *
 * ⚠⚠ THE TWO FAILURES THIS PINS:
 *   - a DEFAULT caller drawing differently than before. Every list in sound
 *     mode, the knob/LFO editors, global settings, the project screens and the
 *     snapshot picker goes through here; a one-pixel shift is a change to all
 *     of them at once, and nothing else in the suite would notice.
 *   - ink LEAVING the box. A value right-aligned to the SCREEN instead of the
 *     box lands outside the overlay's frame, on top of whatever is underneath —
 *     which reads as corruption, not as a layout bug.
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
let px = [];
globalThis.set_pixel = (x, y, v) => { px.push({ x, y, v: v ? 1 : 0 }); };
globalThis.fill_rect = (x, y, w, h, v) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.push({ x: x + i, y: y + j, v: v ? 1 : 0 });
};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.clear_screen = () => { px = []; };

/* ⚠⚠ THE REAL ATLAS. The label is measured with text_width and drawn with
 * print, and the box arithmetic only works if the two agree — a fixed-width
 * stub would size against one metric and draw in another. */
import HFONT from '../../tools/host_font_5x7.json';
const CHAR_SPACING = 1, CELL_W = 5;
function ib(rows) {
    let mn = 5, mx = -1;
    for (const b of rows) for (let x = 0; x < 5; x++) if (b & (1 << (4 - x))) { if (x < mn) mn = x; if (x > mx) mx = x; }
    return mx < 0 ? null : { mn, mx };
}
const gl = (ch) => HFONT[ch] ?? HFONT[ch.toUpperCase?.()] ?? null;
globalThis.print = (x, y, t, col) => {
    let cx = x;
    for (const ch of String(t)) {
        const r = gl(ch), b = r ? ib(r) : null;
        if (b) for (let q = 0; q < 7; q++) for (let c = b.mn; c <= b.mx; c++)
            if (r[q] & (1 << (4 - c))) globalThis.set_pixel(cx + (c - b.mn), y + q, col);
        cx += b ? (b.mx - b.mn + 1) + CHAR_SPACING : CELL_W + CHAR_SPACING;
    }
};
globalThis.text_width = (t) => {
    let w = 0;
    for (const ch of String(t)) {
        const r = gl(ch), b = r ? ib(r) : null;
        w += (b ? (b.mx - b.mn + 1) : CELL_W) + CHAR_SPACING;
    }
    return w;
};

async function main() {
const kit = await import('../../ui/ui_movy.mjs');

/* A list long enough to force the scrollbar, with values, so every element the
 * box has to bound is exercised at once. */
const ROWS = [
    { label: 'Mode', hdr: true, value: 'Melodic' },
    { label: 'Layout', hdr: true, value: 'Chromatic' },
    { label: 'Sound Control', hdr: true, chevron: true },
    { divider: true },
    { label: 'VelIn', hdr: true, value: 'Fixed 100' },
    { label: 'Looper', hdr: true, value: 'Off' },
    { label: 'AftTch', hdr: true, value: 'Channel' },
    { note: 'NOTHING TO SHOW' },
];
const draw = (opts) => { clear_screen(); kit.drawKitList(ROWS, 1, opts || {}); return px.slice(); };
const key = (p) => p.map((q) => `${q.x},${q.y},${q.v}`).join('|');

step('⭑⭑ the DEFAULT render is unchanged — no caller moves', () => {
    /* The whole tree's lists go through here. Explicit full-screen bounds must
     * produce exactly what passing nothing produces, or every existing screen
     * shifted and this refactor was not a refactor. */
    const implicit = draw({});
    const explicit = draw({ x: 0, w: 128 });
    if (key(implicit) !== key(explicit))
        throw new Error(`default bounds differ from an explicit full screen ` +
                        `(${implicit.length} px vs ${explicit.length} px)`);
});

step('⭑⭑ every pixel stays INSIDE the box', () => {
    const X = 14, BW = 96;
    const p = draw({ x: X, w: BW });
    if (!p.length) throw new Error('the list drew nothing at all');
    const out = p.filter((q) => q.x < X || q.x >= X + BW);
    if (out.length) {
        const lo = Math.min(...out.map((q) => q.x)), hi = Math.max(...out.map((q) => q.x));
        throw new Error(`${out.length} px outside the box x=${X}..${X + BW - 1} (at x=${lo}..${hi}) ` +
                        '— this lands on whatever the overlay is covering');
    }
});

step('⚠ CONTROL: the same list at full width DOES reach past that box', () => {
    /* Without this the step above passes on a list too narrow to leave the box
     * whatever the bounds — it would be measuring nothing. */
    const X = 14, BW = 96;
    const p = draw({});
    if (!p.some((q) => q.x >= X + BW))
        throw new Error('the fixture never reaches past the box even unbounded — it cannot ' +
                        'detect a renderer that ignores the bounds');
});

step('⭑ the VALUE right-aligns to the BOX edge, not the screen', () => {
    const X = 14, BW = 96;
    const p = draw({ x: X, w: BW });
    /* The rightmost ink on a value row, and it must sit just inside the box's
     * own right edge (allowing the scrollbar gutter), not near x=127. */
    const maxX = Math.max(...p.map((q) => q.x));
    if (maxX < X + BW - 8)
        throw new Error(`the rightmost ink is x=${maxX}, well short of the box edge ` +
                        `${X + BW - 1} — the values are not being right-aligned to the box`);
    if (maxX > X + BW - 1)
        throw new Error(`ink at x=${maxX} is past the box edge ${X + BW - 1}`);
});

step('⭑ the SELECTION fill starts at the box, not at x=0', () => {
    const X = 14, BW = 96;
    const p = draw({ x: X, w: BW });
    /* The highlight is the only run of filled pixels spanning most of a row. */
    const lit = p.filter((q) => q.v === 1);
    const minX = Math.min(...lit.map((q) => q.x));
    if (minX < X) throw new Error(`filled ink at x=${minX}, left of the box at ${X}`);
});

step('⭑ a box narrower than its content still truncates rather than overflowing', () => {
    /* The availW arithmetic is relative to the box now; if it were still
     * relative to the screen a long label would simply run out of the frame. */
    const X = 30, BW = 60;
    clear_screen();
    kit.drawKitList([{ label: 'Sound Control And Then Some', hdr: true, value: 'CHROMATIC' }],
                    0, { x: X, w: BW });
    const out = px.filter((q) => q.x < X || q.x >= X + BW);
    if (out.length) throw new Error(`${out.length} px escaped a narrow box`);
});

step('⭑ an EMPTY list centres its message in the box', () => {
    const X = 20, BW = 80;
    clear_screen();
    kit.drawKitList([], 0, { x: X, w: BW, emptyMsg: 'NO PARAMS' });
    if (!px.length) throw new Error('the empty message did not draw');
    const lo = Math.min(...px.map((q) => q.x)), hi = Math.max(...px.map((q) => q.x));
    if (lo < X || hi >= X + BW) throw new Error(`the empty message spans ${lo}..${hi}, outside the box`);
    /* Centred: the clear space either side should match within a couple of px. */
    const left = lo - X, right = (X + BW - 1) - hi;
    if (Math.abs(left - right) > 2)
        throw new Error(`the message is not centred in the box (${left}px left, ${right}px right)`);
});

step('⭑⭑ the selection band leaves clear space BELOW the glyphs, not just above', () => {
    /* Josh caught this on device: at rowH 9 the band runs y-1..y+7 while a host
     * glyph inks y+1..y+7, so the band's bottom edge IS the glyph's bottom row —
     * 2px clear above, 0 below, which reads as off-centre.
     *
     * ⚠ Measured on a real framebuffer, taking the LAST write per pixel. My
     * first version scanned the raw call list for "rows with many lit pixels",
     * which caught the overlay FRAME (also full width) and the box's blanking
     * fill (zeros everywhere), and reported 0 clear on both sides of a band it
     * had never actually found. */
    const FB_W = 128, FB_H = 64;
    const fb = new Int8Array(FB_W * FB_H).fill(-1);      /* -1 = never written */
    const realSet = globalThis.set_pixel, realFill = globalThis.fill_rect;
    const put = (x, y, v) => { if (x >= 0 && x < FB_W && y >= 0 && y < FB_H) fb[y * FB_W + x] = v ? 1 : 0; };
    globalThis.set_pixel = (x, y, v) => put(x | 0, y | 0, v);
    globalThis.fill_rect = (x, y, w, h, v) => {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, v);
    };
    const X = 12, BW = 100, TOP = 20, ROW_H = 10;
    kit.drawKitList([{ label: 'Damping' }, { label: 'Dry' }], 0,
                    { x: X, w: BW, topY: TOP, rowH: ROW_H });
    globalThis.set_pixel = realSet; globalThis.fill_rect = realFill;

    /* The band: rows inside the list's own x-range that are mostly WHITE. */
    const rowLit = (y) => {
        let n = 0;
        for (let x = X; x < X + BW; x++) if (fb[y * FB_W + x] === 1) n++;
        return n;
    };
    const band = [];
    for (let y = TOP - 2; y < TOP + ROW_H + 2; y++) if (rowLit(y) > BW / 2) band.push(y);
    if (band.length < ROW_H - 1)
        throw new Error(`no selection band found (${band.length} white rows near the first row)`);
    const bandTop = band[0], bandBot = band[band.length - 1];
    /* The glyphs are drawn in ink 0 ON the white band, so they are HOLES. */
    const holeRows = band.filter((y) => {
        for (let x = X; x < X + BW; x++) if (fb[y * FB_W + x] === 0) return true;
        return false;
    });
    if (!holeRows.length) throw new Error('no glyph holes in the band — the label did not draw');
    const above = holeRows[0] - bandTop, below = bandBot - holeRows[holeRows.length - 1];
    if (below < 1)
        throw new Error(`the band's bottom edge touches the glyphs (${above}px clear above, ` +
                        `${below} below) — this is the off-centre look Josh reported`);
    if (Math.abs(above - below) > 1)
        throw new Error(`the band is lopsided: ${above}px above, ${below}px below`);
});

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed);
}

main();
