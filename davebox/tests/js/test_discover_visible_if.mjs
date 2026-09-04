/* tests/js/test_discover_visible_if.mjs — the Move-bus path honours `visible_if`.
 *
 * ⚠⚠ THE GAP THIS CLOSES, and it was live and documented as a known gap:
 * a module may gate a param on another param's value. Echidna FX expresses its
 * ENTIRE per-effect-type layout that way — 215 gates over four slots, so a slot
 * declares 42 candidate knobs and means to show about six. The grid
 * (param_pages) has always honoured those gates; dAVEBOx's own Move-bus path
 * ignored them, so that surface showed every effect variant's parameters at
 * once, flat. Not a cosmetic difference — a different UI for the same module
 * depending on which kind of slot you dropped it in.
 *
 * ⭑ The evaluator is IMPORTED from shared/param_pages/visibility.mjs, not
 * ported, so this path and the grid answer a gate with the same code. A port is
 * the drift shape this repo keeps paying for, and pp_ctx.mjs's own comment says
 * so.
 *
 * ⚠ Evaluated at DISCOVERY, not at draw — which is only correct because a param
 * that changes the visible SET declares `reload_level`, and the cell handler
 * re-runs discovery synchronously on such a write. That contract is the module's
 * to keep; this file pins the filtering, not the refresh.
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

async function main() {
const { buildLevelPages } = await import('../../ui/ui_discover.mjs');

/* A slot shaped like echidna-fx's: one category selector and three params, each
 * gated to a different category. */
const levels = {
    root: { label: 'Root', knobs: ['mix'], params: ['mix', { level: 's1', label: 'FX-A' }] },
    s1: {
        label: 'FX-A',
        knobs: ['cat', 'drive', 'depth', 'size'],
        params: [
            { key: 'cat' },
            { key: 'drive', visible_if: { param: 'cat', equals: 'Drive' } },
            { key: 'depth', visible_if: { param: 'cat', equals: 'Mod' } },
            { key: 'size',  visible_if: { param: 'cat', equals: 'Space' } },
        ],
    },
};
const ioFor = (cat) => ({
    prefix: 'fx1',
    getParam: (fullKey) => (String(fullKey).endsWith('cat') ? cat : null),
    childIndexOf: () => 0,
});
const keysOfPage = (io) => {
    const p = buildLevelPages(levels, 'root', io).find((x) => x.name === 'FX-A');
    return p ? p.entries.map((e) => e.key) : null;
};

/* NEGATIVE CONTROL FIRST. With no io the filter must stand down completely and
 * every candidate must survive — that is what every caller outside discover()
 * relies on, and if it did NOT hold the positives below would prove nothing. */
step('with no io, every candidate is shown (unchanged behaviour)', () => {
    const keys = keysOfPage(null);
    assert(keys, 'the FX-A page did not build at all');
    assert(keys.length === 4, 'expected all 4 candidates, got ' + JSON.stringify(keys));
});

step('Drive hides the Mod and Space params', () => {
    const keys = keysOfPage(ioFor('Drive'));
    assert(JSON.stringify(keys) === JSON.stringify(['cat', 'drive']),
        'got ' + JSON.stringify(keys));
});

step('and switching category swaps which one survives', () => {
    assert(JSON.stringify(keysOfPage(ioFor('Mod'))) === JSON.stringify(['cat', 'depth']),
        'Mod: got ' + JSON.stringify(keysOfPage(ioFor('Mod'))));
    assert(JSON.stringify(keysOfPage(ioFor('Space'))) === JSON.stringify(['cat', 'size']),
        'Space: got ' + JSON.stringify(keysOfPage(ioFor('Space'))));
});

/* A value no gate matches must leave the ungated params and hide the rest —
 * never hide everything, which would read as a broken module. */
step('an unmatched category leaves the ungated param', () => {
    const keys = keysOfPage(ioFor('Off'));
    assert(JSON.stringify(keys) === JSON.stringify(['cat']), 'got ' + JSON.stringify(keys));
});

/*
 * ⚠⚠ A GATE WE CANNOT ANSWER MUST SHOW THE CONTROL, NEVER HIDE IT.
 * A missing knob is unrecoverable from the UI — there is no gesture that reveals
 * it — while a spurious one is only noise. So a throwing or unreadable io fails
 * OPEN.
 */
step('an io that throws fails OPEN, showing everything', () => {
    const hostile = { prefix: 'fx1', getParam: () => { throw new Error('read failed'); },
                      childIndexOf: () => 0 };
    const keys = keysOfPage(hostile);
    assert(keys.length === 4, 'expected all 4 on an unreadable gate, got ' + JSON.stringify(keys));
});

step('a level with no gates at all is untouched', () => {
    const plain = { root: { label: 'R', knobs: ['a'], params: ['a', { level: 'p', label: 'P' }] },
                    p: { label: 'P', knobs: ['x', 'y'], params: ['x', 'y'] } };
    const page = buildLevelPages(plain, 'root', ioFor('Drive')).find((x) => x.name === 'P');
    assert(page && page.entries.length === 2, 'got ' + JSON.stringify(page && page.entries));
});

console.log(failed ? '\nFAILED' : '\nOK — the Move-bus path honours visible_if');
process.exit(failed);
}
main();
