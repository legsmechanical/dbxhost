/* ui_record.mjs
 * Real-time recording arm/disarm/handoff, DSP-side note-event buffering
 * (recordNoteOn/Off, flushed by tick() as a single batched set_param so
 * chords aren't lost to coalescing), and Tap Tempo capture. Also owns the
 * external-MIDI held-note broadcast (extNoteOffAll) since it shares the
 * recording note-off path.
 * Extracted from ui.js (Phase 5b prep, increment 2 of the modularity refactor).
 */

import {
    MoveRec, LED_OFF, PAD_MODE_DRUM, PAD_MODE_CONDUCT, TAP_TEMPO_RESET_MS
} from './ui_constants.mjs';
import { setButtonLED } from '/data/UserData/schwung/shared/input_filter.mjs';
import { S } from './ui_state.mjs';
import { noteUndoUnit } from './ui_editops.mjs';
import { nowMs } from './ui_clock.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { invalidateLEDCache, effectiveClip, forceRedraw } from './ui_leds.mjs';
import { clipHasContent } from './ui_pure.mjs';
import { showActionPopup } from './ui_persistence.mjs';
/* Intentional ES-module cycle with ui_dsp_bridge.mjs (it imports disarmRecord
 * from here) — safe because both sides reference the cycled bindings only
 * inside function bodies, never at module-init time. Keep it that way. */
import { liveSendNote, _drumRecNoteOns, _drumRecNoteOffs } from './ui_dsp_bridge.mjs';

/* DSP-side recording: buffer note events; tick() flushes as a single batched set_param so
 * chords (multiple pads hit in the same ~5ms JS tick) are not lost to coalescing. */
export const _recordingNoteTrack = new Map(); /* pitch → track index, for matching note-offs */
export const extHeldNotes = new Map(); /* pitch → {track, recording} — external MIDI held notes */

/* Disarm real-time recording: clear DSP flag (triggers deferred save), update LED. */
export function disarmRecord() {
    if (!S.recordArmed) return;
    const t = S.recordArmedTrack;
    const _wasCountingIn   = S.recordCountingIn;
    S.recordArmed          = false;
    S.saveNowOnce          = true;             /* the end of a take: the one save allowed while playing */
    S.recordPendingPage    = false;
    S.recordCountingIn     = false;
    S.recordArmedTrack     = -1;
    S.countInStartTick    = -1;
    S.countInQuarterTicks = 0;
    _recordingNoteTrack.clear();
    S._recNoteOns.length   = 0;
    S._recNoteOffs.length  = 0;
    _drumRecNoteOns.length  = 0;
    _drumRecNoteOffs.length = 0;
    S.pendingPrerollNote          = null;
    S.pendingPrerollNotes         = [];
    S.pendingPrerollToggleQueue   = [];
    S.pendingPrerollGate          = null;
    if (t >= 0) {
        const _dat = S.trackActiveClip[t];
        S.clipAdaptiveMode[t][_dat] = false;
        if (S.trackPadMode[t] === PAD_MODE_DRUM) {
            S.pendingDrumResync      = 2;
            S.pendingDrumResyncTrack = t;
        }
    }
    S.recordScheduledStop       = false;
    S.recordScheduledStopTarget = -1;
    S.recordStopNow             = false;
    S.recordArmedLive           = false;
    S.pendingScheduledDisarm    = false;
    if (_wasCountingIn) {
        /* Count-in active: only cancel is needed; sending _recording 0 would coalesce it away */
        host_module_set_param('record_count_in_cancel', '1');
    } else {
        if (t >= 0) {
            host_module_set_param('t' + t + '_recording', '0');
            /* Re-send the disarm across the next few ticks (drained in tick()):
             * a single set_param can be coalesced away by another set_param
             * sharing the same audio buffer (e.g. a knob-release on the AUTO
             * bank), which would strand recording=1 and flood the lane. */
            S.recOffTrack = t;
            S.recOffTicks = 5;
        }
    }
    setButtonLED(MoveRec, LED_OFF);
}

/* Move recording to a different track while staying armed. No-op if not actively recording. */
export function handoffRecordingToTrack(newTrack) {
    if (!S.recordArmed || S.recordCountingIn || newTrack === S.recordArmedTrack) return;
    const old = S.recordArmedTrack;
    _recordingNoteTrack.clear();
    S.recordArmedTrack      = newTrack;
    if (old >= 0) host_module_set_param('t' + old + '_recording', '0');
    host_module_set_param('t' + newTrack + '_recording', '1');
}

