import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_knob_alt_flip.mjs — SINGLE-KNOB ALTS flip on touch + click
 * (Josh, 2026-10-03: "switch those params through knob-touch+click and have
 * them display like other knob touch click params"; and of Back: "it should
 * flip back").
 *
 * Performed through the real input path (knob touch notes 0-7, jog click CC
 * 3, knob turns CC 71-78, Back CC 51, jog turn CC 14): touch a knob that has
 * an alt and click — that knob alone flips, the footer says what a click
 * switches to, the screen changes, and the turn writes the alt's DSP key. A
 * plain click flips nothing; the triggers (Legato, Crop, Import) still fire;
 * Back flips back; leaving the bank resets. RPT GROOVE and Arp Steps keep the
 * plain click (page alts).
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step ' + label);
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === ((phase || 0) & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

const slotSets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push(k + "=" + v); };
const _dec = (blob) => { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; };
globalThis.host_module_set_params = (b) => { const it = _dec(b); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
let LIST = '';
const knobLed = {};                  /* knob ring CC (71-78) -> colour */
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST : ''); globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = (slot, k, v) => { slotSets.push(k); return 1; };
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m); if (a.length >= 4 && (a[1] & 0xF0) === 0xB0 && a[2] >= 71 && a[2] <= 78) knobLed[a[2]] = a[3]; return true; }; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const await_auto = await import('../../ui/ui_automation.mjs');
const leds = await import('../../ui/ui_leds.mjs');
const K = await import('/data/UserData/schwung/shared/constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
const tick = () => { S.tickCount++; globalThis.tick(); snd.soundTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
const touch = (k) => { midi(0x90, k, 127); ticks(1); };
const untouch = (k) => { midi(0x90, k, 0); ticks(1); };
const touchClick = (k) => { touch(k); click(); untouch(k); };
/* A whole turn: touch, 40 detents, release — enough for any knob's sensitivity. */
const turn = (k, d) => { touch(k); for (let i = 0; i < 40; i++) { cc(71 + k, d > 0 ? 1 : 127); ticks(1); } untouch(k); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const same = (a, b) => a.every((v, i) => v === b[i]);
const toBank = (b) => { S.activeBank = b; S.trackActiveBank[S.activeTrack] = b; ticks(4); };
const latch = (b) => { S.bankCardLatched = false; S.knobAlt = 0; S.altMode = false; toBank(b); click(); };
const wrote = (re) => sets.some((x) => re.test(x));
const hints = (b) => JSON.stringify(render.bankPageHints(b));

step('⭐ CLIP K1: the touch says CLK ZOOM; touch + click flips K1 alone, the card changes, the turn zooms', () => {
    latch(0);
    assert(S.bankCardLatched, 'setup: the card did not latch');
    touch(0);
    assert(hints(0) === JSON.stringify([['CLK', 'ZOOM']]), 'touched K1 hints ' + hints(0));
    const before = frame();
    click();
    assert(S.knobAlt === 1 && !S.altMode, 'knobAlt ' + S.knobAlt + ' altMode ' + S.altMode);
    assert(hints(0) === JSON.stringify([['CLK', 'RES']]), 'flipped K1 hints ' + hints(0));
    assert(!same(before, frame()), 'the screen did not change');
    untouch(0);
    sets.length = 0; turn(0, 1);
    assert(wrote(/^t2_clip_resolution_zoom=/) && !wrote(/^t2_clip_resolution=/), 'K1 turn wrote ' + JSON.stringify(sets.slice(0, 6)));
});

step('…the other knobs are untouched: K3 still turns Clock Shift, and its touch offers NUDGE', () => {
    touch(2);
    assert(hints(0) === JSON.stringify([['CLK', 'NUDGE']]), 'K3 hints ' + hints(0));
    untouch(2);
    sets.length = 0; turn(2, 1);
    assert(wrote(/^t2_clock_shift=/) && !wrote(/^t2_nudge=[^0]/), 'K3 turn wrote ' + JSON.stringify(sets.slice(0, 6)));
});

step('a plain click with no knob touched flips nothing', () => {
    click();
    assert(S.knobAlt === 1 && !S.altMode, 'knobAlt ' + S.knobAlt + ' altMode ' + S.altMode);
});

step('CLIP K3 and K7 flip too: Nudge and Reverse Style', () => {
    touchClick(2);
    assert(S.knobAlt === (1 | 4), 'K3: knobAlt ' + S.knobAlt);
    sets.length = 0; turn(2, 1);
    assert(wrote(/^t2_nudge=/) && !wrote(/^t2_clock_shift=/), 'flipped K3 wrote ' + JSON.stringify(sets.slice(0, 6)));
    touchClick(6);
    assert(S.knobAlt === (1 | 4 | 64), 'K7: knobAlt ' + S.knobAlt);
    sets.length = 0; turn(6, 1);
    assert(wrote(/^t2_clip_playback_audio_reverse=/), 'flipped K7 wrote ' + JSON.stringify(sets.slice(0, 6)));
});

step('⭐ the triggers still fire on touch + click and never flip: Legato, Crop', () => {
    const was = S.knobAlt;
    sets.length = 0;
    touchClick(C.LGTO_KNOB);
    touchClick(C.CROP_KNOB);
    assert(S.knobAlt === was, 'a trigger flipped a knob: ' + S.knobAlt);
    assert(wrote(/lgto_apply=/) || S.actionPopupLines.length > 0, 'Legato did nothing: ' + JSON.stringify(sets.slice(0, 6)));
});

step('⭐ Back flips every flipped knob back, then unlatches', () => {
    back();
    assert(S.knobAlt === 0 && S.bankCardLatched, 'first Back: knobAlt ' + S.knobAlt + ' latched ' + S.bankCardLatched);
    back();
    assert(!S.bankCardLatched, 'second Back did not unlatch');
});

step('⭐ DELAY K1 flips to Clock Feedback: the turn writes it and automation targets it', () => {
    latch(3);
    touchClick(0);
    assert(S.knobAlt === 1, 'knobAlt ' + S.knobAlt);
    assert(C.seqAutoTargetForKnob(2, 3, 0, S.knobAlt & 1) === 'seq:2:delay_clock_fb', 'target');
    sets.length = 0; turn(0, 1);
    assert(wrote(/^t2_delay_clock_fb=/) && !wrote(/^t2_delay_time=/), 'K1 turn wrote ' + JSON.stringify(sets.slice(0, 6)));
    touchClick(7);
    sets.length = 0; turn(7, 1);
    assert(wrote(/^t2_delay_pitch_random_mode=/), 'DELAY K8 Algo wrote ' + JSON.stringify(sets.slice(0, 6)));
});

step('⭐⭐ the PATH: a flipped DELAY K1 is Clock Feedback\'s automation — Delete lights its ring, Delete + touch clears it', () => {
    const auto = await_auto;
    const clip = leds.effectiveClip(2);
    LIST = '2 ' + clip + ' 1 4 seq:2:delay_clock_fb\n';      /* a lane on Clock Feedback only */
    auto.automationRefreshPresence();
    assert(auto.automationStateFor(2, clip, 'seq:2:delay_clock_fb'), 'setup: no lane');
    assert(S.knobAlt & 1, 'setup: K1 not flipped');
    S._forceKnobReemit = true;
    cc(119, 127); ticks(2);                              /* hold Delete: rings show automation state */
    leds.updateTrackLEDs();                              /* the LED frame (the tick paints on its own cadence) */
    assert(knobLed[71] === K.Red, 'flipped K1 ring under Delete: ' + knobLed[71]);
    sets.length = 0; S.actionPopupLines = [];
    touch(0);                                            /* Delete + touch the flipped K1 */
    untouch(0);
    cc(119, 0); ticks(2);
    assert(auto.automationStateFor(2, clip, 'seq:2:delay_clock_fb') === null,
           'Delete + touch did not clear Clock Feedback\'s lane');
    assert(S.actionPopupLines.join(' ') === 'AUTOMATION CLEARED', 'notice: ' + S.actionPopupLines);
    /* CONTROL: K1 back on Rate (no lane) — the ring is dark under Delete. */
    LIST = '2 ' + clip + ' 1 4 seq:2:delay_clock_fb\n'; auto.automationRefreshPresence();
    touchClick(0);
    assert(!(S.knobAlt & 1), 'setup: K1 did not flip back');
    S._forceKnobReemit = true;
    cc(119, 127); ticks(2);
    leds.updateTrackLEDs();
    assert((knobLed[71] | 0) === 0, 'unflipped K1 (Rate, no lane) ring under Delete: ' + knobLed[71]);
    cc(119, 0); ticks(2);
    LIST = ''; auto.automationRefreshPresence();
});

step('NOTE FX K8 flips to Algo', () => {
    latch(1);
    touch(7);
    assert(hints(1) === JSON.stringify([['CLK', 'ALGO']]), 'hints ' + hints(1));
    click(); untouch(7);
    assert(S.knobAlt === 1 << 7, 'knobAlt ' + S.knobAlt);
    sets.length = 0; turn(7, 1);
    assert(wrote(/^t2_noteFX_random_mode=/), 'K8 turn wrote ' + JSON.stringify(sets.slice(0, 6)));
});

step('⭐ leaving the bank resets: a jog walk, and a track change', () => {
    assert(S.knobAlt !== 0, 'setup');
    cc(14, 1); ticks(3); frame();   /* the reset is the render diff guard, run every tick on the device */
    assert(S.activeBank !== 1 && S.knobAlt === 0, 'walk: bank ' + S.activeBank + ' knobAlt ' + S.knobAlt);
    latch(1); touchClick(7);
    assert(S.knobAlt === 1 << 7, 'setup 2');
    cc(49, 127); cc(14, 1); ticks(2); cc(49, 0); ticks(3); frame();
    assert(S.activeTrack === 3 && S.knobAlt === 0, 'track change: track ' + S.activeTrack + ' knobAlt ' + S.knobAlt);
    S.activeTrack = 2; ticks(2);
});

step('⭐ DRUM LANE K1 / K3 / K7 flip to Zoom, Nudge, Reverse Style', () => {
    S.trackPadMode[2] = C.PAD_MODE_DRUM;
    latch(0);
    const lane = S.activeDrumLane[2] | 0;
    S.drumLaneLoopStart[2] = 0;
    touchClick(0); touchClick(2); touchClick(6);
    assert(S.knobAlt === (1 | 4 | 64), 'knobAlt ' + S.knobAlt);
    sets.length = 0; turn(0, -1);
    assert(wrote(new RegExp('^t2_l' + lane + '_clip_resolution_zoom=')), 'K1 wrote ' + JSON.stringify(sets.slice(0, 6)));
    sets.length = 0; turn(2, 1);
    assert(wrote(new RegExp('^t2_l' + lane + '_nudge=')), 'K3 wrote ' + JSON.stringify(sets.slice(0, 6)));
    sets.length = 0; turn(6, 1);
    assert(wrote(new RegExp('^t2_l' + lane + '_playback_audio_reverse=')), 'K7 wrote ' + JSON.stringify(sets.slice(0, 6)));
});

step('⭐ RPT GROOVE keeps the PAGE alt on the plain click, with CLK ALT', () => {
    latch(5);
    assert(render.bankPageHints(5).some((h) => h[0] === 'CLK' && h[1] === 'ALT'), 'hints ' + hints(5));
    click();
    assert(S.altMode && S.knobAlt === 0, 'altMode ' + S.altMode + ' knobAlt ' + S.knobAlt);
    back();
    assert(!S.altMode, 'Back did not clear the page');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE;
});

step('SEQ ARP keeps CLK STEP; CLIP no longer offers CLK ALT', () => {
    latch(4);
    assert(render.bankPageHints(4).some((h) => h[0] === 'CLK' && h[1] === 'STEP'), 'SEQ ARP hints ' + hints(4));
    latch(0);
    assert(!render.bankPageHints(0).some((h) => h[0] === 'CLK'), 'CLIP untouched hints ' + hints(0));
});

if (failed) process.exit(1);
console.log('test_knob_alt_flip: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
