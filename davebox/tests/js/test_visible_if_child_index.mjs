/*
 * visible_if on a CHILD level: the right instance, and out of the cache.
 *
 * ⚠⚠ TWO DEFECTS THIS PINS, both silent.
 *
 * 1. THE WRONG INSTANCE. `controller.childIndexOf` looks a level up in a
 *    NAME-keyed map. davebox handed it the level DEFINITION object, so the
 *    lookup was `s.childIndex[<object>]` — undefined — and fell back to 0.
 *    Every condition on a child level was therefore answered by INSTANCE 0's
 *    value whatever instance was on screen. On a drum module that means pad 1
 *    decides what pad 5 shows; and where a module numbers its children from 1
 *    the resolved key does not exist AT ALL, reads "", and every gated cell
 *    HIDES — the pad's controls simply are not there. ⚠ Note which way round
 *    that is: an unserved key is "" and `equals` compares false, so this fails
 *    CLOSED. Only a null/undefined read fails open.
 *
 * 2. THE BLOCKING READ. A chain read is ~2.9 ms and a re-plan evaluates every
 *    gated param, so the host made this path cache-first and said in as many
 *    words that blocking reads here froze the OLED. davebox's port went
 *    straight to the engine. ⚠ A cache MISS still answers correctly, only
 *    slowly — which is why this needs a test that counts reads rather than one
 *    that checks the answer.
 */
import { evaluateVisibility, normalizeVisibilityConditionKey }
    from '/data/UserData/schwung/shared/param_pages/visibility.mjs';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   — ' : 'FAIL  — ') + m); if (!c) fail++; };

/* A drum level shaped like the real ones: children `pad1_`..`pad8_`, a `type`
 * gating a `tone` cell. */
const LEVEL = {
    child_prefix: 'pad', child_count: 8,
    params: [{ key: 'type' }, { key: 'tone', visible_if: { param: 'type', equals: '2' } }],
};
const COND = { param: 'type', equals: '2' };

/* The device: only pad5 is type 2. */
const ENGINE = { 'dr:pad1_type': '0', 'dr:pad5_type': '2' };

function run({ childIdx, cache }) {
    const reads = [];
    const listedKeyFor = (fullKey) => {
        for (const p of LEVEL.params) {
            const k = typeof p === 'string' ? p : p && p.key;
            if (k && normalizeVisibilityConditionKey('dr', LEVEL, childIdx, k) === fullKey) return k;
        }
        return String(fullKey).startsWith('dr:') ? String(fullKey).slice(3) : fullKey;
    };
    const visible = evaluateVisibility({
        prefix: 'dr',
        childIndexOf: () => childIdx,
        getParam: (fullKey) => {
            if (cache) {
                const held = cache[listedKeyFor(fullKey)];
                if (held !== undefined) return held;
            }
            reads.push(fullKey);
            return Object.prototype.hasOwnProperty.call(ENGINE, fullKey) ? ENGINE[fullKey] : '';
        },
    }, COND, LEVEL);
    return { visible, reads };
}

/* ---- 1. the instance actually decides ---------------------------------- */
const pad5 = run({ childIdx: 5, cache: null });
const pad1 = run({ childIdx: 1, cache: null });
ok(pad5.reads[0] === 'dr:pad5_type', 'the resolved key names the instance on screen, got ' + pad5.reads[0]);
ok(pad5.visible === true, 'pad 5 is type 2, so its gated cell SHOWS');
ok(pad1.visible === false, 'pad 1 is type 0, so its gated cell HIDES');
/* ⚠ CONTROL: without this the two answers could agree by accident and the
 * whole test would pass on the broken code. */
ok(pad5.visible !== pad1.visible, 'control: the two instances genuinely disagree');

/* ---- 2. the old bug, reproduced exactly -------------------------------- */
/* childIndexOf handed a DEF resolves to 0 in the controller. */
const asZero = run({ childIdx: 0, cache: null });
ok(asZero.reads[0] === 'dr:pad0_type',
   'the pre-fix path asked for pad0_type — a key no module with 1-based children has');
ok(asZero.visible === false,
   'and an unserved key reads "" and compares FALSE — the cell vanishes, though ' +
   'this pad is type 2');
/* ⚠ CONTROL: the same read on the RIGHT key shows it, so the vanishing is the
 * index and not the condition. */
ok(pad5.visible === true, 'control: the same pad shows once the index is right');

/* ---- 3. cache first ---------------------------------------------------- */
/* The controller keys its values by what the level LISTS: `type`, not
 * `pad5_type`. Asking with the concrete key is the #440 miss. */
const cached = run({ childIdx: 5, cache: { type: '2' } });
ok(cached.visible === true, 'the cached value answers the same as the engine did');
ok(cached.reads.length === 0,
   'and it costs NO blocking read — got ' + cached.reads.length);
/* ⚠ CONTROL: prove the read counter can be non-zero, or "0 reads" means
 * nothing. */
ok(pad5.reads.length > 0, 'control: the uncached path really does read (' + pad5.reads.length + ')');

/* A cache keyed the WRONG way (by the resolved key) must still be correct — it
 * just pays. That is what made this invisible. */
const wrongKeyed = run({ childIdx: 5, cache: { pad5_type: '2' } });
ok(wrongKeyed.visible === true, 'a wrongly-keyed cache still answers CORRECTLY');
ok(wrongKeyed.reads.length === 1, '...and silently pays the blocking read anyway');

if (fail) { console.log('FAIL: ' + fail + ' assertion(s)'); process.exit(1); }
console.log('PASS: visible_if resolves the shown instance, from the cache');
