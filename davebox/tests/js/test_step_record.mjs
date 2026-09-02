/* tests/js/test_step_record.mjs — STEP RECORD (SH-101 style) + the Front-4
 * chord shuffle (Josh's rulings, 2026-09-01), end to end through the real
 * dispatch:
 *
 *   - chord shuffle: Live Merge sits on Shift+SAMPLE (its release must not
 *     bake); Shift+RECORD is step record; the merge notice/count-in flow is
 *     otherwise unchanged.
 *   - step record: enter gates (stopped transport, melodic track), pads write
 *     _add at the cursor and still preview, a chord accumulates while held and
 *     advances on the last release, '>' is rest/tie, '<' un-ties or backsteps
 *     ERASING ONLY THIS SESSION'S DATA, the cursor CLAMPS at the clip end,
 *     and every exit route ends the session.
 *   - undo: the session opens with ONE tN_cC_undo_checkpoint — the whole
 *     session is a single undo/redo unit.
 *   - the two gate literals in ui_record.mjs MIRROR seq8.c defines — pinned
 *     here against the C source so a drift fails loudly (the copied-C-constant
 *     trap). */

import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
import { readFileSync } from 'fs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; 
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
/* ⚠⚠ TRIPWIRE: the entry-point wrapper SWALLOWS errors (captureError in ui.js),
 * writing them to seq8-jserr.log — which a stubbed host_write_file drops on the
 * floor. A tick or MIDI dispatch that died on line one then looks exactly like a
 * clean pass, so every "and it survives a tick" assertion below would be vacuous.
 * Fail the run instead: any jserr write is a swallowed exception. */
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.move_midi_inject_to_move = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
/* Button CCs live in the HOST's shared constants (the bundler aliases the
 * device path), not in ui_constants — importing them from the wrong module
 * yields undefined and every gesture silently no-ops. */
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const rec = await import('../../ui/ui_record.mjs');
const await_snd = await import('../../ui/ui_sound.mjs');
const { computePadNoteMap } = await import('../../ui/ui_drummodel.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));

const T = 2;
const AC = () => S.trackActiveClip[T];
computePadNoteMap();
/* A melodic pad with a real pitch, from the REAL map — position-hardcoding a
 * pad index is how pad tests rot. */
let PAD = -1;
for (let i = 0; i < 32; i++) if (S.padNoteMap[i] !== 0xFF) { PAD = i; break; }
if (PAD < 0) throw new Error('fixture: no in-map melodic pad');
const PAD2 = (() => { for (let i = PAD + 1; i < 32; i++) if (S.padNoteMap[i] !== 0xFF) return i; return -1; })();
const pitchOf = (pi) => S.padNoteMap[pi] + S.trackOctave[T] * 12;
const padDn = (pi, v = 100) => note(68 + pi, v);
const padUp = (pi) => note(68 + pi, 0);

/* Ops land on the deferred queue (coalescing); read them there. */
const queued = () => S.pendingDefaultSetParams.map(e => [e.key, String(e.val)]);
const clearQ = () => { S.pendingDefaultSetParams.length = 0; };

function rest() {
    rec.stepRecExit();
    S.playing = false; S.shiftHeld = false; S.recordArmed = false;
    S.dspMergeState = 0; S.mergeNoticePending = false; S.mergeCountingIn = false;
    S.confirmBake = false; S.pendingSceneBakePicker = false;
    S.trackCurrentPage[T] = 0; S.sampleHeld = false; S.sampleUsedAsModifier = false;
    /* Wipe the step mirror: hadBefore reads it, and residue from an earlier
     * step would silently flip a fresh step into an "overdub". */
    S.clipSteps[T][AC()].fill(0);
    S.clipNonEmpty[T][AC()] = false;
    clearQ(); sets.length = 0; S.tickCount += 10;
}

step('⭐ CHORD SHUFFLE: Shift+Sample raises the Live Merge notice — and its release does not bake', () => {
    rest();
    S.shiftHeld = true;
    cc(C.MoveSample, 127);
    if (!S.mergeNoticePending) throw new Error('Shift+Sample did not raise the merge notice');
    cc(C.MoveSample, 0);                     /* release, shift still down */
    if (!S.mergeNoticePending) throw new Error('the chord\'s own release dismissed the notice');
    S.shiftHeld = false;
    if (S.confirmBake || S.pendingSceneBakePicker)
        throw new Error('the shifted Sample release BAKED');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);  /* Back cancels the notice */
    if (S.mergeNoticePending) throw new Error('Back did not cancel the notice');
});

