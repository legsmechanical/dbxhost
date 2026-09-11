/* tests/js/test_fader_law.mjs — the level knob scales like a mixer fader.
 *
 * Josh, 2026-09-11, at the device: "investigate common daw/mixing board fader
 * scaling across range of travel and make it behave more like that... just get
 * us in the ballpark."
 *
 * ⚠⚠ WHAT WAS WRONG, and it is the thing to keep pinned: the knob was LINEAR
 * IN AMPLITUDE over 0..2, so unity sat at the MIDDLE of the throw, the top half
 * bought 6 dB, and everything under -12 dB was crushed into the bottom eighth.
 * The cases below assert the SHAPE of the new law — where unity lands, how much
 * throw the mixing range gets — not a table of numbers copied out of the
 * implementation, which would pass whatever the implementation happened to say.
 */
import { faderTravelToDb, faderTravelToGain, faderGainToTravel, faderFormatDb, faderStep, faderWire }
    from '../../ui/ui_engine.mjs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };
const db = (g) => 20 * Math.log10(g);

step('⭐⭐ UNITY SITS HIGH ON THE THROW, where a console puts it — not halfway', () => {
    const t = faderGainToTravel(1.0);
    if (!(t >= 0.70 && t <= 0.90))
        throw new Error('unity at ' + (t * 100).toFixed(0) + '% of travel; a fader puts it ~75-85%. '
            + 'At 50% this is the old linear-in-gain law.');
});

step('⭐⭐ THE MIXING RANGE GETS THE THROW: ±6 dB around unity spans ≥ 30% of it', () => {
    const lo = faderGainToTravel(Math.pow(10, -6 / 20));
    const hi = faderGainToTravel(Math.pow(10, 6 / 20));
    const span = hi - lo;
    if (!(span >= 0.30))
        throw new Error('-6..+6 dB spans only ' + (span * 100).toFixed(0) + '% of travel. '
            + 'The old linear law gave it 12%, which is the complaint.');
});

step('⚠ …and the FADE-OUT range is not crammed into a sliver: -20 dB is still ≥ 20% up', () => {
    const t = faderGainToTravel(0.1);          /* -20 dB */
    if (!(t >= 0.20))
        throw new Error('-20 dB sits at ' + (t * 100).toFixed(0) + '% of travel — too close to the '
            + 'bottom to fade with. The old law put it at 5%.');
});

step('the law is MONOTONIC and bounded across the whole throw', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 510; i++) {
        const g = faderTravelToGain(i / 510);
        if (!(g >= 0)) throw new Error('negative gain at ' + i);
        if (g < prev) throw new Error('gain went DOWN at detent ' + i + ': ' + prev + ' -> ' + g);
        prev = g;
    }
    if (faderTravelToGain(0) !== 0) throw new Error('the fader does not bottom out at silence');
    if (Math.abs(db(faderTravelToGain(1)) - 6) > 0.1) throw new Error('the top is not +6 dB');
});

step('⚠ gain -> travel -> gain ROUND-TRIPS (the knob depends on it every turn)', () => {
    for (const g of [0.001, 0.01, 0.1, 0.25, 0.5, 0.708, 1.0, 1.414, 1.995]) {
        const back = faderTravelToGain(faderGainToTravel(g));
        if (Math.abs(db(back) - db(g)) > 0.05)
            throw new Error(g + ' round-tripped to ' + back.toFixed(4)
                + ' (' + db(g).toFixed(2) + ' dB -> ' + db(back).toFixed(2) + ' dB)');
    }
});

step('⭐ ONE DETENT IS A USABLE STEP EVERYWHERE — no dead zones, no leaps', () => {
    /* The point of the law: constant-ish dB per detent instead of the old
     * law's 0.04 dB at the top and 6 dB at the bottom. */
    let worst = 0, worstAt = 0;
    for (let i = 1; i < 510; i++) {
        const a = faderTravelToDb(i / 510), b = faderTravelToDb((i + 1) / 510);
        if (a === null || b === null) continue;
        const d = Math.abs(b - a);
        if (d > worst) { worst = d; worstAt = i; }
    }
    if (worst > 1.0)
        throw new Error('a single detent jumps ' + worst.toFixed(2) + ' dB at detent ' + worstAt
            + ' — that is a leap, not a fader');
});

