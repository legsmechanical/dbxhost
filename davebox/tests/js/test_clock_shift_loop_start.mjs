import './_bulk_get_stub.mjs';
/* tests/js/test_clock_shift_loop_start.mjs — Clock Shift on a clip whose loop
 * does not start at step 1.
 *
 * Josh, on the device: "clock shift isn't working on a melodic track" — track 5
 * of his set, a 64-step clip looping steps 65..128; "works when i set the loop
 * start to 1". The DSP rotated [0, length) instead of the loop window, and the
 * UI's instant mirror did the same to S.clipSteps (indexed by ABSOLUTE step),
 * so the pads showed the wrong steps moving too.
 *
 * Performed through the real gesture: touch K3 on the CLIP bank of a melodic
 * track, turn it (CC 73) detent by detent with ticks between — the path that
 * accumulates detents into one ±1 fire — and release.
 *
 * ⚠ Since Crop (2026-09-27) every clip transform is REFUSED while the loop does
 * not start at step 1 (Josh: "refuse transforms when loop start isn't at one
 * and direct them to crop"; "these should require clip start at 1 too for
 * consistency"). So the late-loop steps below now assert that NOTHING is sent
 * and the LOOP NOT AT 1 / CROP FIRST notice shows; the loop-at-step-1 controls
 * keep the mirrors pinned. Crop itself: tests/js/test_crop.mjs. */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

let jsErrors = '';
const sets = [];
const reads = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = (path, body) => { if (/jserr/.test(String(path))) jsErrors = String(body); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
/* The per-clip re-read keys answer null: the test watches that the re-read is
 * ASKED FOR, and keeps the mirror's own result on screen to assert on. */
globalThis.host_module_get_param = (k) => {
    if (/^t\d+_c\d+_(steps|length|tps)$/.test(k)) { reads.push(k); return null; }
    return '';
};
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');

const T = 4;   /* "track 5" */
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
S.activeBank = 0; S.trackActiveBank[T] = 0; S.trackActiveClip[T] = 0;
ticks(2);

/* A 64-step clip looping steps 64..127 (loop start 65 on the device's count). */
const setupClip = () => {
    S.clipLength[T][0] = 64; S.clipLoopStart[T][0] = 64; S.clipTPS[T][0] = 24;
    const st = S.clipSteps[T][0];
    for (let i = 0; i < st.length; i++) st[i] = 0;
    st[70] = 1; st[127] = 1; st[3] = 1;
};

/* K3 (knob index 2) = Clock Shift on the CLIP bank. Touch, turn one detent at
 * a time with a tick between (the accumulator needs KNOB_PICK detents per fire),
 * and stop at the first fire so exactly one shift is under test. */
const turnOnce = (d) => {
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 2, 127]));
    const before = sets.length;
    let fired = -1;
    for (let i = 0; i < 40 && fired < 0; i++) {
        cc(73, d > 0 ? 1 : 127);
        if (sets.slice(before).some((x) => /_clock_shift=/.test(x))) fired = i;
        else ticks(1);
    }
    return fired;
};
const release = () => { globalThis.onMidiMessageInternal(new Uint8Array([0x90, 2, 0])); ticks(1); };

step('setup: K3 of the CLIP bank is Clock Shift', () => {
    assert(C.BANKS[0].knobs[2].dspKey === 'clock_shift', 'K3 is ' + C.BANKS[0].knobs[2].dspKey);
    assert(Array.isArray(S.clipLoopStart[T]), 'S.clipLoopStart is not per-track, per-clip');
});

step('⭐⭐ THE GESTURE, loop at step 65: a turn either way sends nothing and says CROP FIRST', () => {
    setupClip();
    for (const d of [1, -1]) {
        sets.length = 0; S.actionPopupLines = [];
        const fired = turnOnce(d);
        release();
        assert(fired < 0 && !sets.some((x) => /_clock_shift=/.test(x)), 'sent ' + JSON.stringify(sets));
        assert((S.actionPopupLines || []).join(' / ') === 'LOOP NOT AT 1 / CROP FIRST',
            'no notice: ' + JSON.stringify(S.actionPopupLines));
        const st = S.clipSteps[T][0];
        assert(st[70] === 1 && st[127] === 1 && st[3] === 1 && st[71] === 0 && st[64] === 0, 'the mirror moved');
    }
});

