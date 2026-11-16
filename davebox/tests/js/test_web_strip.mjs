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
import { STRIP_SPECS, STRIP_GR_ARC_DB, stripEqDb, stripMidHz } from '../../ui/ui_strip.mjs';

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
const W = new Function(cut('const MIX_MODES = [', "/* The channel strip's controls") +
    '\nreturn { MIX_MODES, STRIP_MODES, STRIP_GR_FULL_DB, mixModeFor, mixSnap, eqDb, eqMidHz, eqMidPos };')();

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

step('the EQ pop-out draws the device\'s curve (the sound), at every setting tried', () => {
    const sets = [{ eq_low: 6, eq_mid: 0, eq_mid_freq: 0.5, eq_high: 0 },
                  { eq_low: -15, eq_mid: 15, eq_mid_freq: 0.12, eq_high: 9.5 },
                  { eq_low: 0, eq_mid: -7.5, eq_mid_freq: 0.93, eq_high: -15 },
                  { eq_low: 3, eq_mid: 4, eq_mid_freq: 0, eq_high: 2 }];
    for (const v of sets) for (let i = 0; i <= 60; i++) {
        const hz = 20 * Math.pow(1000, i / 60);
        const a = W.eqDb(v, hz), b = stripEqDb(v, hz);
        assert(Math.abs(a - b) < 1e-9, `${JSON.stringify(v)} @ ${hz.toFixed(0)} Hz: web ${a} vs device ${b}`);
    }
});
step('the mid\'s frequency maps both ways, 125 Hz .. 8 kHz', () => {
    for (const p of [0, 0.25, 0.5, 0.77, 1]) {
        assert(Math.abs(W.eqMidHz(p) - stripMidHz(p)) < 1e-9, `hz(${p})`);
        assert(Math.abs(W.eqMidPos(W.eqMidHz(p)) - p) < 1e-9, `pos(hz(${p}))`);
    }
    assert(W.eqMidPos(20) === 0 && W.eqMidPos(20000) === 1, 'clamped to its reach');
});

if (failed) { console.log('FAIL: test_web_strip'); process.exit(1); }
console.log('PASS: test_web_strip');
