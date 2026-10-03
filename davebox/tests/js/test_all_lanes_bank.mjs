import './_bulk_get_stub.mjs';
/* tests/js/test_all_lanes_bank.mjs — the ALL LANES bank's knobs WORK.
 *
 * Josh, on the device, 2026-09-11: "i can't set resolution on the all lanes
 * bank, nor quantize, nor direction… that worked in the past?" It had: from the
 * 2026-08-26 knob-sites refactor the branch passed an undeclared `lane`, every
 * turn threw a ReferenceError on its first line, and the MIDI handler swallowed
 * it into seq8-jserr.log (the device's log said exactly that). esbuild builds an
 * undeclared name as a host global, so nothing failed until a knob was turned —
 * and no test turned one.
 *
 * Performs the GESTURE: the whole UI, the real jog walk to ALL LANES, then
 * every knob — asserting each reaches the DSP and that NOTHING lands in the JS
 * error log.
 *
 * ALL LANES loads like any other performance bank (Josh, 2026-10-03: "remove
 * the confirmation requirement from all lanes it should load just like any
 * other performance bank"): no "Proceed?" screen, no OK click first. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let LIST = '';
let STEPS = {};                      /* 't<T>_c<C>' -> the pa_steps answer */
let stepReads = 0;
let failStepsRead = false;
const leds = {};                     /* note -> colour, NoteOn only */
let jsErrors = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = (path, body) => { if (/jserr/.test(String(path))) jsErrors = String(body); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) { stepReads++; return failStepsRead ? null : (STEPS[m[1]] || ''); }
    return '';
};
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }, { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
const printed = []; let frames = 0;
globalThis.clear_screen = () => { printed.length = 0; frames++; }; globalThis.print = (x, y, t) => { printed.push(String(t)); }; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const sets = [];
const _dec = (blob) => { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; };
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = (b) => { const it = _dec(b); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.clockFollowTicks = true;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const click = () => { cc(3, 127); cc(3, 0); ticks(1); };
/* A knob's whole turn: touch, 40 detents, release (Stch locks until release). */
const turn = (k, d) => {
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, 127]));
    for (let i = 0; i < 40; i++) { cc(71 + k, d > 0 ? 1 : 127); ticks(1); }
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, 0]));
    ticks(1);
};
S.trackPadMode[0] = PAD_MODE_DRUM;
ticks(2);
for (let g = 0; g < 20 && S.activeBank !== 7; g++) { cc(14, 127); ticks(1); }   /* ALL LANES is FIRST on the drum walk */
step('setup: the jog walk reaches ALL LANES', () => assert(S.activeBank === 7, 'on bank ' + S.activeBank));

/* K1 Res · K2 Stch · K3 Shft · K4 Qnt · K6 InQ · K7 Dir · K8 SyncRpt are TURNED.
 * K5 is Crop since 2026-09-27 (it was VelIn): a trigger, fired by touch + click,
 * so it has its own step below. */
const KNOBS = [[0, 1, /_all_lanes_clip_resolution=/], [1, 1, /_all_lanes_beat_stretch=/],
               [2, 1, /_all_lanes_clock_shift=/],     [3, 1, /_drum_lanes_qnt=/],
               [5, 1, /_diq=/],
               [6, 1, /_all_lanes_playback_dir=/],    [7, 1, /_drum_repeat_sync=/]];
const touchClick = (k) => {
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, 127]));
    click();
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, 0]));
    ticks(1);
};

step('⭐ no confirm: the card shows the knobs, not a "Proceed?" question', () => {
    click();                                            /* latch the card */
    assert(S.bankCardLatched, 'setup: latched');
    const f0 = frames;
    S.screenDirty = true; ticks(2);
    /* CONTROL: a frame was drawn, so an empty `printed` is a real answer. The
     * old question screen was drawn with print(), so it would show here. */
    assert(frames > f0, 'CONTROL: no frame was drawn');
    assert(!printed.some(t => /Proceed|affect/.test(t)), 'printed ' + JSON.stringify(printed));
});

step('⭐ on arrival, EVERY ALL LANES knob reaches the DSP — no OK first', () => {
    const dead = [];
    for (const [k, d, re] of KNOBS) {
        sets.length = 0;
        turn(k, d);
        if (!sets.some(x => re.test(x))) dead.push('K' + (k + 1));
    }
    assert(dead.length === 0, 'knobs that wrote nothing: ' + dead.join(' '));
});

step('⭐ K5 (Crop) fires on touch + click, and a turn writes nothing', () => {
    sets.length = 0;
    turn(4, 1);
    assert(sets.filter(x => /^t0_/.test(x)).length === 0, 'a K5 turn wrote ' + JSON.stringify(sets.slice(0, 6)));
    touchClick(4);
    assert(sets.includes('t0_all_lanes_crop=1'), 'touch + click did not crop: ' + JSON.stringify(sets.slice(0, 6)));
});

step('a plain jog click flips nothing; touch K3 / K7 + click flips that knob alone', () => {
    click();
    assert(!S.altMode && S.knobAlt === 0, 'a plain click flipped: alt ' + S.altMode + ' knobAlt ' + S.knobAlt);
    touchClick(2);
    assert(S.knobAlt === 1 << 2, 'K3: knobAlt ' + S.knobAlt);
    sets.length = 0; turn(2, 1);
    assert(sets.some(x => /_all_lanes_nudge=/.test(x)) && !sets.some(x => /_all_lanes_clock_shift=/.test(x)),
           'flipped K3 did not nudge: ' + JSON.stringify(sets.slice(0, 6)));
    touchClick(6);
    assert(S.knobAlt === ((1 << 2) | (1 << 6)), 'K7: knobAlt ' + S.knobAlt);
    sets.length = 0; turn(6, 1);
    assert(sets.some(x => /_all_lanes_playback_audio_reverse=/.test(x)), 'flipped K7 wrote ' + JSON.stringify(sets.slice(0, 6)));
    touchClick(2); touchClick(6);
    assert(S.knobAlt === 0, 'a second touch + click did not flip back: ' + S.knobAlt);
});

step('Back only unlatches — nothing re-arms, the knobs still write at once', () => {
    S.altMode = false;
    assert(S.bankCardLatched, 'setup: latched');
    cc(51, 127); cc(51, 0); ticks(1);
    assert(!S.bankCardLatched && S.activeBank === 7, 'Back: latched ' + S.bankCardLatched + ', bank ' + S.activeBank);
    sets.length = 0;
    turn(0, 1);
    assert(sets.some(x => /_all_lanes_clip_resolution=/.test(x)), 'K1 after Back wrote nothing');
});

step('⭐ and nothing was swallowed into the JS error log', () => {
    assert(jsErrors === '', 'seq8-jserr.log got: ' + jsErrors.slice(0, 200));
});

if (failed) process.exit(1);
console.log('test_all_lanes_bank: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