step('⭐ ...shift released FIRST: the unshifted Sample release still does not bake', () => {
    rest();
    S.shiftHeld = true;
    cc(C.MoveSample, 127);
    S.shiftHeld = false;                     /* shift up before sample up */
    cc(C.MoveSample, 0);
    if (S.confirmBake || S.pendingSceneBakePicker)
        throw new Error('unshifted release of a SHIFTED press baked');
    S.mergeNoticePending = false;
    /* control: a genuine plain press+release still bakes */
    cc(C.MoveSample, 127); cc(C.MoveSample, 0);
    if (!S.confirmBake) throw new Error('control: plain Sample no longer bakes');
    S.confirmBake = false;
});

step('⭐ Shift+Record no longer touches the merge — it is STEP RECORD now', () => {
    rest();
    S.shiftHeld = true;
    cc(C.MoveRec, 127); cc(C.MoveRec, 0);
    S.shiftHeld = false;
    if (S.mergeNoticePending) throw new Error('Shift+Record still raises the merge notice');
    if (!S.stepRecActive) throw new Error('Shift+Record did not enter step record');
    if (S.stepRecCursor !== 0) throw new Error('cursor did not start at the visible page');
    const ckpt = queued().filter(([k]) => k === 't' + T + '_c' + AC() + '_undo_checkpoint');
    if (ckpt.length !== 1) throw new Error('entry did not queue exactly one undo checkpoint');
});

step('⭐ entry gates: playing or a drum track declines with a message, silently changing nothing', () => {
    rest();
    S.playing = true; S.shiftHeld = true;
    cc(C.MoveRec, 127); cc(C.MoveRec, 0);
    if (S.stepRecActive) throw new Error('entered while the transport was running');
    S.playing = false;
    const _pm = S.trackPadMode[T];
    S.trackPadMode[T] = C.PAD_MODE_DRUM;
    cc(C.MoveRec, 127); cc(C.MoveRec, 0);
    S.trackPadMode[T] = _pm;
    S.shiftHeld = false;
    if (S.stepRecActive) throw new Error('entered on a drum track');
});

step('⭐ a pad writes _add at the cursor, still previews, and the release advances', () => {
    rest();
    rec.stepRecEnter(); clearQ();
    const p = pitchOf(PAD);
    padDn(PAD);
    const adds = queued().filter(([k]) => k.endsWith('_step_0_add'));
    if (adds.length !== 1 || parseInt(adds[0][1]) !== p)
        throw new Error('press did not queue one _add with the pad\'s pitch: ' + JSON.stringify(adds));
    if (!S.liveActiveNotes.has(p)) throw new Error('the pad no longer previews in step record');
    if (S.clipSteps[T][AC()][0] !== 1) throw new Error('mirror not set');
    if (S.stepRecCursor !== 0) throw new Error('cursor moved before the release');
    padUp(PAD);
    if (S.stepRecCursor !== 1) throw new Error('release did not advance the cursor');
    if (!S.undoAvailable) throw new Error('the first write did not arm undo');
});

step('⭐ a CHORD accumulates while held and advances ONCE on the last release', () => {
    if (PAD2 < 0) throw new Error('fixture: need a second pad');
    rest();
    rec.stepRecEnter(); clearQ();
    padDn(PAD); padDn(PAD2);
    const adds = queued().filter(([k]) => k.endsWith('_step_0_add'));
    if (adds.length !== 2) throw new Error('two presses queued ' + adds.length + ' _add ops');
    padUp(PAD);
    if (S.stepRecCursor !== 0) throw new Error('cursor advanced before the LAST release');
    padUp(PAD2);
    if (S.stepRecCursor !== 1) throw new Error('last release did not advance');
});

