/* ui_audio_editor.mjs — the AUDIO editor and the WAVE editor.
 *
 * S.auPanel is the frame the editor opens in (openWave: the bank map's SAMPLE
 * and SLICES pads); its pages (auPanelPages) are SAMPLE's, or on a Slice
 * clip's SLICES the ALL SLICES page (CLIP) and SLICE n. The standalone AUDIO
 * panel of 2026-10-27 is retired (removed after review, 2026-10-31).
 *
 * THE EDITOR (S.auEditor, in that frame; Back closes both) is the clip's SAMPLE (Josh: "new
 * editor: wav — initial page should show the loop waveform in loop mode, with
 * adjustable zoom, start/end, pitch, and gain. in slice mode, it should show
 * the slice editor. if no sample is loaded yet - the waveform view should show
 * the "click" corners and say click to load sample"). What it is follows the
 * clip:
 *   no sample   CLICK TO LOAD SAMPLE: click opens the chooser
 *   Loop        K1 Start · K2 Zoom · K3 End of the loop. No chops (Josh,
 *               2026-10-29: "chops should just be completely invisible in
 *               loop mode"), no cursor ("only in slice mode"): the pads, the
 *               jog and a click do nothing, and Shift + click offers only Load
 *   Slice       K1 Start · K2 Zoom · K3 End of the clip, the chops drawn and
 *               the slice the pads pick bracketed (it plays); no cursor, and a
 *               click opens the menu as Shift + click does (Josh, 2026-10-28:
 *               "open the chip menu, including the sample load items")
 * One detent of K1 / K3 / the jog = one screen pixel at the zoom; what was
 * touched last stays in the middle of the screen, the waveform scrolling
 * around it, and touching one jumps there.
 * SHIFT + CLICK opens the picker (Josh: "editor picker is: "Load sample" and
 * "Chop sample" at first level. Chop sample has second level with options."):
 *   Load sample›   the chooser
 *   Chop sample›   Even · Transient · Lazy · Manual — each opens the CHOP
 *                  editor on the waveform (Josh, 2026-10-28: "you select the
 *                  chop type, including manual, and then adjust the chops
 *                  with the waveform in view and then press back to get back
 *                  to the regular view"). Since 2026-10-30 chopping is
 *                  SLICES' (its click), and SAMPLE's menu offers Chop sample
 *                  only on a Loop clip, which a chop turns into a Slice clip
 *                  (toSlice) with the editor moving to SLICES
 * THE CHOP EDITOR (ed.mode 'chop', ed.chop.kind):
 *   Even       the jog sets the count, live on the pads
 *   Transient  the jog sets Sens (Shift: 5 a detent); the chops are Start and
 *              each hit kept, redrawn as it turns
 *   Manual     the hand editor on the chops as they are: K1 / K3 the picked
 *              slice's Start / End, the jog a cursor, a click adds a marker
 *              there, Delete + pad removes one (not slice 1's), Delete +
 *              click asks "Clear all chops?" (one slice, Start..End). An End
 *              turned past the next slice's start sticks there a few detents
 *              and reads NEXT.
 *   A click or Back in Even / Transient closes it and the chops are the
 *   clip's own — no question (Josh, 2026-10-30: "click in editor closes the
 *   editor and saves the slices just like back. and get rid of the
 *   confirmation for back"; it asked "Keep N chops?" and a click opened
 *   Manual); Manual's click adds a chop, its Back just returns. The pads play
 *   the chops in all three (Josh: "yes - and in manual").
 * LAZY: pad 1 white; its tap plays Start..End; then the next pad is white and
 * its tap drops a marker at the playhead; chopped slices stay lit. It ends on
 * a click, Back or at End, keeping what it chopped (it asked "Keep N new
 * chops?"); Back before the first tap changes nothing. Back leaves the
 * picker a level at a time, the chop editor for WAVE, and WAVE. Steps are
 * swallowed; Note/Session closes and falls through. */

import { S, loopViewActive, noteUndoUnit } from './ui_state.mjs';
import { MoveBack } from '/data/UserData/schwung/shared/constants.mjs';
import { MoveMainKnob, MoveMainButton, MoveMainTouch, MoveNoteSession, TRACK_PAD_BASE } from './ui_constants.mjs';
import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';
import { nowMs } from './ui_clock.mjs';
import { auInfo, auClipOf, auLazyStart, auLazyStop, auLazyTap, auLazyKeep, auLazyState, auMarkStale,
         auPanelPages, auPanelPageName, auPanelKnob, auPanelKnobClass, auChop, auPadToSlice,
         auSelSlice, auSetSelSlice, isSampledTrack, isSlicerTrack, auSeqClipOf, auMarks, auMarksLocal, auSliceStart, auSliceEnd,
         auMarkAdd, auMarkDel, auManual, auEvenBake, auTrans, auTransBake, auRangeStep, auSet, auEnd, auPanelRingCells, auPanelReset,
         auIsSlice, auIsLoop, AU_LAZY_ARMED, AU_LAZY_RUN, AU_LAZY_ENDED, AU_EVEN_MAX, AU_BPM10_MIN, AU_BPM10_MAX, auLenTicks,
         auSampleP2Cells, auSampleP2Knob, AU_P2_FIELDS, AU_P2_BARS, auPageFields, auSlcSyncTurn, auSlicerReset, auPanelCells, auSampleFieldCell, auSliceHeard, auSamplePageCells, auCellRing, auFreeTurn, AU_SAMPLE_PAGES, auTimeReset, auOffsetStep, auTempoStep, auShiftNorm, auBarsTurn, auIsFree, auSpeedTurn, AU_SPEED_MIN, AU_SPEED_MAX, auBpm, auSampleReset, auEdit, auTrimCuts, auOrig, auFit, auNudgeStep, auFpt, auPlayedEnd, auTooLongToChop, auAutoEdit, auAutoTouch, auSlicesAutoTouch, SLICE_GRID } from './ui_audio.mjs';
import { registerScreenRingCells } from './ui_knob_leds.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { ccKnobDelta, knobPick, KNOB_PICK, KNOB_DELIB } from './ui_input_cc.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { automationClearKey, automationToggleActive } from './ui_automation.mjs';
import { auAutoKey, auSlicesAutoKey } from './ui_constants.mjs';

/* One step per detent run (ui_input_cc's knobStep; its exports are only used
 * inside function bodies here — the two modules import each other). */
function knobStep(k, d2, need) {
    const steps = knobPick(k, decodeDelta(d2), need);
    return steps === 0 ? 0 : (steps > 0 ? 1 : -1);
}

/* ---- the AUDIO editor: S.auPanel is the frame the SAMPLE / SLICES editor
 * (S.auEditor) opens in (openWave) — never one without the other since the
 * retired AUDIO panel (removed after review, 2026-10-31) ---- */


/* A Shift shortcut over an Audio screen: a step pressed, or the jog turned. */
export function shortcutLeaves(status, d1, d2) {
    if (!S.shiftHeld) return false;
    const hi = status & 0xF0;
    return (hi === 0x90 && d2 > 0 && d1 >= 16 && d1 <= 31) || (status === 0xB0 && d1 === MoveMainKnob);
}

export function closeAudioPanel() {
    if (S.auEditor) closeAudioEditor();
    S.auPanel = null;
    S.knobTouched = -1;
    S.screenDirty = true;
}

/* A › cell under the touched knob, fired by the jog click: >Seq, the clip's
 * slices to its steps (Josh: "change "chop" to ">Seq" ("Slices to
 * sequence")"). */
/* >Seq: track t's clip's slices onto its steps, one per step (the CLIP
 * bank's K8 in Slice mode, touch + click). Returns true when it ran. */
export function slicesToSequence(t) {
    const c = auClipOf(t), i = auInfo(t, c);
    if (!auIsSlice(i) || i.state !== 2) return false;
    auChop(t, c);
    showActionPopup('SEQUENCED', i.n + ' slices to steps');
    return true;
}

/* Returns true when the message was the AUDIO editor's. The pads are not:
 * they play (and the pad handler picks the slice). */
export function audioPanelInput(status, d1, d2) {
    const ed = S.auPanel;
    if (!ed) return false;
    /* Shift + a step or the jog is a SHORTCUT (Josh, 2026-10-28: "regular
     * shortcuts don't work on waveform editor apart from pad map. shift
     * shortcuts don't seem to work"): it leaves the screen and runs as it
     * does anywhere. Shift + click (the picker) and Shift + a knob (fine
     * steps) stay the screen's. */
    if (shortcutLeaves(status, d1, d2)) { closeAudioPanel(); return false; }
    /* Loop + steps sets the loop here as anywhere — on a Loop clip, Start
     * and End with it (Josh, 2026-10-28: "it's not accessible at all in
     * sample view"); the screen stays */
    if ((status & 0xE0) === 0x80 && d1 >= 16 && d1 <= 31 && (loopViewActive() || S.loopGestureStart >= 0)) return false;
    /* ...and Loop + jog changes the clip's length a step a detent, as on any
     * clip (Josh, 2026-11-12: "holding loop allows me to press the step
     * buttons to set length by bars as it should, but turning jog doesn't
     * adjust it by steps ... it just scrolls to the second sample edit page") */
    if (status === 0xB0 && d1 === MoveMainKnob && loopViewActive()) return false;
    /* The sequence works here as under any instrument's editor (Josh,
     * 2026-10-30: "note sequencing via step and record should work in sample
     * and slice just like any other mode ... as should step editing via jog
     * turn"): the steps and a held step's jog — and, while that jog shows the
     * step's page, the knobs it edits with. (Record was never the editor's.) */
    if (S.auEditor && !S.auEditor.ask && S.auEditor.mode !== 'lazy') {
        if ((status & 0xE0) === 0x80 && d1 >= 16 && d1 <= 31) return false;
        if (status === 0xB0 && d1 === MoveMainKnob && S.heldStep >= 0) return false;
        if (S.stepReveal && (((status & 0xE0) === 0x80 && d1 <= 7) || (status === 0xB0 && d1 >= 71 && d1 <= 78))) return false;
    }
    if (S.auEditor) return audioEditorInput(status, d1, d2);
    closeAudioPanel();                 /* a frame with no editor: nothing to show */
    return false;
}

/* A pad tap on an Audio track in Slice mode: that slice is the one SLICE n
 * edits (the pad still plays it). */