/* ext (4th param): true when the note came from external cable-2 MIDI
 * (_onMidiExternalImpl). The tick flush prefixes ext entries with the
 * per-note 'e' marker in the tN_record_note_on/off payload; the DSP handler
 * then applies slot-if-active-else-fallback for ext notes (non-Move ext never
 * reaches on_midi, so it has no press slot to require — Path B), while plain
 * pad notes keep the slot requirement. Batches can mix pad + ext entries. */
export function recordNoteOn(pitch, velocity, rt, ext) {
    _recordingNoteTrack.set(pitch, rt);
    S._recNoteOns.push({pitch, vel: velocity, rt, ext: !!ext});
}

export function recordNoteOff(pitch, ext) {
    const rt = _recordingNoteTrack.get(pitch);
    if (rt === undefined) return;
    _recordingNoteTrack.delete(pitch);
    S._recNoteOffs.push({pitch, rt, ext: !!ext});
}

/* External-MIDI count-in capture gate. External notes never reach the DSP
 * on_midi preroll filter (Move plays cable-2 notes natively but does NOT echo
 * note-on/off to MIDI_OUT — device diagnosis 2026-07-11), so the last-1/8-note
 * count-in rule the pad path gets from on_midi must be replicated here for ext:
 *   - not counting in            -> always capture;
 *   - counting in, final 1/8     -> capture (these flush at the count-in->
 *     recording transition, landing at ~loop_start / "the one");
 *   - counting in, earlier       -> drop (warm-up noise).
 * Mirrors seq8.c on_midi is_preroll (count_in_ticks <= PPQN/2). Count-in is a
 * fixed 1 bar (4 * countInQuarterTicks); we estimate its end from
 * countInStartTick since JS drives it and both sides track the same BPM. */
export function extCountInCapture() {
    if (!S.recordCountingIn) return true;
    if (S.countInQuarterTicks <= 0 || S.countInStartTick < 0) return true;
    const endTick = S.countInStartTick + 4 * S.countInQuarterTicks;  /* 1 bar */
    return (endTick - S.tickCount) <= (S.countInQuarterTicks >> 1);   /* final 1/8 */
}


export function openTapTempo() {
    S.tapTempoOpen      = true;
    S.tapTempoTapTimes  = [];
    S.tapTempoBpm       = Math.max(40, Math.min(250, Math.round(parseFloat(host_module_get_param('bpm')) || 120)));
    S.tapTempoFlashTick = -1;
    S.tapTempoFlashPad  = -1;
    computePadNoteMap();
    invalidateLEDCache();
    S.screenDirty = true;
}

export function closeTapTempo() {
    S.tapTempoOpen = false;
    host_module_set_param('bpm', String(S.tapTempoBpm));
    computePadNoteMap();
    invalidateLEDCache();
    S.screenDirty = true;
}

export function registerTapTempo(padNote) {
    const nowMs  = Date.now();
    const taps   = S.tapTempoTapTimes;
    const last   = taps.length > 0 ? taps[taps.length - 1] : -1;
    const intvl  = last >= 0 ? nowMs - last : -1;

    /* Inactivity reset: gap exceeds 2s */
    if (intvl > TAP_TEMPO_RESET_MS) {
        S.tapTempoTapTimes = [nowMs];
    } else if (intvl > 0 && taps.length >= 2) {
        /* Deviation reset: new interval differs from previous by >~1.8x */
        const prevIntvl = taps[taps.length - 1] - taps[taps.length - 2];
        const ratio     = intvl / prevIntvl;
        if (ratio > 1.8 || ratio < 0.55) {
            /* Tempo change: keep last tap as anchor for new session */
            S.tapTempoTapTimes = [last, nowMs];
        } else {
            taps.push(nowMs);
            /* Sliding window: cap at last 9 taps (8 intervals) */
            if (taps.length > 9) S.tapTempoTapTimes = taps.slice(-9);
        }
    } else {
        taps.push(nowMs);
    }

    if (S.tapTempoTapTimes.length >= 2) {
        const t = S.tapTempoTapTimes;
        const n = t.length;
        const avgInterval = (t[n - 1] - t[0]) / (n - 1);
        if (avgInterval > 0) {
            S.tapTempoBpm = Math.max(40, Math.min(250, Math.round(60000 / avgInterval)));
            host_module_set_param('bpm', String(S.tapTempoBpm));
        }
    }
    S.tapTempoFlashTick = nowMs();
    S.tapTempoFlashPad  = padNote;
    S.screenDirty = true;
}

