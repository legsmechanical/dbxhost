/* tests/js/test_sound_write_verify.mjs — verify-and-rewrite: a write is not
 * DONE until a read confirms it (built 2026-08-24 for the knob-reset class).
 *
 * The bug this pins was proven ON DEVICE: shadow_set_param is fire-and-forget
 * in overtake mode and a >8ms serve stall lets a later write STOMP an earlier
 * unconsumed one — the value is silently lost, and the next poll (or the
 * hosted kit's cache flush) snaps the knob back. Every branch here fails
 * silently in real use, which is why this drives the REAL modules over a fake
 * engine that can be told to lose writes.
 *
 * The HOSTED-canvas read shield is covered at the bottom: the kit re-reads
 * every key twice a second, so a flush landing after a LOST write is the hosted
 * flavour of "the knob resets", and the shield is what stands in front of it. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* ---- fake chain engine over the shadow bindings ---- */
const ENGINE = {
    'synth:module': 'nusaw', 'synth:name': 'NuSaw',
    /* ⚠⚠ EMPTY STRING, NOT ABSENT, AND THE DIFFERENCE IS THE WHOLE POINT. The
     * module editor reads this contract three ways and only two of them say
     * anything about the module: JSON = "here is my tree", "" = "I declare
     * none, use chain_params", and null/absent = "the READ FAILED, we know
     * nothing" — on which the editor deliberately holds the screen and retries
     * rather than planning pages from a failure (the bug that once put
     * granny's sample_path on knob 1).
     *
     * This fixture answered nothing here, so under the vendored editor the
     * contract read as FAILED: the grid held, planned no pages, and swallowed
     * every knob turn — which looked exactly like "the write path is broken"
     * and is why two assertions below failed the day the editor was wired.
     * `''` is the honest fixture: a real module with no hierarchy, whose pages
     * come from chain_params. */
    'synth:ui_hierarchy': '',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
    ]),
    'synth:cutoff': '0.30', 'synth:shape': '0',
    'slot:volume': '1.0', 'slot:send_a': '0.25', 'slot:send_b': '0',
};
let dropNextSets = 0;          /* the mailbox stomp, on demand */
let setCalls = [];
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, val) => {
    setCalls.push([key, val]);
    if (dropNextSets > 0) { dropNextSets--; return 1; }   /* claims fine, never served */
    ENGINE[key] = String(val);
    return 1;
};

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
/* ⚠ davebox's module editor is the HOST'S OWN binding (ui/vendor/), so sound
 * mode's exit path now reaches host bindings this rig never needed —
 * shadow_restore_knob_leds among them, on the LED teardown. Declared here
 * rather than injected into every bundle: tests/js/build.mjs refuses blanket
 * stubbing on purpose, because a missing binding throws inside tick() and the
 * rig would then pass against a tick that stopped on line one. */
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();

await import('../../ui/ui.js');
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const cc   = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const jog  = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => cc(3, 127);
const tick = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };

GS.sessionView = false;
for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
GS.activeTrack = 4; GS.stateLoading = false; GS.bootSplashTicks = 0;

function openSynth() {
    snd.soundEnter(4, 4); tick(4);
    /* ⚠ Entry lands on the BANK'S PROMPT now (Josh, 2026-08-28: the bank is a
     * door). These steps act on the menu. */
    snd.soundShowMenu();
    const st = snd.soundPickStateForTest();
    const target = st.kinds.indexOf('block') + 1;   /* row 0 of blocks is MIDI FX (empty -> browser); +1 = the SYNTH */
    for (let g = 0; g <= st.kinds.length * 2; g++) {
        if (snd.soundPickStateForTest().row === target) break;
        jog(snd.soundPickStateForTest().row < target ? 1 : -1);
    }
    click(); tick(8);           /* discovery runs on the tick */
}