export function auPadTapped(t, padIdx) {
    if (!isSampledTrack(t)) return;
    const i = auInfo(t, auClipOf(t));
    if (!auIsSlice(i)) return;
    const k = auPadToSlice(padIdx, t);
    if (k < i.n) auSetSelSlice(t, k);
    if (padIdx >= 0 && padIdx < 32) { S.auPadDown[padIdx] = true; S.ledsDirtyAudio = true; }
}

/* ---- the WAVE editor ---- */

const MIN_SPAN = 128;                     /* full zoom: one frame per pixel */
const END_HOLD = 4;                       /* detents an End sticks at NEXT */

/* The map's SAMPLE / SLICES pads: the editor on the track's current clip,
 * over an AUDIO editor (so the screens and input routes are the AUDIO
 * editor's). SLICES is a Slice clip's. */
export function openWave(t, which = 'sample') {
    if (!isSampledTrack(t)) return false;
    if (isSlicerTrack(t)) {
        /* a Slicer: its one SLICER editor (the 2026-11-14 rethink), on its
         * first page (an automation jump then moves it: slcPageForLane) */
        S.auSrc[t] = 'slices';
        S.auPanel = { t, page: 0, wave: true };
        openWaveEditor(t, auClipOf(t));
        S.auEditor.ed = 'slicer';
        S.auEditor.page = 0;
        return true;
    }
    if (which === 'slices' && !auIsSlice(auInfo(t, auClipOf(t)))) return false;
    S.auSrc[t] = which;
    S.auPanel = { t, page: 0, wave: true };
    openWaveEditor(t, auClipOf(t));
    S.auEditor.ed = which;
    return true;
}

export function openWaveEditor(t, c) {
    const i = auInfo(t, c);
    const ed = { t, c, mode: 'wave', A: 0, B: Math.max(MIN_SPAN, i.nframes | 0), view: i.name + '|' + i.nframes, full: true,
                 cur: 0, last: 'jog', endHold: 0, ask: null, pick: null, openedAt: S.clockMs | 0 };
    const mk = auMarks(t, c);
    const sel = auSelSlice(t);
    ed.cur = auIsSlice(i) && mk[sel] ? mk[sel][0] : i.rstart;
    S.auEditor = ed;
    S.knobTouched = -1;
    computePadNoteMap();
    S.ledsDirtyAudio = true;
    S.screenDirty = true;
}

/* What WAVE is for its clip right now: 'empty' (no sample, or loading),
 * 'loop' or 'chop' (a Slice clip). */
export function auWaveSub(ed) {
    const i = auInfo(ed.t, ed.c);
    if (i.state !== 2 || !i.nframes) return 'empty';
    return auIsSlice(i) ? 'chop' : 'loop';
}
/* A sample that arrived (or changed) since the view was set: show all of it. */
export function auWaveView(ed) {
    const i = auInfo(ed.t, ed.c);
    const v = i.name + '|' + i.nframes;
    const [lo, hi] = auViewBounds(ed);
    if (ed.view !== v) {
        ed.view = v; ed.full = true; ed.cur = i.rstart;
    }
    /* zoomed all the way out, the view IS the bounds — on SAMPLE the clip's
     * window, so turning Start slides the audio under it and Tempo / Length
     * squeeze or stretch it (Josh, 2026-10-29) */
    const [slo, shi] = auScrollBounds(ed);
    if (ed.full || ed.B - ed.A > hi - lo) { ed.A = lo; ed.B = hi; ed.full = true; }
    else if (ed.A < slo || ed.B > shi) { const sp = ed.B - ed.A; ed.A = Math.max(slo, Math.min(shi - sp, ed.A)); ed.B = ed.A + sp; }
}
/* What the view spans zoomed all the way out. SAMPLE's plain view (no chop
 * editor up): the clip's window — Start for its Length at the sample's Tempo,
 * running past the file's end when the Length does (drawn empty) — so the
 * screen is the clip, the audio where it lands (Josh, 2026-10-29: "the actual
 * part of the sample that plays needs to stretch, compress, have empty space
 * after it when zoomed fully out"). Anything else: the whole sample. */
export function auViewBounds(ed) {
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    const sampleView = ed.ed !== 'slices' && ed.ed !== 'slicer' && !(ed.mode === 'chop' && ed.chop) && ed.mode !== 'lazy';
    if (sampleView && fr && i.state === 2) {
        const lo = i.rstart | 0;
        /* Free: Start..End, its own loop — no clip window to fill */
        const hi = auIsFree(i) ? auPlayedEnd(ed.t, ed.c, i) : Math.round(lo + auLenTicks(ed.t, ed.c, i) * auFpt(i));
        if (hi - lo >= MIN_SPAN) return [lo, hi];
    }
    if (fr && i.state === 2 && auIsSlice(i)) {
        /* SLICES and the chop editors: SAMPLE's Start for its Length — the
         * chopped part, the same waveform SAMPLE shows — widened only to a
         * chop left outside it by a later Start / Length (Josh, 2026-10-30:
         * "sample's start and length should set the zone limits for viewing
         * and chopping the waveform in slice") */
        let lo = i.rstart | 0, hi = auPlayedEnd(ed.t, ed.c, i);
        for (const m of auMarks(ed.t, ed.c)) { if (m[0] < lo) lo = m[0]; if (m[1] > hi) hi = m[1]; }
        lo = Math.max(0, lo); hi = Math.min(fr, hi);
        if (hi - lo >= MIN_SPAN) return [lo, hi];
    }
    return [0, Math.max(MIN_SPAN, fr)];
}

/* How far a zoomed-in view may scroll: SAMPLE's plain view past its clip
 * window, over the whole file (and the window's empty end), so what lies
 * outside Start..End is there to see (Josh, 2026-11-13: "the waveform beyond
 * start end disappears. that shouldn't happen. we need it for reverence");
 * zoomed all the way out the view stays the clip's. Anything else: its
 * bounds. */
export function auScrollBounds(ed) {
    const [lo, hi] = auViewBounds(ed), i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    const sampleView = ed.ed !== 'slices' && ed.ed !== 'slicer' && !(ed.mode === 'chop' && ed.chop) && ed.mode !== 'lazy';
    return sampleView && fr && i.state === 2 && !auIsSlice(i) ? [0, Math.max(fr, hi)] : [lo, hi];
}

/* A chop method leaves the Mode alone: the chops serve both (Josh,
 * 2026-10-28: one set of chops; Mode "tells the sequencer how to handle the
 * slices"). */
/* A Slicer's chop editor opens: ONE undo step for the visit — its chops and
 * every clip's steps, which a chop edit renumbers (Josh, 2026-11-02: one
 * undo per chop-editor visit). The sound knobs take none. */
function chopVisitUndo(ed) {
    if (!isSlicerTrack(ed.t)) return;
    noteUndoUnit();
    host_module_set_param('t' + ed.t + '_au_undo_slc', '1');
}
function startLazy(ed) {
    chopVisitUndo(ed);
    ed.mode = 'lazy';
    ed.lazyAt = S.clockMs | 0;
    auLazyStart(ed.t, ed.c);
    auSetSelSlice(ed.t, 0);
    computePadNoteMap();
    S.ledsDirtyAudio = true;
}
/* Lazy ends (a click, Back, or played out) keeping what it chopped; armed,
 * before the first tap, nothing changes. */
export function lazyFinish(ed) {
    const lz = auLazyState();
    if (lz.state === AU_LAZY_RUN || lz.state === AU_LAZY_ENDED) {
        if (lz.state === AU_LAZY_RUN) auLazyStop(ed.t, ed.c);
        auLazyKeep(ed.t, ed.c, 1);
        auSetSelSlice(ed.t, 0);
        auMarkStale(ed.t, ed.c);
        S.auStartsRev = (S.auStartsRev | 0) + 1;
    } else if (lz.state === AU_LAZY_ARMED) auLazyStop(ed.t, ed.c);
    endLazy(ed);
}
function endLazy(ed) {
    ed.mode = 'wave';
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
}

/* Manual's Clear all: one slice, Start..End. */
function clearChops(ed) {
    const t = ed.t, c = ed.c;
    auManual(t, c);
    auSetSelSlice(t, 0);
    const i = auInfo(t, c);
    S.auInfo[t][c] = Object.assign({}, i, { even: 0, trans: 0, hand: 1, n: 1 });
    auMarksLocal(t, c, [[i.rstart, auEnd(i)]]);
    ed.cur = i.rstart;
    S.pendingPadNoteMapRecompute = true;
}

/* Even WRITES v equal chops (the engine: a tool, not a setting that stays). */
function setEven(ed, v) {
    const t = ed.t, c = ed.c;
    const i = auInfo(t, c);
    if (v < 2) return;
    auSet(t, c, 'even', v);
    S.auInfo[t][c] = Object.assign({}, i, { even: 0, trans: 0, hand: v, n: v });
    chopsMoved(t, v);
}
/* The chops changed under the pads: re-read them, keep the pick in range. */
function chopsMoved(t, n) {
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    if (auSelSlice(t) >= n) auSetSelSlice(t, 0);
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
}
/* Transient's count as the engine has it: Start and the kept hits, the first
 * AU_EVEN_MAX. */
export function auTransCount(i) { return Math.max(1, Math.min(AU_EVEN_MAX, i.hits | 0)); }
/* Transient's Sens: the chops written again at it as it turns */
function setSens(ed, v) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    auSet(t, c, 'sens', v);
    auTrans(t, c, 1);
    S.auInfo[t][c] = Object.assign({}, i, { sens: v });
    auMarkStale(t, c);
    chopsMoved(t, i.n);
}

/* The CHOP editor on `kind`, from the picker. */
function openChop(ed, kind) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    chopVisitUndo(ed);
    ed.chop = { kind, orig: { even: i.even | 0 } };
    ed.mode = 'chop';
    ed.chopAt = S.clockMs | 0;
    if (kind === 'even') setEven(ed, (i.n | 0) >= 2 ? i.n : 16);
    else if (kind === 'transient') {
        auTrans(t, c, 1);
        const n = auTransCount(i);
        S.auInfo[t][c] = Object.assign({}, i, { even: 0, trans: 0, hand: n, n });
        auMarkStale(t, c);
        chopsMoved(t, n);
    } else {
        const m = auMarks(t, c)[auSelSlice(t)];
        ed.cur = m ? m[0] : i.rstart;
        ed.last = 'jog';
    }
}
/* Out of the chop editor, back to WAVE: what Even / Transient wrote stays —
 * on every way out (Josh, 2026-11-02, R6: "Yes"); the visit's one Undo takes
 * it back. (`keep` is the caller's word for the same.) */