/* FINDING-1 fix (cross-track hold hangs a Move voice): a note pressed while
 * the active track A was ROUTE_MOVE sounds NATIVELY on Move via the cable-2
 * channel remap (JS deliberately never sends Move a release). When the remap
 * is about to be repointed (active track / route / channel / midiInChannel
 * change), the physical note-off can no longer reach Move on A's channel
 * (B=Move: rewritten to B's channel; B=nonMove: BLOCKed table, off passes on
 * the raw keyboard channel) -> stranded firmware voice. Called by the tick
 * remap edge-detect BEFORE applyExtMidiRemap(): inject a note-off to Move for
 * every held ext note whose track routes to Move, then drop the entry (its
 * later physical release is moot). Musically this cuts the held note when you
 * leave its track -- predictable, mirrors the co-run drum-hold drain
 * (ui_corun.mjs exitMoveNativeCoRun).
 *
 * INJECT FORM (device-verify): cable-2 channel-voice note-off
 * [0x28, 0x80|ch, pitch, 0] -- byte-identical to the packet the DSP's
 * pfx_emit sends for EVERY sequenced/pad note-off on a ROUTE_MOVE track
 * (dsp/seq8.c pfx_emit: {0x20|(status>>4), status, d1, d2}), delivered
 * through the same host inject ring (shadow_midi.c: "cable ... 2 for external
 * USB (general MIDI, routed to tracks by channel)"). Those releases verifiably
 * reach Move channel voices today, including while the ext remap is active
 * (multi-track ROUTE_MOVE playback works), so injected packets are not
 * subject to the MIDI_IN remap. The documented cable-2 echo-cascade hazard is
 * a note-ON re-injection feedback loop; a one-shot note-OFF at the switch
 * edge cannot loop (its echo is channel-filtered / release-only in on_midi).
 * NOT the cable-0 pad form ([0x08,0x80,pad,0]) -- that addresses the 68-99
 * pad block, not a remapped channel voice. */
export function flushHeldMoveExtNotes() {
    if (extHeldNotes.size === 0) return;
    for (const [pitch, info] of extHeldNotes) {
        if (S.trackRoute[info.track] !== 1) continue;   /* Move-native voices only */
        const ch = (S.trackChannel[info.track] - 1) & 0x0F;
        move_midi_inject_to_move([0x28, 0x80 | ch, pitch, 0]);
        /* Close an open recording gate at the cut point (fallback tick --
         * the release slot won't exist; matches the audible cut). */
        if (info.recording) recordNoteOff(pitch, true);
        extHeldNotes.delete(pitch);
    }
}

export function extNoteOffAll() {
    if (extHeldNotes.size === 0) return;
    for (const [pitch, info] of extHeldNotes) {
        /* Ext-origin tag for non-Move routes only (mirrors the
         * _onMidiExternalImpl guards): ROUTE_MOVE ext is played natively by
         * Move and must not generate ext live tokens. */
        liveSendNote(info.track, 0x80, pitch, 0, false, S.trackRoute[info.track] !== 1);
        if (info.recording) recordNoteOff(pitch, true);
    }
    extHeldNotes.clear();
}

/* ===================== STEP RECORD (SH-101 style) =====================
 * Shift+Record with the transport STOPPED on a melodic/MIDI track (Josh's
 * Front-4 ruling, 2026-09-01). Pads write the step under the CURSOR and still
 * sound as previews; a chord accumulates while any pad is held and the cursor
 * advances when the last pad is released. '>' with pads held is a TIE (the
 * entry grows a step); '>' bare is a rest (cursor forward); '<' steps the
 * cursor BACK and erases what THIS SESSION wrote at the step it lands on —
 * never pre-existing notes (the journal below is the session's memory). The
 * cursor CLAMPS at the clip's last step (Josh: no wrap, no auto-extend).
 *
 * ONE OWNER: every state transition lives here — enter/exit, pad press and
 * release, and both arrows. Callers (ui_input_cc, ui_input_pads, ui_editops,
 * ui_tick) dispatch in; none of them write S.stepRec* directly.
 *
 * UNDO: the whole session is ONE undo/redo unit. stepRecEnter queues
 * tN_cC_undo_checkpoint (a clip snapshot); the entry ops used here (_add,
 * _gate, _toggle) deliberately take no snapshot of their own, so the next
 * undo_restore returns the clip to the moment the session began. ⚠ Never use
 * _clear from this path — it snapshots, and would shrink the undo unit to
 * whatever followed it.
 *
 * ⚠ All writes ride S.pendingDefaultSetParams (one per tick): set_param
 * coalesces per audio buffer on the on-device path, and this handler runs
 * from onMidiMessage. get_param is unavailable here for the same reason —
 * everything below reads the JS mirrors (S.clipSteps / clipLength / pages). */

