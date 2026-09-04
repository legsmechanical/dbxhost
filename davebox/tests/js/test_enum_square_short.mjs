/* tests/js/test_enum_square_short.mjs — TWO CHOICES MUST NOT DRAW AS ONE CELL.
 *
 * ⚠⚠ THE BUG THIS EXISTS FOR, and it was live: RRVerb-10 declares nine reverb
 * modes, two of which are "M-Tap 1" and "M-Tap 2". The enum square is two lines
 * of the 4x5 font at three characters a line, so BOTH break to M / TAP — the
 * cell is pixel-for-pixel identical whichever mode is selected. The value is
 * right, the write is right, and the screen simply cannot tell you which one you
 * are on. Nothing logs, nothing looks wrong in a screenshot of either state; it
 * only shows up when you turn the knob and the picture does not move.
 *
 * The fix is a module-declared `short_options` parallel to `options`, which the
 * SQUARE consults and nothing else does — `text` and the picker overlay keep the
 * full words, because they exist precisely to show the whole value.
 *
 * ⚠ It reached the device on ONE surface only, which is why this is a test.
 * The generated knob grid (shared/param_pages) already honoured short_options,
 * so the module read correctly there while dAVEBOx's own Move-bus path — which
 * builds its cells in ui_discover and draws them in ui_movy — dropped the field
 * in cellFor and drew the collision. A fix verified on one adapter is not a fix.
 * [[schwung-second-consumer-masks-a-host-bug]]
 *
 * ASSERTED IN PIXELS, not in the descriptor. `sq` being set is not the property
 * that matters; two different selections rendering differently is. The negative
 * control runs first: the same two options WITHOUT short forms must come out
 * identical, or this test would pass on a renderer that had stopped drawing at
 * all.
 */

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
let fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = () => {};
globalThis.text_width = (t) => String(t).length * 6;

const shot = (fn) => { fb = new Uint8Array(W * H); fn(); return fb.slice(); };
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const ink = (a) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i]) n++; return n; };

/* RRVerb-10's real declaration — the module this was found on. */
const OPTIONS = ['Room 1', 'Room 2', 'Hall 1', 'Hall 2', 'Plate 1',
                 'Plate 2', 'M-Tap 1', 'M-Tap 2', 'Gate'];
const SHORT = ['RM1', 'RM2', 'HL1', 'HL2', 'PL1', 'PL2', 'MT1', 'MT2', 'GAT'];
const MTAP1 = 6, MTAP2 = 7;

async function main() {
const movy = await import('../../ui/ui_movy.mjs');
const cells = await import('../../ui/ui_cells.mjs');

const cellFor = (short_options) => ({
    key: 'mode', label: 'Mode', short: 'MODE', kind: 'enumc', type: 'enum',
    min: 0, max: OPTIONS.length - 1, step: 1, options: OPTIONS, short_options,
});
const draw = (cell, value) => {
    const r = cells.toRenderCell(cell, value, value);
    return shot(() => movy.drawEnumSquare(0, 0, r.text, r.sq));
};

/* NEGATIVE CONTROL FIRST. Without short forms these two MUST collide — if they
 * did not, the positive below would be proving nothing, and the most likely
 * reason for that is a renderer that has stopped putting ink down at all. */
step('without short forms, M-Tap 1 and M-Tap 2 draw the SAME square', () => {
    const bare = cellFor(null);
    const a = draw(bare, MTAP1), b = draw(bare, MTAP2);
    assert(ink(a) > 0, 'the square drew nothing at all — the control is void');
    assert(same(a, b), 'expected the collision this test exists for; if this '
        + 'fails the square has changed shape and the fix may be moot');
});

step('short forms make them different pictures', () => {
    const declared = cellFor(SHORT);
    const a = draw(declared, MTAP1), b = draw(declared, MTAP2);
    assert(ink(a) > 0 && ink(b) > 0, 'a short form drew an empty square');
    assert(!same(a, b), 'M-Tap 1 and M-Tap 2 STILL draw identically');
});

/* Every one of the nine, not just the pair that collided: a short list is easy
 * to typo, and two modes sharing a form is the same defect wherever it lands. */
step('and all nine modes are distinguishable from each other', () => {
    const declared = cellFor(SHORT);
    const shots = OPTIONS.map((_, i) => draw(declared, i).join(','));
    const dupes = shots.filter((s, i) => shots.indexOf(s) !== i);
    assert(dupes.length === 0, dupes.length + ' mode(s) draw the same square as another');
});

/* The header and the picker overlay exist to show the WHOLE value; shortening
 * them was the first, wrong fix (it made the held-knob header read "MT1" too).
 * So short_options must reach the square and nothing else. */
step('the full words survive everywhere else', () => {
    const r = cells.toRenderCell(cellFor(SHORT), MTAP2, MTAP2);
    assert(r.text === 'M-TAP 2', 'the header text was shortened, got ' + JSON.stringify(r.text));
    assert(r.options && r.options[MTAP2] === 'M-TAP 2',
        'the picker overlay was shortened, got ' + JSON.stringify(r.options && r.options[MTAP2]));
});

/* A module that declares nothing must render exactly as it did before this
 * feature existed — the field is opt-in, and every other module on the device
 * declares none. */
step('a module declaring no short forms is byte-identical to before', () => {
    const bare = cellFor(null);
    const undeclared = cellFor(undefined);
    for (let i = 0; i < OPTIONS.length; i++)
        assert(same(draw(bare, i), draw(undeclared, i)),
            'option ' + i + ' differs between null and absent short_options');
    const r = cells.toRenderCell(bare, MTAP1, MTAP1);
    assert(r.sq == null, 'sq must stay null when nothing is declared, got ' + JSON.stringify(r.sq));
});

/* A short list shorter than the options list, or holes in it, must fall back
 * per-option rather than drawing an empty square — a module half-way through
 * declaring them is a likely state, and a blank cell is worse than a collision. */
step('a partial short list falls back per option, never to a blank square', () => {
    const partial = cellFor(['RM1', 'RM2']);
    for (let i = 0; i < OPTIONS.length; i++)
        assert(ink(draw(partial, i)) > 0, 'option ' + i + ' drew an empty square');
    const r = cells.toRenderCell(partial, MTAP1, MTAP1);
    assert(r.sq == null, 'an unlisted option must fall back to its full value');
});

console.log(failed ? '\nFAILED' : '\nOK — enum squares stay distinguishable');
process.exit(failed);
}
main();
