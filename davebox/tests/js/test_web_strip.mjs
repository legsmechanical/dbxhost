/* tests/js/test_web_strip.mjs — the remote editor's channel-strip controls
 * (davebox/web_ui_mix.js, STRIP_MODES) are the device's (ui/ui_strip.mjs,
 * STRIP_SPECS): same keys in the same order, ranges, detent steps, defaults,
 * centre detents and readouts. The browser runs classic scripts and cannot
 * import the module, so the table is written twice — and held together here.
 *
 * Josh, 2026-11-16: "are remote editor and screen up to date for the new mixer
 * settings?" — they were not: the editor had no EQ or comp at all. */
import fs from 'fs';
import path from 'path';
import { STRIP_SPECS, STRIP_GR_ARC_DB } from '../../ui/ui_strip.mjs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const src = [path.join(process.cwd(), 'web_ui_mix.js'), path.join(process.cwd(), 'davebox/web_ui_mix.js')]
    .find((p) => fs.existsSync(p));
if (!src) { console.log('FAIL: web_ui_mix.js not found from ' + process.cwd()); process.exit(1); }
const text = fs.readFileSync(src, 'utf8');

/* the two tables and the helpers, cut out of the script and evaluated alone */
function cut(from, to) {
    const a = text.indexOf(from), b = text.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error(`cannot find ${from} .. ${to} in web_ui_mix.js`);
    return text.slice(a, b);
}
const W = new Function(cut('const MIX_MODES = [', 'let mixSubscribed') +
    '\nreturn { MIX_MODES, STRIP_MODES, STRIP_GR_FULL_DB, mixModeFor, mixSnap };')();

step('the same five controls, in the device order', () => {
    assert(W.STRIP_MODES.map((m) => m.key).join() === STRIP_SPECS.map((s) => s.key).join(),
        `web ${W.STRIP_MODES.map((m) => m.key)} vs device ${STRIP_SPECS.map((s) => s.key)}`);
});
step('ranges, steps, defaults, detents and the session labels match', () => {
    for (const s of STRIP_SPECS) {
        const m = W.STRIP_MODES.find((x) => x.key === s.key);
        for (const f of ['min', 'max', 'def', 'step', 'detent'])
            assert(m[f] === s[f], `${s.key}.${f}: web ${m[f]} vs device ${s[f]}`);
        assert(m.label === s.sess, `${s.key} label: web ${m.label} vs device ${s.sess}`);
    }
});
step('every readout prints what the device prints', () => {
    for (const s of STRIP_SPECS) {
        const m = W.STRIP_MODES.find((x) => x.key === s.key);
        for (let i = 0; i <= 200; i++) {
            const v = s.min + (s.max - s.min) * i / 200;
            assert(m.fmt(v) === s.fmt(v), `${s.key}(${v}): web ${m.fmt(v)} vs device ${s.fmt(v)}`);
        }
    }
});
step('the gain-reduction meter spans the dot\'s arc', () => {
    assert(W.STRIP_GR_FULL_DB === STRIP_GR_ARC_DB, `${W.STRIP_GR_FULL_DB} vs ${STRIP_GR_ARC_DB}`);
});
step('a wire key finds its own mode — eq_mid is not eq_mid_freq', () => {
    assert(W.mixModeFor('chain:3:eq_mid').key === 'eq_mid', 'eq_mid');
    assert(W.mixModeFor('move_fx:2:eq_mid_freq').key === 'eq_mid_freq', 'eq_mid_freq');
    assert(W.mixModeFor('chain:0:send_a').key === 'send_a', 'send_a');
    assert(W.mixModeFor('chain:0:comp_gr') === null, 'comp_gr is a reading, not a control');
});
step('a gain slider stops on 0 dB; pan keeps its sticky centre', () => {
    const lo = W.STRIP_MODES[0];
    assert(W.mixSnap(lo, 0.3) === 0 && W.mixSnap(lo, -0.3) === 0, 'near 0 dB snaps');
    assert(W.mixSnap(lo, 1.0) === 1.0, 'a real boost stays');
    assert(W.mixSnap(W.MIX_MODES[1], 0.51) === 0.5, 'pan centre');
    assert(W.mixSnap(W.STRIP_MODES[2], 0.001) === 0.001, 'the frequency has no detent');
});

if (failed) { console.log('FAIL: test_web_strip'); process.exit(1); }
console.log('PASS: test_web_strip');