function closeChop(ed, keep) {
    const t = ed.t, c = ed.c, i = auInfo(t, c), kind = ed.chop && ed.chop.kind;
    void keep;
    if (kind === 'even' || kind === 'transient') {
        S.auInfo[t][c] = Object.assign({}, i, { even: 0, trans: 0, hand: i.n });
        chopsMoved(t, i.n);
    }
    ed.mode = 'wave';
    ed.chop = null;
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
}
function chopKind(ed) { return ed.mode === 'chop' && ed.chop ? ed.chop.kind : null; }

export function closeAudioEditor() {
    const ed = S.auEditor;
    if (!ed) return;
    if (ed.mode === 'lazy') {
        /* closed under a running chop (Note/Session, a track change): what it
         * chopped stays, as on every way out (Josh, 2026-11-02, R6: "Yes");
         * armed, nothing had changed */
        const st = auLazyState().state;
        if (st === AU_LAZY_ARMED) { auLazyStop(ed.t, ed.c); auLazyKeep(ed.t, ed.c, 0); }
        else {
            if (st === AU_LAZY_RUN) auLazyStop(ed.t, ed.c);
            auLazyKeep(ed.t, ed.c, 1);
        }
    }
    /* Even / Transient left some other way: the chops as they were */
    if (ed.mode === 'chop') closeChop(ed, false);
    S.auEditor = null;
    computePadNoteMap();
    S.ledsDirtyAudio = true;
    S.screenDirty = true;
}

/* The editor follows the track's clip (Josh, 2026-10-30: "when i switch clips
 * in track mode with a waveform editor up it doesn't change to the new
 * clip"): a launch or a queued pick moves it onto the clip now current — a
 * running chop or a question on the old one undone first, as any way out of
 * the editor undoes it. SLICES on a clip with no slices becomes SAMPLE (an
 * empty clip: click to load). SAMPLE keeps its page. Once a tick. */
export function auEditorFollowClip() {
    const ed = S.auEditor;
    if (!ed || !S.auPanel || !isSampledTrack(ed.t)) return;
    const c = auClipOf(ed.t);
    if (c === ed.c) return;
    const t = ed.t, page = ed.page | 0;
    let which = ed.ed || 'sample';
    closeAudioEditor();
    if (which === 'slices' && !auIsSlice(auInfo(t, c))) which = 'sample';
    S.auSrc[t] = which;
    openWaveEditor(t, c);
    S.auEditor.ed = which;
    S.auEditor.page = which === 'sample' ? page : 0;
}

/* Frames per screen pixel at the editor's zoom (128 pixels across). */
export function auEdPixel(ed) { return Math.max(1, Math.round((ed.B - ed.A) / 128)); }

/* The point being worked on sits in the MIDDLE of the screen and the
 * waveform scrolls around it, as far as the sample allows (Josh, 2026-10-28:
 * "start/end/cursor should always be in the center of screen with waveform
 * scrolling around it (where there's room) touch start should jump to start,
 * end to end, and cursor to current cursor position"). `f` defaults to the
 * focus: what was touched last. The span is kept. */
function centre(ed, f) {
    if (f == null) f = focus(ed);
    const span = ed.B - ed.A, [lo, hi] = auScrollBounds(ed);
    if (ed.full) return;                              /* zoomed out: the bounds are the view */
    let A = Math.round(f - span / 2);
    A = Math.max(lo, Math.min(Math.max(lo, hi - span), A));
    ed.A = A; ed.B = A + span;
}
function focus(ed) {
    return ed.last === 'start' ? edStart(ed) : ed.last === 'end' ? edEnd(ed) : ed.cur;
}

/* The points K1 / K3 edit: the selected slice's (Slice), the clip's (Loop). */
function edStart(ed) {
    const i = auInfo(ed.t, ed.c);
    if (chopKind(ed) !== 'manual') return i.rstart;
    const m = auMarks(ed.t, ed.c)[auSelSlice(ed.t)];
    return m ? m[0] : 0;
}
function edEnd(ed) {
    const i = auInfo(ed.t, ed.c);
    /* a Loop clip: where it stops playing — End, or its Length's end */
    if (chopKind(ed) !== 'manual') return auIsLoop(i) ? auPlayedEnd(ed.t, ed.c, i) : auEnd(i);
    const m = auMarks(ed.t, ed.c)[auSelSlice(ed.t)];
    return m ? m[1] : 0;
}
/* Hand-set slice k's home end: the next start, else the clip's End (the
 * sample's end when the slice starts past End). */
export function auEdHome(ed, k) {
    const i = auInfo(ed.t, ed.c), mk = auMarks(ed.t, ed.c);
    if (k + 1 < mk.length) return mk[k + 1][0];
    const e = auEnd(i);
    return mk[k] && e > mk[k][0] ? e : i.nframes;
}

function zoom(ed, dir) {
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    if (fr <= 0) return false;
    const [lo, hi] = auViewBounds(ed), full = hi - lo;
    const span = ed.B - ed.A;
    let ns = Math.round(dir > 0 ? span * 0.8 : span * 1.25);
    ns = Math.max(Math.min(MIN_SPAN, full), Math.min(full, ns));
    if (ns === span) return false;
    ed.full = ns >= full;
    ed.B = ed.A + ns;
    if (ed.full) { ed.A = lo; ed.B = hi; } else centre(ed);
    return true;
}

/* Even is a way to chop, never a lock (Josh, 2026-10-28: "even shouldn't
 * lock the slices - it's just a way to chop them"): an edit while a clip is
 * still on Even makes its slices the clip's own chops first. The engine does
 * the same on the edit's key; this keeps the mirror in step. */
function bakeLocal(ed) {
    const i = auInfo(ed.t, ed.c);
    if (!i.even) return;
    S.auInfo[ed.t][ed.c] = Object.assign({}, i, { even: 0, hand: i.n });
}

/* K1 / K3 in Slice mode: the selected slice's start / end by `dd` pixels. */
function chopPoint(ed, which, dd) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    bakeLocal(ed);
    const k = auSelSlice(t);
    const mk = auMarks(t, c).map((m) => m.slice());
    if (!mk[k]) return false;
    const px = auEdPixel(ed), G = 16, [blo, bhi] = auViewBounds(ed);
    if (which === 'start') {
        const lo = k > 0 ? mk[k - 1][0] + G : Math.min(blo, mk[k][0]);
        const hi = Math.min(k + 1 < mk.length ? mk[k + 1][0] - G : bhi - G, mk[k][1] - G);
        const v = Math.max(lo, Math.min(hi, mk[k][0] + dd * px));
        if (v === mk[k][0]) return false;
        const wasHome = k > 0 && mk[k - 1][1] === mk[k][0];
        mk[k][0] = v;
        if (wasHome) mk[k - 1][1] = v;                                 /* the slice before follows (home) */
        auSliceStart(t, c, k, v);
        auMarksLocal(t, c, mk);
        centre(ed, v);
        return true;
    }
    const home = auEdHome(ed, k), b = mk[k][1];
    if (b === home && ed.endHold > 0) { ed.endHold -= Math.abs(dd); return true; }   /* sticks at home */
    let v = Math.max(mk[k][0] + G, Math.min(Math.max(bhi, b), b + dd * px));
    if (b !== home && (v - home) * (b - home) <= 0) { v = home; ed.endHold = END_HOLD; }
    if (v === b) return false;
    mk[k][1] = v;
    auSliceEnd(t, c, k, v === home ? 0 : v);
    auMarksLocal(t, c, mk);
    centre(ed, v);
    return true;
}

/* K4 / K5 in Loop mode: the clip's Pitch / Gain. */
function clipStep(ed, field, dir) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    const lim = field === 'pitch' ? [-24, 24] : field === 'detune' ? [-50, 50] : [-40, 12];
    const v = Math.max(lim[0], Math.min(lim[1], (i[field] | 0) + dir));
    if (v === (i[field] | 0)) return false;
    auSet(t, c, field, v);
    auAutoEdit(t, c, field, v, i[field] | 0);
    S.auInfo[t][c] = Object.assign({}, i, { [field]: v });
    return true;
}
/* Tempo: the sample's own, 1 BPM a detent (Shift 0.1) — what Sync and
 * >Seq's step places follow (Josh, 2026-10-29: Move's "tempo knob to set the
 * original tempo"); Free's is Speed. */
function clipTempo(ed, dir) {
    if (!auTempoStep(ed.t, ed.c, dir)) return false;
    /* the view stays on what was touched last: Length's end moves with the
     * Tempo (Josh, 2026-10-30: "if i last touched length, wave view should
     * stay focused on the end of the clip while adjusting bpm") */
    if (!auIsFree(auInfo(ed.t, ed.c))) centre(ed);
    return true;
}

/* SAMPLE's knobs by what they set, on all its pages (Josh, 2026-11-13:
 * page 1 "offset ... on knob 4 on the waveform view knobs, move gain to k8
 * and knock reverse off the waveform knobs"): page 1 K4 Offset, K5 Pitch, K6
 * Detune, K7 Tempo, K8 Gain; page 2 TIME and page 3 SOUND as auPageFields
 * has them. `k` is the physical knob (its detent state). */
export const AU_P1_FIELDS = auPageFields(0);
function sampleKnob(ed, f, k, d2) {
    if (f === 'free') { const st = knobStep(k, d2, KNOB_PICK); return !!st && auFreeTurn(ed.t, ed.c, st); }
    if (f === 'sync') { const st = knobStep(k, d2, KNOB_PICK); return !!st && auSampleP2Knob(ed.t, ed.c, 1, st); }
    if (f === 'nudge') { const st = ccKnobDelta(d2, k); return !!st && !isSlicerTrack(ed.t) && auNudgeStep(ed.t, ed.c, st); }
    if (f === 'bars') {
        /* Bars: whole bars a detent, deliberate as a choice is */
        const st = knobStep(k, d2, KNOB_PICK);
        if (!st || !auBarsTurn(ed.t, ed.c, st)) return false;
        centre(ed);
        return true;
    }
    if (f === 'gain') { const st = ccKnobDelta(d2, k); return !!st && clipStep(ed, 'gain', st > 0 ? 1 : -1); }
    if (f === 'pitch') { const st = knobStep(k, d2, KNOB_PICK); return !!st && clipStep(ed, 'pitch', st); }
    if (f === 'detune') { const st = ccKnobDelta(d2, k); return !!st && clipStep(ed, 'detune', st); }
    if (f === 'tempo') { const st = ccKnobDelta(d2, k); return !!st && clipTempo(ed, st > 0 ? 1 : -1); }
    if (f === 'offset') { const st = knobStep(k, d2, KNOB_PICK); return !!st && auOffsetStep(ed.t, ed.c, st); }
    return false;
}