step('⭐ TIE: \'>\' with a pad held grows the gate a full step and \'<\' un-ties it', () => {
    rest();
    rec.stepRecEnter(); clearQ();
    padDn(PAD);
    cc(HC.MoveRight, 127); cc(HC.MoveRight, 0);
    let gates = queued().filter(([k]) => k.endsWith('_step_0_gate'));
    if (gates.length !== 1 || parseInt(gates[0][1]) !== 36)
        throw new Error('tie gate wrong: ' + JSON.stringify(gates) + ' (want (2-1)*24+12=36)');
    if (S.stepRecCursor !== 2) throw new Error('tie did not move the cursor past the tied step');
    cc(HC.MoveLeft, 127); cc(HC.MoveLeft, 0);      /* un-tie, symmetric */
    gates = queued().filter(([k]) => k.endsWith('_step_0_gate'));
    if (gates.length !== 2 || parseInt(gates[1][1]) !== 12)
        throw new Error('un-tie did not restore the default gate: ' + JSON.stringify(gates));
    padUp(PAD);
    if (S.stepRecCursor !== 1) throw new Error('release after un-tie should land on step 1');
});

step('⭐ \'>\' bare is a REST; the cursor CLAMPS at the clip\'s last step', () => {
    rest();
    rec.stepRecEnter(); clearQ();
    cc(HC.MoveRight, 127); cc(HC.MoveRight, 0);
    if (S.stepRecCursor !== 1) throw new Error('bare > did not rest-advance');
    if (queued().length) throw new Error('a rest wrote something: ' + JSON.stringify(queued()));
    const len = S.clipLength[T][AC()];
    S.stepRecCursor = len - 1;
    cc(HC.MoveRight, 127); cc(HC.MoveRight, 0);
    if (S.stepRecCursor !== len - 1) throw new Error('cursor did not clamp at the end');
    padDn(PAD); padUp(PAD);
    if (S.stepRecCursor !== len - 1) throw new Error('an entry at the last step must not wrap');
});

step('⭐ \'<\' BACKSTEPS and erases THIS SESSION\'s data only — pre-existing notes survive', () => {
    rest();
    /* Pre-existing note at step 1 (the mirror is what the session reads). */
    S.clipSteps[T][AC()][1] = 1;
    rec.stepRecEnter(); clearQ();
    const p = pitchOf(PAD);
    padDn(PAD); padUp(PAD);                      /* session note at 0 → cursor 1 */
    padDn(PAD); padUp(PAD);                      /* overdub at 1 (hadBefore) → cursor 2 */
    clearQ();
    cc(HC.MoveLeft, 127); cc(HC.MoveLeft, 0);      /* back onto 1: erase OUR pitch only */
    let togg = queued().filter(([k]) => k.endsWith('_step_1_toggle'));
    if (togg.length !== 1 || parseInt(togg[0][1]) !== p)
        throw new Error('backstep did not toggle off exactly the session\'s pitch: ' + JSON.stringify(togg));
    if (S.clipSteps[T][AC()][1] !== 1)
        throw new Error('backstep cleared a step that HAD pre-existing notes');
    if (S.stepRecCursor !== 1) throw new Error('cursor did not land on the erased step');
    clearQ();
    cc(HC.MoveLeft, 127); cc(HC.MoveLeft, 0);      /* back onto 0: fresh step, fully ours */
    togg = queued().filter(([k]) => k.endsWith('_step_0_toggle'));
    if (togg.length !== 1) throw new Error('backstep onto the fresh step queued ' + togg.length + ' toggles');
    if (S.clipSteps[T][AC()][0] !== 0) throw new Error('fresh step mirror not cleared');
    clearQ();
    cc(HC.MoveLeft, 127); cc(HC.MoveLeft, 0);      /* at 0 already: clamp, no ops */
    if (S.stepRecCursor !== 0 || queued().length)
        throw new Error('backstep at step 0 must clamp silently');
    S.clipSteps[T][AC()][1] = 0;
});

