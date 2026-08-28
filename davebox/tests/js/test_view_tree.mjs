/* tests/js/test_view_tree.mjs — VIEW_TREE is where a screen sits, and Back
 * reads it for the pure step-ups.
 *
 * ⚠⚠ WHAT THIS EXISTS TO CATCH. Four Back branches that each did exactly
 * `S.view = <my parent>` were replaced by one table lookup. The table is now
 * also what a breadcrumb walks, which is the whole point — the parent edges had
 * been encoded twice over otherwise, and two copies of a tree agree only until
 * one is edited. But a table that gets an edge WRONG sends Back somewhere it
 * has never gone, and that is a navigation bug the renderer cannot show: you
 * press Back and land on the wrong screen, with nothing logged.
 *
 * So the observable is BEHAVIOURAL: drive the real Back handler from each view
 * and assert where it lands. A source pin on the table would only prove the
 * table says what it says.
 */

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const PARAMS = {
    'synth:module': 'noisemaker', 'synth:name': 'Noisemaker',
    'fx1:module': 'rrverb10',     'fx1:name': 'RRVerb-10',
    'knob_1_target': 'synth', 'knob_1_param': 'cutoff',
    'synth:chain_params': JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 }]),
};
globalThis.shadow_get_param = (slot, key) => PARAMS[key] || '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.set_pixel = () => {};
globalThis.fill_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

/* Sound mode's view enum — not exported, pinned here so a renumbering shows up
 * as a failure rather than as silently comparing the wrong constants. */
const VIEW_EDIT = 1, VIEW_PRESET_SRC = 3, VIEW_SLOTCFG = 8,
      VIEW_KNOBS = 11, VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13,
      VIEW_LFO = 14, VIEW_LFO_TARGET = 15, VIEW_LFO_PARAM = 16;