/* Gate ticks are RAW 24-per-step units at render (seq8.c step_gate), and a
 * fresh step's gate is 12 — half a step. A tie keeps that shape: full steps
 * for the tied span, the default half-step tail on the last. These two
 * literals MIRROR seq8.c's TICKS_PER_STEP / GATE_TICKS and are pinned against
 * the header by the step-record test — a silent drift here is the
 * copied-C-constant trap. */
const STEP_REC_RAW_TPS      = 24;
const STEP_REC_GATE_DEFAULT = 12;
const _srGateFor = (chordLen) => (chordLen - 1) * STEP_REC_RAW_TPS + STEP_REC_GATE_DEFAULT;

const _srKey = (t, ac, step, op) => 't' + t + '_c' + ac + '_step_' + step + '_' + op;
function _srQueue(key, val) { S.pendingDefaultSetParams.push({ key, val: String(val) }); }
function _srLen(t, ac) { return Math.max(1, S.clipLength[t][ac] | 0); }
function _srFollowPage(t, cursor) {
    const pg = cursor >> 4;
    if (S.trackCurrentPage[t] !== pg) { S.trackCurrentPage[t] = pg; }
}

export function stepRecEligible() {
    return !S.playing && !S.sessionView &&
        S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM &&
        S.trackPadMode[S.activeTrack] !== PAD_MODE_CONDUCT;
}

export function stepRecEnter() {
    const t = S.activeTrack, ac = effectiveClip(t);
    S.stepRecActive    = true;
    S.stepRecCursor    = Math.min((S.trackCurrentPage[t] | 0) * 16, _srLen(t, ac) - 1);
    S.stepRecWroteStep = -1;
    S.stepRecChordLen  = 1;
    S.stepRecDidWrite  = false;
    S.stepRecHeld.clear();
    S.stepRecJournal.clear();
    /* The session's ONE undo snapshot — see the banner. */
    _srQueue('t' + t + '_c' + ac + '_undo_checkpoint', '1');
    showActionPopup('STEP REC', 'Pads write steps.', '> rest/tie, < erase.');
    invalidateLEDCache();
    forceRedraw();
}

export function stepRecExit() {
    if (!S.stepRecActive) return;
    S.stepRecActive    = false;
    S.stepRecWroteStep = -1;
    S.stepRecChordLen  = 1;
    S.stepRecHeld.clear();
    S.stepRecJournal.clear();
    invalidateLEDCache();
    forceRedraw();
}

export function stepRecPadPress(pitch, vel) {
    const t = S.activeTrack, ac = effectiveClip(t);
    if (S.stepRecHeld.size === 0) {
        S.stepRecWroteStep = S.stepRecCursor;
        S.stepRecChordLen  = 1;
    }
    const ws = S.stepRecWroteStep;
    if (!S.stepRecJournal.has(ws)) {
        S.stepRecJournal.set(ws, {
            added: [],
            hadBefore: (S.clipSteps[t][ac][ws] | 0) === 1,
            chordLen: 1,
        });
    }
    const entry = S.stepRecJournal.get(ws);
    S.stepRecHeld.add(pitch);
    if (entry.added.indexOf(pitch) < 0) {
        /* _add is add-only and dedupes DSP-side too; one op per press keeps
         * each write atomic against coalescing. */
        _srQueue(_srKey(t, ac, ws, 'add'), pitch + ' 0 ' + vel);
        entry.added.push(pitch);
        /* Mirrors, so LEDs/screen agree before the queue drains. */
        S.clipSteps[t][ac][ws] = 1;
        S.clipNonEmpty[t][ac] = true;
        if (!S.stepRecDidWrite) {
            S.stepRecDidWrite = true;
            noteUndoUnit(); S.undoSeqArpSnapshot = null;
        }
    }
    invalidateLEDCache();
    forceRedraw();
}

