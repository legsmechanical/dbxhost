/* ui_audio_editor.mjs — an Audio clip's SLICE EDITOR (SAMPLE bank, Slices:
 * touch + click). The sample big, every slice start marked, the selected slice
 * bracketed (ui_render drawAudioSliceEditor).
 *   pads      pick a slice (the engine plays it: the pads still sound)
 *   jog       move the selected slice's start (Shift: fine) — the clip's
 *             slicing becomes Manual
 *   Record    LAZY CHOP: the sample plays from Start; each pad tap starts the
 *             next slice where the sample is (the first tap is slice 1). It
 *             ends at the sample's end, on Record again, or on Back.
 *   Back      out (while a chop runs: ends the chop)
 * Knobs and steps are swallowed; Note/Session closes and falls through. */

import { S } from './ui_state.mjs';
import { MoveBack, MoveRec } from '/data/UserData/schwung/shared/constants.mjs';
import { MoveMainKnob, MoveMainButton, MoveNoteSession } from './ui_constants.mjs';
import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';
import { TRACK_PAD_BASE } from './ui_constants.mjs';
import { nowMs } from './ui_clock.mjs';
import { auInfo, auSlice, auSlicePos, auLazyStart, auLazyStop, auLazyTap, auMarkStale } from './ui_audio.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';

function padLane(padIdx) {
    const col = padIdx % 8, row = Math.floor(padIdx / 8);
    return col < 4 ? row * 4 + col : 16 + row * 4 + (col - 4);
}

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

/* Returns true when the message was the editor's. */
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
                const lane = padLane(d1 - TRACK_PAD_BASE);
                if (ed.lazy) { if (ed.lazySeen) auLazyTap(ed.t); }
                else if (lane < auInfo(ed.t, ed.c).n) {
                    ed.sel = lane;
                    S.activeDrumLane[ed.t] = lane;
                    ed.pos = null;
                }
                S.screenDirty = true;
            }
            return true;
        }
        return false;
    }
    if (status !== 0xB0) return false;
    if (d1 >= 71 && d1 <= 78) return true;
    if (d1 === MoveMainKnob && !S.shiftHeld) {
        const dd = decodeDelta(d2);
        if (!dd || ed.lazy) return true;
        const i = auInfo(ed.t, ed.c);
        const r = auSlice(ed.t, ed.c, ed.sel);
        if (!r || !i.nframes) return true;
        if (ed.pos == null) ed.pos = r.a;
        const step = Math.max(1, Math.round(i.nframes / (S.shiftHeld ? 20000 : 1000)));
        ed.pos = Math.max(0, Math.min(i.nframes - 1, ed.pos + dd * step));
        auSlicePos(ed.t, ed.c, ed.sel, ed.pos);
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
    if (d1 === MoveNoteSession) { closeAudioEditor(); return false; }
    return false;
}