step('⭐ a tied entry backsteps one step per press — each \'<\' undoes one \'>\'', () => {
    rest();
    rec.stepRecEnter(); clearQ();
    padDn(PAD);
    cc(HC.MoveRight, 127); cc(HC.MoveRight, 0);    /* tie → span 2 */
    cc(HC.MoveRight, 127); cc(HC.MoveRight, 0);    /* tie → span 3 */
    padUp(PAD);                                  /* cursor = 3 */
    if (S.stepRecCursor !== 3) throw new Error('setup: cursor after double tie = ' + S.stepRecCursor);
    clearQ();
    cc(HC.MoveLeft, 127); cc(HC.MoveLeft, 0);      /* onto 2 = tied tail → un-tie to span 2 */
    let gates = queued().filter(([k]) => k.endsWith('_step_0_gate'));
    if (gates.length !== 1 || parseInt(gates[0][1]) !== 36)
        throw new Error('tail backstep did not un-tie to 36: ' + JSON.stringify(gates));
    if (S.stepRecCursor !== 2) throw new Error('cursor after tail backstep');
});

step('⭐ every exit route ends the session: Back, Play, track switch, view switch, tick belt', () => {
    const enter = () => { rest(); rec.stepRecEnter(); };
    enter(); cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    if (S.stepRecActive) throw new Error('Back did not exit');
    /* ⭐ Bare RECORD leaves the session and must NOT also arm real-time
     * recording (Josh's ruling) — it used to fall through to the arm/punch
     * block and do exactly that, with the session still open underneath. */
    enter(); cc(C.MoveRec, 127); cc(C.MoveRec, 0);
    if (S.stepRecActive) throw new Error('bare Record did not exit');
    if (S.recordArmed) throw new Error('bare Record armed real-time recording instead of only exiting');
    if (S.recordCountingIn) throw new Error('bare Record started a count-in instead of only exiting');
    enter(); cc(HC.MovePlay, 127);
    if (S.stepRecActive) throw new Error('Play did not exit');
    if (!sets.some(([k]) => k === 'transport') &&
        !queued().some(([k]) => k === 'transport'))
        throw new Error('Play was swallowed instead of also starting the transport');
    S.playing = false;
    enter(); S.shiftHeld = true; padDn(3 <= 7 ? 3 : 0); S.shiftHeld = false;  /* Shift+bottom pad = track switch */
    if (S.stepRecActive) throw new Error('a track switch did not exit');
    S.activeTrack = T; computePadNoteMap();
    enter(); S.playing = true; globalThis.tick();
    if (S.stepRecActive) throw new Error('the tick belt did not exit on a running transport');
    S.playing = false;
    rest();
});

step('⭐ Shift+SAMPLE is DECLINED over an open session — no merge can open under step record', () => {
    /* The mirror of the entry gate. Step record runs with the transport
     * STOPPED, which is exactly the condition that raises the Live Merge
     * notice — so without a gate here the notice goes up over the session,
     * a plain Rec then reaches the notice block ABOVE the step-record exit
     * gate, and a merge count-in runs while pads still write steps. Same
     * defect class as the bare-Record fall-through, reached through Sample. */
    rest(); rec.stepRecEnter();
    if (!S.stepRecActive) throw new Error('rig: no session open');
    S.shiftHeld = true; cc(C.MoveSample, 127); cc(C.MoveSample, 0); S.shiftHeld = false;
    if (S.mergeNoticePending)
        throw new Error('Shift+Sample raised the merge notice over an open session');
    if (!S.stepRecActive) throw new Error('Shift+Sample ended the session instead of declining');
    /* and the follow-up Rec must still be the session exit, not a count-in */
    cc(C.MoveRec, 127); cc(C.MoveRec, 0);
    if (S.mergeCountingIn) throw new Error('a merge count-in started under the session');
    if (S.stepRecActive) throw new Error('Record did not exit the session');
    rest();
});

