import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_patch_load_midi_fx.mjs — a chain preset with a MIDI FX must
 * SOUND when it is loaded onto a track that had none.
 *
 * Josh, 2026-10-21: "Why doesn't plank preset sound when loaded despite the
 * chain working fine before it was saved?" The preset holds the slot's
 * hand-back flag (`midi_fx_host_route: 1`, set live by syncTrackMidiFx when the
 * MIDI FX was picked), and the load restores it — but the TRACK's half,
 * `tN_fxpost`, is not in a chain preset. On a track that had no MIDI FX it
 * stayed 0, and the engine then plays none of what the slot hands back.
 *
 * The REAL gesture: TRACK CONFIG → the chain presets row → the preset. The
 * stub host applies the load LATE, as the real one does (a request served a
 * few frames on), and writes the file's flag after the modules — so the
 * test also pins that davebox's sync lands AFTER the apply.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

const loaded = {};                       /* comp -> module id (slot 0) */
const chain = { midi_fx_host_route: '0' };
const log = [];                          /* every write that matters, in order */
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    if (m) return loaded[m[1]] || '';
    if (k === 'midi_fx_host_route') return chain.midi_fx_host_route;
    return '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k !== 'string') return 0;
    const m = k.match(/^(.*):module$/);
    if (m) { if (v) loaded[m[1]] = String(v); else delete loaded[m[1]]; }
    if (k === 'midi_fx_host_route') { chain.midi_fx_host_route = String(v); log.push('slot:host_route=' + v); }
    return 1;
};
let pendingApply = null;                 /* the host's late apply */
globalThis.host_patch_list = () => ['PLANK'];
globalThis.host_patch_current = () => '';
globalThis.host_patch_load = (slot, index) => {
    pendingApply = { at: 3 };            /* applied three ticks later */
    return true;
};
function hostFrame() {
    if (!pendingApply) return;
    if (--pendingApply.at > 0) return;
    pendingApply = null;
    loaded.synth = 'plank'; loaded.midi_fx1 = 'plank-player'; loaded.fx1 = 'plank-amp';
    chain.midi_fx_host_route = '1';      /* the file's flag, written after the modules */
    log.push('apply:host_route=1');
}

for (const fn of ['host_system_cmd', 'host_vol_block', 'host_edit_cc_block',
                  'move_midi_internal_send', 'set_led', 'stipple_rect', 'draw_line', 'flush_display',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'clear_screen', 'print',
                  'fill_rect', 'draw_rect', 'set_pixel'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_param = (k, v) => { if (/^t0_fx(post|pre)$/.test(k)) log.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.shadow_save_state_now = () => true;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; hostFrame(); tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const JOG = 14, CLICK = 3;
const click = () => { cc(CLICK, 127); cc(CLICK, 0); ticks(4); };

step('setup: track 1, a Schwung track with NO MIDI FX (tN_fxpost off)', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0; S.trackRoute[0] = 0; S.trackChannel[0] = 1;
    loaded.synth = 'nusaw';
    ticks(8);
});

step('⭐ loading the preset from TRACK CONFIG turns the track\'s MIDI FX hand-back ON, after the load lands', () => {
    openTrackConfigViaMap(); ticks(6);
    for (let g = 0; g < 40; g++) {
        const st = snd.soundPickStateForTest();
        const want = st.kinds.indexOf('patches');
        if (want < 0) throw new Error('no chain presets row: ' + JSON.stringify(st.kinds));
        if (st.row === want) break;
        cc(JOG, st.row < want ? 1 : 127); ticks(1);
    }
    click();                                    /* the presets list: Save, Save As, PLANK */
    cc(JOG, 1); ticks(1); cc(JOG, 1); ticks(1);
    log.length = 0;
    click();                                    /* load PLANK */
    ticks(200);                                 /* ~2.2 s: past every re-sync */
    if (loaded.midi_fx1 !== 'plank-player') throw new Error('rig: the preset never applied: ' + JSON.stringify(log));
    const ai = log.indexOf('apply:host_route=1');
    const post = log.map((x, i) => [x, i]).filter(([x]) => x === 't0_fxpost=1');
    if (!post.length) throw new Error('t0_fxpost never turned on: ' + JSON.stringify(log));
    if (post[post.length - 1][1] < ai) throw new Error('the track synced only BEFORE the load landed: ' + JSON.stringify(log));
    const lastRoute = log.filter(x => /host_route/.test(x)).pop();
    if (!/=1$/.test(lastRoute)) throw new Error('the slot ends NOT handing back: ' + JSON.stringify(log));
    const lastPost = log.filter(x => /^t0_fxpost=/.test(x)).pop();
    if (lastPost !== 't0_fxpost=1') throw new Error('the track ends with fxpost off: ' + JSON.stringify(log));
});

if (failed) { console.log('FAIL: test_patch_load_midi_fx'); process.exit(1); }
console.log('PASS: test_patch_load_midi_fx');
}
main().catch(e => { console.error(e); process.exit(1); });