step('CONTROL: loop start 0 still rotates [0, length)', () => {
    S.clipLength[T][0] = 16; S.clipLoopStart[T][0] = 0;
    const st = S.clipSteps[T][0];
    for (let i = 0; i < st.length; i++) st[i] = 0;
    st[15] = 1; st[20] = 1;
    sets.length = 0;
    turnOnce(1);
    assert(sets.includes('t' + T + '_clock_shift=1'), 'sent ' + JSON.stringify(sets));
    assert(st[0] === 1 && st[15] === 0 && st[20] === 1, '[0]=' + st[0] + ' [15]=' + st[15] + ' [20]=' + st[20]);
    assert(S.pendingStepsReread > 0 && S.pendingStepsRereadTrack === T && S.pendingStepsRereadClip === 0,
        'no re-read armed');
    reads.length = 0;
    ticks(3);
    assert(reads.includes('t' + T + '_c0_steps'), 'the re-read never asked for the steps: ' + JSON.stringify(reads));
    release();
});

/* K2 (knob index 1, CC 72) = Beat Stretch: one fire per touch, then locked. */
const stretch = (d) => {
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 1, 127]));
    for (let i = 0; i < 40; i++) { cc(72, d > 0 ? 1 : 127); ticks(1); }
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 1, 0]));
    ticks(1);
};

step('⭐ Beat Stretch on a loop at step 65 is not sent, either way', () => {
    S.clipLength[T][0] = 32; S.clipLoopStart[T][0] = 64;
    const st = S.clipSteps[T][0];
    for (let i = 0; i < st.length; i++) st[i] = 0;
    st[64] = 1; st[70] = 1; st[95] = 1; st[3] = 1; st[200] = 1;
    sets.length = 0;
    stretch(1); stretch(-1);
    assert(!sets.some((x) => /_beat_stretch=/.test(x)), 'sent ' + JSON.stringify(sets));
    assert(S.clipLength[T][0] === 32 && st[70] === 1 && st[76] === 0, 'the mirror changed');
});
step('CONTROL: Beat Stretch x2 at step 1 mirrors the DSP', () => {
    S.clipLength[T][0] = 32; S.clipLoopStart[T][0] = 0;
    const st = S.clipSteps[T][0];
    for (let i = 0; i < st.length; i++) st[i] = 0;
    st[0] = 1; st[6] = 1; st[31] = 1; st[200] = 1;
    sets.length = 0;
    stretch(1);
    assert(sets.includes('t' + T + '_beat_stretch=1'), 'sent ' + JSON.stringify(sets));
    assert(S.clipLength[T][0] === 64, 'length ' + S.clipLength[T][0]);
    assert(st[0] === 1 && st[12] === 1 && st[62] === 1 && st[6] === 0 && st[31] === 0,
        'not stretched: ' + [0, 6, 12, 31, 62].map((i) => i + '=' + st[i]).join(' '));
});

step('⭐ Beat Stretch x2 is not sent on a late loop (refused), nor when the doubled loop would pass step 256', () => {
    S.clipLength[T][0] = 100; S.clipLoopStart[T][0] = 64;
    sets.length = 0;
    stretch(1);
    assert(!sets.some((x) => /_beat_stretch=/.test(x)), 'sent ' + JSON.stringify(sets));
    assert(S.clipLength[T][0] === 100, 'length ' + S.clipLength[T][0]);
    S.clipLength[T][0] = 200; S.clipLoopStart[T][0] = 0;   /* at step 1, 2 x 200 does not fit */
    stretch(1);
    assert(!sets.some((x) => /_beat_stretch=/.test(x)), 'sent a stretch past 256: ' + JSON.stringify(sets));
    S.clipLength[T][0] = 100;                         /* CONTROL: 2 x 100 fits */
    stretch(1);
    assert(sets.includes('t' + T + '_beat_stretch=1'), 'the control did not fire: ' + JSON.stringify(sets));
});