step('⭐ entry DECLINES from behind another screen: sound mode and modal covers', () => {
    /* Review finding, verified: sound mode never consumes CC 86 and the modal
     * set draws over everything — an entry here would open INVISIBLY, burn the
     * one undo checkpoint, and let pads write real steps behind a dialog. */
    rest();
    const snd = await_snd;
    snd.soundEnter(T, T);
    S.shiftHeld = true; cc(C.MoveRec, 127); cc(C.MoveRec, 0); S.shiftHeld = false;
    if (S.stepRecActive) throw new Error('entered behind sound mode');
    snd.soundExit();
    rest();
    S.confirmBake = true;                            /* one of soundModeCovered()'s set */
    S.shiftHeld = true; cc(C.MoveRec, 127); cc(C.MoveRec, 0); S.shiftHeld = false;
    if (S.stepRecActive) throw new Error('entered behind a modal dialog');
    S.confirmBake = false;
});

step('⭐ a TRACK CONVERSION ends the session — pads must not write a re-typed clip', () => {
    /* Review finding: the conduct convert flipped pad mode without exiting,
     * leaving stepRecActive true on a track the eligibility gate forbids. The
     * tick-side convert helpers now stepRecExit() first; pin it at the state
     * level (the full convert path needs the DSP round-trip the rig stubs). */
    rest();
    rec.stepRecEnter();
    if (!S.stepRecActive) throw new Error('setup: not active');
    rec.stepRecExit();                               /* what the converts call */
    if (S.stepRecActive) throw new Error('exit did not clear');
    const js = readFileSync('ui/ui_tick.mjs', 'utf8');
    const cvt = js.indexOf('function convertTrackType');
    const cnd = js.indexOf('function convertTrackToConduct');
    if (cvt < 0 || cnd < 0) throw new Error('pin lost its anchors — fix the pin');
    const cvtBody = js.slice(cvt, js.indexOf('function', cvt + 10));
    const cndBody = js.slice(cnd, js.indexOf('function', cnd + 10));
    if (!cvtBody.includes('stepRecExit()'))
        throw new Error('convertTrackType no longer exits step record');
    if (!cndBody.includes('stepRecExit()'))
        throw new Error('convertTrackToConduct no longer exits step record');
});

step('⭐ the merge NOTICE swallows a PLAIN Sample tap — no bake dialog under it', () => {
    /* Review finding: the unconditional MoveSample exemption let an unshifted
     * Sample tap stack the bake confirm under (track view) or over (session
     * view) the notice. Only the SHIFTED chord passes now. */
    rest();
    S.shiftHeld = true; cc(C.MoveSample, 127); cc(C.MoveSample, 0); S.shiftHeld = false;
    if (!S.mergeNoticePending) throw new Error('setup: no notice');
    cc(C.MoveSample, 127); cc(C.MoveSample, 0);      /* plain tap under the notice */
    if (S.confirmBake || S.pendingSceneBakePicker)
        throw new Error('a plain Sample tap under the notice reached the bake handlers');
    if (!S.mergeNoticePending) throw new Error('the swallowed tap dismissed the notice');
    S.mergeNoticePending = false;
});

step('⭐ the gate literals MIRROR seq8.c — the copied-C-constant pin', () => {
    /* run-one.sh / run.sh execute from the davebox root — read relative to it
     * (import.meta is unavailable in the cjs test bundle). */
    const c  = readFileSync('dsp/seq8.c', 'utf8');
    const js = readFileSync('ui/ui_record.mjs', 'utf8');
    const cTps  = c.match(/#define\s+TICKS_PER_STEP\s+(\d+)/);
    const cGate = c.match(/#define\s+GATE_TICKS\s+(\d+)/);
    const jTps  = js.match(/STEP_REC_RAW_TPS\s*=\s*(\d+)/);
    const jGate = js.match(/STEP_REC_GATE_DEFAULT\s*=\s*(\d+)/);
    if (!cTps || !cGate || !jTps || !jGate)
        throw new Error('pin could not read one of the four constants — fix the pin, not the code');
    if (cTps[1] !== jTps[1] || cGate[1] !== jGate[1])
        throw new Error('JS mirrors drifted from seq8.c: C ' + cTps[1] + '/' + cGate[1] +
                        ' vs JS ' + jTps[1] + '/' + jGate[1]);
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
