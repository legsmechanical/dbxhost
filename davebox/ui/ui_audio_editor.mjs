/* ui_audio_editor.mjs — the AUDIO editor and the WAVE editor.
 *
 * THE AUDIO EDITOR (S.auPanel) is an Audio track's instrument door — the
 * sound menu's click on "Audio", the bank map's AUDIO pad (Josh, 2026-10-27:
 * "inst ... would take you an editor with all the audio settings"). It edits
 * the track's current clip's SOUND (Josh, 2026-10-28, from the Layout Map:
 * SLICING "don't need this - it's now on wave"; ALL SLICES "merge with
 * "clip""):
 *   CLIP, Slice mode  Mode · Pitch · Gain · Revrs · Attk · Decay · Play (every
 *                     slice, `--` while they differ) · >Seq› (slices to steps)
 *   CLIP, Loop mode   Mode · Pitch · Gain · Jump · Revrs · Nudge · JmpQ
 *   SLICE n           Pitch · Gain · Revrs · Attk · Decay · Play (Slice mode)
 * The jog turns pages; a knob turns its cell; touch + click fires >Seq. The
 * pads stay live — a tap picks the slice SLICE n edits. Back closes.
 *
 * THE WAVE EDITOR (S.auEditor, opened by the map's WAVE pad, with an AUDIO
 * editor under it that Back closes too) is the clip's SAMPLE (Josh: "new
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

import { S, loopViewActive } from './ui_state.mjs';
import { MoveBack } from '/data/UserData/schwung/shared/constants.mjs';
import { MoveMainKnob, MoveMainButton, MoveMainTouch, MoveNoteSession, TRACK_PAD_BASE } from './ui_constants.mjs';
import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';
import { nowMs } from './ui_clock.mjs';
import { auInfo, auClipOf, auLazyStart, auLazyStop, auLazyTap, auLazyKeep, auLazyState, auMarkStale,
         auPanelPages, auPanelPageName, auPanelKnob, auPanelKnobClass, auChop, auPadToSlice,
         auSelSlice, auSetSelSlice, isAudioTrack, auMarks, auMarksLocal, auSliceStart, auSliceEnd,
         auMarkAdd, auMarkDel, auManual, auEvenBake, auTrans, auTransBake, auRangeStep, auSet, auEnd, auPanelRingCells, auPanelReset,
         auIsSlice, AU_LAZY_ARMED, AU_LAZY_RUN, AU_LAZY_ENDED, AU_EVEN_MAX, AU_BPM10_MIN, AU_BPM10_MAX, auLenTicks,
         auSampleP2Cells, auSampleP2Knob, auSampleReset, auEdit, auTrimCuts, auOrig, auNudgeStep, auFpt, auPlayedEnd } from './ui_audio.mjs';
import { registerScreenRingCells } from './ui_knob_leds.mjs';
import { auModeValue } from './ui_pure.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { ccKnobDelta, knobPick, KNOB_PICK, KNOB_DELIB } from './ui_input_cc.mjs';
import { showActionPopup } from './ui_persistence.mjs';

/* One step per detent run (ui_input_cc's knobStep; its exports are only used
 * inside function bodies here — the two modules import each other). */
function knobStep(k, d2, need) {
    const steps = knobPick(k, decodeDelta(d2), need);
    return steps === 0 ? 0 : (steps > 0 ? 1 : -1);
}

/* ---- the AUDIO editor ---- */

export function audioPanelOpen() { return !!S.auPanel; }

