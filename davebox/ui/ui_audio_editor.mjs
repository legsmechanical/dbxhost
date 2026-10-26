/* ui_audio_editor.mjs — the AUDIO editor and its slice editor.
 *
 * THE AUDIO EDITOR (S.auPanel) is an Audio track's instrument door — the
 * sound menu's click on "Audio", the bank map's AUDIO pad (Josh, 2026-10-27:
 * "inst ... would take you an editor with all the audio settings (mode,
 * slicing, etc) while clip bank would have all the sequence settings" ·
 * "making the "instrument" be per clip audio settings (and should probably be
 * renamed "audio")"). It edits the track's current clip:
 *   CLIP        Smpl› · Mode · Start · End · Pitch · Gain · Slices/Jump · Chop›
 *   SLICING     Meth · Slices · Edit› · Lazy›     (Loop: Jump · Revrs · Nudge · JmpQ)
 *   SLICE n     Start · Len · Pitch · Gain · Revrs · Attk · Decay · Play
 *   ALL SLICES  the same eight, set on every slice (`--` while they differ)
 * The jog turns pages; a knob turns its cell; touch a knob + click the jog
 * fires a › cell (the chooser, Chop, the slice editor, Lazy chop). The pads
 * stay live — a tap picks the slice SLICE n edits and plays it. Back closes.
 *
 * THE SLICE EDITOR (S.auEditor), over the AUDIO editor: the sample big,
 * every slice start marked, the selected slice bracketed.
 *   pads      pick a slice (the engine plays it: the pads still sound)
 *   jog       move the selected slice's start (Shift: fine) — the clip's
 *             slicing becomes Manual
 *   Record    LAZY CHOP: the sample plays from Start; each pad tap starts the
 *             next slice where the sample is. It ends at the sample's end, on
 *             Record again, or on Back.
 *   Back      out (while a chop runs: ends the chop)
 * Knobs and steps are swallowed; Note/Session closes and falls through. */

import { S } from './ui_state.mjs';
import { MoveBack, MoveRec } from '/data/UserData/schwung/shared/constants.mjs';
import { MoveMainKnob, MoveMainButton, MoveNoteSession, TRACK_PAD_BASE } from './ui_constants.mjs';
import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';
import { nowMs } from './ui_clock.mjs';
import { auInfo, auClipOf, auSlice, auSlicePos, auLazyStart, auLazyStop, auLazyTap, auMarkStale,
         auPanelPages, auPanelPageName, auPanelKnob, auPanelKnobDeliberate, auChop, auPadToSlice,
         auSelSlice, auSetSelSlice, isAudioTrack, AU_MODE_SLICE } from './ui_audio.mjs';
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

/* A › cell under the touched knob, fired by the jog click. */
function panelAction(ed, k) {
    const t = ed.t, c = auClipOf(t), i = auInfo(t, c);
    const page = auPanelPageName(ed);
    if (page === 'CLIP' && k === 0) { S.pendingAudioChooser = { t, c }; return true; }
    if (page === 'CLIP' && k === 7 && i.mode === AU_MODE_SLICE && i.state === 2) {
        auChop(t, c);
        showActionPopup('CHOPPED', i.n + ' slices to steps');
        return true;
    }
    if (page === 'SLICING' && i.mode === AU_MODE_SLICE && i.state === 2 && (k === 2 || k === 3)) {
        S.auEditor = { t, c, lazy: false, lazySeen: false, lazyAt: 0, pos: null };
        if (k === 3) startLazy(S.auEditor);
        return true;
    }
    return false;
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
            if (hi === 0x90 && d2 >= 64) S.knobTouched = d1;
            else if (S.knobTouched === d1) S.knobTouched = -1;
            S.screenDirty = true;
            return true;
        }
        if (d1 >= 16 && d1 <= 31) return true;               /* steps */
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) {
        const k = d1 - 71;
        const st = auPanelKnobDeliberate(ed, k) ? knobStep(k, d2, KNOB_DELIB)
                 : (auPanelPageName(ed) === 'CLIP' && k === 6) || auPanelPageName(ed) === 'SLICING' ? knobStep(k, d2, KNOB_PICK)
                 : ccKnobDelta(d2, k);
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
        if (d2 === 127 && S.knobTouched >= 0) panelAction(ed, S.knobTouched);
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
    const k = auPadToSlice(padIdx);
    if (k < i.n) auSetSelSlice(t, k);
}

