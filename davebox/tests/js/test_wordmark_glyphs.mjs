/* Every glyph the session banner can show must actually EXIST in the heading
 * font.
 *
 * ⚠⚠ This is a silent failure by construction. hdrPrint skips an unmapped
 * codepoint and advances — no throw, no warning, nothing in a log. When the
 * wordmark moved to this font on 2026-08-25 the animation swapped 'A' for '@',
 * which was unmapped: the letter simply DISAPPEARED for half of every bar, and
 * only a rendered picture showed it. A width check cannot catch it either —
 * hdrWidth returns the same 6 for a mapped glyph and for the fallback.
 *
 * So the observable is INK: draw the glyph and count pixels.
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

function inkOf(ch) {
    let n = 0;
    globalThis.set_pixel = () => { n++; };
    kit.hdrPrint(0, 0, ch, 1);
    return n;
}

/* The resting mark and every letter the transport animation can swap in. */
const REST = ['d', 'A', 'V', 'E', 'B', 'O', 'x'];
const ALTS = ['@', '3', 'o'];

step('⭑ every letter of the resting wordmark renders', () => {
    for (const ch of REST)
        if (inkOf(ch) === 0)
            throw new Error(JSON.stringify(ch) + ' draws NOTHING — it is unmapped in the heading font');
});

step('⭑ every ANIMATED substitute renders (the @ that vanished)', () => {
    for (const ch of ALTS)
        if (inkOf(ch) === 0)
            throw new Error(JSON.stringify(ch) + ' draws NOTHING — the letter would vanish ' +
                            'for half of every bar while the transport runs');
});

step('⭑ the swapped glyph is VISIBLY different from what it replaces', () => {
    /* A caps-only font maps lowercase to its capital, so O -> o rendered
     * identically: the animation "worked" and showed nothing. Same ink count
     * from the same face is the signature of that. */
    for (const [from, to] of [['A', '@'], ['E', '3'], ['O', 'o']]) {
        if (inkOf(from) === inkOf(to))
            throw new Error(from + ' -> ' + to + ' draws the same ink (' + inkOf(to) +
                            ') — the swap is invisible, which is how the caps ' +
                            'fallback hid itself');
    }
});

step('⚠ control: an unmapped codepoint really does draw nothing', () => {
    /* Proves the probe can see the negative — without this, all of the above
     * would pass against a set_pixel spy that was never called at all. */
    if (inkOf('¥') !== 0)
        throw new Error('a yen sign rendered ink — the ink probe is not measuring this font');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