/* ⚠⚠ SCOPED TO davebox's OWN EDITOR, deliberately and loudly.
 *
 * The LEDGER is this rig's subject and it is covered under BOTH editors — the
 * healthy-turn step above passes either way, because the vendored editor writes
 * through queueWrite like everything else. These two steps are different: they
 * measure davebox's own OPTIMISTIC VALUE (soundValueForTest) and its own forced
 * poll, and the vendored editor replaces both — it owns the value while a knob
 * is held, and davebox's poll does not run underneath it. Asserting them with
 * that editor on would be asserting that machinery which is not running still
 * behaves, which is how a test starts passing for the wrong reason.
 *
 * ⭑ They are SKIPPED, not deleted, and they say so: davebox's own editor is
 * still the shipped one, and this is the only coverage its lost-write recovery
 * has. When the swap completes and that editor goes, these go with it. */
function ownEditorStep(label, fn) {
    if (snd.soundPpEditorForTest()) {
        console.log(`  skip — ${label} (davebox's own editor is not the active one)`);
        return;
    }
    step(label, fn);
}

step('setup: the synth block opens with real banks', () => {
    openSynth();
    if (snd.soundValueForTest('cutoff') == null)
        throw new Error('discovery did not populate values');
});

step('healthy engine: a turn drains, confirms, and the ledger EMPTIES', () => {
    setCalls = [];
    cc(71, 1); cc(71, 1);       /* two detents = one step at sens 2 */
    tick(1);                    /* drain */
    if (!setCalls.some(([k]) => k === 'synth:cutoff'))
        throw new Error('the write never drained');
    tick(6);                    /* confirm window + one verify */
    if (snd.soundInflightForTest().length)
        throw new Error('confirmed write stuck in the ledger');
});

ownEditorStep('⭑ a LOST write is rewritten until the engine matches', () => {
    const before = ENGINE['synth:cutoff'];
    setCalls = [];
    dropNextSets = 2;           /* the drain write AND the first rewrite die */
    cc(71, 1); cc(71, 1);
    tick(1);                    /* drain — lost */
    if (ENGINE['synth:cutoff'] !== before)
        throw new Error('control: the fake engine did not lose the write');
    tick(12);                   /* verify -> rewrite (lost) -> verify -> rewrite */
    const sets = setCalls.filter(([k]) => k === 'synth:cutoff').length;
    if (sets < 3) throw new Error('no rewrites happened: ' + sets + ' set(s)');
    if (ENGINE['synth:cutoff'] === before)
        throw new Error('the write never reached the engine');
    if (snd.soundInflightForTest().length)
        throw new Error('ledger did not settle after the rewrite landed');
});

ownEditorStep('⭑ a FORCED poll must NOT snap the optimistic value back while in flight', () => {
    /* The idle poll (every 24 ticks) rarely lands inside the verify window —
     * the one that bites is the FORCED poll, armed by a bank jog on ANY tick.
     * Hold the engine stale across it, then let the verifier heal. */
    setCalls = [];
    dropNextSets = 3;           /* drain + two rewrites die; the third lands */
    const shown0 = snd.soundValueForTest('cutoff');
    cc(71, 1); cc(71, 1);
    const shown1 = snd.soundValueForTest('cutoff');
    if (shown1 === shown0) throw new Error('control: the turn did not move the value');
    tick(1);                    /* drain — lost; ledger holds the key */
    if (Math.abs(parseFloat(ENGINE['synth:cutoff']) - shown1) <= 1e-3)
        throw new Error('control: the engine did not lose the write');
    cc(14, 1);                  /* bank jog arms S.needsPoll — the forced poll */
    tick(1);                    /* forced poll runs THIS tick, engine still stale */
    if (snd.soundValueForTest('cutoff') !== shown1)
        throw new Error('the forced poll snapped the value back: ' + snd.soundValueForTest('cutoff'));
    tick(20);                   /* verifier retries until the write lands */
    if (Math.abs(parseFloat(ENGINE['synth:cutoff']) - shown1) > 1e-3)
        throw new Error('engine not healed: ' + ENGINE['synth:cutoff']);
    if (snd.soundInflightForTest().length) throw new Error('ledger did not settle');
});

