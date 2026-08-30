/* tests/js/test_cellkind_parity.mjs — the manual renderer's copy of
 * kitCellForKnob must classify every widget the same way ui_render does.
 *
 * ⚠⚠ THE BUG THIS EXISTS FOR, and it shipped: on 2026-08-29 Strch and Shift
 * were reclassified from the pushbutton to the signed big number. Both literal
 * cell sites in ui_render.mjs were changed and so was ui_render's own
 * classifier — but tools/render_screens.mjs carries a VERBATIM COPY of that
 * classifier, and it was missed. The result was a manual whose CLIP page drew
 * two buttons the device does not draw, sitting beside a DRUM LANE page that
 * was right, because drum lane is built from literal cells that HAD been fixed.
 * One page right, one page wrong, same two params.
 *
 * ⚠ The audit that missed it grepped for `kind: 'action'` — the object-literal
 * spelling. The copy writes `base.kind = 'action'`, an assignment, so the grep
 * was clean while the drift was live. Pattern-matching one spelling of a thing
 * that has two is not an audit, which is why this is a test and not a habit.
 *
 * ⚠ It is the SECOND time this file's copies have drifted: its drawMenuHeader
 * replica reproduced STOCK schwung's header for months while the device drew
 * ours. A copy in a tool is a copy that nothing runs, so nothing notices.
 *
 * WHAT IS COMPARED: the ordered sequence of `base.kind = '<x>'` assignments
 * inside each kitCellForKnob. That is the classification itself. It does not
 * compare the CONDITIONS — a test that did would be a second copy of the
 * function — so it catches a kind changing on one side, which is the drift that
 * has actually happened twice, and not a condition changing on one side.
 * ⚠ If you change a condition, check the other file by hand; this will not.
 */

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

import { readFileSync } from 'node:fs';

/* Pull one function's body out by brace-matching from its `function NAME(`
 * header. Brace-matched rather than regex'd to the next `\n}` because both
 * functions contain nested blocks, and a lazy match would stop at the first
 * one and silently compare a fraction of the classifier. */
function functionBody(src, name) {
    const at = src.indexOf('function ' + name + '(');
    assert(at >= 0, name + ' not found — did it get renamed?');
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
    }
    throw new Error(name + ': unbalanced braces');
}

/* Comments are stripped first: this file's own explanatory notes quote widget
 * kinds ("...is `valsq` since..."), and counting those as assignments would
 * make the two sides differ for a reason that is only prose. */
function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function kindSequence(src, name) {
    const body = stripComments(functionBody(src, name));
    const out = [];
    const re = /base\.kind\s*=\s*'([a-z]+)'/g;
    let m;
    while ((m = re.exec(body)) !== null) out.push(m[1]);
    return out;
}

/* ⚠ Repo-relative, not import.meta.url: these tests are BUNDLED into /tmp by
 * tests/js/build.mjs, so a URL relative to the module resolves next to the
 * bundle and not next to the source. run.sh cd's to davebox/ first, which is
 * what every other source-reading test here relies on. */
const uiRender = readFileSync('ui/ui_render.mjs', 'utf8');
const renderer = readFileSync('tools/render_screens.mjs', 'utf8');

step('the manual renderer classifies widgets exactly as the device does', () => {
    const device = kindSequence(uiRender, 'kitCellForKnob');
    const manual = kindSequence(renderer, 'kitCellForKnob');
    assert(device.length > 4, 'only ' + device.length + ' kinds found in ui_render — the ' +
                              'extraction broke, not the code');
    assert(JSON.stringify(device) === JSON.stringify(manual),
           'ui_render assigns [' + device.join(', ') + '] but tools/render_screens.mjs assigns [' +
           manual.join(', ') + '] — the copy has drifted, and the manual is now documenting a ' +
           'screen the device does not draw');
});

step('only a TRUE fire-action still classifies as a button', () => {
    /* ⚠ Pins the 2026-08-29 rule itself, not just the parity: `scope: 'action'`
     * covers Strch, Shift and Lgto, and only Lgto is a trigger. If the generic
     * branch ever goes back to 'action', both files would agree and the test
     * above would pass while every valued action drew as a button again. */
    for (const [file, src] of [['ui_render.mjs', uiRender], ['render_screens.mjs', renderer]]) {
        const body = stripComments(functionBody(src, 'kitCellForKnob'));
        const m = body.match(/scope\s*===\s*'action'\s*\)\s*\{\s*base\.kind\s*=\s*'([a-z]+)'/);
        assert(m, file + ': the scope==="action" branch is gone or was reshaped — check by hand');
        assert(m[1] === 'valsq',
               file + ': a scope:"action" knob classifies as ' + m[1] + '. Only Lgto (fmtLgto, ' +
               'above this branch) is a fire-action; Strch and Shift hold signed values.');
    }
});

console.log(failed ? '\nFAILED' : '\nAll cell-kind parity checks passed.');
process.exit(failed);