/* The automatable setting knob k turns on the screen as it is (sampleKnob's
 * on SAMPLE; SLICES' are the slice's own, not automatable), or null. */
const SAMPLE_AUTO_FIELD = { gain: 'gain', pitch: 'pitch', detune: 'detune', tempo: 'bpm10' };
function sampleAutoField(k, plain, page, sl, slEdit) {
    if ((page && sl) || (slEdit && k > 2)) return null;
    return SAMPLE_AUTO_FIELD[auPageFields(page)[k]] || null;
}

/* A Tempo x10 as shown: 120, 224.1 */
function bpmText(v) { return v % 10 ? (v / 10).toFixed(1) : String(v / 10); }

/* The picker's rows at its level. */
export function auPickRows(ed) {
    const p = ed.pick;
    if (!p) return [];
    const i = auInfo(ed.t, ed.c);
    /* touch Tempo + click (Josh, 2026-11-02: "both on a small pop-up menu
     * that shows when you touch click tempo" · "menu should be "Fit to clip"
     * "Original tempo""); Fit is a Loop clip's */
    if (p.tempo) return (auIsLoop(i) ? [{ id: 'fit', label: 'Fit to clip' }] : []).concat([{ id: 'orig', label: 'Original tempo' }]);
    /* the SLICER editor's two menus (Josh, 2026-11-14/15): the SLICE menu on
     * pages 1-2 (Shift + click) — Load sample first, the chopping tools,
     * Clear all, Convert to kit; the SAMPLE menu on page 3 — what deals with
     * the whole file */
    if (p.menu === 'slices') return [{ id: 'load', label: 'Load sample', chevron: true }]
        .concat(i.state === 2 ? [{ id: 'even', label: 'Even' }, { id: 'transient', label: 'Transient' }, { id: 'lazy', label: 'Lazy' },
                                 { id: 'clear', label: 'Clear all' }, { id: 'kit', label: 'Convert to kit' }] : []);
    if (p.menu === 'sample') return [{ id: 'load', label: 'Load sample', chevron: true }]
        .concat(i.state === 2 ? [{ id: 'trim', label: 'Trim' }, { id: 'norm', label: 'Normalize' }] : []);
    /* SAMPLE's menu (Josh, 2026-10-30: "it should load a menu for consistency.
     * AND i want to add trim and normalize options there"); chopping is
     * SLICES' alone */
    /* ...and on a Loop clip, Chop sample (Josh, 2026-10-30: "when mode is loop
     * and the sample menu is opened, can we add chopping options to the menu
     * there, which switch the clip into slice mode?") */
    /* (Chop sample left: an Audio clip reaches a Slicer by copy and paste —
     * Josh, 2026-11-02) */
    if (p.level === 1) return i.state === 2
        ? [{ id: 'load', label: 'Load sample', chevron: true }, { id: 'trim', label: 'Trim' }, { id: 'norm', label: 'Normalize' }]
        : [{ id: 'load', label: 'Load sample', chevron: true }];
    /* Convert to kit (Josh, 2026-10-30: "slice menu option: convert to kit"):
     * the chops as a Move drum kit (ui_audio_kit) — a Slice clip's: a Loop
     * clip chopping from SAMPLE has none yet */
    return [{ id: 'even', label: 'Even' }, { id: 'transient', label: 'Transient' },
            { id: 'lazy', label: 'Lazy' }, { id: 'manual', label: 'Manual' }]
        .concat(i.state === 2 && auIsSlice(i) ? [{ id: 'kit', label: 'Convert to kit' }] : []);
}
function pickInput(ed, status, d1, d2) {
    const p = ed.pick, hi = status & 0xF0;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 9 && (hi === 0x80 || d2 < 64)) {
            if (S.knobTouched === d1) S.knobTouched = -1;
            if (S.knobPhysIdx === d1) S.knobPhysIdx = -1;
        }
        return d1 !== 9;                                     /* pads, steps and knob touches wait */
    }
    if (status !== 0xB0) return false;
    const rows = auPickRows(ed);
    if (d1 === MoveMainKnob) {
        const dd = decodeDelta(d2);
        if (!dd) return true;
        p.sel = Math.max(0, Math.min(rows.length - 1, p.sel + (dd > 0 ? 1 : -1)));
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainButton) {
        if (d2 !== 127) return true;
        const row = rows[p.sel];
        S.screenDirty = true;
        if (!row) return true;
        if (row.id === 'load') { ed.pick = null; S.pendingAudioChooser = { t: ed.t, c: ed.c }; return true; }
        if (row.id === 'clear') {
            /* Clear all slices (the SLICE menu, and only there — Josh,
             * 2026-11-15): it asks; Yes is a fresh load, one slice, the range */
            ed.pick = null;
            ed.ask = { kind: 'clear', sel: 1 };
            return true;
        }
        /* (a Slicer's Trim cuts to its range, set on SAMPLE's page: it asks
         * New / Overwrite as an Audio clip's does — no handles of its own) */
        if (row.id === 'trim' || row.id === 'norm') {
            ed.pick = null;
            /* nothing to cut: say so rather than ask */
            if (row.id === 'trim' && !auTrimCuts(ed.t, ed.c)) { showActionPopup('TRIM', 'Nothing to cut'); return true; }
            ed.ask = { kind: 'edit', op: row.id, sel: 0 };   /* opens on New (Josh: "new copy is default") */
            return true;
        }
        if (row.id === 'fit' || row.id === 'orig') {
            ed.pick = null;
            if (row.id === 'orig') {
                if (auOrig(ed.t, ed.c)) showActionPopup('ORIGINAL TEMPO', bpmText(auInfo(ed.t, ed.c).bpm10 | 0) + ' BPM');
                return true;
            }
            /* the Bars set once so Start..End fills the clip (Josh,
             * 2026-11-02: "fit to clip" · "(once)") */
            const v = auFit(ed.t, ed.c);
            if (v < 0) showActionPopup('FIT TO CLIP', 'Out of range');
            else if (v) showActionPopup('FIT TO CLIP', bpmText(v) + ' BPM');
            return true;
        }
        if (row.id === 'kit') { ed.pick = null; S.pendingAuKit = { t: ed.t, c: ed.c }; return true; }   /* reads + a copy: the tick's */
        ed.pick = null;
        if (!isSlicerTrack(ed.t) || auTooLongToChop(ed.t, ed.c)) return true;   /* chops are a Slicer's */
        if (row.id === 'lazy') startLazy(ed);
        else openChop(ed, row.id);
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        S.backPressTick = -1; S.backHoldFired = false;
        if (p.level === 2 && !p.only2 && !p.tempo && !p.menu) ed.pick = { level: 1, sel: p.from != null ? p.from : 1 };
        else ed.pick = null;                                  /* SLICES opens straight onto the chop types */
        S.screenDirty = true;
        return true;
    }
    if (d1 >= 71 && d1 <= 78) return true;
    return false;
}

/* Back from SAMPLE / SLICES: out of it — and out of the AUDIO editor it
 * opened over — onto the bank that was showing, as any instrument editor
 * leaves (Josh, 2026-10-30: "just fall back to the last regular knob bank"). */
function leaveWave() {
    if (S.auPanel && S.auPanel.wave) closeAudioPanel();
    else closeAudioEditor();
}


/* ==================== THE SLICER EDITOR (the 2026-11-14 rethink) ====================
 * One editor for a Slicer, behind the pad map's instrument pad (Josh, 2026-11-14:
 * "i like b"), three pages turned by the jog:
 *   1 SLICES  the picked slice (the pads pick it): K1 Start · K2 Zoom · K3 End ·
 *             K4 Play · K5 Pitch · K6 Detune · K7 Revrs · K8 Gain. Delete + pad
 *             deletes a slice. A click ENTERS the slice editor (corner brackets):
 *             inside, the jog moves a cursor and a click adds a slice there; Back
 *             leaves it (Josh, 2026-11-15: "there's no reason anything but
 *             scrolling and adding slices needs to be inside-only").
 *   2 SHAPE   the picked slice's Attk · Decay.
 *   3 SAMPLE  the whole file: a strip with the range on it over K1 Start · K2 Zoom ·
 *             K3 End (the range), K4 Sync · K5 Pitch · K6 Detune · K7 Tempo · K8 Gain
 *             — the base every slice adds to.
 * Shift + a slice knob sets every slice on Play, Revrs, Attk and Decay; on Pitch,
 * Detune and Gain it does nothing — page 3 moves every slice and keeps their
 * differences (Josh, 2026-11-15). Shift + click opens the menu on every page:
 * page 1 and 2's the SLICE menu (Load sample · Even · Transient · Lazy · Clear
 * all · Convert to kit), page 3's the SAMPLE menu (Load sample · Trim ·
 * Normalize), which page 3's plain click opens too. Delete + click resets the
 * page showing, as on every bank. Even and Transient re-cut live while open; a
 * click there accepts and lands inside the slice editor at the same view, Back
 * keeps the cut. */
export const SLC_PAGES = 3;
export const SLC_P0 = [null, null, null, 'play', 'pitch', 'detune', 'rev', 'gain'];
export const SLC_P1 = ['atk', 'dec', null, null, null, null, null, null];
export const SLC_P2 = [null, null, null, 'sync', 'pitch', 'detune', 'tempo', 'gain'];
const SLC_ALL_OK = { play: 1, rev: 1, atk: 1, dec: 1 };
export const SLC_STRIP_W = 92;               /* page 3's strip, pixels: over K1-K3 */
export function isSlicerEd(ed) { return !!ed && ed.ed === 'slicer'; }
/* The SLICER editor page an automation lane's knob is on: the sample's lanes
 * page 3, the every-slice lanes Attk / Decay page 2, Revrs / Play page 1 */