step('⚠ the READOUT moves across the whole throw (why it is dB, not "x")', () => {
    /* The 'x' readout stalls where the law adds resolution: measured, 41 of
     * 510 detents all read "0.00x" while still audible. dB must not do that. */
    const seen = new Map();
    for (let i = 0; i <= 510; i++) {
        const s = faderFormatDb(faderTravelToGain(i / 510));
        seen.set(s, (seen.get(s) || 0) + 1);
    }
    let worst = 0, label = '';
    for (const [s, n] of seen) if (s !== '-inf' && n > worst) { worst = n; label = s; }
    if (worst > 12)
        throw new Error('the readout sits on "' + label + '" for ' + worst
            + ' detents — that is the stall the dB readout exists to avoid');
});

step('⭐⭐⭐ NO CREEP: +n then -n returns to EXACTLY where it started, on every throw', () => {
    /* THE BUG THIS CASE EXISTS FOR (2026-09-11). A first cut snapped each result
     * to the 0.1 dB the readout prints, and the snap fed back into the next
     * turn: one 40-step detent near unity is 0.75 dB, which snapped up to 0.8,
     * and stepping back from 0.8 landed on 0.05, which snapped to 0.1. Wiggling
     * a fader made it CREEP. Asserted in GRID POSITIONS through the real
     * five-decimal wire — comparing a written value to an unwritten one counts
     * every rounding as drift, which is how the first harness for this lied.
     * ⭑ WHAT GUARANTEES IT is faderStep's TRAVEL GRID, not the absence of a dB
     * snap: putting a snap back into faderTravelToGain ALONE does not fail this
     * case, because the grid re-seats travel on every turn and absorbs it.
     * Removing the grid does — mutation-tested: "started on detent 24, +7/-7
     * came back to 23". If you touch faderStep's rounding, this is the guard. */
    for (const N of [40, 130, 200]) {
        const at = (g) => Math.round(faderGainToTravel(g) * N);
        for (let i = 1; i < N - 8; i++) {
            let g = parseFloat(faderWire(faderStep(0, i, N)));
            const k0 = at(g);
            for (let k = 0; k < 7; k++) g = parseFloat(faderWire(faderStep(g, 1, N)));
            for (let k = 0; k < 7; k++) g = parseFloat(faderWire(faderStep(g, -1, N)));
            if (at(g) !== k0)
                throw new Error('N=' + N + ': started on detent ' + k0 + ', +7/-7 came back to ' + at(g));
        }
    }
});

step('⭐ UNITY IS A DETENT on every surface — you can dial exactly 0.0 dB', () => {
    for (const N of [40, 130, 200]) {
        let g = 0, hit = false;
        for (let i = 0; i <= N; i++) { g = faderStep(0, i, N); if (faderFormatDb(g) === '0.0' && Math.abs(g - 1) < 1e-9) hit = true; }
        if (!hit) throw new Error('on a ' + N + '-detent throw no detent lands on exactly unity');
    }
});

step('⚠ the top of the throw IS the parameter\'s max (2.0), not 1.9953', () => {
    if (Math.abs(faderTravelToGain(1) - 2) > 1e-12)
        throw new Error('top of throw = ' + faderTravelToGain(1) + ', want exactly 2 (SLOT_LEVEL_MAX)');
});

step('⚠ CONTROL: silence prints -inf and nothing else does', () => {
    if (faderFormatDb(0) !== '-inf') throw new Error('0 gain must print -inf');
    /* ⚠ Unity prints "0.0", NOT "+0.0" — the sign is for what is ABOVE unity,
     * which is how a console reads. The first cut of this case asserted the
     * plus and was simply wrong about the convention. */
    if (faderFormatDb(1.0) !== '0.0') throw new Error('unity prints ' + faderFormatDb(1.0));
    if (faderFormatDb(1.414).indexOf('+3.0') < 0) throw new Error('above unity must carry a +: ' + faderFormatDb(1.414));
    if (faderFormatDb(0.5).indexOf('-6.0') < 0) throw new Error('half gain prints ' + faderFormatDb(0.5));
});

if (failed) { console.log('FAIL: fader law'); process.exit(1); }
console.log('PASS: the level knob scales like a mixer fader');