step('⭐ a drum lane: Stretch x2 is not sent when its doubled loop would pass step 256', () => {
    S.trackPadMode[T] = C.PAD_MODE_DRUM;
    S.activeBank = 0; S.trackActiveBank[T] = 0;
    S.drumLaneLength[T] = 100; S.drumLaneLoopStart[T] = 64;
    ticks(2);
    sets.length = 0;
    stretch(1);
    assert(!sets.some((x) => /_beat_stretch=/.test(x)), 'sent ' + JSON.stringify(sets));
    S.drumLaneLength[T] = 100; S.drumLaneLoopStart[T] = 0;   /* CONTROL */
    stretch(1);
    assert(sets.some((x) => /^t4_l\d+_beat_stretch=1$/.test(x)), 'the control did not fire: ' + JSON.stringify(sets));
    S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE;
});

/* Shift + K1 on CLIP is Zoom (keep the timing, change the steps). Resolution
 * K1 is index 1 (1/16) here; a turn LEFT goes to index 0 (1/32). */
const zoomDown = () => {
    S.altMode = true;
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 0, 127]));
    const before = sets.length;
    for (let i = 0; i < 60 && !sets.slice(before).some((x) => /_clip_resolution_zoom=/.test(x)); i++) { cc(71, 127); ticks(1); }
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 0, 0])); ticks(1);
    S.altMode = false;
};
step('⭐ Zoom on a loop that starts late is not sent, and says CROP FIRST', () => {
    S.clipLength[T][0] = 32; S.clipLoopStart[T][0] = 16; S.clipTPS[T][0] = 24;
    S.bankParams[T][0][0] = 1;                       /* Res = 1/16 */
    sets.length = 0; S.actionPopupLines = [];
    zoomDown();
    assert(!sets.some((x) => /_clip_resolution_zoom=/.test(x)), 'sent ' + JSON.stringify(sets));
    assert((S.actionPopupLines || []).join(' / ') === 'LOOP NOT AT 1 / CROP FIRST', 'no notice');
    assert(S.clipTPS[T][0] === 24 && S.clipLength[T][0] === 32 && S.clipLoopStart[T][0] === 16, 'the mirror changed');
});
step('CONTROL: Zoom to 1/32 at step 1 doubles the length', () => {
    S.clipLength[T][0] = 32; S.clipLoopStart[T][0] = 0; S.clipTPS[T][0] = 24;
    S.bankParams[T][0][0] = 1;
    sets.length = 0;
    zoomDown();
    assert(sets.includes('t' + T + '_clip_resolution_zoom=0'), 'sent ' + JSON.stringify(sets));
    assert(S.clipTPS[T][0] === 12 && S.clipLength[T][0] === 64 && S.clipLoopStart[T][0] === 0,
        'tps/length/start ' + S.clipTPS[T][0] + '/' + S.clipLength[T][0] + '/' + S.clipLoopStart[T][0]);
});
step('⭐ Zoom is not sent when the scaled window would pass step 256', () => {
    S.clipLength[T][0] = 200; S.clipLoopStart[T][0] = 0; S.clipTPS[T][0] = 24;
    S.bankParams[T][0][0] = 1;
    sets.length = 0;
    zoomDown();
    assert(!sets.some((x) => /_clip_resolution_zoom=/.test(x)), 'sent a zoom that cannot fit: ' + JSON.stringify(sets));
    assert(S.clipLength[T][0] === 200 && S.clipLoopStart[T][0] === 0, 'the mirror changed anyway');
});

step('and nothing was swallowed into the JS error log', () => {
    assert(jsErrors === '', 'seq8-jserr.log got: ' + jsErrors.slice(0, 300));
});

if (failed) process.exit(1);
console.log('test_clock_shift_loop_start: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
