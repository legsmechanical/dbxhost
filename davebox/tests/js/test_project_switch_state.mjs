import './_bulk_get_stub.mjs';
/* tests/js/test_project_switch_state.mjs — opening another project carries none
 * of the last one's UI state that is saved nowhere, and re-reads the per-clip
 * settings the DSP saved (2026-10-02 audit of what leaked across a switch):
 *   - reset: drum lane page (it was even PUSHED into the new DSP), drum perform
 *     mode (pads stayed routed to the repeat handlers), repeat latches, TARP
 *     style memory, the clips' adaptive/manual-length flags, the vel zone;
 *   - re-read: NOTE FX / MIDI DLY random modes (and the rest of the per-clip
 *     snapshot), which no load path read back. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_state_subdir = () => 'dAVEBOx'; globalThis.host_write_file = (p, b) => { if (/jserr/.test(String(p))) console.log('JSERR', String(b).slice(0, 700)); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
const GP = {};
const ASKED = [];
globalThis.host_module_get_param = (k) => { if (/pfx_snapshot/.test(k)) ASKED.push(k); return (k in GP ? GP[k] : ''); };
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
let printed = [];
globalThis.print = (x, y, t) => { printed.push(String(t)); };
let stepLights = {};
let buttonLights = {};
globalThis.move_midi_internal_send = (m) => {
    const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90 && a[2] >= 16 && a[2] <= 31) stepLights[a[2] - 16] = a[3];
    if (a.length >= 4 && (a[1] & 0xF0) === 0xB0) buttonLights[a[2]] = a[3];
    return true;
};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};



async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };

step('⭐ the last project\'s unsaved UI state does not survive opening another', () => {
    S.currentSetUuid = 'aaaaaaaa-2222-3333-4444-555555555555';
    S.drumLanePage[0] = 1; S.drumPerformMode[0] = 2; S.drumRepeatLatched[0] = true;
    S.drumRepeatHeldPad[0] = 5; S.drumRepeat2LatchedLanes[0].add(3);
    S.lastTarpStyle[2] = 4; S.clipLengthManuallySet[1][0] = true; S.clipAdaptiveMode[1][2] = true;
    S.drumLaneLengthManuallySet[0] = true; S.drumLastVelZone[0] = 3; S.followPaused = true;
    sets.length = 0;
    S.currentSetUuid = 'bbbbbbbb-2222-3333-4444-555555555555';
    S.pendingSetLoad = true;
    ticks(1);
    assert(sets.some(s => /^state_load=/.test(s)), 'rig: the load was not sent');
    assert(S.drumLanePage[0] === 0 && S.drumPerformMode[0] === 0, 'lane page / perform mode carried: ' + S.drumLanePage[0] + ' ' + S.drumPerformMode[0]);
    assert(!S.drumRepeatLatched[0] && S.drumRepeatHeldPad[0] === -1 && S.drumRepeat2LatchedLanes[0].size === 0, 'a repeat latch carried');
    assert(S.lastTarpStyle[2] === 1 && !S.clipLengthManuallySet[1][0] && !S.clipAdaptiveMode[1][2] &&
           !S.drumLaneLengthManuallySet[0] && S.drumLastVelZone[0] === 12 && !S.followPaused,
           'per-project flags carried');
});

step('⭐ after the load, the DSP\'s per-clip settings are read back (NOTE FX / MIDI DLY random modes)', () => {
    S.trackPadMode[1] = 0; S.trackActiveClip[1] = 0;
    S.noteFXRandomMode[1] = 2; S.midiDlyRandomMode[1] = 2;   /* the last project's (default) */
    const v = new Array(44).fill('0'); v[32] = '1'; v[33] = '0'; v[42] = '8';
    GP['t1_c0_pfx_snapshot'] = v.join(' ');
    for (let i = 0; i < 12 && S.pendingDspSync > 0; i++) ticks(1);
    ticks(2);
    assert(S.noteFXRandomMode[1] === 1 && S.midiDlyRandomMode[1] === 0,
           'the saved random modes were not read back: ' + S.noteFXRandomMode[1] + ' ' + S.midiDlyRandomMode[1]);
    assert(sets.some(s => s === 't0_drum_lane_page=0'), 'the new DSP got a non-zero lane page: ' + JSON.stringify(sets.filter(s => /lane_page/.test(s))));
});

if (failed) { console.log('FAIL: test_project_switch_state'); process.exit(1); }
console.log('PASS: test_project_switch_state');
}
main().catch(e => { console.error(e); process.exit(1); });
