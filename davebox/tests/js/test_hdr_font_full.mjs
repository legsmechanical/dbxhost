/* The expanded header font (wired in 2026-08-26 from docs/incoming/
 * hdrfont-full-v2.mjs) must cover what it claims and must not bleed.
 *
 * ⚠⚠ THE OBSERVABLE IS INK, not the table. hdrPrint SKIPS an unmapped codepoint
 * and advances — no throw, no warning, nothing in a log — and hdrWidth returns
 * the same number for a mapped glyph and for the fallback. That is how the
 * wordmark lost its 'A' for half of every bar on 2026-08-25 (see
 * test_wordmark_glyphs). So every assertion here DRAWS and counts pixels.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

async function main() {
const kit = await import('../../ui/ui_movy.mjs');

/* Draw one character at the origin and return its lit pixels as a set of
 * "x,y" keys — a SHAPE, not a count, so two glyphs with equal ink still differ. */
function shapeOf(ch) {
    const px = new Set();
    globalThis.set_pixel = (x, y) => { px.add(x + ',' + y); };
    kit.hdrPrint(0, 0, ch, 1);
    return px;
}

const PRINTABLE = [];
for (let cp = 0x20; cp <= 0x7E; cp++) PRINTABLE.push(String.fromCharCode(cp));

/* Known blanks, pinned deliberately so the set cannot grow by accident:
 *   ' ' is a blank glyph by design.
 *   '$' is UNMAPPED — and was unmapped in the shipped font too, so this is a
 *   pre-existing gap, not a regression. Pinned so that mapping it is a
 *   deliberate act that updates this list, and so that any OTHER character
 *   going dark fails loudly. */
const EXPECTED_BLANK = new Set([' ', '$']);

step('every printable character draws ink, except the two known blanks', () => {
    const dark = PRINTABLE.filter((c) => shapeOf(c).size === 0);
    const unexpected = dark.filter((c) => !EXPECTED_BLANK.has(c));
    const missing = [...EXPECTED_BLANK].filter((c) => !dark.includes(c));
    if (unexpected.length)
        throw new Error('these draw NOTHING and will silently vanish on screen: ' +
                        JSON.stringify(unexpected.join('')));
    if (missing.length)
        throw new Error('expected blank but it now draws: ' + JSON.stringify(missing.join('')) +
                        ' — good news, but update EXPECTED_BLANK deliberately');
});

/* THE UPGRADE ITSELF. The shipped font had all 26 lowercase rows repeating the
 * capitals; a revert would restore that silently, and every other assertion
 * here would still pass. */
step('all 26 lowercase are DISTINCT from their capitals', () => {
    const same = [];
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
        const lo = shapeOf(c), up = shapeOf(c.toUpperCase());
        if (lo.size === up.size && [...lo].every((k) => up.has(k))) same.push(c);
    }
    if (same.length)
        throw new Error(same.length + ' lowercase letters still draw their CAPITAL: ' +
                        same.join('') + ' — the old font repeated caps for all 26, so this ' +
                        'is what a revert looks like');
});

/* hdrPrint scans 15 columns per glyph but advances by the glyph's own width, so
 * a bit set beyond the advance is drawn INTO THE NEXT CHARACTER'S CELL. Nothing
 * in the renderer clips it. */
step('no glyph draws outside its own advance — a bleed smears the next character', () => {
    const bleeding = [];
    for (const c of PRINTABLE) {
        const adv = kit.hdrWidth(c) + 1;          /* hdrWidth subtracts the 1px gap */
        for (const k of shapeOf(c)) {
            if (parseInt(k.split(',')[0], 10) >= adv) { bleeding.push(c); break; }
        }
    }
    if (bleeding.length)
        throw new Error('ink past the advance in: ' + JSON.stringify(bleeding.join('')) +
                        ' — it lands in the NEXT glyph\'s cell');
});

/* The fraction read-out is the one place lowercase reaches the screen without
 * being upper-cased first: drawFracStack passes a [A-Za-z]* suffix straight to
 * hdrPrint, and the suffixes in use are 'd' and 't'. Those two shapes are
 * therefore load-bearing and were carried across the font swap unchanged. */
step('the fraction suffixes d and t are unchanged by the swap', () => {
    const d = shapeOf('d'), t = shapeOf('t');
    /* Shapes recorded from the shipped font's own overrides, which the new
     * table folds in verbatim: d = [7,48,48,62,51,51,62], t = [7,12,30,12,12,12,28]. */
    const render = (bits) => {
        const px = new Set();
        bits.forEach((row, r) => { for (let c = 0; c < 15; c++) if (row & (1 << c)) px.add(c + ',' + r); });
        return px;
    };
    const same = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));
    if (!same(d, render([48, 48, 62, 51, 51, 62])))
        throw new Error("'d' changed shape — it is a live fraction suffix (1/16d)");
    if (!same(t, render([12, 30, 12, 12, 12, 28])))
        throw new Error("'t' changed shape — it is a live fraction suffix");
});

if (failed) process.exit(1);
console.log('test_hdr_font_full: PASS');
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