export function slcPageForLane(field, sampleLane) {
    if (sampleLane) return 2;
    return field === 'atk' || field === 'dec' ? 1 : 0;
}
export function slcInside(ed) { return isSlicerEd(ed) && chopKind(ed) === 'manual'; }

/* A slice knob (pages 1-2): the picked slice's field; Shift: every slice's,
 * on the four fields that allows */
function slcSliceKnob(ed, f, k, d2) {
    const all = !!S.shiftHeld;
    if (all && !SLC_ALL_OK[f]) return false;
    const idx = SLICE_GRID.indexOf(f);
    if (idx < 0) return false;
    const ped = { t: ed.t, page: all ? 0 : 1 };
    const cls = auPanelKnobClass(ped, idx);
    const st = cls === 'pick' ? knobStep(k, d2, KNOB_PICK) : cls === 'delib' ? knobStep(k, d2, KNOB_DELIB) : ccKnobDelta(d2, k);
    if (!st || !auPanelKnob(ped, idx, st)) return false;
    S.pendingPadNoteMapRecompute = true;
    return true;
}

/* page 3's strip: what it spans (the whole file zoomed out), its frames a pixel */
export function slcStripView(ed) {
    const i = auInfo(ed.t, ed.c), fr = Math.max(MIN_SPAN, i.nframes | 0);
    if (ed.sFull !== false || ed.sB == null || ed.sB - ed.sA >= fr || ed.sB > fr) { ed.sA = 0; ed.sB = fr; ed.sFull = true; }
    return [ed.sA, ed.sB];
}
function slcStripPixel(ed) { slcStripView(ed); return Math.max(1, Math.round((ed.sB - ed.sA) / SLC_STRIP_W)); }
function slcStripFocus(ed) { const i = auInfo(ed.t, ed.c); return ed.sLast === 'end' ? auEnd(i) : (i.rstart | 0); }
function slcStripCentre(ed) {
    slcStripView(ed);
    if (ed.sFull) return;
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0, span = ed.sB - ed.sA;
    const A = Math.max(0, Math.min(Math.max(0, fr - span), Math.round(slcStripFocus(ed) - span / 2)));
    ed.sA = A; ed.sB = A + span;
}
function slcStripZoom(ed, dir) {
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    if (fr <= 0) return false;
    slcStripView(ed);
    const span = ed.sB - ed.sA;
    let ns = Math.round(dir > 0 ? span * 0.8 : span * 1.25);
    ns = Math.max(Math.min(MIN_SPAN, fr), Math.min(fr, ns));
    if (ns === span) return false;
    ed.sFull = ns >= fr;
    if (ed.sFull) { ed.sA = 0; ed.sB = fr; } else { ed.sB = ed.sA + ns; slcStripCentre(ed); }
    return true;
}
/* K1 / K3 on page 3: the range's Start / End, a strip pixel a detent (a frame
 * with Shift) */
function slcRangeStep(ed, which, dd) {
    const t = ed.t, c = ed.c, i = auInfo(t, c), fr = i.nframes | 0, G = 16;
    if (i.state !== 2 || !fr) return false;
    const px = S.shiftHeld ? 1 : slcStripPixel(ed);
    const rs = i.rstart | 0, re = auEnd(i);
    const loc = Object.assign({}, i);
    if (which === 'start') {
        const v = Math.max(0, Math.min(re - G, rs + dd * px));
        if (v === rs) return false;
        auSet(t, c, 'start', v);
        loc.rstart = v;
    } else {
        const v = Math.max(rs + G, Math.min(fr, re + dd * px));
        if (v === re) return false;
        auSet(t, c, 'end', v >= fr ? 0 : v);
        loc.rend = v; loc.cut = v >= fr ? 0 : v;
    }
    S.auInfo[t][c] = loc;
    auMarkStale(t, c);                     /* an unchopped slice follows the range */
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
    ed.sLast = which;
    slcStripCentre(ed);
    return true;
}
/* page 3's other knobs: the sample's (sampleKnob's), Sync its three */
function slcSampleKnob(ed, f, k, d2) {
    if (f === 'sync') { const st = knobStep(k, d2, KNOB_DELIB); return !!st && auSlcSyncTurn(ed.t, ed.c, st); }
    return sampleKnob(ed, f, k, d2);
}
/* Delete + click: the page showing back to its defaults — the picked slice's
 * sound (Shift: every slice's Play / Revrs, or Attk / Decay), the sample's */
function slcReset(ed) {
    const t = ed.t, c = ed.c, pg = ed.page | 0;
    if (pg === 2) return auSampleReset(t, c) ? 'SAMPLE' : null;
    const fields = (pg === 1 ? SLC_P1 : SLC_P0).filter((f) => f && (!S.shiftHeld || SLC_ALL_OK[f]));
    return auSlicerReset(t, c, fields, !!S.shiftHeld) ? (S.shiftHeld ? 'ALL SLICES' : 'SLICE') : null;
}
/* Even / Transient's click: their cut accepted, straight into the slice
 * editor at the same view (Josh, 2026-11-15: "accept chops and put you in
 * manual mode at the same point in the waveform view") */
function slcAcceptToInside(ed) {
    closeChop(ed, true);
    const i = auInfo(ed.t, ed.c), rs = i.rstart | 0, re = auEnd(i);
    ed.chop = { kind: 'manual', orig: { even: 0 } };
    ed.mode = 'chop';
    ed.chopAt = S.clockMs | 0;
    ed.cur = Math.max(rs, Math.min(re - 1, Math.round((ed.A + ed.B) / 2)));
    ed.last = 'jog';
    computePadNoteMap();
}
/* the cursor's room: the range (no way of making slices leaves it) */
function slcCursorBounds(ed) { const i = auInfo(ed.t, ed.c); return [i.rstart | 0, Math.max((i.rstart | 0) + 1, auEnd(i) - 1)]; }

/* The page's knob cells as drawn (and lit): the picked slice's on pages 1-2
 * (every slice's with Shift, `--` on the fields Shift leaves alone), the
 * sample's on page 3; K1 / K3 the points they move, K2 Zoom (no cell: the
 * waveform shows it). */
/* Page 3's knobs that change how the sample DRAWS — Start, Zoom, End (the
 * range and the strip's window) and Gain (the wave's height) — show the
 * waveform card while in hand, as SAMPLE's do (Josh, 2026-11-15: "can we use a
 * similar popup waveform view like the other audio tracks use when adjusting
 * the anything in page 3 that changes the sample display?"). Pitch, Detune,
 * Sync and Tempo change how it plays, not how it draws. */
export const SLC_P3_WAVE_KNOBS = [0, 1, 2, 7];
/* (asked only from page 3's drawing, which a question, a menu or the slice
 * editor never reaches — so the knob is all it decides) */
export function slcWaveKnob(k) { return SLC_P3_WAVE_KNOBS.indexOf(k) >= 0; }
const SLC_BLANK = { kind: 'blank', label: '' };
export function slcPageCells(ed) {
    const t = ed.t, c = ed.c, i = auInfo(t, c), pg = chopKind(ed) ? 0 : (ed.page | 0);
    if (pg === 2) return SLC_P2.map((f) => (f ? auSampleFieldCell(t, c, f) : SLC_BLANK));
    const all = !!S.shiftHeld;
    const grid = auPanelCells({ t, page: all ? 0 : 1 });
    const fields = pg === 1 ? SLC_P1 : SLC_P0;
    return fields.map((f) => {
        if (!f) return SLC_BLANK;
        const cell = grid[SLICE_GRID.indexOf(f)] || SLC_BLANK;
        if (all && !SLC_ALL_OK[f]) return Object.assign({}, cell, { text: '--', na: true });
        return cell;
    });
}
/* The knob rings: the cells' places; K1 / K3 where the points sit (the picked
 * slice's start / end, or the range's on page 3), K2 the zoom. */
export function slcRingCells(ed) {
    const none = [null, null, null, null, null, null, null, null];
    if (!ed || ed.ask || ed.pick || ed.mode === 'lazy') return none;
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0, kind = chopKind(ed);
    if (i.state !== 2 || !fr) return none;
    const at = (n) => ({ kind: 'arc', norm: Math.max(0, Math.min(1, n)) });
    const zoomOf = (A, B) => { const span = Math.max(MIN_SPAN, B - A); return fr > MIN_SPAN ? 1 - Math.log(span / MIN_SPAN) / Math.log(fr / MIN_SPAN) : 0; };
    if (kind === 'even' || kind === 'transient') return [null, at(zoomOf(ed.A, ed.B)), null, null, null, null, null, null];
    const cells = slcPageCells(ed).map(auCellRing);
    const pg = kind ? 0 : (ed.page | 0);
    if (pg === 1) return cells;
    if (pg === 2) {
        const [sA, sB] = slcStripView(ed);
        cells[0] = at((i.rstart | 0) / fr); cells[1] = at(zoomOf(sA, sB)); cells[2] = at(auEnd(i) / fr);
        return cells;
    }
    const m = auMarks(ed.t, ed.c)[auSelSlice(ed.t)];
    cells[0] = m ? at(m[0] / fr) : null; cells[1] = at(zoomOf(ed.A, ed.B)); cells[2] = m ? at(m[1] / fr) : null;
    return cells;
}