export function openAudioEditor(t) {
    if (!isAudioTrack(t)) return false;
    S.auPanel = { t, page: 0 };
    S.knobTouched = -1;
    S.screenDirty = true;
    return true;
}


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
    const hi = status & 0xF0;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7) {                            /* knob touches */
            /* A PHYSICAL touch, as the knob handler records it: the tick
             * clears a touched knob ~600 ms after a turn unless knobPhysIdx
             * says a finger is on it — so a knob turned earlier lost its
             * touch before the click (found by Josh: Edit did nothing). */
            if (hi === 0x90 && d2 >= 64) { S.knobTouched = d1; S.knobPhysIdx = d1; S.knobTurnedTick[d1] = -1; }
            else {
                if (S.knobTouched === d1) S.knobTouched = -1;
                if (S.knobPhysIdx === d1) S.knobPhysIdx = -1;
            }
            S.screenDirty = true;
            return true;
        }
        if (d1 >= 16 && d1 <= 31) return true;               /* steps */
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) {
        const k = d1 - 71;
        const cls = auPanelKnobClass(ed, k);
        const st = cls ? knobStep(k, d2, cls === 'pick' ? KNOB_PICK : KNOB_DELIB) : ccKnobDelta(d2, k);
        if (st && auPanelKnob(ed, k, st)) S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainKnob && !S.shiftHeld) {
        const dd = decodeDelta(d2);
        if (dd) {
            const n = auPanelPages(ed.t).length;
            ed.page = Math.max(0, Math.min(n - 1, (ed.page | 0) + (dd > 0 ? 1 : -1)));
            S.screenDirty = true;
        }
        return true;
    }
    if (d1 === MoveMainButton) {
        if (d2 >= 64 && S.deleteHeld && auPanelReset(ed)) showActionPopup(auPanelPageName(ed) === 'CLIP' ? 'CLIP' : 'SLICE', 'RESET');
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        const held = S.backHoldFired;
        S.backPressTick = -1; S.backHoldFired = false;
        if (!held) closeAudioPanel();
        return true;
    }
    if (d1 === MoveNoteSession) { closeAudioPanel(); return false; }
    return false;
}

/* A pad tap on an Audio track in Slice mode: that slice is the one SLICE n
 * edits (the pad still plays it). */
export function auPadTapped(t, padIdx) {
    if (!isAudioTrack(t)) return;
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
    if (!isAudioTrack(t)) return false;
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
    if (ed.full || ed.B - ed.A > hi - lo) { ed.A = lo; ed.B = hi; ed.full = true; }
    else if (ed.A < lo || ed.B > hi) { const sp = ed.B - ed.A; ed.A = Math.max(lo, Math.min(hi - sp, ed.A)); ed.B = ed.A + sp; }
}
/* What the view spans zoomed all the way out. SAMPLE's plain view (no chop
 * editor up): the clip's window — Start for its Length at the sample's Tempo,
 * running past the file's end when the Length does (drawn empty) — so the
 * screen is the clip, the audio where it lands (Josh, 2026-10-29: "the actual
 * part of the sample that plays needs to stretch, compress, have empty space
 * after it when zoomed fully out"). Anything else: the whole sample. */
