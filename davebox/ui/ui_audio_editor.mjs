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
 *   Loop        K1 Start · K2 Zoom · K3 End of the loop; its chops marked: the
 *               jog a cursor, a click adds a chop there, a pad moves the cursor
 *               to its chop, Delete + pad removes one
 *   Slice       the chop editor: K1 Start · K2 Zoom · K3 End of the slice the
 *               pads pick (it plays); the jog a cursor and a click adds a marker
 *               there; Delete + pad removes one (not slice 1's). An End turned past the next slice's start sticks
 *               there a few detents and reads NEXT.
 * One detent of K1 / K3 / the jog = one screen pixel at the zoom; what was
 * touched last stays in the middle of the screen, the waveform scrolling
 * around it, and touching one jumps there.
 * SHIFT + CLICK opens the picker (Josh: "editor picker is: "Load sample" and
 * "Chop sample" at first level. Chop sample has second level with options."):
 *   Load sample›   the chooser
 *   Chop sample›   Lazy · Manual · Even (2-32, live on the pads as it turns; a
 *                  click makes them the clip's chops) — the Mode stays: the
 *                  chops serve both
 * LAZY: pad 1 white; its tap plays Start..End; then the next pad is white and
 * its tap drops a marker at the playhead; chopped slices stay lit. It ends on
 * Back or at End and asks "Keep N new chops?" (Yes keeps them, No brings the
 * old ones back); Back before the first tap changes nothing. MANUAL asks
 * before it replaces chops made by hand. Back leaves the picker a level at a
 * time, and leaves WAVE. Steps are swallowed; Note/Session closes and falls
 * through. */

import { S } from './ui_state.mjs';
import { MoveBack } from '/data/UserData/schwung/shared/constants.mjs';
import { MoveMainKnob, MoveMainButton, MoveMainTouch, MoveNoteSession, TRACK_PAD_BASE } from './ui_constants.mjs';
import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';
import { nowMs } from './ui_clock.mjs';
import { auInfo, auClipOf, auLazyStart, auLazyStop, auLazyTap, auLazyKeep, auLazyState, auMarkStale,
         auPanelPages, auPanelPageName, auPanelKnob, auPanelKnobClass, auChop, auPadToSlice,
         auSelSlice, auSetSelSlice, isAudioTrack, auMarks, auMarksLocal, auSliceStart, auSliceEnd,
         auMarkAdd, auMarkDel, auManual, auEvenBake, auRangeStep, auSet, auEnd, auPanelRingCells, auPanelReset,
         AU_MODE_SLICE, AU_LAZY_ARMED, AU_LAZY_RUN, AU_EVEN_MAX } from './ui_audio.mjs';
import { registerScreenRingCells } from './ui_knob_leds.mjs';
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
    if (i.mode !== AU_MODE_SLICE || i.state !== 2) return false;
    auChop(t, c);
    showActionPopup('SEQUENCED', i.n + ' slices to steps');
    return true;
}

/* Returns true when the message was the AUDIO editor's. The pads are not:
 * they play (and the pad handler picks the slice). */
export function audioPanelInput(status, d1, d2) {
    const ed = S.auPanel;
    if (!ed) return false;
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
    if (i.mode !== AU_MODE_SLICE) return;
    const k = auPadToSlice(padIdx, t);
    if (k < i.n) auSetSelSlice(t, k);
}

/* ---- the WAVE editor ---- */

const MIN_SPAN = 128;                     /* full zoom: one frame per pixel */
const END_HOLD = 4;                       /* detents an End sticks at NEXT */

/* The map's WAVE pad: the WAVE editor on the track's current clip, over an
 * AUDIO editor (so the screens and input routes are the AUDIO editor's). */
export function openWave(t) {
    if (!isAudioTrack(t)) return false;
    S.auPanel = { t, page: 0, wave: true };
    openWaveEditor(t, auClipOf(t));
    return true;
}

export function openWaveEditor(t, c) {
    const i = auInfo(t, c);
    const ed = { t, c, mode: 'wave', A: 0, B: Math.max(MIN_SPAN, i.nframes | 0), view: i.name + '|' + i.nframes,
                 cur: 0, last: 'jog', endHold: 0, ask: null, pick: null, openedAt: S.clockMs | 0 };
    const mk = auMarks(t, c);
    const sel = auSelSlice(t);
    ed.cur = i.mode === AU_MODE_SLICE && mk[sel] ? mk[sel][0] : i.rstart;
    S.auEditor = ed;
    S.knobTouched = -1;
    computePadNoteMap();
    S.ledsDirtyAudio = true;
    S.screenDirty = true;
}

/* What WAVE is for its clip right now: 'empty' (no sample, or loading),
 * 'loop' or 'chop'. */
export function auWaveSub(ed) {
    const i = auInfo(ed.t, ed.c);
    if (i.state !== 2 || !i.nframes) return 'empty';
    return i.mode === AU_MODE_SLICE ? 'chop' : 'loop';
}
/* A sample that arrived (or changed) since the view was set: show all of it. */
export function auWaveView(ed) {
    const i = auInfo(ed.t, ed.c);
    const v = i.name + '|' + i.nframes;
    if (ed.view !== v || ed.B > (i.nframes | 0) && i.nframes) {
        ed.view = v; ed.A = 0; ed.B = Math.max(MIN_SPAN, i.nframes | 0); ed.cur = i.rstart;
    }
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
function endLazy(ed) {
    ed.mode = 'wave';
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
}

function startManual(ed) {
    const t = ed.t, c = ed.c;
    auManual(t, c);
    auSetSelSlice(t, 0);
    const i = auInfo(t, c);
    S.auInfo[t][c] = Object.assign({}, i, { even: 0, hand: 1, n: 1 });
    auMarksLocal(t, c, [[i.rstart, auEnd(i)]]);
    ed.mode = 'wave';
    ed.cur = i.rstart;
    S.pendingPadNoteMapRecompute = true;
}

function setEven(ed, v) {
    const t = ed.t, c = ed.c;
    const i = auInfo(t, c);
    auSet(t, c, 'even', v);
    S.auInfo[t][c] = Object.assign({}, i, { even: v, n: v || i.hand });
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    if (auSelSlice(t) >= (v || i.hand)) auSetSelSlice(t, 0);
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
}

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
    S.auEditor = null;
    computePadNoteMap();
    S.ledsDirtyAudio = true;
    S.screenDirty = true;
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
    const span = ed.B - ed.A, fr = auInfo(ed.t, ed.c).nframes | 0;
    let A = Math.round(f - span / 2);
    A = Math.max(0, Math.min(Math.max(0, fr - span), A));
    ed.A = A; ed.B = A + span;
}
function focus(ed) {
    return ed.last === 'start' ? edStart(ed) : ed.last === 'end' ? edEnd(ed) : ed.cur;
}

/* The points K1 / K3 edit: the selected slice's (Slice), the clip's (Loop). */
function edStart(ed) {
    const i = auInfo(ed.t, ed.c);
    if (auWaveSub(ed) !== 'chop') return i.rstart;
    const m = auMarks(ed.t, ed.c)[auSelSlice(ed.t)];
    return m ? m[0] : 0;
}
function edEnd(ed) {
    const i = auInfo(ed.t, ed.c);
    if (auWaveSub(ed) !== 'chop') return auEnd(i);
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
    const span = ed.B - ed.A;
    let ns = Math.round(dir > 0 ? span * 0.8 : span * 1.25);
    ns = Math.max(Math.min(MIN_SPAN, fr), Math.min(fr, ns));
    if (ns === span) return false;
    ed.B = ed.A + ns;
    centre(ed);
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
    const px = auEdPixel(ed), G = 16;
    if (which === 'start') {
        const lo = k > 0 ? mk[k - 1][0] + G : 0;
        const hi = Math.min(k + 1 < mk.length ? mk[k + 1][0] - G : i.nframes - G, mk[k][1] - G);
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
    let v = Math.max(mk[k][0] + G, Math.min(i.nframes, b + dd * px));
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

/* The Shift + click picker's rows at its level. */
export function auPickRows(ed) {
    const p = ed.pick;
    if (!p) return [];
    if (p.level === 1) return [{ id: 'load', label: 'Load sample', chevron: true }, { id: 'chop', label: 'Chop sample', chevron: true }];
    const i = auInfo(ed.t, ed.c);
    const ev = p.editEven ? p.even : i.even;
    return [{ id: 'lazy', label: 'Lazy' }, { id: 'manual', label: 'Manual' },
            { id: 'even', label: 'Even', value: p.editEven || ev ? (ev ? String(ev) : 'Off') : '', editing: !!p.editEven }];
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
        if (p.editEven) {
            /* Off, 2..32 — live: the clip is sliced as you turn, so the pads
             * show the count (Josh, 2026-10-28: "can we have even samples
             * populate dynamically on the pads as we increase/decrease the
             * number?") */
            let v = p.even + (dd > 0 ? 1 : -1);
            if (v === 1) v = dd > 0 ? 2 : 0;
            v = Math.max(0, Math.min(AU_EVEN_MAX, v));
            if (v !== p.even) { p.even = v; setEven(ed, v); }
        } else p.sel = Math.max(0, Math.min(rows.length - 1, p.sel + (dd > 0 ? 1 : -1)));
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainButton) {
        if (d2 !== 127) return true;
        const row = rows[p.sel];
        S.screenDirty = true;
        if (!row) return true;
        if (row.id === 'load') { ed.pick = null; S.pendingAudioChooser = { t: ed.t, c: ed.c }; return true; }
        if (row.id === 'chop') { ed.pick = { level: 2, sel: 0 }; return true; }
        if (row.id === 'lazy') { ed.pick = null; startLazy(ed); return true; }
        if (row.id === 'manual') {
            ed.pick = null;
            if (auInfo(ed.t, ed.c).hand > 1) ed.ask = { kind: 'replace', sel: 1 };
            else startManual(ed);
            return true;
        }
        if (row.id === 'even') {
            if (!p.editEven) {
                /* the clip as it was, for Back; then the count goes live */
                const i = auInfo(ed.t, ed.c);
                p.orig = { even: i.even };
                p.editEven = true;
                p.even = i.even || 16;
                setEven(ed, p.even);
                return true;
            }
            /* kept: the count becomes the clip's own chops, to edit like any
             * others (Josh: Even "is just a way to chop them") */
            ed.pick = null;
            if (p.even) {
                const i = auInfo(ed.t, ed.c);
                auEvenBake(ed.t, ed.c);
                S.auInfo[ed.t][ed.c] = Object.assign({}, i, { even: 0, hand: p.even, n: p.even });
                S.auStartsRev = (S.auStartsRev | 0) + 1;
            }
            return true;
        }
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        S.backPressTick = -1; S.backHoldFired = false;
        if (p.editEven) {
            /* Back while turning: the slicing it had before */
            setEven(ed, p.orig.even);
            p.editEven = false;
        }
        else if (p.level === 2) ed.pick = { level: 1, sel: 1 };
        else ed.pick = null;
        S.screenDirty = true;
        return true;
    }
    if (d1 >= 71 && d1 <= 78) return true;
    return false;
}

/* Back from WAVE: out of it — and out of the AUDIO editor it opened over. */
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
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7) {
            const on = hi === 0x90 && d2 >= 64;
            if (on) {
                S.knobTouched = d1; S.knobPhysIdx = d1; S.knobTurnedTick[d1] = -1;
                if (d1 === 1) ed.zoomDir = 0;                  /* touched, not turned yet: "ZOOM" */
                /* a touch jumps there: K1 to the start, K3 to the end */
                if ((d1 === 0 || d1 === 2) && (sub === 'chop' || sub === 'loop')) {
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
            /* touching the jog jumps to the cursor */
            if (hi === 0x90 && d2 >= 64 && (sub === 'chop' || sub === 'loop')) { ed.last = 'jog'; centre(ed); S.screenDirty = true; }
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
            if (sub !== 'chop' && sub !== 'loop') return false;
            const i = auInfo(ed.t, ed.c);
            if (S.deleteHeld) {
                /* Delete + pad: that slice's start goes (merges into the one
                 * before); slice 1's stays */
                if (down && k >= 1 && k < i.n) {
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
                auSetSelSlice(ed.t, k);
                const m = auMarks(ed.t, ed.c)[k];
                if (m) { ed.cur = m[0]; ed.last = 'jog'; centre(ed); }
                ed.endHold = 0;
                S.ledsDirtyAudio = true;
                S.screenDirty = true;
            }
            /* Slice: the pad still plays its slice; Loop: the cursor goes to
             * the chop (the pad itself does nothing in Loop mode) */
            return false;
        }
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) {
        const k = d1 - 71, dd = decodeDelta(d2);
        if (!dd || (sub !== 'chop' && sub !== 'loop')) return true;
        let moved = false;
        /* Start, Zoom and End light while turned, as a touched knob does (the
         * tick lets go KNOB_TURN_HIGHLIGHT_MS after the last turn) — Josh,
         * 2026-10-28: "start and end values need to be highlighted while
         * they're turned/touched" */
        if (k <= 5) {
            S.knobTouched = k; S.knobTurnedTick[k] = S.clockMs;
            if (k === 1) ed.zoomDir = dd > 0 ? 1 : -1;
            S.screenDirty = true;
        }
        if (k === 1) moved = zoom(ed, dd > 0 ? 1 : -1);
        else if (k === 0 || k === 2) {
            ed.last = k === 0 ? 'start' : 'end';
            if (sub === 'chop') moved = chopPoint(ed, ed.last, dd);
            else {
                moved = auRangeStep(ed.t, ed.c, ed.last, dd, auEdPixel(ed));
                if (moved) centre(ed);
            }
        } else if (k === 3) {
            /* K4 Gain, K5 Pitch, K6 Detune — the clip's, in either mode (Josh,
             * 2026-10-28: "put gain on a knob in wave edit mode ... same with
             * pitch and detune on k5/6"; "The whole clip") */
            const st = ccKnobDelta(d2, k);
            if (st) moved = clipStep(ed, 'gain', st > 0 ? 1 : -1);
        } else if (k === 4) {
            const st = knobStep(k, d2, KNOB_PICK);
            if (st) moved = clipStep(ed, 'pitch', st);
        } else if (k === 5) {
            const st = ccKnobDelta(d2, k);
            if (st) moved = clipStep(ed, 'detune', st);
        }
        if (moved) S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainKnob) {
        const dd = decodeDelta(d2);
        if (!dd || (sub !== 'chop' && sub !== 'loop')) return true;
        const i = auInfo(ed.t, ed.c);
        const step = S.shiftHeld ? 1 : auEdPixel(ed);
        ed.cur = Math.max(0, Math.min((i.nframes | 0) - 1, ed.cur + dd * step));
        ed.last = 'jog';
        centre(ed, ed.cur);
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainButton) {
        if (d2 !== 127) return true;
        S.screenDirty = true;
        if (sub === 'lazy') return true;
        /* Shift + click: the picker */
        if (S.shiftHeld) { ed.pick = { level: 1, sel: 0 }; return true; }
        /* no sample: click loads one */
        if (sub === 'empty') { S.pendingAudioChooser = { t: ed.t, c: ed.c }; return true; }
        if (sub !== 'chop' && sub !== 'loop') return true;
        /* a chop at the cursor, in either mode */
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
        if (sub === 'lazy') {
            const lz = auLazyState();
            if (lz.state === AU_LAZY_RUN) {
                /* Back while it plays: it ends, and asks */
                auLazyStop(ed.t, ed.c);
                ed.ask = { kind: 'keep', sel: 0, n: lz.n };
            } else if (lz.state === AU_LAZY_ARMED) {
                /* before the first tap: no change */
                auLazyStop(ed.t, ed.c);
                endLazy(ed);
            }
        } else leaveWave();
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveNoteSession) { closeAudioPanel(); return false; }
    return false;
}

/* "Keep N new chops?" / "Replace chops?" — the jog picks (clockwise toward
 * Yes, on the right), a click answers, Back is No. Either way WAVE stays. */
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
    const kind = ed.ask.kind;
    ed.ask = null;
    S.backPressTick = -1; S.backHoldFired = false;
    if (kind === 'keep') {
        auLazyKeep(ed.t, ed.c, yes);
        if (yes) {
            auSetSelSlice(ed.t, 0);
            auMarkStale(ed.t, ed.c);
            S.auStartsRev = (S.auStartsRev | 0) + 1;
        }
        endLazy(ed);
    } else if (kind === 'replace' && yes) {
        startManual(ed);
    }
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    S.ledsDirtyAudio = true;
    S.screenDirty = true;
    return true;
}

/* WAVE's knob rings: K1 Start, K2 Zoom, K3 End, K4 Gain, K5 Pitch, K6 Detune,
 * each where it sits; dark with no sample, in a Lazy chop, under the picker or
 * a question, and on K7 / K8. */
export function waveRingCells(ed) {
    if (!ed || ed.ask || ed.pick || ed.mode === 'lazy') return [null, null, null, null, null, null, null, null];
    const i = auInfo(ed.t, ed.c), fr = i.nframes | 0;
    const sub = auWaveSub(ed);
    if (sub !== 'chop' && sub !== 'loop' || !fr) return [null, null, null, null, null, null, null, null];
    let a = i.rstart, b = auEnd(i);
    if (sub === 'chop') {
        const m = auMarks(ed.t, ed.c)[auSelSlice(ed.t)];
        if (m) { a = m[0]; b = m[1]; }
    }
    const span = Math.max(MIN_SPAN, (ed.B | 0) - (ed.A | 0));
    const zoom = fr > MIN_SPAN ? 1 - Math.log(span / MIN_SPAN) / Math.log(fr / MIN_SPAN) : 0;
    const at = (n) => ({ kind: 'arc', norm: Math.max(0, Math.min(1, n)) });
    return [at(a / fr), at(zoom), at(b / fr), at(((i.gain | 0) + 40) / 52),
            at(((i.pitch | 0) + 24) / 48), at(((i.detune | 0) + 50) / 100), null, null];
}

/* The rings while an Audio screen holds the knobs: WAVE's, the AUDIO
 * editor's, none under the sample chooser. */
registerScreenRingCells(() => {
    if (S.auChooser) return [null, null, null, null, null, null, null, null];
    if (!S.auPanel) return null;
    if (S.auEditor) return waveRingCells(S.auEditor);
    return auPanelRingCells(S.auPanel);
});