async function main() {
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

/* ⚠⚠ soundOnCC returns immediately unless sound mode is ACTIVE, so a rig that
 * only sets S.view drives NOTHING — every Back assertion would pass by never
 * moving. The CONTROL below caught exactly that on the first run. Enter the
 * mode properly first. */
for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;      /* all Schwung tracks */
GS.activeTrack = 2;
snd.soundEnter(2, 2);
for (let i = 0; i < 3; i++) snd.soundTick && snd.soundTick();
if (!snd.soundActive()) throw new Error('setup: sound mode did not enter — the rig cannot drive Back');

const view = () => snd.soundPickStateForTest().view;
const setView = (v) => { snd.soundSetViewForTest(v); };
/* The REAL handler: Back is a press then a release, and only the release
 * navigates (the press arms the long-hold that suspends the module). */
function back() {
    GS.backHoldFired = false;
    snd.soundOnCC(51, 127, (v) => (v < 64 ? v : v - 128));
    snd.soundOnCC(51, 0, (v) => (v < 64 ? v : v - 128));
}

step('⭑⭑ Back steps up exactly one level, on every pure edge', () => {
    const EDGES = [
        ['KNOB_PARAM -> KNOB_TARGET', VIEW_KNOB_PARAM, VIEW_KNOB_TARGET],
        ['KNOB_TARGET -> KNOBS',      VIEW_KNOB_TARGET, VIEW_KNOBS],
        ['LFO_PARAM -> LFO_TARGET',   VIEW_LFO_PARAM,  VIEW_LFO_TARGET],
        ['LFO_TARGET -> LFO',         VIEW_LFO_TARGET, VIEW_LFO],
    ];
    for (const [name, from, want] of EDGES) {
        setView(from);
        back();
        if (view() !== want)
            throw new Error(`${name}: landed on view ${view()}, expected ${want}`);
    }
});

step('⚠ CONTROL: the probe can see a WRONG landing', () => {
    /* If back() were inert — a swallowed press, a guard returning early — every
     * assertion above would pass by never moving at all. Assert it MOVES. */
    setView(VIEW_KNOB_PARAM);
    const before = view();
    back();
    if (view() === before)
        throw new Error('Back did not change the view at all — the driver is inert, so the ' +
                        'edges above are asserting nothing');
});

step('⭑ a whole chain walks all the way out, one press per level', () => {
    /* The edges compose: three Backs from the deepest screen must land on
     * KNOBS, not skip a level and not stall on one. */
    setView(VIEW_KNOB_PARAM);
    back();
    if (view() !== VIEW_KNOB_TARGET) throw new Error(`first Back -> ${view()}`);
    back();
    if (view() !== VIEW_KNOBS) throw new Error(`second Back -> ${view()}`);
});

step('⭑⭑ the PATH names the ancestors, outermost first', () => {
    /* The breadcrumb reads the same edges Back does — that is the entire reason
     * the table exists. The screen you are ON is not a crumb.
     * ⚠ Updated when the tree GREW: Knobs sits inside Sound Control, so the
     * knob chain is three deep, not two. The old expectation of two was correct
     * for a table that stopped at Knobs. */
    setView(VIEW_KNOB_PARAM);
    const path = snd.soundViewPath();
    if (path.length !== 3)
        throw new Error(`expected 3 ancestors for KNOB_PARAM, got ${path.length}: ${JSON.stringify(path)}`);
    if (path[0] !== 'Sound' || path[1] !== 'Knobs')
        throw new Error(`the path reads ${JSON.stringify(path)}, expected Sound > Knobs > K1`);
});

step('⭑ a ROOT screen has an empty path', () => {
    /* SLOTCFG is the top of the sound-mode tree: the blocks picker under it is
     * not a tabled view, it is the fallback root everything falls back to. */
    setView(VIEW_SLOTCFG);
    const path = snd.soundViewPath();
    if (path.length) throw new Error(`SLOTCFG should have no ancestors, got ${JSON.stringify(path)}`);
});

step('⭑⭑ the STACK depth counts floating ancestors, stopping at a full screen', () => {
    /* ⚠ Updated 2026-08-28: the LFO used to be the not-a-list EXCEPTION — its
     * waveform strip sat where a box would go, so it kept the full screen and
     * its pickers were a shallow stack. Josh's call: shrink the strip to one
     * cycle and put it INSIDE the box. The exception is gone and both chains
     * are now uniform.
     *
     * The `float: false` machinery is still exercised — by VIEW_EDIT, which is
     * tabled for its crumb but never drawn as a backdrop because it hands the
     * frame to a hosted module canvas. */
    setView(VIEW_KNOB_PARAM);
    const knobs = snd.soundStackDepth();
    if (knobs !== 4) throw new Error(`knob param stack is ${knobs} boxes, expected 4`);
    setView(VIEW_LFO_PARAM);
    const lfo = snd.soundStackDepth();
    if (lfo !== 4)
        throw new Error(`LFO param stack is ${lfo} boxes, expected 4 — the LFO floats now, so ` +
                        'its chain is the same depth as the knob chain');
    setView(VIEW_LFO);
    if (snd.soundStackDepth() !== 2)
        throw new Error('the LFO screen is itself a 2-box stack (Sound Control, then LFO)');
});

step('⭑ a non-floating ancestor still stops the walk', () => {
    /* VIEW_EDIT keeps float:false, so the preset chain rooted on it is measured
     * from there rather than running all the way to the blocks picker. Without
     * a case here, the whole float mechanism would be untested the moment the
     * LFO stopped being the exception. */
    setView(VIEW_PRESET_SRC);
    const d = snd.soundStackDepth();
    if (d !== 1)
        throw new Error(`preset source is ${d} boxes, expected 1 — the walk should stop at ` +
                        'VIEW_EDIT, which does not float');
});

step('⚠ an unknown view has an empty path rather than throwing', () => {
    /* Most of sound mode's views are not in the table and never will be — the
     * path must degrade to "no crumbs", not explode mid-render. A throw here
     * would take the whole tick with it, and tick() swallows errors: the screen
     * would simply stop updating with nothing logged. */
    setView(0);
    if (snd.soundViewPath().length) throw new Error('an untabled view produced crumbs');
});

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed);
}

main();
