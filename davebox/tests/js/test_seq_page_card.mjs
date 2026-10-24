/* tests/js/test_seq_page_card.mjs — Left/Right over a MODULE EDITOR shows the
 * "SEQUENCER PAGE x/n" card (Josh, 2026-10-24: "have a pop-up show when
 * changing sequencer page in a module editor (</> buttons) that says
 * 'Sequencer Page x/x'").
 *
 * The arrows page the sequencer from every track-view screen, but only the
 * overview draws the page bar; over a sound screen the page moved invisibly.
 * Every press here goes through onMidiMessageInternal, so ui.js's steering
 * (sound mode gets first refusal on every CC) is part of what is tested, and
 * the observable is what drawUI PRINTS — the card, not a flag.
 *
 * ⚠ tick() swallows errors, so the jserr tripwire catches a stage that died. */

import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const ENGINE = {
    'synth:module': 'nusaw',
    'synth:cutoff': '0.5',
    'synth:mode': 'Saw',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'mode', name: 'Mode', type: 'enum', options: ['Saw', 'Square', 'Noise'] },
    ]),
    'synth:ui_hierarchy': JSON.stringify({ levels: { root: { name: 'NuSaw',
        params: [{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
                 { key: 'mode', name: 'Mode', type: 'enum', options: ['Saw', 'Square', 'Noise'] }],
        knobs: ['cutoff', 'mode'] } } }),
};
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, val) => { ENGINE[key] = String(val); return 1; };
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.shadow_save_state_now = () => 1;
globalThis.move_midi_external_send = () => {};
globalThis.host_vol_block = () => {};
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 600);
    return true;
};
for (const fn of ['host_read_file', 'host_file_exists', 'host_ensure_dir', 'host_remove_dir',
                  'host_system_cmd', 'host_module_set_param', 'host_module_set_params', 'host_module_get_param',
                  'host_send_midi', 'move_midi_inject_to_move', 'host_set_led', 'set_led',
                  'host_get_setting', 'host_set_setting', 'move_midi_internal_send',
                  'host_edit_cc_block', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_autosave_hold', 'host_register_primary',
                  'host_open_service', 'host_close_service'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
let printed = [];
globalThis.clear_screen = () => {};
globalThis.print = (x, y, t) => { printed.push(String(t)); };
globalThis.pixel_print = () => {};
globalThis.text_width = (t) => String(t).length * 6;
/* Every rect, so the page bar's segments can be found by geometry. */
let rects = [];
globalThis.fill_rect = (x, y, w, h, v) => { rects.push([x, y, w, h, v ? 1 : 0]); };
const drew = (x, y, w, h, v) => rects.some((r) => r[0] === x && r[1] === y && r[2] === w && r[3] === h && r[4] === v);
globalThis.draw_rect = () => {}; globalThis.draw_line = () => {}; globalThis.set_pixel = () => {};
globalThis.stipple_rect = () => {}; globalThis.flush_display = () => {};
globalThis.shadow_get_ui_flags = () => 0; globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const rend = await import('../../ui/ui_render.mjs');
const { effectiveClip } = await import('../../ui/ui_leds.mjs');

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const press = (d1) => { cc(d1, 127); cc(d1, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const LEFT = 62, RIGHT = 63;
const T = 2;
globalThis.__shiftHardware = true;

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
ticks(4);

/* A 4-page clip whose loop window starts on page 2 (steps 16..79): the card
 * must count WINDOW pages (1..4), as the bar does, not absolute ones. */
const ac = effectiveClip(T);
S.clipLoopStart[T][ac] = 16;
S.clipLength[T][ac] = 64;
S.trackCurrentPage[T] = 1;

const card = () => {
    printed = [];
    rend.drawUI();
    const i = printed.indexOf('SEQUENCER PAGE');
    return i < 0 ? null : printed[i + 1];
};

step('control: the track OVERVIEW pages with no card (the page bar is on screen)', () => {
    snd.soundExit(); ticks(2);
    if (snd.soundActive()) throw new Error('rig: a sound screen is up');
    press(RIGHT); ticks(1);
    if (S.trackCurrentPage[T] !== 2) throw new Error('rig: Right did not page, page ' + S.trackCurrentPage[T]);
    const c = card();
    if (c !== null) throw new Error('a card drew on the overview: ' + c);
    press(LEFT); ticks(1);
});

step('open the MODULE EDITOR on the Instrument row', () => {
    snd.soundEnter(T, T); ticks(4);
    if (snd.soundViewForTest() === 18) { snd.soundShowMenu(); ticks(3); }   /* MIX has no door */
    const gen = snd.soundPickStateForTest().kinds.indexOf('trackto');
    if (gen < 0) throw new Error('rig: no Instrument row in ' + JSON.stringify(snd.soundPickStateForTest().kinds));
    for (let g = 0; g < 20 && snd.soundPickStateForTest().row !== gen; g++) {
        cc(14, snd.soundPickStateForTest().row > gen ? 127 : 1); ticks(1);
    }
    cc(3, 127); cc(3, 0); ticks(8);
    if (!snd.soundPPForTest().on) throw new Error('rig: the editor never came up (view ' + snd.soundViewForTest() + ')');
});

step('Right in the editor pages the sequencer AND shows "SEQUENCER PAGE 2/4"', () => {
    if (S.trackCurrentPage[T] !== 1) throw new Error('rig: start page ' + S.trackCurrentPage[T]);
    press(RIGHT); ticks(1);
    if (S.trackCurrentPage[T] !== 2) throw new Error('Right did not reach the pager from the editor: page ' + S.trackCurrentPage[T]);
    if (!snd.soundPPForTest().on) throw new Error('the press left the editor');
    const c = card();
    if (c !== '2/4') throw new Error('card reads ' + JSON.stringify(c) + ', expected "2/4"');
});

step('Left back to the window start reads 1/4; again at the edge still reads 1/4', () => {
    press(LEFT); ticks(1);
    if (card() !== '1/4') throw new Error('card reads ' + JSON.stringify(card()));
    press(LEFT); ticks(1);
    if (S.trackCurrentPage[T] !== 1) throw new Error('paged out of the loop window: ' + S.trackCurrentPage[T]);
    if (card() !== '1/4') throw new Error('edge press: card reads ' + JSON.stringify(card()));
});

step('the card goes when its window ends', () => {
    /* The tick-driven clock (nowMs follows S.tickCount), so time is the
     * rig's to move; 120 ticks is well past the card's window. */
    S.clockFollowTicks = true;
    press(RIGHT); ticks(1);
    if (card() !== '2/4') throw new Error('rig: no card to expire, reads ' + JSON.stringify(card()));
    ticks(120);
    printed = []; rend.drawUI();
    if (printed.indexOf('SEQUENCER PAGE') >= 0) throw new Error('card still drawn after its window');
});

/* ---- MOCKUP B: while the transport runs, the editor's footer IS the page bar.
 * The window is 4 pages (steps 16..79), so each segment is 29 px wide from
 * x = 4 + page * 30, in rows 58..61 (MV_FOOTER_Y + 1, 4 high). */
const SEG = (p) => 4 + p * 30;
const play = (on, step) => {
    S.playing = on; S.trackClipPlaying[T] = on;
    if (step != null) S.trackCurrentStep[T] = step;
    S.followPaused = true;            /* the view page is the test's, not Seq Follow's */
};
const frame = () => { rects = []; printed = []; rend.drawUI(); };

step('B: PLAYING, the editor footer is the page bar — viewed page solid, the band cleared', () => {
    S.clockFollowTicks = false;
    S.trackCurrentPage[T] = 2;        /* window page 2 of 4 (index 1) */
    play(true, 56);                   /* window step 40: page 3 playing */
    if (!snd.soundPageBarShown()) throw new Error('soundPageBarShown() is false while playing on the editor');
    frame();
    if (!drew(0, 57, 128, 7, 0)) throw new Error('the footer band was not cleared');
    if (!drew(SEG(1), 58, 29, 4, 1)) throw new Error('no solid segment for the viewed page at x ' + SEG(1));
    if (!drew(78, 58, 1, 4, 1)) throw new Error('no playhead tick at x 78 (step 56)');
});

step('B: STOPPED, the hints are back and no bar is drawn', () => {
    play(false);
    if (snd.soundPageBarShown()) throw new Error('soundPageBarShown() is true while stopped');
    frame();
    if (drew(SEG(1), 58, 29, 4, 1)) throw new Error('the bar drew while stopped');
    if (drew(0, 57, 128, 7, 0)) throw new Error('the footer band was cleared while stopped');
});

step('B: while the bar shows, an arrow pages with NO card (the bar shows the move)', () => {
    play(true, 56);
    S.actionPopupEndTick = -1;
    press(LEFT);
    if (S.trackCurrentPage[T] !== 1) throw new Error('Left did not page: ' + S.trackCurrentPage[T]);
    play(true);
    frame();
    if (printed.indexOf('SEQUENCER PAGE') >= 0) throw new Error('the card drew over the bar');
    if (!drew(SEG(0), 58, 29, 4, 1)) throw new Error('the bar did not move to page 1');
});

step('B: the editor REDRAWS when the playhead moves (it is not redrawn every tick)', () => {
    play(true, 56); ticks(2);
    play(true, 60);
    rects = [];
    ticks(1);
    if (!drew(85, 58, 1, 4, 1)) throw new Error('the tick did not redraw the bar at the new playhead (x 85)');
});

step('B: the enum PEEK (turn an enum knob) covers the page — the bar stands down', () => {
    play(true, 56);
    if (!snd.soundPageBarShown()) throw new Error('rig: bar not up');
    cc(72, 1);                        /* knob 2 = Mode, one detent */
    play(true);
    if (snd.soundPageBarShown()) throw new Error('soundPageBarShown() stayed true with the peek up');
    frame();
    if (drew(SEG(0), 58, 29, 4, 1)) throw new Error('the bar drew over the peek');
    if (!printed.some((t) => /square/i.test(t)))
        throw new Error('rig: no peek on screen (printed ' + JSON.stringify(printed.slice(0, 8)) + ')');
});

step('a DRUM track counts its lane window', () => {
    S.clockFollowTicks = false;
    play(false);
    S.trackPadMode[T] = PAD_MODE_DRUM;
    S.drumLaneLoopStart[T] = 0;
    S.drumLaneLength[T] = 32;
    S.drumStepPage[T] = 0;
    press(RIGHT); ticks(1);
    if (S.drumStepPage[T] !== 1) throw new Error('drum page ' + S.drumStepPage[T]);
    if (snd.soundActive() && card() !== '2/2') throw new Error('card reads ' + JSON.stringify(card()));
    if (!snd.soundActive()) throw new Error('rig: the pad-mode change closed sound mode — the drum case proves nothing');
    S.trackPadMode[T] = 0;
});

if (swallowed) bad('tripwire', 'a stage threw and tick swallowed it: ' + swallowed);
if (failed) process.exit(1);
console.log('test_seq_page_card: PASS');
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
