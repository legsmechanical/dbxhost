import './_bulk_get_stub.mjs';
/* tests/js/test_automation_bank_lit.mjs — the AUTOMATION menu's selected lane
 * lights its steps on the step row, blinking white (Josh, 2026-09-10: "when
 * scrolling through automation rows, have any p-locks related to the lane light
 * up on the step sequencer (blinking white)").
 *
 * Performs the GESTURE, end to end: the whole UI (ui.js + onMidiMessageInternal
 * + tick), the real jog click / jog turn / Back, and the step row read back out
 * of the LED packets the painter actually sends — NoteOn, notes 16..31, status
 * byte kept (step ICONS are CCs on the same numbers). → [[led-and-render-observables-lie]]
 *
 * The DSP half (tN_cC_pa_steps) is tests/test_param_auto_steps.c; here the stub
 * answers it the way that test proves the DSP does. */

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
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
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
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
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
const { BANKS, BANK_AUTOMATION, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const { White } = await import('/data/UserData/schwung/shared/constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const ledsMod = await import('../../ui/ui_leds.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true;           /* a blink is a PHASE: a deterministic clock */
S.playing = false;
const T = 0, C = 0;
const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);

/* Every step button that went WHITE over ~1.2 s of ticks (covers both blink
 * phases several times), and every one that was white on EVERY tick (a solid
 * light, not a blink). */
function watch() {
    const whiteEver = new Set(), whiteAlways = new Set();
    for (let i = 0; i < 16; i++) whiteAlways.add(i);
    for (let n = 0; n < 120; n++) {
        S.tickCount++; globalThis.tick();
        for (let i = 0; i < 16; i++) {
            if (leds[16 + i] === White) whiteEver.add(i); else whiteAlways.delete(i);
        }
    }
    return { ever: [...whiteEver].sort((a, b) => a - b), always: [...whiteAlways] };
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* A melodic clip, 16 steps, one page, nothing on it — so the only white a
 * stopped transport can paint on the row is ours. */
function seedMelodic() {
    S.trackPadMode[T] = 0;
    S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
    S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0;
    for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = 0;
    S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
}

LIST = '0 0 1 2 0:synth:cutoff 0\n0 0 1 1 0:synth:voices 0\n';
STEPS = { t0_c0: '0:synth:cutoff 100001\n0:synth:voices 0001\n' };
auto.automationRefreshPresence();
seedMelodic();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;

step('CONTROL: the resting card lights nothing and reads nothing', () => {
    stepReads = 0;
    const w = watch();
    assert(w.ever.length === 0, 'no step should go white on the resting card, got ' + JSON.stringify(w.ever));
    assert(stepReads === 0, 'the card must not read the step map, read ' + stepReads);
});

step('⭐ the menu cursor on a lane BLINKS that lane\'s steps white — exactly those steps', () => {
    click();                                        /* card -> menu, cursor on row 0 */
    assert(S.autoBank && S.autoBank.menu && S.autoBank.sel === 0, 'setup: the menu opened on row 0');
    const w = watch();
    assert(eq(w.ever, [0, 5]), 'Syn>Cutoff sorts first: steps 0 and 5, got ' + JSON.stringify(w.ever));
    assert(w.always.length === 0, 'a BLINK, not a solid light: ' + JSON.stringify(w.always) + ' never went dark');
    assert(stepReads === 1, 'one read for the clip, got ' + stepReads);
});

step('⭐ scrolling moves the lights to the next lane, with no further read', () => {
    jog(1);
    assert(S.autoBank.sel === 1, 'setup: cursor on row 1');
    const w = watch();
    assert(eq(w.ever, [3]), 'Syn>Voices: step 3 only, got ' + JSON.stringify(w.ever));
    assert(stepReads === 1, 'scrolling is served from the clip\'s one read, got ' + stepReads);
});

step('the Clear clip row lights nothing', () => {
    jog(1);
    assert(S.autoBank.sel === 2, 'setup: cursor on Clear clip');
    assert(watch().ever.length === 0, 'Clear clip is not a lane');
});

step('the ops pop-up keeps its lane lit; Back to the card puts the row out', () => {
    jog(-2); click();                               /* row 0 -> its ops */
    assert(S.autoBank.ops, 'setup: ops open');
    assert(eq(watch().ever, [0, 5]), 'the ops row\'s lane stays lit');
    back(); back();                                 /* ops -> menu -> card */
    assert(!S.autoBank.menu && !S.autoBank.ops, 'setup: back on the card');
    assert(watch().ever.length === 0, 'the card lights nothing again');
});

step('a changed list is re-read once; a FAILED read shows nothing rather than a stale map', () => {
    click();                                        /* menu, row 0 */
    watch();
    const before = stepReads;
    STEPS = { t0_c0: '0:synth:cutoff 0000000001\n0:synth:voices 0001\n' };
    failStepsRead = true;
    auto.automationRefreshPresence();               /* the list changed */
    const w1 = watch();
    assert(w1.ever.length === 0, 'a failed read must not leave the OLD steps lit, got ' + JSON.stringify(w1.ever));
    const tries = stepReads - before;
    assert(tries >= 2 && tries <= 8, 'a failing read retries on a ~500 ms cadence over ~2.5 s, not every tick: ' + tries);
    failStepsRead = false;
    const w2 = watch();
    assert(eq(w2.ever, [9]), 'after a good read: the new step, got ' + JSON.stringify(w2.ever));
    back();
});

step('the second page shows the second page\'s steps', () => {
    S.clipLength[T][C] = 32; S.trackCurrentPage[T] = 1;
    STEPS = { t0_c0: '0:synth:cutoff 1000000000000000010001\n' };
    LIST = '0 0 1 3 0:synth:cutoff 0\n';
    auto.automationRefreshPresence();
    click();
    const w = watch();
    assert(eq(w.ever, [1, 5]), 'steps 17 and 21 are buttons 1 and 5 on page 2, got ' + JSON.stringify(w.ever));
    back();
    seedMelodic();
});

step('a DRUM track lights the same lane on its step row', () => {
    S.trackPadMode[T] = PAD_MODE_DRUM;
    const lane = S.activeDrumLane[T] | 0;
    S.drumLaneSteps[T][lane] = '0'.repeat(256);
    S.drumStepPage[T] = 0; S.drumLaneLength[T] = 16; S.drumLaneLoopStart[T] = 0;
    STEPS = { t0_c0: '0:synth:cutoff 0011\n' };
    LIST = '0 0 1 2 0:synth:cutoff 0\n';
    auto.automationRefreshPresence();
    ledsMod.invalidateLEDCache();
    click();
    const w = watch();
    assert(eq(w.ever, [2, 3]), 'drum row: steps 2 and 3, got ' + JSON.stringify(w.ever));
    back();
    S.trackPadMode[T] = 0;
});

step('leaving the bank puts the row out even with the menu state left behind', () => {
    STEPS = { t0_c0: '0:synth:cutoff 01\n' };
    auto.automationRefreshPresence();               /* a new answer arrives with a new list */
    click();
    assert(eq(watch().ever, [1]), 'setup: lit');
    S.autoBank.menu = true;                         /* as if a walk forgot to reset it */
    S.activeBank = 0; S.trackActiveBank[T] = 0;
    assert(watch().ever.length === 0, 'another bank on screen: nothing lit');
});

if (failed) process.exit(1);
console.log('test_automation_bank_lit: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