export function stepRecPadRelease(pitch) {
    S.stepRecHeld.delete(pitch);
    if (S.stepRecHeld.size > 0 || S.stepRecWroteStep < 0) return;
    /* Last pad up: the entry commits and the cursor advances past it
     * (idempotent with any ties that already moved it). CLAMP at the end. */
    const t = S.activeTrack, ac = effectiveClip(t);
    S.stepRecCursor = Math.min(S.stepRecWroteStep + S.stepRecChordLen, _srLen(t, ac) - 1);
    S.stepRecWroteStep = -1;
    S.stepRecChordLen  = 1;
    _srFollowPage(t, S.stepRecCursor);
    invalidateLEDCache();
    forceRedraw();
}

/* dir: +1 = '>', -1 = '<'. */
export function stepRecArrow(dir) {
    const t = S.activeTrack, ac = effectiveClip(t);
    const len = _srLen(t, ac);
    if (dir > 0) {
        if (S.stepRecHeld.size > 0 && S.stepRecWroteStep >= 0) {
            /* TIE: the held entry grows one step (clamped to the clip end). */
            if (S.stepRecWroteStep + S.stepRecChordLen <= len - 1) {
                S.stepRecChordLen++;
                const entry = S.stepRecJournal.get(S.stepRecWroteStep);
                if (entry) entry.chordLen = S.stepRecChordLen;
                _srQueue(_srKey(t, ac, S.stepRecWroteStep, 'gate'),
                         _srGateFor(S.stepRecChordLen));
            }
            S.stepRecCursor = Math.min(S.stepRecWroteStep + S.stepRecChordLen, len - 1);
        } else {
            /* REST: the cursor moves on, writing nothing. */
            S.stepRecCursor = Math.min(S.stepRecCursor + 1, len - 1);
        }
    } else {
        if (S.stepRecHeld.size > 0 && S.stepRecWroteStep >= 0) {
            /* '<' mid-hold un-ties one step — the exact inverse of '>'. */
            if (S.stepRecChordLen > 1) {
                S.stepRecChordLen--;
                const entry = S.stepRecJournal.get(S.stepRecWroteStep);
                if (entry) entry.chordLen = S.stepRecChordLen;
                _srQueue(_srKey(t, ac, S.stepRecWroteStep, 'gate'),
                         _srGateFor(S.stepRecChordLen));
                S.stepRecCursor = Math.min(S.stepRecWroteStep + S.stepRecChordLen, len - 1);
            }
        } else if (S.stepRecCursor > 0) {
            /* DESTRUCTIVE BACKSTEP (Josh, 2026-09-01): move back one step and
             * erase what THIS SESSION recorded there, as it goes. */
            const p = S.stepRecCursor - 1;
            /* A tied entry un-ties from its tail first, one step per press —
             * each '<' exactly undoes one '>'. */
            let tied = null;
            for (const [ws, e] of S.stepRecJournal) {
                if (e.chordLen > 1 && ws + e.chordLen - 1 === p) { tied = [ws, e]; break; }
            }
            if (tied) {
                const [ws, e] = tied;
                e.chordLen--;
                _srQueue(_srKey(t, ac, ws, 'gate'), _srGateFor(e.chordLen));
            } else if (S.stepRecJournal.has(p)) {
                const e = S.stepRecJournal.get(p);
                /* Gate back to default FIRST — _gate refuses on an empty step,
                 * so it must land while the notes are still there. (A
                 * pre-existing custom gate on an overdubbed step is not
                 * restored — the journal has no gate history; accepted, and
                 * the session-level undo still recovers it.) */
                if (e.chordLen > 1)
                    _srQueue(_srKey(t, ac, p, 'gate'), STEP_REC_GATE_DEFAULT);
                for (const n of e.added)
                    _srQueue(_srKey(t, ac, p, 'toggle'), String(n));
                S.stepRecJournal.delete(p);
                if (!e.hadBefore) {
                    S.clipSteps[t][ac][p] = 0;
                    if (S.clipNonEmpty[t][ac])
                        S.clipNonEmpty[t][ac] = clipHasContent(t, ac);
                }
            }
            S.stepRecCursor = p;
        }
    }
    _srFollowPage(t, S.stepRecCursor);
    invalidateLEDCache();
    forceRedraw();
}