function slcInput(ed, status, d1, d2) {
    const hi = status & 0xF0;
    const t = ed.t, c = ed.c;
    const sub = ed.mode === 'lazy' ? 'lazy' : auWaveSub(ed);
    const kind = chopKind(ed), inside = kind === 'manual';
    const pg = kind ? 0 : (ed.page | 0);
    const fields = pg === 1 ? SLC_P1 : pg === 2 ? SLC_P2 : SLC_P0;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7) {
            const on = hi === 0x90 && d2 >= 64;
            const f = fields[d1];
            /* automation: page 3's Pitch / Detune / Gain / Tempo (the sample's
             * lanes), and with Shift the every-slice lanes left (Attk, Decay,
             * Revrs, Play) */
            const af = pg === 2 && (f === 'pitch' || f === 'detune' || f === 'gain') ? f : pg === 2 && f === 'tempo' ? 'bpm10' : null;
            const asf = !af && pg < 2 && S.shiftHeld && f && SLC_ALL_OK[f] ? f : null;
            const akey = af ? auAutoKey(af) : asf ? auSlicesAutoKey(asf) : null;
            if (akey) {
                const tgt = 'seq:' + t + ':' + akey;
                if (on && S.deleteHeld) {
                    if (automationClearKey(t, c, tgt)) showActionPopup('AUTOMATION', 'CLEARED');
                } else if (on && S.muteHeld) {
                    S.muteUsedAsModifier = true;
                    const r = automationToggleActive(t, c, tgt);
                    if (r !== null) showActionPopup('AUTOMATION', r ? 'ON' : 'OFF');
                }
                if (af) auAutoTouch(t, c, af, on);
                else auSlicesAutoTouch(t, c, asf, on);
            }
            if (!on && f && SLC_ALL_OK[f]) auSlicesAutoTouch(t, c, f, false);
            if (on) {
                S.knobTouched = d1; S.knobPhysIdx = d1; S.knobTurnedTick[d1] = -1;
                if (d1 === 1) ed.zoomDir = 0;
                if (d1 === 0 || d1 === 2) {
                    if (pg === 2) { ed.sLast = d1 === 0 ? 'start' : 'end'; slcStripCentre(ed); }
                    else if (sub === 'chop' && (!kind || inside)) { ed.last = d1 === 0 ? 'start' : 'end'; centre(ed); }
                }
            } else {
                if (S.knobTouched === d1) S.knobTouched = -1;
                if (S.knobPhysIdx === d1) S.knobPhysIdx = -1;
            }
            S.screenDirty = true;
            return true;
        }
        if (d1 === MoveMainTouch) {
            if (hi === 0x90 && d2 >= 64 && inside) { ed.last = 'jog'; centre(ed); S.screenDirty = true; }
            return false;
        }
        if (d1 >= 16 && d1 <= 31) return true;
        if (d1 >= TRACK_PAD_BASE && d1 < TRACK_PAD_BASE + 32) {
            const down = hi === 0x90 && d2 > 0;
            const k = auPadToSlice(d1 - TRACK_PAD_BASE, t);
            if (sub === 'lazy') {
                if (down) {
                    const lz = auLazyState();
                    const next = lz.state === AU_LAZY_RUN ? lz.n : 0;
                    if (k === next && (lz.state === AU_LAZY_ARMED || lz.state === AU_LAZY_RUN) && next < AU_EVEN_MAX) {
                        auLazyTap(t);
                        lz.state = AU_LAZY_RUN; lz.n = next + 1;
                        S.ledsDirtyAudio = true;
                        S.screenDirty = true;
                    }
                }
                return true;
            }
            if (sub !== 'chop') return true;
            const i = auInfo(t, c);
            if (S.deleteHeld) {
                /* Delete + pad (page 1, in or out of the slice editor): that
                 * slice goes, merging into the one before; slice 1 stays */
                if (pg === 0 && (!kind || inside) && down && k >= 1 && k < i.n) {
                    bakeLocal(ed);
                    auMarkDel(t, c, k);
                    const mk = auMarks(t, c).map((m) => m.slice());
                    if (mk[k - 1] && mk[k] && mk[k - 1][1] === mk[k][0]) mk[k - 1][1] = mk[k][1];
                    mk.splice(k, 1);
                    S.auInfo[t][c] = Object.assign({}, i, { even: 0, hand: i.n - 1, n: i.n - 1 });
                    auMarksLocal(t, c, mk);
                    if (auSelSlice(t) >= mk.length) auSetSelSlice(t, mk.length - 1);
                    S.pendingPadNoteMapRecompute = true;
                    S.ledsDirtyAudio = true;
                }
                return true;
            }
            if (down && k < i.n) {
                auSetSelSlice(t, k);
                const m = auMarks(t, c)[k];
                if (m && pg === 0) {
                    if (inside) { ed.cur = Math.max(slcCursorBounds(ed)[0], Math.min(slcCursorBounds(ed)[1], m[0])); ed.last = 'jog'; }
                    centre(ed, m[0]);
                }
                ed.endHold = 0;
                S.ledsDirtyAudio = true;
                S.screenDirty = true;
            }
            return false;                                 /* the pad still plays its slice */
        }
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) {
        const k = d1 - 71, dd = decodeDelta(d2);
        if (!dd || sub !== 'chop') return true;
        S.knobTouched = k; S.knobTurnedTick[k] = S.clockMs;
        let moved = false;
        if (kind === 'even' || kind === 'transient') {
            if (k === 1) { ed.zoomDir = dd > 0 ? 1 : -1; moved = zoom(ed, ed.zoomDir); }
        } else if (pg === 0) {
            if (k === 1) { ed.zoomDir = dd > 0 ? 1 : -1; moved = zoom(ed, ed.zoomDir); }
            else if (k === 0 || k === 2) { ed.last = k === 0 ? 'start' : 'end'; moved = chopPoint(ed, ed.last, dd); }
            else moved = slcSliceKnob(ed, SLC_P0[k], k, d2);
        } else if (pg === 1) {
            if (SLC_P1[k]) moved = slcSliceKnob(ed, SLC_P1[k], k, d2);
        } else {
            if (k === 1) { ed.zoomDir = dd > 0 ? 1 : -1; moved = slcStripZoom(ed, ed.zoomDir); }
            else if (k === 0 || k === 2) moved = slcRangeStep(ed, k === 0 ? 'start' : 'end', dd);
            else moved = slcSampleKnob(ed, SLC_P2[k], k, d2);
        }
        S.screenDirty = true;
        void moved;
        return true;
    }
    if (d1 === MoveMainKnob) {
        const dd = decodeDelta(d2);
        if (!dd) return true;
        if (sub === 'chop' && !kind) {
            const np = Math.max(0, Math.min(SLC_PAGES - 1, (ed.page | 0) + (dd > 0 ? 1 : -1)));
            if (np !== (ed.page | 0)) { ed.page = np; S.knobTouched = -1; S.screenDirty = true; }
            return true;
        }
        if (sub !== 'chop') return true;
        const i = auInfo(t, c);
        ed.jogAt = S.clockMs | 0;
        if (kind === 'even') {
            const v = Math.max(2, Math.min(AU_EVEN_MAX, (i.n | 0) + (dd > 0 ? 1 : -1)));
            if (v !== (i.n | 0)) setEven(ed, v);
        } else if (kind === 'transient') {
            const v = Math.max(0, Math.min(100, (i.sens | 0) + dd));
            if (v !== (i.sens | 0)) setSens(ed, v);
        } else if (inside) {
            const step = auEdPixel(ed), [blo, bhi] = slcCursorBounds(ed);
            ed.cur = Math.max(blo, Math.min(bhi, ed.cur + dd * step));
            ed.last = 'jog';
            centre(ed, ed.cur);
        }
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainButton) {
        if (d2 !== 127) return true;
        S.screenDirty = true;
        if (sub === 'lazy') { lazyFinish(ed); return true; }
        if (sub === 'empty') { S.pendingAudioChooser = { t, c }; return true; }
        if (kind === 'even' || kind === 'transient') { slcAcceptToInside(ed); return true; }
        if (S.deleteHeld) {
            const what = slcReset(ed);
            if (what) showActionPopup(what, 'RESET');
            return true;
        }
        /* touch Tempo + click on page 3: Tempo's own menu (Original tempo) */
        if (pg === 2 && S.knobTouched === 6) {
            auAutoTouch(t, c, 'bpm10', false);
            ed.pick = { level: 1, sel: 0, tempo: true };
            return true;
        }
        if (pg === 2) { ed.pick = { menu: 'sample', level: 1, sel: 0 }; return true; }
        if (S.shiftHeld) { ed.pick = { menu: 'slices', level: 1, sel: 0 }; return true; }
        if (pg === 1) return true;
        if (!inside) { openChop(ed, 'manual'); return true; }
        /* inside: a slice at the cursor */
        const i = auInfo(t, c);
        const mk = auMarks(t, c);
        const f = ed.cur, [blo, bhi] = slcCursorBounds(ed);
        if (f < blo + 16 || f > bhi - 15) return true;     /* the engine refuses a split at the range's edge */
        if (mk.length < AU_EVEN_MAX && !mk.some((m) => Math.abs(m[0] - f) < 16)) {
            auMarkAdd(t, c, f);
            const nm = (i.whole ? [[i.rstart | 0, auEnd(i)]] : mk).map((m) => m.slice());
            let k = 0;
            while (k < nm.length && nm[k][0] < f) k++;
            if (k > 0) { nm.splice(k, 0, [f, nm[k - 1][1] > f + 16 ? nm[k - 1][1] : (k < nm.length ? nm[k][0] : auEnd(i))]); nm[k - 1][1] = f; }
            else nm.unshift([f, nm.length ? nm[0][0] : auEnd(i)]);
            S.auInfo[t][c] = Object.assign({}, i, { even: 0, whole: 0, hand: nm.length, n: nm.length });
            auMarksLocal(t, c, nm);
            S.pendingPadNoteMapRecompute = true;
            S.ledsDirtyAudio = true;
        }
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        const held = S.backHoldFired;
        S.backPressTick = -1; S.backHoldFired = false;
        if (held) return true;
        if (sub === 'lazy') lazyFinish(ed);
        else if (kind) { closeChop(ed, true); ed.page = 0; }
        else leaveWave();
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveNoteSession) { closeAudioPanel(); return false; }
    return false;
}

