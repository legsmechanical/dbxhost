/* tests/js/test_deferred_banks.mjs — opening a module with repeated
 * elements must not build davebox's own flat banks while the page grid is the
 * editor on screen.
 *
 * Measured 2026-09-24 on DR32's served hierarchy under QuickJS: discovery
 * expanded 45 child levels x 32 pads into 1441 banks / 8161 cells, ~250 ms on a
 * Mac and most of the ~0.9 s the device took to open the editor -- for a list
 * only davebox's FALLBACK editor draws. The banks are now built on demand, the
 * first tick that fallback is really the editor.
 *
 * Fixture: a 32-pad child level, the DR32 shape, over the write-verify rig. */
const PADS = 32;
const HIER = JSON.stringify({ modes: null, levels: {
    root: { name: 'Main', knobs: ['cutoff', 'shape'],
            params: ['cutoff', 'shape', { level: 'pads', label: 'Pads' }] },
    pads: { name: 'Pads', child_prefix: 'pad', child_count: PADS, child_label: 'Pad',
            knobs: ['tune', 'level'], params: ['tune', 'level'] },
} });
const PAD_VALUES = {};
for (let i = 0; i < PADS; i++) { PAD_VALUES['synth:pad' + i + '_tune'] = '0'; PAD_VALUES['synth:pad' + i + '_level'] = '0.5'; }

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
    'synth:ui_hierarchy': HIER,
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
    ]),
    'synth:cutoff': '0.30', 'synth:shape': '0',
    ...PAD_VALUES,
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
GS.activeTrack = 4; GS.stateLoading = false; GS.bootSplashMs = 0;

function openSynth() {
    snd.soundEnter(4, 4); tick(4);
    /* ⚠ Entry lands on the BANK'S PROMPT now (Josh, 2026-08-28: the bank is a
     * door). These steps act on the menu. */
    snd.soundShowMenu();
    const st = snd.soundPickStateForTest();
    const target = st.kinds.indexOf('trackto');     /* the INSTRUMENT row is the generator's door (2026-09-04); the Generator row is gone */
    for (let g = 0; g <= st.kinds.length * 2; g++) {
        if (snd.soundPickStateForTest().row === target) break;
        jog(snd.soundPickStateForTest().row < target ? 1 : -1);
    }
    click(); tick(8);           /* discovery runs on the tick */
}


step('control: the fixture has 32 repeated pads, the shape that made DR32 slow', () => {
    const h = JSON.parse(HIER);
    if (h.levels.pads.child_count !== PADS) throw new Error('fixture lost its pads');
});

step('⭐ the grid takes the editor and the flat banks are NOT built', () => {
    openSynth();
    if (!snd.soundPPForTest().on) throw new Error('control: the page grid is not the editor');
    const b = snd.soundBanksForTest();
    if (!b.deferred || b.count !== 0)
        throw new Error('discovery built the banks anyway: ' + JSON.stringify(b));
});

step('idle ticks under the grid do not build them either', () => {
    tick(40);
    const b = snd.soundBanksForTest();
    if (!b.deferred || b.count !== 0) throw new Error('something built the banks: ' + JSON.stringify(b));
});

step('⭐ the grid declines: davebox\'s own editor gets its banks on the next tick, every pad', () => {
    snd.soundDeclineGridForTest();
    tick(2);
    const b = snd.soundBanksForTest();
    if (b.deferred) throw new Error('still deferred after the fallback took over');
    if (b.count < 1 + PADS) throw new Error('expected Main + ' + PADS + ' pad banks, got ' + b.count);
});

if (failed) { console.log('FAIL: deferred banks'); process.exit(1); }
console.log('PASS: deferred banks — the grid editor opens without building davebox\'s flat banks; the fallback builds them when it draws');
}
main().catch(e => { console.error(e); process.exit(1); });
