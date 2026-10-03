import './_bulk_get_stub.mjs';
/* tests/js/test_crop.mjs — Crop, and the transforms it unblocks.
 *
 * Josh, 2026-09-27: "expose crop as an item on the clip/lanes banks. and refuse
 * transforms when loop start isn't at one and direct them to crop." — and "i
 * don't think velin earns its keep on all lanes" (ALL LANES K5 becomes Crop;
 * VelIn stays on TRACK CONFIG and Shift + Step 10) — and "these should require
 * clip start at 1 too for consistency": EVERY clip transform (Shift, Nudge,
 * Stretch both ways, Legato, Zoom) is refused off step 1.
 *
 * Performed through the real gestures: a knob TOUCH is a note on/off of its
 * index, a TURN is CC 71+k detent by detent with ticks between (the pick
 * accumulator), and the jog CLICK is CC 3. */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

let jsErrors = '';
const sets = [];
let offGrid = '0';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = (path, body) => { if (/jserr/.test(String(path))) jsErrors = String(body); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    if (/^t\d+_lanes_off_grid$/.test(k)) return offGrid;
    if (/^t\d+_(c\d+|l\d+)_(steps|length|tps|loop_start)$/.test(k)) return null;
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
const { bankPageHints } = await import('../../ui/ui_render.mjs');

const T = 4;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const touch = (k) => midi(0x90, k, 127);
const untouch = (k) => { midi(0x90, k, 0); ticks(1); };
const click = () => { cc(3, 127); cc(3, 0); };
/* Turn knob k one way until `stop` sees what it wants (or 40 detents). */
const turn = (k, d, stop) => {
    const before = sets.length;
    for (let i = 0; i < 40; i++) {
        cc(71 + k, d > 0 ? 1 : 127);
        if (stop && stop(sets.slice(before))) return true;
        ticks(1);
    }
    return false;
};
const lines = () => (S.actionPopupLines || []).join(' / ');
/* A shift or nudge that MOVES something. `nudge=0` is the counter reset sent
 * when the knob is released — bookkeeping, not a transform. */
const moved = (x) => /_clock_shift=|_nudge=-?[1-9]/.test(x);
const clearPopup = () => { S.actionPopupLines = []; S.actionPopupEndTick = -1; };
const toBank = (b) => { S.activeBank = b; S.trackActiveBank[T] = b; };
toBank(0); S.trackActiveClip[T] = 0;
ticks(2);

const setupClip = (ls, len) => {
    S.clipLength[T][0] = len; S.clipLoopStart[T][0] = ls; S.clipTPS[T][0] = 24;
    const st = S.clipSteps[T][0];
    for (let i = 0; i < st.length; i++) st[i] = 0;
    st[3] = 1; st[ls + 6] = 1; st[ls + len - 1] = 2; st[200] = 1;
};

step('setup: CLIP K6 and ALL LANES K5 are Crop', () => {
    assert(C.CROP_KNOB === 5 && C.ALL_LANES_CROP_KNOB === 4, 'knob constants');
    assert(C.BANKS[0].knobs[C.CROP_KNOB].dspKey === 'crop', 'CLIP K6 is ' + C.BANKS[0].knobs[5].dspKey);
    assert(C.BANKS[7].knobs[C.ALL_LANES_CROP_KNOB].dspKey === 'crop', 'ALL LANES K5 is ' + C.BANKS[7].knobs[4].dspKey);
});

step('CLIP K6: a turn sends nothing', () => {
    setupClip(64, 64);
    sets.length = 0;
    touch(5);
    turn(5, 1); turn(5, -1);
    untouch(5);
    assert(sets.length === 0, 'a turn sent ' + JSON.stringify(sets));
});

step('⭐ CLIP K6: touching it says CLK CROP', () => {
    touch(5); ticks(1);
    const h = bankPageHints(0);
    assert(JSON.stringify(h) === JSON.stringify([['CLK', 'CROP']]), 'hints ' + JSON.stringify(h));
    untouch(5);
});

step('⭐⭐ THE GESTURE: touch CLIP K6 + click sends ONE t4_crop=1 and moves the loop to step 1', () => {
    setupClip(64, 64);
    sets.length = 0;
    touch(5); click();
    const crops = sets.filter((x) => /_crop=/.test(x));
    assert(crops.length === 1 && crops[0] === 't' + T + '_crop=1', 'sent ' + JSON.stringify(sets));
    const st = S.clipSteps[T][0];
    assert(st[6] === 1 && st[63] === 2, 'the window did not move to step 1: [6]=' + st[6] + ' [63]=' + st[63]);
    assert(st[3] === 0 && st[200] === 0 && st[70] === 0, 'something outside the window survived');
    assert(S.clipLoopStart[T][0] === 0 && S.clipLength[T][0] === 64, 'window ' + S.clipLoopStart[T][0] + '+' + S.clipLength[T][0]);
    assert(S.trackCurrentPage[T] === 0, 'page ' + S.trackCurrentPage[T]);
    assert(S.pendingStepsReread > 0 && S.pendingStepsRereadTrack === T && S.pendingStepsRereadClip === 0, 'no re-read armed');
    assert(lines() === 'CROPPED', 'popup ' + lines());
    untouch(5);
});

step('⭐ nothing to crop: says NOTHING TO / CROP and sends nothing', () => {
    setupClip(0, 16);
    S.clipSteps[T][0][200] = 0;
    clearPopup(); sets.length = 0;
    touch(5); click();
    assert(!sets.some((x) => /_crop=/.test(x)), 'sent ' + JSON.stringify(sets));
    assert(lines() === 'NOTHING TO / CROP', 'popup ' + lines());
    untouch(5);
});

step('...but a note past the loop end IS something to crop', () => {
    setupClip(0, 16);
    sets.length = 0;
    touch(5); click();
    assert(sets.includes('t' + T + '_crop=1'), 'sent ' + JSON.stringify(sets));
    assert(S.clipSteps[T][0][200] === 0, 'the mirror kept step 200');
    untouch(5);
});

/* ---- refusals: melodic -------------------------------------------------- */
step('⭐ loop not at 1: CLIP K3 (Clock Shift) sends nothing and says LOOP STARTS AFTER STEP 1 / CROP FIRST', () => {
    setupClip(16, 32);
    clearPopup(); sets.length = 0;
    touch(2); turn(2, 1); untouch(2);
    assert(!sets.some(moved), 'sent ' + JSON.stringify(sets));
    assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
});
step('⭐ loop not at 1: Shift + K3 (Nudge) sends nothing and says so', () => {
    clearPopup(); sets.length = 0;
    S.altMode = true;
    touch(2); turn(2, -1); untouch(2);
    S.altMode = false;
    assert(!sets.some(moved), 'sent ' + JSON.stringify(sets));
    assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
});
step('⭐ loop not at 1: K2 (Stretch) sends nothing either way and says so', () => {
    for (const d of [1, -1]) {
        clearPopup(); sets.length = 0;
        touch(1); turn(1, d); untouch(1);
        assert(!sets.some((x) => /_beat_stretch=/.test(x)), 'stretch ' + d + ' sent ' + JSON.stringify(sets));
        assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
        assert(S.clipLength[T][0] === 32, 'length changed: ' + S.clipLength[T][0]);
    }
});
step('⭐ loop not at 1: touch K4 (Legato) + click sends nothing and says so', () => {
    clearPopup(); sets.length = 0;
    touch(C.LGTO_KNOB); click(); untouch(C.LGTO_KNOB);
    assert(!sets.some((x) => /lgto_apply=/.test(x)), 'sent ' + JSON.stringify(sets));
    assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
});
step('⭐ loop not at 1: Shift + K1 (Zoom) sends nothing and says so', () => {
    clearPopup(); sets.length = 0;
    S.bankParams[T][0][0] = 1;
    S.altMode = true;
    touch(0); turn(0, -1); untouch(0);
    S.altMode = false;
    assert(!sets.some((x) => /_clip_resolution/.test(x)), 'sent ' + JSON.stringify(sets));
    assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
    assert(S.clipTPS[T][0] === 24 && S.clipLoopStart[T][0] === 16, 'the mirror changed');
});
step('after a Crop, K3 sends Clock Shift again', () => {
    setupClip(16, 32);
    touch(5); click(); untouch(5);
    sets.length = 0;
    touch(2);
    const fired = turn(2, 1, (s) => s.some((x) => /_clock_shift=/.test(x)));
    untouch(2);
    assert(fired && sets.includes('t' + T + '_clock_shift=1'), 'sent ' + JSON.stringify(sets));
    sets.length = 0;
    touch(C.LGTO_KNOB); click(); untouch(C.LGTO_KNOB);
    assert(sets.includes('t' + T + '_lgto_apply=1'), 'Legato not sent after crop: ' + JSON.stringify(sets));
});

/* ---- DRUM LANE --------------------------------------------------------- */
step('⭐ DRUM LANE K6: touch + click sends t4_lL_crop=1 and moves the lane loop to step 1', () => {
    S.trackPadMode[T] = C.PAD_MODE_DRUM;
    toBank(0);
    S.activeDrumLane[T] = 2;
    S.drumLaneLength[T] = 16; S.drumLaneLoopStart[T] = 32; S.drumStepPage[T] = 2;
    ticks(2);
    sets.length = 0;
    touch(5); click(); untouch(5);
    assert(sets.includes('t' + T + '_l2_crop=1'), 'sent ' + JSON.stringify(sets));
    assert(sets.filter((x) => /_crop=/.test(x)).length === 1, 'more than one crop: ' + JSON.stringify(sets));
    assert(S.drumLaneLoopStart[T] === 0 && S.drumStepPage[T] === 0, 'mirror ' + S.drumLaneLoopStart[T] + ' p' + S.drumStepPage[T]);
    assert(S.pendingDrumLaneResync > 0 && S.pendingDrumLaneResyncLane === 2, 'no lane re-read armed');
});
step('DRUM LANE K6: a turn sends nothing', () => {
    sets.length = 0;
    touch(5); turn(5, 1); turn(5, -1); untouch(5);
    assert(sets.length === 0, 'sent ' + JSON.stringify(sets));
});
step('⭐ DRUM LANE, loop not at 1: K3, K2 both ways, Legato and Zoom are refused', () => {
    S.drumLaneLength[T] = 16; S.drumLaneLoopStart[T] = 32;
    const refusedBy = (label, gesture, re) => {
        clearPopup(); sets.length = 0;
        gesture();
        assert(!sets.some((x) => re.test(x)), label + ' sent ' + JSON.stringify(sets));
        assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', label + ' popup ' + lines());
    };
    refusedBy('K3', () => { touch(2); turn(2, 1); untouch(2); }, /_clock_shift=|_nudge=-?[1-9]/);
    refusedBy('K2 right', () => { touch(1); turn(1, 1); untouch(1); }, /_beat_stretch=/);
    refusedBy('K2 left', () => { touch(1); turn(1, -1); untouch(1); }, /_beat_stretch=/);
    refusedBy('Legato', () => { touch(C.LGTO_KNOB); click(); untouch(C.LGTO_KNOB); }, /lgto_apply=/);
    refusedBy('Zoom', () => { S.altMode = true; touch(0); turn(0, -1); untouch(0); S.altMode = false; },
              /_clip_resolution/);
});

/* ---- ALL LANES --------------------------------------------------------- */
step('⭐ ALL LANES: the first touch K5 + click sends t4_all_lanes_crop=1 (no confirm)', () => {
    toBank(7);
    ticks(1);
    sets.length = 0;
    touch(4);
    const h = bankPageHints(7);
    assert(JSON.stringify(h) === JSON.stringify([['CLK', 'CROP']]), 'hints ' + JSON.stringify(h));
    click(); untouch(4);
    const crops = sets.filter((x) => /_crop=/.test(x));
    assert(crops.length === 1 && crops[0] === 't' + T + '_all_lanes_crop=1', 'sent ' + JSON.stringify(sets));
    assert(S.pendingDrumResync > 0 && S.pendingDrumResyncTrack === T, 'no drum re-read armed');
});
step('ALL LANES K5: turning it never writes VelIn', () => {
    sets.length = 0;
    const tvo = S.trackVelOverride[T];
    touch(4); turn(4, 1); turn(4, -1); untouch(4);
    assert(!sets.some((x) => /track_vel_override|_tvo/.test(x)), 'wrote VelIn: ' + JSON.stringify(sets));
    assert(sets.length === 0, 'sent ' + JSON.stringify(sets));
    assert(S.trackVelOverride[T] === tvo, 'VelIn mirror changed');
});
step('⭐ ALL LANES, a lane off step 1: K3 and K2 (both ways) are refused', () => {
    offGrid = '2';
    clearPopup(); sets.length = 0;
    touch(2); turn(2, 1); untouch(2);
    assert(!sets.some((x) => /all_lanes_(clock_shift=|nudge=-?[1-9])/.test(x)), 'K3 sent ' + JSON.stringify(sets));
    assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
    for (const d of [1, -1]) {
        clearPopup();
        touch(1); turn(1, d); untouch(1);
        assert(!sets.some((x) => /all_lanes_beat_stretch=/.test(x)), 'K2 ' + d + ' sent ' + JSON.stringify(sets));
        assert(lines() === 'LOOP STARTS AFTER / STEP 1 / CROP FIRST', 'popup ' + lines());
    }
});
step('CONTROL: no lane off step 1, ALL LANES K3 sends', () => {
    offGrid = '0';
    sets.length = 0;
    touch(2);
    const fired = turn(2, 1, (s) => s.some((x) => /all_lanes_clock_shift=/.test(x)));
    untouch(2);
    assert(fired && sets.includes('t' + T + '_all_lanes_clock_shift=1'), 'sent ' + JSON.stringify(sets));
    S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE;
    toBank(0);
});

step('and nothing was swallowed into the JS error log', () => {
    assert(jsErrors === '', 'seq8-jserr.log got: ' + jsErrors.slice(0, 300));
});

if (failed) process.exit(1);
console.log('test_crop: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