/* Returns true when the message was the WAVE editor's. */
export function audioEditorInput(status, d1, d2) {
    const ed = S.auEditor;
    if (!ed) return false;
    const hi = status & 0xF0;
    if (ed.ask) return askInput(ed, status, d1, d2);
    if (ed.pick) return pickInput(ed, status, d1, d2);
    auWaveView(ed);
    if (isSlicerEd(ed)) return slcInput(ed, status, d1, d2);
    const sub = ed.mode === 'lazy' ? 'lazy' : auWaveSub(ed);
    const kind = chopKind(ed);
    /* Manual: the slice the pads pick, a cursor, markers */
    const hand = kind === 'manual' && sub === 'chop';
    /* K1 / K3: an Audio clip's Start / End on WAVE, the picked chop's on
     * SLICES and in Manual; Even and Transient leave them be, and so does a
     * Slicer's SAMPLE (no Start or Length: what plays is its chops) */
    const ends = sub === 'loop' || (sub === 'chop' && (hand || (!kind && ed.ed === 'slices')));
    /* SAMPLE's two pages, turned by the jog (Josh, 2026-10-29: "the waveform
     * on page 1 and the params on page 2"); a chop editor keeps the jog */
    const plain = (sub === 'loop' || sub === 'chop') && !kind;
    /* ...and since 2026-11-14 three: the waveform, TIME, SOUND (a SLICES
     * editor keeps two); `p2` is any page after the waveform */
    const p2 = plain && (ed.page | 0) >= 1;
    /* SLICES (Josh, 2026-10-29): page 1 the chops — K1 / K3 the picked slice's
     * start / end, K2 Zoom, a click the chop types; page 2 the slice's sound,
     * Shift held for every slice */
    const sl = ed.ed === 'slices' && sub === 'chop';
    const slEdit = sl && plain && !p2;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7) {
            const on = hi === 0x90 && d2 >= 64;
            /* an automatable knob here (sampleKnob's): the touch opens its
             * gesture, Delete + touch clears its lane, Mute + touch switches
             * the lane off / on — as a bank knob's touch does */
            /* ...and SLICES' with Shift held: ALL SLICES' (a single chop's own
             * sound is not automated) */
            let af = sampleAutoField(d1, plain, plain ? ed.page | 0 : 0, sl, slEdit);
            if (af === 'bpm10' && auIsFree(auInfo(ed.t, ed.c))) af = null;   /* Free: that knob is Speed */
            const asf = !af && S.shiftHeld && ((p2 && sl) || (slEdit && d1 > 2)) ? SLICE_GRID[d1] : null;
            const akey = af ? auAutoKey(af) : asf ? auSlicesAutoKey(asf) : null;
            if (akey) {
                const tgt = 'seq:' + ed.t + ':' + akey;
                if (on && S.deleteHeld) {
                    if (automationClearKey(ed.t, ed.c, tgt)) showActionPopup('AUTOMATION', 'CLEARED');
                } else if (on && S.muteHeld) {
                    S.muteUsedAsModifier = true;
                    const r = automationToggleActive(ed.t, ed.c, tgt);
                    if (r !== null) showActionPopup('AUTOMATION', r ? 'ON' : 'OFF');
                }
                if (af) auAutoTouch(ed.t, ed.c, af, on);
                else auSlicesAutoTouch(ed.t, ed.c, asf, on);
            }
            /* a release lets go of ALL SLICES' gesture whether or not Shift is
             * still down (a touch begun with it would otherwise stay open) */
            if (!on && !af && SLICE_GRID[d1]) auSlicesAutoTouch(ed.t, ed.c, SLICE_GRID[d1], false);
            if (on) {
                S.knobTouched = d1; S.knobPhysIdx = d1; S.knobTurnedTick[d1] = -1;
                if (d1 === 1) ed.zoomDir = 0;                  /* touched, not turned yet: "ZOOM" */
                /* a touch jumps there: K1 to the start, K3 to the end */
                if ((d1 === 0 || d1 === 2) && ends) {
                    ed.last = d1 === 0 ? 'start' : 'end';
                    centre(ed);
                }
            } else {
                /* a release still lets go */
                if (S.knobTouched === d1) S.knobTouched = -1;
                if (S.knobPhysIdx === d1) S.knobPhysIdx = -1;
            }
            S.screenDirty = true;
            return true;
        }
        if (d1 === MoveMainTouch) {
            /* touching the jog jumps to the cursor (Manual only: the rest have none) */
            if (hi === 0x90 && d2 >= 64 && hand) { ed.last = 'jog'; centre(ed); S.screenDirty = true; }
            return false;
        }
        if (d1 >= 16 && d1 <= 31) return true;               /* steps */
        if (d1 >= TRACK_PAD_BASE && d1 < TRACK_PAD_BASE + 32) {
            const down = hi === 0x90 && d2 > 0;
            const k = auPadToSlice(d1 - TRACK_PAD_BASE, ed.t);
            if (sub === 'lazy') {
                /* only the white pad: the next slice in order */
                if (down) {
                    const lz = auLazyState();
                    const next = lz.state === AU_LAZY_RUN ? lz.n : 0;
                    if (k === next && (lz.state === AU_LAZY_ARMED || lz.state === AU_LAZY_RUN) && next < AU_EVEN_MAX) {
                        auLazyTap(ed.t);
                        lz.state = AU_LAZY_RUN; lz.n = next + 1;
                        S.ledsDirtyAudio = true;
                        S.screenDirty = true;
                    }
                }
                return true;
            }
            /* Loop: the pads do nothing here — its chops are invisible */
            if (sub !== 'chop') return sub === 'loop';
            const i = auInfo(ed.t, ed.c);
            if (S.deleteHeld) {
                /* Delete + pad (Manual): that slice's start goes (merges into
                 * the one before); slice 1's stays */
                if (hand && down && k >= 1 && k < i.n) {
                    bakeLocal(ed);
                    auMarkDel(ed.t, ed.c, k);
                    const mk = auMarks(ed.t, ed.c).map((m) => m.slice());
                    if (mk[k - 1][1] === mk[k][0]) mk[k - 1][1] = mk[k][1];
                    mk.splice(k, 1);
                    S.auInfo[ed.t][ed.c] = Object.assign({}, i, { even: 0, hand: i.n - 1, n: i.n - 1 });
                    auMarksLocal(ed.t, ed.c, mk);
                    if (auSelSlice(ed.t) >= mk.length) auSetSelSlice(ed.t, mk.length - 1);
                    S.pendingPadNoteMapRecompute = true;
                    S.ledsDirtyAudio = true;
                }
                return true;
            }
            if (down && k < i.n) {
                /* the view goes to the chop's start at the zoom it has (Josh,
                 * 2026-10-28: "zoom persists through selection by pads (which
                 * should snap to slice start") */
                auSetSelSlice(ed.t, k);
                const m = auMarks(ed.t, ed.c)[k];
                if (m) {
                    if (hand) { ed.cur = m[0]; ed.last = 'jog'; }
                    centre(ed, m[0]);
                }
                ed.endHold = 0;
                S.ledsDirtyAudio = true;
                S.screenDirty = true;
            }
            /* the pad still plays its chop */
            return false;
        }
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) {
        const k = d1 - 71, dd = decodeDelta(d2);
        if (!dd || (sub !== 'chop' && sub !== 'loop')) return true;
        if ((p2 && sl) || (slEdit && k > 2)) {
            /* SLICES: page 2, and page 1's K4-K8 — the same knobs (Josh,
             * 2026-10-30: they "need to correspond to the slice params and work
             * with shift for all slices too"): slice n, every slice with Shift */
            S.knobTouched = k; S.knobTurnedTick[k] = S.clockMs;
            const ped = { t: ed.t, page: S.shiftHeld ? 0 : 1 };
            const cls = auPanelKnobClass(ped, k);
            const st = cls === 'pick' ? knobStep(k, d2, KNOB_PICK) : cls === 'delib' ? knobStep(k, d2, KNOB_DELIB) : ccKnobDelta(d2, k);
            if (st && auPanelKnob(ped, k, st)) { S.pendingPadNoteMapRecompute = true; }
            S.screenDirty = true;
            return true;
        }
        if (p2) {
            /* SAMPLE page 2 TIME / page 3 SOUND: each knob its field */
            S.knobTouched = k; S.knobTurnedTick[k] = S.clockMs;
            sampleKnob(ed, auPageFields(ed.page | 0)[k], k, d2);
            S.screenDirty = true;
            return true;
        }
        if ((k === 0 || k === 2) && !ends) return true;
        let moved = false;
        /* Start, Zoom and End light while turned, as a touched knob does (the
         * tick lets go KNOB_TURN_HIGHLIGHT_MS after the last turn) — Josh,
         * 2026-10-28: "start and end values need to be highlighted while
         * they're turned/touched" */
        if (k <= 7) {
            S.knobTouched = k; S.knobTurnedTick[k] = S.clockMs;
            if (k === 1) ed.zoomDir = dd > 0 ? 1 : -1;
            S.screenDirty = true;
        }
        if (k === 1) moved = zoom(ed, dd > 0 ? 1 : -1);
        else if (k === 0 || k === 2) {
            ed.last = k === 0 ? 'start' : 'end';
            if (hand || slEdit) moved = chopPoint(ed, ed.last, dd);
            else {
                /* K1 Start, K3 End: a pixel a detent, a frame zoomed all
                 * the way in; the Length is the Loop gestures' (Josh,
                 * 2026-11-12: "i need it fine like start") */
                moved = auRangeStep(ed.t, ed.c, k === 0 ? 'start' : 'end', dd, auEdPixel(ed));
                if (moved) centre(ed);
            }
        } else moved = sampleKnob(ed, AU_P1_FIELDS[k], k, d2);
        if (moved) S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainKnob) {
        const dd = decodeDelta(d2);
        if (dd && plain) {
            const n = ed.ed === 'slices' && sub === 'chop' ? 2 : AU_SAMPLE_PAGES;
            const pg = Math.max(0, Math.min(n - 1, (ed.page | 0) + (dd > 0 ? 1 : -1)));
            if (pg !== (ed.page | 0)) { ed.page = pg; S.knobTouched = -1; S.screenDirty = true; }
            return true;
        }
        if (!dd || sub !== 'chop') return true;
        const i = auInfo(ed.t, ed.c);
        ed.jogAt = S.clockMs | 0;
        if (kind === 'even') {
            /* the count, live on the pads (Josh, 2026-10-28: "can we have even
             * samples populate dynamically on the pads as we increase/decrease
             * the number?") */
            const v = Math.max(2, Math.min(AU_EVEN_MAX, (i.n | 0) + (dd > 0 ? 1 : -1)));
            if (v !== (i.n | 0)) setEven(ed, v);
        } else if (kind === 'transient') {
            const v = Math.max(0, Math.min(100, (i.sens | 0) + dd * (S.shiftHeld ? 5 : 1)));   /* a fast turn goes further */
            if (v !== (i.sens | 0)) setSens(ed, v);
        } else if (hand) {
            const step = S.shiftHeld ? 1 : auEdPixel(ed);
            const [blo, bhi] = auViewBounds(ed);   /* the chopped part (and any chop past it) */
            ed.cur = Math.max(blo, Math.min(bhi - 1, ed.cur + dd * step));
            ed.last = 'jog';
            centre(ed, ed.cur);
        }
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainButton) {
        if (d2 !== 127) return true;
        S.screenDirty = true;
        /* A click outside Manual closes the chop editor, the chops kept, as
         * Back does (Josh, 2026-10-30: "get rid of click to insert a [slice]
         * outside of manual mode. click in editor closes the editor and saves
         * the slices just like back"): Lazy ends keeping what it chopped,
         * Even / Transient keep theirs */
        if (sub === 'lazy') { lazyFinish(ed); return true; }
        /* no sample: click loads one */
        if (sub === 'empty') { S.pendingAudioChooser = { t: ed.t, c: ed.c }; return true; }
        if (kind && !hand) { closeChop(ed, true); return true; }
        if (p2 && S.deleteHeld) {
            /* Delete + click: the page showing back to its defaults, as on a
             * bank (Josh, 2026-10-28: "for multi-page banks, we should have
             * delete+jog only reset the active page") — slice n, every slice
             * with Shift; SAMPLE's TIME (Sync, Warp, Nudge, Offset) or SOUND
             * (Gain, Pitch, Detune) */
            if (sl) {
                if (auPanelReset({ t: ed.t, page: S.shiftHeld ? 0 : 1 })) showActionPopup(S.shiftHeld ? 'ALL SLICES' : 'SLICE', 'RESET');
            } else if ((ed.page | 0) === 1) { if (auTimeReset(ed.t, ed.c)) showActionPopup('TIME', 'RESET'); }
            else if (auSampleReset(ed.t, ed.c)) showActionPopup('SOUND', 'RESET');
            S.screenDirty = true;
            return true;
        }
        if (sl && p2) return true;
        /* touch Tempo + click, on the waveform or TIME: Tempo's menu — Fit
         * to clip (a Loop clip's) · Original tempo (Josh, 2026-11-02: "both
         * on a small pop-up menu that shows when you touch click tempo") */
        if (!sl && plain && S.knobTouched >= 0 && auPageFields(ed.page | 0)[S.knobTouched] === 'tempo' && !auIsFree(auInfo(ed.t, ed.c))) {
            auAutoTouch(ed.t, ed.c, 'bpm10', false);           /* the menu takes the knob's release */
            ed.pick = { level: 1, sel: 0, tempo: true };
            return true;
        }
        if (slEdit) { ed.pick = { level: 2, sel: 0, only2: true }; return true; }   /* the chop types */
        if (p2) return true;
        if (!hand) {
            /* SAMPLE: a click opens its menu — Load sample · Trim · Normalize
             * (Josh, 2026-10-30: "it should load a menu for consistency");
             * chopping is SLICES' alone */
            ed.pick = { level: 1, sel: 0 };
            return true;
        }
        /* Manual: Delete + click clears them all (it asks) */
        if (S.deleteHeld) { ed.ask = { kind: 'clear', sel: 1 }; return true; }
        if (S.shiftHeld) return true;
        /* a chop at the cursor */
        const i = auInfo(ed.t, ed.c);
        const mk = auMarks(ed.t, ed.c);
        const f = ed.cur;
        if (mk.length < AU_EVEN_MAX && !mk.some((m) => Math.abs(m[0] - f) < 16)) {
            auMarkAdd(ed.t, ed.c, f);
            const nm = mk.map((m) => m.slice());
            let k = 0;
            while (k < nm.length && nm[k][0] < f) k++;
            if (k > 0) { nm.splice(k, 0, [f, nm[k - 1][1] > f + 16 ? nm[k - 1][1] : (k < nm.length ? nm[k][0] : auEnd(i))]); nm[k - 1][1] = f; }
            else nm.unshift([f, nm.length ? nm[0][0] : auEnd(i)]);
            S.auInfo[ed.t][ed.c] = Object.assign({}, i, { even: 0, hand: i.n + 1, n: i.n + 1 });
            auMarksLocal(ed.t, ed.c, nm);
            S.pendingPadNoteMapRecompute = true;
            S.ledsDirtyAudio = true;
        }
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        const held = S.backHoldFired;
        S.backPressTick = -1; S.backHoldFired = false;
        if (held) return true;
        /* Back closes a chop editor keeping its chops, no question (Josh,
         * 2026-10-30: "get rid of the comfirmation for back") */
        if (sub === 'lazy') lazyFinish(ed);
        else if (kind === 'even' || kind === 'transient') closeChop(ed, true);
        else if (kind) closeChop(ed, false);
        else leaveWave();
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveNoteSession) { closeAudioPanel(); return false; }
    return false;
}

