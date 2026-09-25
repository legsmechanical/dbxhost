import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_modbus_voice_pads.mjs — in the bus VOICE picker a pad plays AND
 * moves the cursor to the voice it plays; only the jog click toggles (Josh,
 * 2026-09-24: "pad N should play the pad and jump to it in the list but not
 * toggle it. jog click always required for toggle").
 *
 * The module says which notes sound which voice: split_voices entries carry an
 * optional `notes` list. A module that does not say leaves the cursor alone —
 * the CONTROL, so the positive below is the declaration and not a position.
 *
 * The whole walk is the real gesture: the track's sound menu -> Buses -> the
 * bus -> Voices, then a physical pad note-on through onMidiMessageInternal.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const played = [];                                 /* notes that reached the chain */
const writes = [];                                 /* every bus<N>:voices write */
let VOICES = [];
const ENGINE = {
    'synth:module': 'drumkit', 'slot:volume': '1.000', 'slot:send_a': '0.25', 'slot:send_b': '0.1',
    'slot:muted': '0', 'slot:soloed': '0',
};
const CONFIG = JSON.stringify({ buses: [{ present: true, name: 'Drums', voices: [] }], main_sends: [0, 0] });
globalThis.shadow_get_param = (slot, key) => {
    if (typeof key === 'string' && key.endsWith('split_voices')) return JSON.stringify(VOICES);
    if (typeof key === 'string' && key.endsWith('buses:config')) return CONFIG;
    return ENGINE[key] != null ? ENGINE[key] : '';
};
globalThis.shadow_set_param = (slot, key, v) => { if (/voices/.test(key)) writes.push([key, String(v)]); ENGINE[key] = String(v); return 1; };
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.shadow_send_midi_to_dsp = (m) => { const a = Array.from(m); if ((a[0] & 0xF0) === 0x90 && a[2] > 0) played.push(a[1]); };
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
globalThis.shadow_save_state_now = () => 1;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const dm = await import('../../ui/ui_drummodel.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
/* A scale map with a DIFFERENT note on every pad, as the tick builds it. */
S.padKey = 0; S.padScale = 0;
S.tickCount = 500; S.pendingDspSync = 0; S.pendingSetLoad = false; S.currentSetUuid = 'vp-uuid';

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => { cc(3, 127); cc(3, 0); };
const pad   = (i, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, 68 + i, on ? 100 : 0]));
const pitchOf = (i) => S.padNoteMap[i] + (S.trackOctave[2] | 0) * 12;
const VIEW_MODBUS_VOICES = 32;

function openVoices() {
    snd.soundExit(); ticks(2);
    snd.soundEnter(2, 2); ticks(4);
    snd.soundShowMenu(); ticks(3);
    const st = snd.soundPickStateForTest();
    const i = st.labels.indexOf('Buses');
    if (i < 0) throw new Error('rig: no Buses row: ' + JSON.stringify(st.labels));
    for (let g = 0; g < 30 && snd.soundPickStateForTest().row !== i; g++) jog(snd.soundPickStateForTest().row > i ? -1 : 1);
    click(); ticks(4);                                        /* -> the bus list */
    for (let g = 0; g < 6 && snd.soundViewForTest() !== VIEW_MODBUS_VOICES; g++) {
        const v = snd.soundViewForTest();
        click(); ticks(4);                                    /* bus -> its menu -> Voices */
        if (snd.soundViewForTest() === v) { jog(1); ticks(1); }
    }
    if (snd.soundViewForTest() !== VIEW_MODBUS_VOICES) throw new Error('rig: never reached the voice picker, view ' + snd.soundViewForTest());
}

ticks(3);
dm.computePadNoteMap();
step('rig: the pads play distinct notes', () => {
    const p = [0, 1, 2, 4, 5].map(pitchOf);
    assert(new Set(p).size === p.length, 'pads share notes: ' + p);
});
step('CONTROL: a module that declares NO notes — a pad plays, the cursor stays put', () => {
    VOICES = [0, 1, 2, 3].map((k) => ({ id: 'v' + k, label: 'Voice ' + k }));
    openVoices();
    assert(snd.soundModBusVoiceIdxForTest() === 0, 'rig: cursor not on row 0');
    pad(2, true); ticks(1);
    assert(S.liveActiveNotes.has(pitchOf(2)), 'the pad did not play: ' + [...S.liveActiveNotes]);
    pad(2, false); ticks(1);
    assert(snd.soundModBusVoiceIdxForTest() === 0, 'the cursor moved by POSITION: ' + snd.soundModBusVoiceIdxForTest());
});

step('⭐ declared notes: a pad plays AND the cursor jumps to the voice that note sounds', () => {
    /* voice order deliberately NOT pad order, and one voice sounded by two
     * pads (the Urchin shape: an alias pad on its owner's voice). */
    VOICES = [
        { id: 'v0', label: 'Kick',  notes: [pitchOf(0), pitchOf(4)] },
        { id: 'v1', label: 'Hat',   notes: [pitchOf(5)] },
        { id: 'v2', label: 'Snare', notes: [pitchOf(1)] },
    ];
    openVoices();
    writes.length = 0;
    pad(1, true); ticks(1);
    assert(S.liveActiveNotes.has(pitchOf(1)), 'pad 2 did not play its note: ' + [...S.liveActiveNotes]);
    pad(1, false); ticks(2);
    assert(snd.soundModBusVoiceIdxForTest() === 2, 'pad 2 should land on Snare (row 2), got ' + snd.soundModBusVoiceIdxForTest());
    pad(4, true); ticks(1); pad(4, false); ticks(2);
    assert(snd.soundModBusVoiceIdxForTest() === 0, 'the alias pad should land on its owner Kick, got ' + snd.soundModBusVoiceIdxForTest());
    assert(snd.soundViewForTest() === VIEW_MODBUS_VOICES, 'a pad left the picker');
    assert(writes.length === 0, 'a pad TOGGLED a voice: ' + JSON.stringify(writes));
});

step('the jog click is still what toggles', () => {
    writes.length = 0;
    click(); ticks(4);
    assert(writes.length > 0, 'the jog click no longer toggles');
});

process.exit(failed);
}
main();