/* ---- the slice editor ---- */

export function closeAudioEditor() {
    const ed = S.auEditor;
    if (!ed) return;
    if (ed.lazy) auLazyStop(ed.t, ed.c);
    S.auEditor = null;
    computePadNoteMap();
    S.screenDirty = true;
}

function startLazy(ed) {
    ed.lazy = true;
    ed.lazySeen = false;
    ed.lazyAt = S.clockMs;
    auLazyStart(ed.t, ed.c);
    computePadNoteMap();          /* the pads stop playing slices: they cut */
}
function stopLazy(ed) {
    auLazyStop(ed.t, ed.c);
    ed.lazy = false;
    ed.lazySeen = false;
    computePadNoteMap();
}

/* Returns true when the message was the slice editor's. */
export function audioEditorInput(status, d1, d2) {
    const ed = S.auEditor;
    if (!ed) return false;
    const hi = status & 0xF0;
    if (hi === 0x90 || hi === 0x80) {
        if (d1 >= 0 && d1 <= 7) {                            /* knob touches: a release still lets go */
            if ((hi === 0x80 || d2 < 64) && S.knobTouched === d1) S.knobTouched = -1;
            return true;
        }
        if (d1 >= 16 && d1 <= 31) return true;               /* steps */
        if (d1 >= TRACK_PAD_BASE && d1 < TRACK_PAD_BASE + 32) {
            if (hi === 0x90 && d2 > 0) {
                const k = auPadToSlice(d1 - TRACK_PAD_BASE);
                if (ed.lazy) { if (ed.lazySeen) auLazyTap(ed.t); return true; }
                if (k < auInfo(ed.t, ed.c).n) { auSetSelSlice(ed.t, k); ed.pos = null; }
                S.screenDirty = true;
            }
            /* not lazy: the pad still plays its slice */
            return !!ed.lazy;
        }
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) return true;
    if (d1 === MoveMainKnob && !S.shiftHeld) {
        const dd = decodeDelta(d2);
        if (!dd || ed.lazy) return true;
        const i = auInfo(ed.t, ed.c);
        const sel = auSelSlice(ed.t);
        const r = auSlice(ed.t, ed.c, sel);
        if (!r || !i.nframes) return true;
        if (ed.pos == null) ed.pos = r.a;
        const step = Math.max(1, Math.round(i.nframes / (S.shiftHeld ? 20000 : 1000)));
        ed.pos = Math.max(0, Math.min(i.nframes - 1, ed.pos + dd * step));
        auSlicePos(ed.t, ed.c, sel, ed.pos);
        S.auStartsRev = (S.auStartsRev | 0) + 1;
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveMainButton) return true;
    if (d1 === MoveRec) {
        if (d2 >= 64) { if (ed.lazy) stopLazy(ed); else startLazy(ed); auMarkStale(ed.t, ed.c); S.screenDirty = true; }
        return true;
    }
    if (d1 === MoveBack) {
        if (d2 >= 64) { S.backPressTick = nowMs(); S.backHoldFired = false; return true; }
        const held = S.backHoldFired;
        S.backPressTick = -1; S.backHoldFired = false;
        if (!held) { if (ed.lazy) stopLazy(ed); else closeAudioEditor(); }
        S.screenDirty = true;
        return true;
    }
    if (d1 === MoveNoteSession) { closeAudioPanel(); return false; }
    return false;
}