/* The SLICE menu's "Clear all slices?" and SAMPLE's Trim / Normalize — the jog picks
 * (clockwise toward Yes, on the right), a click answers, Back is No. */
function askInput(ed, status, d1, d2) {
    const hi = status & 0xF0;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7 && (hi === 0x80 || d2 < 64)) {
            if (S.knobTouched === d1) S.knobTouched = -1;
            if (S.knobPhysIdx === d1) S.knobPhysIdx = -1;
        }
        return true;                                         /* pads and steps wait */
    }
    if (status !== 0xB0) return false;
    if (d1 === MoveMainKnob) {
        const dd = decodeDelta(d2);
        if (dd) { ed.ask.sel = dd > 0 ? 0 : 1; S.screenDirty = true; }
        return true;
    }
    let yes = null;
    if (d1 === MoveMainButton && d2 === 127) yes = ed.ask.sel === 0;
    if (d1 === MoveBack && d2 < 64) yes = false;
    if (yes === null) return d1 === MoveMainButton || d1 === MoveBack || (d1 >= 71 && d1 <= 78);
    if (ed.ask.kind === 'edit') {
        /* Trim / Normalize: New (a sample for this clip) or Overwrite (the
         * project's copy, every clip on it); Back changes nothing */
        const op = ed.ask.op, ow = ed.ask.sel === 1;
        ed.ask = null;
        S.backPressTick = -1; S.backHoldFired = false;
        if (d1 === MoveMainButton) auEdit(ed.t, ed.c, op === 'norm' ? 1 : 0, ow);
        S.screenDirty = true;
        return true;
    }
    const kind = ed.ask.kind;
    ed.ask = null;
    S.backPressTick = -1; S.backHoldFired = false;
    if (kind === 'clear' && yes) {
        clearChops(ed);
    }
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
    S.screenDirty = true;
    return true;
}

/* SAMPLE's knob rings: K1 Start, K2 Zoom, K3 End, K4 Offset, K5 Pitch, K6 Detune, K7 Tempo, K8 Gain,
 * each where it sits — the clip's Start / End, the picked slice's in Manual,
 * none in Even / Transient; dark with no sample, in a Lazy chop, under the
 * picker or a question, and on K8. */
export function waveRingCells(ed) {
    if (isSlicerEd(ed)) return slcRingCells(ed);
    if (!ed || ed.ask || ed.pick || ed.mode === 'lazy') return [null, null, null, null, null, null, null, null];
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    const sub = auWaveSub(ed);
    if (sub !== 'chop' && sub !== 'loop' || !fr) return [null, null, null, null, null, null, null, null];
    const at = (n) => ({ kind: 'arc', norm: Math.max(0, Math.min(1, n)) });
    const kind = chopKind(ed);
    const slp = ed.ed === 'slices' && sub === 'chop' && !kind;
    const slRings = () => auPanelRingCells({ t: ed.t, page: S.shiftHeld ? 0 : 1 });
    if (slp && ed.page === 1) return slRings();
    const free = auIsFree(i);
    /* Offset's ring: a Loop or Shot clip's, dark where the knob does nothing */
    const offRing = sub === 'loop' && !isSlicerTrack(ed.t) ? at(auShiftNorm(ed.t, ed.c, i)) : null;
    const sampleRings = () => [at(((i.gain | 0) + 40) / 52), at(((i.pitch | 0) + 24) / 48), at(((i.detune | 0) + 50) / 100),
                               free ? at(((i.speed || 1000) - AU_SPEED_MIN) / (AU_SPEED_MAX - AU_SPEED_MIN))
                                    : at(((Math.round(auBpm(i) * 10) || 1200) - AU_BPM10_MIN) / (AU_BPM10_MAX - AU_BPM10_MIN))];
    if (!kind && (ed.page | 0) >= 1) {
        /* pages 2 and 3: lit where a knob works, from the cells as drawn */
        return auSamplePageCells(ed.t, ed.c, ed.page | 0).map(auCellRing);
    }
    let a = i.rstart, b = auEnd(i);
    if (kind === 'manual' || slp) {
        const m = auMarks(ed.t, ed.c)[auSelSlice(ed.t)];
        if (m) { a = m[0]; b = m[1]; }
    }
    if (slp) {
        const span = Math.max(MIN_SPAN, (ed.B | 0) - (ed.A | 0));
        const zoom = fr > MIN_SPAN ? 1 - Math.log(span / MIN_SPAN) / Math.log(fr / MIN_SPAN) : 0;
        return [at(a / fr), at(zoom), at(b / fr)].concat(slRings().slice(3));
    }
    const span = Math.max(MIN_SPAN, (ed.B | 0) - (ed.A | 0));
    const zoom = fr > MIN_SPAN ? 1 - Math.log(span / MIN_SPAN) / Math.log(fr / MIN_SPAN) : 0;
    /* (a Slicer's SAMPLE has no Start or End to turn) */
    const ends = kind !== 'even' && kind !== 'transient' && !(isSlicerTrack(ed.t) && !kind && ed.ed !== 'slices');
    const sr = sampleRings();
    /* page 1: K4 Offset, K5 Pitch, K6 Detune, K7 Tempo, K8 Gain */
    return [ends ? at(a / fr) : null, at(zoom), ends ? at(b / fr) : null, offRing, sr[1], sr[2], sr[3], sr[0]];
}

/* The rings while an Audio screen holds the knobs: WAVE's, the AUDIO
 * editor's, none under the sample chooser. */
registerScreenRingCells(() => {
    if (S.auChooser) return [null, null, null, null, null, null, null, null];
    if (!S.auPanel || S.stepReveal) return null;      /* a held step's page: its own rings */
    if (S.auEditor) return waveRingCells(S.auEditor);
    return auPanelRingCells(S.auPanel);
});

