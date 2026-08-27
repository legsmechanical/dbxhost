/* tests/js/test_crumbs.mjs — the breadcrumb bar over the header band.
 *
 * `parts` is the path TO the current screen. The FIRST crumb is PINNED (Josh:
 * "keep the track head - that's useful"); overflow drops whole crumbs from the
 * HEAD of the remainder and marks the gap with an ellipsis that takes a
 * separator of its own, so a shortened path reads as a path with a MISSING
 * SEGMENT rather than as a truncated word.
 *
 * ⚠⚠ THE FAILURES THIS PINS:
 *   - the bar OVERFLOWING its own frame. It auto-sizes to content, so a path
 *     one crumb too long puts glyphs on top of the border, or past it onto the
 *     screen — and the fit loop is the only thing preventing that.
 *   - dropping a crumb from a path that FITS. The first version charged the
 *     ellipsis's width before anything had been dropped, so a path that fitted
 *     whole still lost its second crumb.
 *   - dropping the TRACK. It is the crumb most worth keeping and, being first,
 *     it is what a naive head-drop removes soonest.
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
/* The real primitive's contract, so the dim can be asserted rather than assumed:
 * every other pixel, parity from ABSOLUTE coordinates. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            px.push({ x: xi, y: yi, v: value ? 1 : 0 });
};
globalThis.draw_rect = () => {};
globalThis.clear_screen = () => { px = []; };
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const kit = await import('../../ui/ui_movy.mjs');

/* Ink laid down, in draw order, restricted to the bar band. */
const lit = () => px.filter((p) => p.v === 1 && p.y < 11);
const spanX = () => {
    const l = lit();
    if (!l.length) return null;
    return { lo: Math.min(...l.map((p) => p.x)), hi: Math.max(...l.map((p) => p.x)) };
};

step('⭑ a short path draws a bar, centred, inside the screen', () => {
    clear_screen();
    kit.drawKitCrumbs(['T3', 'Config']);
    const s = spanX();
    if (!s) throw new Error('nothing drawn');
    if (s.lo < 0 || s.hi > 127) throw new Error(`the bar spans ${s.lo}..${s.hi}, off screen`);
    const left = s.lo, right = 127 - s.hi;
    if (Math.abs(left - right) > 1) throw new Error(`not centred (${left} vs ${right})`);
});

step('⭑⭑ a LONG path never escapes the bar', () => {
    /* The bar auto-sizes, so the fit loop is the only thing keeping glyphs off
     * the frame. Deep path, long names — the case that produced the overrun. */
    clear_screen();
    kit.drawKitCrumbs(['T3', 'Sound Control', 'Knobs', 'K1', 'Noisemaker', 'Oscillators']);
    const s = spanX();
    if (!s) throw new Error('nothing drawn');
    if (s.hi > 127 || s.lo < 0) throw new Error(`ink at ${s.lo}..${s.hi} — outside the screen`);
    if (s.hi - s.lo + 1 > 126)
        throw new Error(`the bar is ${s.hi - s.lo + 1}px wide, past its own 126px cap`);
});

step('⭑⭑ the TRACK crumb survives at any depth', () => {
    /* It is first, so it is what a naive head-drop removes soonest — and it is
     * the crumb Josh most wanted kept. The observable is its ink: the head is
     * drawn immediately after the frame, at the bar's left inset. */
    clear_screen();
    kit.drawKitCrumbs(['T3', 'Sound Control', 'Knobs', 'K1', 'Noisemaker', 'Oscillators']);
    const s = spanX();
    /* The head's glyphs start CRUMB_PAD+1 in from the bar's left edge; if the
     * head had been dropped the first piece would be the 3-dot ellipsis, which
     * is only 5px wide and one pixel tall. Assert a full-height glyph band. */
    const headBand = px.filter((p) => p.v === 1 && p.x >= s.lo + 1 && p.x <= s.lo + 14 && p.y >= 2 && p.y <= 8);
    const rows = new Set(headBand.map((p) => p.y));
    if (rows.size < 4)
        throw new Error(`only ${rows.size} ink rows where the head crumb should be — it looks ` +
                        'like the ellipsis, i.e. the track was dropped');
});

step('⚠ CONTROL: a path that FITS keeps every crumb (no ellipsis)', () => {
    /* The first fit loop charged the ellipsis before anything was dropped, so a
     * path that fitted whole still lost a crumb. The ellipsis is the only mark
     * that is 1px tall — a single-row run of exactly 3 dots on a 2px pitch. */
    clear_screen();
    kit.drawKitCrumbs(['T3', 'Config']);
    const byRow = {};
    for (const p of lit()) (byRow[p.y] = byRow[p.y] || []).push(p.x);
    /* look for a row whose ink is exactly three pixels, 2 apart */
    const ellipsisRow = Object.values(byRow).find((xs) => {
        const u = [...new Set(xs)].sort((a, b) => a - b);
        return u.length === 3 && u[1] - u[0] === 2 && u[2] - u[1] === 2;
    });
    if (ellipsisRow) throw new Error('an ellipsis was drawn for a path that fits whole');
});

step('⭑ an over-long path DOES draw the ellipsis', () => {
    /* The other half of the control: if this never fired, the step above would
     * be asserting on a renderer that simply cannot draw one. */
    clear_screen();
    kit.drawKitCrumbs(['T3', 'Sound Control', 'Knobs', 'K1', 'Noisemaker', 'Oscillators']);
    const byRow = {};
    for (const p of lit()) (byRow[p.y] = byRow[p.y] || []).push(p.x);
    const ell = Object.values(byRow).some((xs) => {
        const u = [...new Set(xs)].sort((a, b) => a - b);
        for (let i = 0; i + 2 < u.length; i++)
            if (u[i + 1] - u[i] === 2 && u[i + 2] - u[i + 1] === 2) return true;
        return false;
    });
    if (!ell) throw new Error('no ellipsis on a path that had to drop crumbs');
});

step('⭑ an empty path draws nothing at all', () => {
    clear_screen();
    kit.drawKitCrumbs([]);
    kit.drawKitCrumbs(null);
    kit.drawKitCrumbs(['', null]);
    if (px.length) throw new Error(`${px.length} px drawn for an empty path`);
});

/* ---- the backdrop dim ---- */

step('⭑⭑ the dim removes half the ink, in ONE host call', () => {
    /* The whole reason it is a primitive. If this ever becomes a JS loop the
     * call count goes from 1 to 4096 and every frame an overlay is up pays it. */
    let calls = 0;
    const real = globalThis.stipple_rect;
    globalThis.stipple_rect = (...a) => { calls++; return real(...a); };
    clear_screen();
    kit.drawKitBackdropDim();
    globalThis.stipple_rect = real;
    if (calls !== 1) throw new Error(`the dim made ${calls} stipple_rect calls, expected 1`);
    const black = px.filter((p) => p.v === 0).length;
    if (black !== W * H / 2)
        throw new Error(`the dim wrote ${black} px, expected ${W * H / 2} (half the screen)`);
});

step('⭑ the dim writes BLACK, never white', () => {
    /* Writing 1s would ADD ink — it would brighten the backdrop into the
     * overlay rather than knocking it back. */
    clear_screen();
    kit.drawKitBackdropDim();
    if (px.some((p) => p.v === 1)) throw new Error('the dim wrote white pixels');
});

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed);
}

main();