export function auViewBounds(ed) {
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    const sampleView = ed.ed !== 'slices' && !(ed.mode === 'chop' && ed.chop) && ed.mode !== 'lazy';
    if (sampleView && fr && i.state === 2) {
        const lo = i.rstart | 0;
        const hi = Math.round(lo + auLenTicks(ed.t, ed.c, i) * auFpt(i));
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

/* A chop method leaves the Mode alone: the chops serve both (Josh,
 * 2026-10-28: one set of chops; Mode "tells the sequencer how to handle the
 * slices"). */
function startLazy(ed) {
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

function setEven(ed, v) {
    const t = ed.t, c = ed.c;
    const i = auInfo(t, c);
    auSet(t, c, 'even', v);
    S.auInfo[t][c] = Object.assign({}, i, { even: v, trans: 0, n: v || i.hand });
    chopsMoved(t, v || i.hand);
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
function setSens(ed, v) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    auSet(t, c, 'sens', v);
    S.auInfo[t][c] = Object.assign({}, i, { sens: v });
    chopsMoved(t, i.n);
}

/* A chop picked on a Loop clip (SAMPLE › Chop sample): the clip becomes a
 * Slice clip, as Mode does on the CLIP bank (the engine puts its chops on the
 * steps when it has none), and the editor becomes SLICES — the chop editor
 * opens there and its Back lands there. */
function toSlice(ed) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    if (auIsSlice(i)) return;
    auSet(t, c, 'mode', auModeValue(true));
    S.auInfo[t][c] = Object.assign({}, i, { mode: auModeValue(true) });
    S.auSrc[t] = 'slices';
    ed.ed = 'slices';
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
}

/* The CHOP editor on `kind`, from the picker. */
function openChop(ed, kind) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    ed.chop = { kind, orig: { even: i.even | 0 } };
    ed.mode = 'chop';
    ed.chopAt = S.clockMs | 0;
    if (kind === 'even') setEven(ed, i.even || 16);
    else if (kind === 'transient') {
        auTrans(t, c, 1);
        const n = auTransCount(i);
        S.auInfo[t][c] = Object.assign({}, i, { even: 0, trans: 1, n });
        chopsMoved(t, n);
    } else {
        const m = auMarks(t, c)[auSelSlice(t)];
        ed.cur = m ? m[0] : i.rstart;
        ed.last = 'jog';
    }
}
/* Out of the chop editor, back to WAVE: Even / Transient's chops kept (the
 * clip's own now) or put back as they were. */
function closeChop(ed, keep) {
    const t = ed.t, c = ed.c, i = auInfo(t, c), kind = ed.chop && ed.chop.kind;
    if (kind === 'even' || kind === 'transient') {
        if (keep) {
            if (kind === 'even') auEvenBake(t, c); else auTransBake(t, c);
            S.auInfo[t][c] = Object.assign({}, i, { even: 0, trans: 0, hand: i.n });
            chopsMoved(t, i.n);
        } else if (kind === 'even') {
            setEven(ed, ed.chop.orig.even);
        } else {
            auTrans(t, c, 0);
            S.auInfo[t][c] = Object.assign({}, i, { trans: 0, n: i.hand });
            if (ed.chop.orig.even) setEven(ed, ed.chop.orig.even);
            else chopsMoved(t, i.hand);
        }
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
        /* closed under a running chop (Note/Session, a track change): the old
         * chops back */
        const st = auLazyState().state;
        if (st === AU_LAZY_ARMED || st === AU_LAZY_RUN) auLazyStop(ed.t, ed.c);
        auLazyKeep(ed.t, ed.c, 0);
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
    if (!ed || !S.auPanel || !isAudioTrack(ed.t)) return;
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
    const span = ed.B - ed.A, [lo, hi] = auViewBounds(ed);
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
    if (chopKind(ed) !== 'manual') return auEnd(i);
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
    S.auInfo[t][c] = Object.assign({}, i, { [field]: v });
    return true;
}
/* K7: the sample's own Tempo, 1 BPM a detent (Shift 0.1) — what Sync and
 * >Seq's step places follow (Josh, 2026-10-29: Move's "tempo knob to set the
 * original tempo"). */
function clipTempo(ed, dir) {
    const t = ed.t, c = ed.c, i = auInfo(t, c);
    const cur = i.bpm10 || 1200;
    const v = Math.max(AU_BPM10_MIN, Math.min(AU_BPM10_MAX, cur + dir * (S.shiftHeld ? 1 : 10)));
    if (v === (i.bpm10 | 0)) return false;
    auSet(t, c, 'bpm', v);
    const loc = Object.assign({}, i, { bpm10: v });
    loc.rend = auPlayedEnd(t, c, loc);
    S.auInfo[t][c] = loc;
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    /* the view stays on what was touched last: Length's end moves with the
     * Tempo (Josh, 2026-10-30: "if i last touched length, wave view should
     * stay focused on the end of the clip while adjusting bpm") */
    centre(ed);
    return true;
}

/* SAMPLE's K4-K8, on both its pages: K4 Gain, K5 Pitch, K6 Detune — the
 * clip's, in either mode (Josh, 2026-10-28: "put gain on a knob in wave edit
 * mode ... same with pitch and detune on k5/6"; "The whole clip") — K7 the
 * sample's Tempo, K8 Revrs (Nudge left SAMPLE, Josh, 2026-10-30). */
function sampleKnob(ed, k, d2) {
    if (k === 3) { const st = ccKnobDelta(d2, k); return !!st && clipStep(ed, 'gain', st > 0 ? 1 : -1); }
    if (k === 4) { const st = knobStep(k, d2, KNOB_PICK); return !!st && clipStep(ed, 'pitch', st); }
    if (k === 5) { const st = ccKnobDelta(d2, k); return !!st && clipStep(ed, 'detune', st); }
    if (k === 6) { const st = ccKnobDelta(d2, k); return !!st && clipTempo(ed, st > 0 ? 1 : -1); }
    if (k === 7) { const st = knobStep(k, d2, KNOB_DELIB); return !!st && auSampleP2Knob(ed.t, ed.c, 7, st); }
    return false;
}

/* The picker's rows at its level. */
export function auPickRows(ed) {
    const p = ed.pick;
    if (!p) return [];
    const i = auInfo(ed.t, ed.c);
    /* SAMPLE's menu (Josh, 2026-10-30: "it should load a menu for consistency.
     * AND i want to add trim and normalize options there"); chopping is
     * SLICES' alone */
    /* ...and on a Loop clip, Chop sample (Josh, 2026-10-30: "when mode is loop
     * and the sample menu is opened, can we add chopping options to the menu
     * there, which switch the clip into slice mode?") */
    if (p.level === 1) return i.state === 2
        ? [{ id: 'load', label: 'Load sample', chevron: true }, { id: 'trim', label: 'Trim' }, { id: 'norm', label: 'Normalize' }]
            .concat(auIsSlice(i) ? [] : [{ id: 'chop', label: 'Chop sample', chevron: true }])
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
        if (row.id === 'trim' || row.id === 'norm') {
            ed.pick = null;
            /* nothing to cut: say so rather than ask */
            if (row.id === 'trim' && !auTrimCuts(ed.t, ed.c)) { showActionPopup('TRIM', 'Nothing to cut'); return true; }
            ed.ask = { kind: 'edit', op: row.id, sel: 0 };   /* opens on New (Josh: "new copy is default") */
            return true;
        }
        if (row.id === 'kit') { ed.pick = null; S.pendingAuKit = { t: ed.t, c: ed.c }; return true; }   /* reads + a copy: the tick's */
        if (row.id === 'chop') { ed.pick = { level: 2, sel: 0, from: p.sel }; return true; }
        ed.pick = null;
        toSlice(ed);                                         /* a Loop clip's chop: it becomes a Slice clip */
        if (row.id === 'lazy') startLazy(ed);
        else openChop(ed, row.id);
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        S.backPressTick = -1; S.backHoldFired = false;
        if (p.level === 2 && !p.only2) ed.pick = { level: 1, sel: p.from != null ? p.from : 1 };
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

/* Returns true when the message was the WAVE editor's. */
export function audioEditorInput(status, d1, d2) {
    const ed = S.auEditor;
    if (!ed) return false;
    const hi = status & 0xF0;
    if (ed.ask) return askInput(ed, status, d1, d2);
    if (ed.pick) return pickInput(ed, status, d1, d2);
    auWaveView(ed);
    const sub = ed.mode === 'lazy' ? 'lazy' : auWaveSub(ed);
    const kind = chopKind(ed);
    /* Manual: the slice the pads pick, a cursor, markers */
    const hand = kind === 'manual' && sub === 'chop';
    /* K1 / K3: the clip's Start / End on WAVE, the slice's in Manual; Even
     * and Transient leave them be */
    const ends = sub === 'loop' || (sub === 'chop' && (!kind || hand));
    /* SAMPLE's two pages, turned by the jog (Josh, 2026-10-29: "the waveform
     * on page 1 and the params on page 2"); a chop editor keeps the jog */
    const plain = (sub === 'loop' || sub === 'chop') && !kind;
    const p2 = plain && ed.page === 1;
    /* SLICES (Josh, 2026-10-29): page 1 the chops — K1 / K3 the picked slice's
     * start / end, K2 Zoom, a click the chop types; page 2 the slice's sound,
     * Shift held for every slice */
    const sl = ed.ed === 'slices' && sub === 'chop';
    const slEdit = sl && plain && !p2;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7) {
            const on = hi === 0x90 && d2 >= 64;
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
            /* SAMPLE page 2: page 1's knobs in their places — K2 Sync where Zoom
             * is, no Start / Length; K1 Orig fires on touch + click */
            S.knobTouched = k; S.knobTurnedTick[k] = S.clockMs;
            if (k === 1) {
                const st = knobStep(k, d2, KNOB_PICK);
                if (st) auSampleP2Knob(ed.t, ed.c, k, st);
            } else if (k > 2) sampleKnob(ed, k, d2);
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
                /* K1 Start (a pixel a detent), K3 Length (a bar a detent, Shift a step) */
                moved = k === 0 ? auRangeStep(ed.t, ed.c, 'start', dd, auEdPixel(ed))
                                : auRangeStep(ed.t, ed.c, 'length', dd > 0 ? 1 : -1);
                if (moved) centre(ed);
            }
        } else if (k < 7 || plain) moved = sampleKnob(ed, k, d2);
        if (moved) S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainKnob) {
        const dd = decodeDelta(d2);
        if (dd && plain) {
            const pg = dd > 0 ? 1 : 0;
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
            const v = Math.max(2, Math.min(AU_EVEN_MAX, (i.even | 0) + (dd > 0 ? 1 : -1)));
            if (v !== (i.even | 0)) setEven(ed, v);
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
             * with Shift; SAMPLE's Gain, Pitch, Detune and Revrs */
            if (sl) {
                if (auPanelReset({ t: ed.t, page: S.shiftHeld ? 0 : 1 })) showActionPopup(S.shiftHeld ? 'ALL SLICES' : 'SLICE', 'RESET');
            } else if (auSampleReset(ed.t, ed.c)) showActionPopup('SAMPLE', 'RESET');
            S.screenDirty = true;
            return true;
        }
        if (sl && p2) return true;
        if (slEdit) { ed.pick = { level: 2, sel: 0, only2: true }; return true; }   /* the chop types */
        if (p2) {
            /* touch K1 + click: Orig */
            if (S.knobTouched === 0) auOrig(ed.t, ed.c);
            return true;
        }
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

/* Manual's "Clear all chops?" and SAMPLE's Trim / Normalize — the jog picks
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

/* WAVE's knob rings: K1 Start, K2 Zoom, K3 End, K4 Gain, K5 Pitch, K6 Detune, K7 Bars,
 * each where it sits — the clip's Start / End, the picked slice's in Manual,
 * none in Even / Transient; dark with no sample, in a Lazy chop, under the
 * picker or a question, and on K8. */
export function waveRingCells(ed) {
    if (!ed || ed.ask || ed.pick || ed.mode === 'lazy') return [null, null, null, null, null, null, null, null];
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    const sub = auWaveSub(ed);
    if (sub !== 'chop' && sub !== 'loop' || !fr) return [null, null, null, null, null, null, null, null];
    const kind = chopKind(ed);
    const slp = ed.ed === 'slices' && sub === 'chop' && !kind;
    const at = (n) => ({ kind: 'arc', norm: Math.max(0, Math.min(1, n)) });
    const slRings = () => auPanelRingCells({ t: ed.t, page: S.shiftHeld ? 0 : 1 });
    if (slp && ed.page === 1) return slRings();
    const sampleRings = () => [at(((i.gain | 0) + 40) / 52), at(((i.pitch | 0) + 24) / 48), at(((i.detune | 0) + 50) / 100),
                               at(((i.bpm10 || 1200) - AU_BPM10_MIN) / (AU_BPM10_MAX - AU_BPM10_MIN)), at(i.revrs ? 1 : 0)];
    if (!kind && ed.page === 1) {
        /* page 2: Orig, Sync, then page 1's K4-K8 — lit where a knob works */
        const cells = auSampleP2Cells(ed.t, ed.c);
        return [at(1), cells[1] && cells[1].kind !== 'blank' ? at((cells[1].sel | 0) / 2) : null, null].concat(sampleRings());
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
    const ends = kind !== 'even' && kind !== 'transient';
    const sr = sampleRings();
    return [ends ? at(a / fr) : null, at(zoom), ends ? at(b / fr) : null, sr[0], sr[1], sr[2], sr[3], kind ? null : sr[4]];
}

/* The rings while an Audio screen holds the knobs: WAVE's, the AUDIO
 * editor's, none under the sample chooser. */
registerScreenRingCells(() => {
    if (S.auChooser) return [null, null, null, null, null, null, null, null];
    if (!S.auPanel || S.stepReveal) return null;      /* a held step's page: its own rings */
    if (S.auEditor) return waveRingCells(S.auEditor);
    return auPanelRingCells(S.auPanel);
});