step('⚠ enum echoed as its option STRING confirms without a rewrite loop', () => {
    /* junologue-chorus mode: wrote "2", engine echoes "II". */
    const realSet = globalThis.shadow_set_param;
    globalThis.shadow_set_param = (slot, key, val) => {
        setCalls.push([key, val]);
        if (key === 'synth:shape') { ENGINE[key] = ['Saw', 'Square', 'Tri'][parseInt(val, 10)] || val; return 1; }
        ENGINE[key] = String(val); return 1;
    };
    setCalls = [];
    /* find the shape knob: cell index 1 on the first bank */
    cc(72, 1); cc(72, 1); cc(72, 1); cc(72, 1); cc(72, 1); cc(72, 1);
    tick(1);
    tick(14);                   /* plenty of verify windows */
    const sets = setCalls.filter(([k]) => k === 'synth:shape').length;
    if (sets === 0) throw new Error('control: shape never written');
    if (sets > 1) throw new Error('echo-as-string caused ' + (sets - 1) + ' spurious rewrite(s)');
    if (snd.soundInflightForTest().length)
        throw new Error('echoed enum stuck in the ledger');
    globalThis.shadow_set_param = realSet;
});

step('⚠ an engine that NEVER echoes gives up after bounded tries (no loop)', () => {
    const realSet = globalThis.shadow_set_param;
    globalThis.shadow_set_param = (slot, key, val) => { setCalls.push([key, val]); return 1; }; /* black hole */
    setCalls = [];
    cc(71, 1); cc(71, 1);
    tick(1);
    tick(40);                   /* far beyond the retry budget */
    const sets = setCalls.filter(([k]) => k === 'synth:cutoff').length;
    if (sets > 5) throw new Error('unbounded rewrite loop: ' + sets + ' sets');
    if (snd.soundInflightForTest().length)
        throw new Error('unconfirmable write never evicted');
    globalThis.shadow_set_param = realSet;
    snd.soundExit();
});

/* ---- the HOSTED-canvas read shield ----------------------------------------
 *
 * A hosted module draws its own editor and reads its values back through the
 * ctx davebox hands it. The kit flushes that cache 2x/sec, so if a write was
 * LOST in the mailbox and the flush reads the engine directly, the canvas
 * repaints the OLD value — the knob snaps back, which is exactly Josh's report
 * in its hosted flavour. The ctx must serve the in-flight value until the
 * verifier has confirmed the write really landed.
 *
 * ⚠ This was the known coverage gap left by the 08-24 fix: the ledger and the
 * verifier were tested, the ctx wrapper around them was not. */
step('⭑ hosted ctx: a read after a LOST write serves the value you set, not the stale engine', () => {
    openSynth();
    const ctx = snd.soundHostedCtxForTest();
    if (!ctx || typeof ctx.getParam !== 'function')
        throw new Error('control: no hosted ctx');

    /* Control: with nothing in flight the ctx is a pass-through to the engine. */
    /* ⚠ ctx keys are BARE — the comp prefix ('synth:') is added by
     * engineGet/engineSet underneath. Passing the prefixed key reads '' and the
     * whole step passes for the wrong reason. */
    ENGINE['synth:cutoff'] = '0.30';
    if (ctx.getParam('cutoff') !== '0.30')
        throw new Error('control: ctx did not read the engine: ' + ctx.getParam('cutoff'));

    dropNextSets = 1;                       /* the mailbox stomp */
    setCalls = [];
    ctx.setParam('cutoff', '0.90');

    if (ENGINE['synth:cutoff'] !== '0.30')
        throw new Error('control: the fixture did not actually lose the write');
    const shielded = ctx.getParam('cutoff');
    if (String(parseFloat(shielded)) !== '0.9')
        throw new Error('the kit flush would repaint the OLD value (' + shielded +
                        ') — the knob snaps back');
});

step('⭑ ...and once the verifier lands it, the ctx goes back to reading the engine', () => {
    tick(12);                               /* verify -> mismatch -> rewrite */
    if (ENGINE['synth:cutoff'] === '0.30')
        throw new Error('the lost write was never rewritten: engine still 0.30');
    if (snd.soundInflightForTest().length)
        throw new Error('confirmed write left in the ledger — the shield would never lift');

    /* The shield is OFF now, so a value changed BEHIND the UI (a preset load,
     * the browser editor) is seen. A shield that never lifts is its own bug. */
    ENGINE['synth:cutoff'] = '0.10';
    const after = snd.soundHostedCtxForTest().getParam('cutoff');
    if (String(parseFloat(after)) !== '0.1')
        throw new Error('ctx kept serving a stale in-flight value: ' + after);
    snd.soundExit();
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
