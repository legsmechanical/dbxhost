/* ui_tick.mjs
 * The tick() payload: _tickImpl (the ~1,300-line per-frame drain/LED/draw loop)
 * plus its tick-only satellite helpers (track-type/Conduct conversion, cable-2
 * MIDI remap, scene-playing cache, metronome click no-op). ui.js's globalThis.tick
 * wrapper stays resident and calls the imported _tickImpl; applyExtMidiRemap is
 * also called directly from ui.js's init() (exported for that).
 * Extracted from ui.js (Phase 6b, the FINAL extraction of the modularity refactor —
 * see docs/superpowers/plans/2026-07-10-refactor-phase6b-map.md).
 */

import {
    MoveShift, MovePlay, MoveLeft, MoveRight, MoveUp, MoveDown, MoveMute, MoveDelete,
    MoveBack
} from '/data/UserData/schwung/shared/constants.mjs';
import {
    Red, VividYellow, Green, DarkGrey, White
} from '/data/UserData/schwung/shared/constants.mjs';
import { setLED, setButtonLED } from '/data/UserData/schwung/shared/input_filter.mjs';

import {
    MoveNoteSession, MoveUndo, MoveLoop, MoveCopy, MoveRec, MoveCapture, MoveSample,
    LED_OFF, NUM_TRACKS, NUM_CLIPS, DRUM_LANES, NUM_STEPS, TPS_VALUES,
    BANK_PICKER_SETTLE_TICKS,
    PAD_MODE_DRUM, PAD_MODE_MELODIC_SCALE, PAD_MODE_CONDUCT,
    BANK_SOUND, BANK_MACROS, isSoundBank,
    POLL_INTERVAL,
    CC_GRADIENT_BASE, CC_GRADIENT_LEVELS, CC_GRADIENT_SCALARS
} from './ui_constants.mjs';

import { S, standDownBankDisplay } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { tickPrefetch, dget } from './ui_dsp_bridge.mjs';
import { daveBoxTick } from './ui_daves.mjs';
import { automationTick, automationPollWarnings } from './ui_automation.mjs';
import { clipHasContent, stepEntryVelocity } from './ui_pure.mjs';
import { saveState, showActionPopup, showTrackVolCard, uuidToStatePath, readActiveSet,
    commitSnapshot } from './ui_persistence.mjs';
import { showMenuInfo , projectPadPickerModifiers, openProjectPadPicker,
         projectPickerTextEntryTick } from './ui_dialogs.mjs';
import { sceneAllQueued, updateSceneMapLEDs } from './ui_scene.mjs';
import { _padDispatchMutedNow, computePadNoteMap, syncDrumLaneSteps, syncDrumLanesMeta,
    syncDrumClipContent } from './ui_drummodel.mjs';
import { effectiveClip, updateStepLEDs, updateSessionLEDs, updateTrackLEDs, flashAtRate,
    invalidateLEDCache, trackColor, setPaletteEntryRGB, reapplyPalette, forceRedraw,
    updatePerfModeLEDs, altIndicatorActive, clearAllLEDs, installFlagsWrap, removeFlagsWrap,
    buildLedInitQueue, drainLedInit } from './ui_leds.mjs';
import { schSlotForTrack, schSlotsForTrack, schSlotMasksAllTracks } from './ui_corun.mjs';
import { pollPendingExport } from './ui_export.mjs';
import { drawUI } from './ui_render.mjs';
import { pollDSP,
    refreshPerClipBankParams, refreshDrumLaneBankParams, refreshSeqNotesIfCurrent,
    syncClipsFromDsp, syncClipsTargeted, syncMuteSoloFromDsp, restoreUiSidecar,
    liveSendNote, _drainLiveNotes,
    pendingDrumNoteOffs, _drumRecNoteOns, _drumRecNoteOffs } from './ui_dsp_bridge.mjs';
import { disarmRecord, _recordingNoteTrack, flushHeldMoveExtNotes, stepRecExit } from './ui_record.mjs';
import { xposeCancelPreview } from './ui_xpose.mjs';
import { checkBackHold, checkShiftNoteHold, backTapWouldAct, applyShiftEdge } from './ui_input_cc.mjs';
import { engineGetSlotParam, engineSetSlotParam, engineSaveState,
         engineGet, engineSet, moveBusForChannel, moveBusComp,
         SLOT_LEVEL_KEY, SLOT_LEVEL_STEP, SLOT_LEVEL_MAX, slotIndex, CHAIN_SLOTS, DAVEBOX_HOST_DIR,
         SESS_KNOB_KEYS, SESS_KNOB_DEFAULTS, SESS_KNOB_MODES } from './ui_engine.mjs';
import { soundActive, soundOpen, soundResting, soundEnter, soundEnterMove, soundExit,
    soundTick, soundDirty, soundTrack, soundRetarget, soundIsGlobal,
    soundEnteredInSession, soundConsumeLedDirty,
    soundConsumeCoRunRequest, soundShowMenu, soundSetBank } from './ui_sound.mjs';
import { enterMoveNativeCoRun } from './ui_corun.mjs';

const BANK_DISPLAY_MS = 1000;
const KNOB_TURN_HIGHLIGHT_MS = 600;               /* highlight after turn without touch */
const STEP_HOLD_MS       = 120;  /* below = tap, at/above = hold (ms off ui_clock, never ticks). Josh 2026-09-02: shorter than the old 200 ms, longer than the accidental ~55 */
const STEP_SAVE_HOLD_MS  = 750;
const STEP_SAVE_FLASH_MS = 425;  /* double-blink on step button LEDs after save */
/* How long a select HANDOFF may be in flight before the SELECT-BEFORE-LOAD
 * watchdog is allowed to treat the session as stranded again. ~15s at the 94Hz
 * device tick. The handoff itself measured ~6.5s on hardware (arm -> walk Move
 * to its Set Overview -> replay the pad -> load the set -> resume), so this is
 * roughly double: too short re-opens the race it exists to close, and the only
 * cost of too long is a slower recovery from a handoff that genuinely died. */
const SELECT_HANDOFF_TICKS = 1400;
/* ~500ms at 94Hz. How long the session-view level must sit still before the
 * chain state is written. Comfortably longer than the gaps inside one turn
 * (encoder messages come in bursts), short enough that a save always lands well
 * before a user could act on the result. */
const SESSVOL_SAVE_IDLE_MS = 500;
/* Reused across polls — this runs every POLL_INTERVAL ticks and a fresh array
 * each time is garbage the tick doesn't need to make. */
const _sessMaskScratch = new Array(8).fill(0);

function playMetronomeClick() {
    /* DSP handles click audio via render_block; nothing to do here */
}

/* Convert a track between melodic and drum, translating note content so the
 * music follows the track. The DSP handler (tN_convert_to_drum/_to_melodic)
 * does the data move AND flips pad_mode atomically in a single set_param, so
 * there is no coalescing drop. We then resync JS from DSP — syncClipsFromDsp()'s
 * get_param round-trips double as the audio-thread sync barrier. */
function trackHasAnyData(t) {
    for (let c = 0; c < NUM_CLIPS; c++)
        if (S.clipNonEmpty[t][c] || S.drumClipNonEmpty[t][c]) return true;
    return false;
}

function convertTrackType(t, toDrum) {
    /* A conversion re-types the very clip a step-record session is writing —
     * end the session first, exactly as a track SWITCH does (review finding:
     * the conduct path left stepRecActive true on a track the eligibility
     * gate forbids, and pad writes kept landing). */
    stepRecExit();
    host_module_set_param('t' + t + (toDrum ? '_convert_to_drum' : '_convert_to_melodic'), '1');
    S.trackPadMode[t] = toDrum ? PAD_MODE_DRUM : PAD_MODE_MELODIC_SCALE;
    /* Resync inline (this runs in tick(), so get_param works): the first get
     * in syncClipsFromDsp flushes the queued convert, then reads post-convert
     * state — it also runs the drum-side syncs when the result is a drum track.
     * Empty tracks skip the heavy all-track resync but still need a get_param
     * barrier so the convert set_param drains before computePadNoteMap pushes
     * tN_padmap (without the barrier, same-buffer coalescing drops the convert). */
    if (trackHasAnyData(t)) syncClipsFromDsp();
    else host_module_get_param('t' + t + '_pad_mode');
    if (toDrum) {
        if (t === S.activeTrack && (S.activeBank === 2 || S.activeBank === 4)) S.activeBank = 0;
    } else {
        if (t === S.activeTrack && S.activeBank === 7) S.activeBank = 0;
        /* DSP zeroed active_drum_lane/drum_perform_mode inside the convert
         * handler; only JS-side mirror state needs clearing here. */
        S.drumVelZoneArmed[t] = false;
        S.drumLastVelZone[t]  = 0;
    }
    computePadNoteMap();   /* get_param-free — rebuild pad LEDs immediately */
    invalidateLEDCache();
    forceRedraw();
}

/* Route a track to Conductor. The DSP enforces one-Conductor: if another track
 * already holds the role, the convert handler returns without changing anything.
 * We optimistically flip the local mode, then verify the role next tick via
 * pendingConductReadback to detect (and revert) a refusal. */
function convertTrackToConduct(t) {
    stepRecExit();   /* same rule as convertTrackType — see its note */
    const prevMode = S.trackPadMode[t];
    host_module_set_param('t' + t + '_convert_to_conduct', '1');
    S.trackPadMode[t] = PAD_MODE_CONDUCT;
    S.pendingConductReadback = { t: t, prevMode: prevMode };
    /* Mirror convertTrackType's drain barrier: the convert set_param must drain
     * before computePadNoteMap pushes tN_padmap, or same-buffer tN_* coalescing
     * drops the convert (DSP never sets the role → false refusal). The first
     * get_param in syncClipsFromDsp flushes the queued convert; empty tracks use
     * a bare get_param barrier. The refusal readback runs in tick() (get_param
     * valid there). */
    if (trackHasAnyData(t)) syncClipsFromDsp();
    else host_module_get_param('t' + t + '_pad_mode');
    computePadNoteMap();
    invalidateLEDCache();
    forceRedraw();
}

/* Rewrite the cable-2 channel remap table for the active track.
 * When the active track is ROUTE_MOVE, incoming external MIDI is remapped to the
 * track's channel so Move's firmware routes it to the correct track instrument.
 * Called from tick() on any change to activeTrack/route/channel/midiInChannel,
 * and directly from init() on first load / resume after full exit. */
export function applyExtMidiRemap() {
    const t = S.activeTrack;
    const isMove = S.trackRoute[t] === 1;
    if (!isMove) {
        host_ext_midi_remap_clear();
        for (var _i = 0; _i < 16; _i++) {
            host_ext_midi_remap_set(_i, 254);  /* EXT_MIDI_REMAP_BLOCK */
        }
        host_ext_midi_remap_enable(1);
        S.extMidiRemapActive = false;
        return;
    }
    const outCh = S.trackChannel[t] - 1;  /* 0-indexed */
    host_ext_midi_remap_clear();
    if (S.midiInChannel === 0) {
        for (var _i = 0; _i < 16; _i++) {
            if (_i !== outCh) host_ext_midi_remap_set(_i, outCh);
        }
    } else {
        const inCh = S.midiInChannel - 1;  /* 0-indexed */
        if (inCh !== outCh) host_ext_midi_remap_set(inCh, outCh);
    }
    host_ext_midi_remap_enable(1);
    S.extMidiRemapActive = true;
}

function sceneAllPlaying(sceneIdx) {
    let hasAny = false;
    if (S.playing) {
        for (let t = 0; t < NUM_TRACKS; t++) {
            if (!S.trackClipPlaying[t]) continue;
            if (S.trackActiveClip[t] !== sceneIdx) return false;
            hasAny = true;
        }
    } else {
        for (let t = 0; t < NUM_TRACKS; t++) {
            if (!S.trackWillRelaunch[t] && S.trackQueuedClip[t] < 0) continue;
            if (effectiveClip(t) !== sceneIdx) return false;
            hasAny = true;
        }
    }
    return hasAny;
}

function sceneAnyPlaying(sceneIdx) {
    for (let t = 0; t < NUM_TRACKS; t++) {
        if (S.trackClipPlaying[t] && S.trackActiveClip[t] === sceneIdx) return true;
    }
    return false;
}

var _lastSessionView = false;

/* ------------------------------------------------------------------ */
/* _tickImpl drain-order constraints (phase 6b.5)                       */
/* ------------------------------------------------------------------ */
/* _tickImpl is a ~44-block flat sequence of independently-triggered
 * drains (each gated on its own S.pending* flag/countdown), but a handful
 * of pairs are load-bearing on RELATIVE ORDER within the function body —
 * reordering these blocks breaks behavior even though each block looks
 * self-contained. This banner is the "make the drain order explicit"
 * deliverable for phase 6b (map §3): NO dynamic drainPending registry —
 * every writer lives in a module and every drain here is statically
 * ordered, so the order belongs in comments, not indirection. Each
 * constraint below is anchored to its block by a searchable string.
 *
 * - CHORD TWO-TICK PHASE ORDER: the `S.pendingChordPhase2` check (anchor:
 *   "if (S.pendingChordPhase2 !== null)") MUST run BEFORE the
 *   `S.pendingChordToStep` check (anchor: "if (S.pendingChordToStep !==
 *   null && S.activeBank !== 6)") in the same tick. Phase-1 (_toggle) arms
 *   pendingChordPhase2 for the NEXT tick; _set_notes is a DSP no-op on an
 *   empty step, so _toggle must land a tick before _set_notes. Inverting
 *   this pair breaks chord entry.
 *
 * - DEFAULT-DRAIN BEFORE dspSync COUNTDOWN: the pendingDefaultSetParams
 *   drain (anchor: "else if (S.pendingDefaultSetParams.length > 0 &&
 *   !S.pendingSetLoad && S.pendingDspSync === 0") MUST run BEFORE the
 *   pendingDspSync countdown (anchor: "if (S.pendingDspSync > 0) {").
 *   On the tick pendingDspSync hits 1, the default-drain's `=== 0` guard
 *   correctly skips; the FOLLOWING tick's countdown-to-0 fires
 *   restoreUiSidecar(true), which *pushes* new defaults. Swapping the
 *   order would drain a half-populated queue.
 *
 * - pendingSetLoad GATES BOTH pendingDefaultSetParams (`!S.pendingSetLoad`
 *   guard), and pendingSetLoad's own
 *   drain (anchor: "if (S.pendingSetLoad) {")
 *   arms `S.pendingDspSync = 5`. Load is checked/drained first in program
 *   order; defaults wait on `pendingDspSync === 0` by construction.
 *
 * - pollDSP() BEFORE THE LED/SCENE/DRAW BLOCK: the POLL_INTERVAL-gated
 *   pollDSP() call (anchor: "if ((S.tickCount % POLL_INTERVAL) === 0) {
 *   pollDSP();") writes S.playing/trackCurrentStep/trackClipPlaying/merge
 *   state/drum playhead — all read by the scene-cache refresh and the LED
 *   painters that follow later in the same tick. Must stay drain-before-draw.
 *
 * - SUSPEND-SAVE FIRES LAST: the pendingSuspendSave drain (anchor:
 *   "if (S.pendingSuspendSave)") is placed deliberately near the end of the function so
 *   no subsequent set_param in the same tick can overwrite the save (see
 *   the block's own inline comment). Its else-if siblings
 *   (pendingExitAfterSave/pendingHideAfterSave/pendingSnapshotCopy) each
 *   run a tick AFTER the save set_param reached DSP — do not hoist any of
 *   this earlier in the function.
 *
 * - isSuspended: EARLY COMPUTE, LATE CONSUME. `const isSuspended` (anchor:
 *   "const isSuspended = S._origClearScreen && (clear_screen !==
 *   S._origClearScreen);") is computed near the top of the function and
 *   consumed exactly once, at the final draw gate (anchor: "if
 *   (S.screenDirty && !isSuspended) { S.screenDirty = false; drawUI(); }").
 *   This is the one fn-local (not S-field) cross-block coupling in
 *   _tickImpl — it is why the suspend-detect block and the draw-gate block
 *   are not independently carve-safe.
 *
 * - 2-TICK COUNTDOWNS: pendingDrumResync (anchor: "if (S.pendingDrumResync
 *   > 0) {") and pendingStepsReread (anchor: "if (S.pendingStepsReread >
 *   0) {") both arm to 2, decrement once per tick, and act at 0 — the DSP
 *   move they're waiting on must settle a full tick before the JS mirror
 *   re-reads it. pendingScheduledDisarm (anchor: "if
 *   (S.pendingScheduledDisarm) {") is its own 2-tick pair: lock length on
 *   tick 1, disarm on tick 2.
 *
 * - STANDING WARNING: do NOT silently restore a "stepOpTick" /
 *   collision-aware deferred-drain block. An earlier revision of this file
 *   had one (removed in Phase 6, long before this extraction) — its ordering
 *   hazard was real but the block itself is gone from current behavior.
 *   (The write-only S.stepOpTick field + its two ui_input_pads.mjs writers
 *   that lingered after the Phase-6 removal were deleted in the post-refactor
 *   cleanup, 2026-07-11.) If a future change reintroduces a similar deferred
 *   step-op drain, treat its ordering against the blocks above as a fresh
 *   design question, not a copy-paste restore.
 */
/* dAVEBOx IS the session, so quitting hands the device back to stock.
 *
 * ⚠⚠ Historical note worth keeping, because the shape recurs: this used to test
 * for a marker FILE under /data, written by the launcher on take-over and removed
 * on hand-back. A file survives an unclean exit, and the documented recovery path
 * -- "a reboot always returns to stock" -- is exactly the path that skips the
 * launcher's cleanup, so a leftover marker convinced davebox it owned a session
 * it did not. Quit then killed MoveOriginal and the watchdog respawned it: every
 * Quit became a surprise device restart until somebody deleted the file by hand.
 * Never answer a liveness question with a file that only a clean exit removes. */

/* Session exit on the module's terms: the same staged flow as the menu's
 * Quit (save → farewell frame + LED clear → teardown cmd). Called by the
 * host's Shift+Back handler via globalThis.onSessionExitRequest, so the
 * gesture exit shows the same farewell as Quit instead of tearing the stack
 * down around a live screen. Returns true = exit owned and in flight. */
export function requestSessionExit() {
    if (S.exitFarewell !== 0 || S.pendingExitAfterSave) return true;  /* already leaving */
    saveState();                       /* sets pendingSuspendSave */
    S.pendingExitAfterSave = true;     /* drained one tick after the save fires */
    S.globalMenuOpen = false;
    return true;
}

export function _tickImpl() {
    /* ⭑⭑ STUCK-MODIFIER RECONCILE — heal a Shift release that never arrived.
     *
     * ⚠ FIRST, and UNCONDITIONAL. The first cut sat beside updateTrackLEDs(),
     * which is inside the `else` of `if (S.sessionView)` — so a Shift stuck in
     * SESSION view would never have healed, and any earlier stage throwing would
     * skip it silently, because tick() swallows errors. A stuck modifier is
     * exactly the state that must not depend on which view you are in or on the
     * rest of the tick surviving. Caught by test_shift_stuck_reconcile.
     *
     * The shim publishes hardware MIDI to us through a 64-slot ring that
     * DROPS SILENTLY when full, and we drain it only between JS callbacks.
     * A dropped PRESS is self-healing; a dropped RELEASE latches forever.
     * Josh, 2026-08-25: after Shift+volume in track view the Shift+bottom-row
     * track LEDs kept animating "as if they're still in track switch mode" —
     * because as far as we knew, Shift WAS still down. The volume gesture is
     * the worst case for the ring: a CC 79 detent stream plus capacitive
     * touch, with per-detent work on our side.
     *
     * ⭑ The shim tracks Shift from the HARDWARE BUFFER, independently of that
     * ring, and already publishes it in shared memory — so there is an
     * authoritative answer available for free, no round-trip.
     *
     * ⚠ ONE DIRECTION ONLY. We heal stuck-HELD (we think down, hardware says
     * up) because that is the state that never recovers by itself. We do NOT
     * assert Shift from the other direction: a dropped press heals the moment
     * the user presses again, and synthesising a modifier nobody is holding is
     * a worse failure than the one being fixed.
     *
     * Routed through applyShiftEdge() rather than clearing the flag here, so
     * the heal drops the volume claim, flushes the pending level and re-pushes
     * the pad map exactly as a real release would. */
    if (S.shiftHeld && !shadow_get_shift_held()) {
        console.log('stuck Shift healed — release was dropped by the input ring');
        applyShiftEdge(false);
    }

    /* Exit farewell: the EXITING frame and the LED clear were queued when Quit
     * drained; freeze everything else so no later stage can repaint over them
     * (drainLedInit completing would otherwise re-light the surface during the
     * teardown seconds). A few frozen ticks guarantee at least one SPI frame
     * flushes both before the stack dies — the panel then retains this frame
     * across the whole hand-back to stock. */
    if (S.exitFarewell !== 0) {
        if (S.screenDirty) { S.screenDirty = false; drawUI(); }
        if (S.exitFarewell > 0 && --S.exitFarewell === 0) {
            S.exitFarewell = -1;
            host_system_cmd('sh /data/UserData/dbx-host/scripts/exit-to-stock.sh');
        }
        return;
    }

    S.tickCount++;
    {   /* THE CLOCK: one reading per tick; every UI duration is ms off it. */
        const _prevMs = S.clockMs;
        S.clockMs = nowMs();
        const _dtMs = _prevMs > 0 ? Math.max(0, S.clockMs - _prevMs) : 0;
        if (S.bootSplashMs > 0) S.bootSplashMs = Math.max(0, S.bootSplashMs - _dtMs);
    }
    tickPrefetch();                              /* the tick's one read — see ui_dsp_bridge */
    checkBackHold();   /* self-managed Back: fire suspend once a held Back crosses the long-press threshold */
    checkShiftNoteHold();  /* Shift+Note/Session: the HOLD fires at the threshold, not on release */

    /* Ableton .ablbundle export runs here (tick context) so get_param('bpm')
     * resolves — it returns null on the on_midi path where the menu action
     * fires. host_system_cmd blocks for the python packager; transport is
     * stopped (guarded in exportSession) so the brief tick stall is benign. */
    pollPendingExport();

    /* Deferred padmap recompute for leaving-DRUM (see applyTrackConfig
     * else branch). Fire ONLY when the pendingDefaultSetParams queue is
     * empty — otherwise the tN_padmap push would land in the same tick
     * as a queue-drained tN_* push for the same track, and the empirically-
     * observed same-track set_param interference drops the padmap push.
     * (See the val=1 case: it works because syncDrum* get_params between
     * the pad_mode and padmap pushes flush the buffer.) */
    /* Track-type conversion runs here (tick context) so the get_param
     * round-trips inside convertTrackType -> syncClipsFromDsp work — they
     * return null on the on_midi path where the triggers fire. */
    if (S.pendingTrackConvert) {
        const _pc = S.pendingTrackConvert;
        S.pendingTrackConvert = null;
        convertTrackType(_pc.t, _pc.toDrum);
    }

    if (S.pendingConductConvert !== null) {
        const _cct = S.pendingConductConvert;
        S.pendingConductConvert = null;
        convertTrackToConduct(_cct);
    }

    /* Verify the Conductor role landed (or detect a one-Conductor refusal).
     * Runs in tick() so get_param is valid. */
    if (S.pendingConductReadback !== null) {
        const _rb  = S.pendingConductReadback;
        S.pendingConductReadback = null;
        const _raw = host_module_get_param('conductor_track');
        const _ct  = parseInt(_raw, 10);
        const _val = isNaN(_ct) ? -1 : _ct;
        if (_val === _rb.t) {
            /* SUCCESS — the role landed on the requested track. */
            S.conductorTrack = _val;
        } else if (_val >= 0) {
            /* Refused — a different track already holds the role. Revert. */
            S.conductorTrack = _val;
            S.trackPadMode[_rb.t] = _rb.prevMode;
            computePadNoteMap();
            invalidateLEDCache();
            forceRedraw();
            /* Action popups are invisible while the global menu is open (drawUI
             * early-returns into drawGlobalMenu). Use the menu-visible info
             * dialog instead. */
            showMenuInfo('Conductor exists', 'on T' + (_val + 1) + '.', 'Route it back first.');
            S.screenDirty = true;
        } else {
            /* Unexpected — DSP reports no conductor right after convert.
             * Revert the optimistic mode but do NOT show the misleading
             * "exists" popup. */
            S.conductorTrack = _val;
            S.trackPadMode[_rb.t] = _rb.prevMode;
            computePadNoteMap();
            invalidateLEDCache();
            forceRedraw();
        }
    }

    if (S.pendingPadNoteMapRecompute && S.pendingDefaultSetParams.length === 0
            && S.clearDrainHold === 0) {
        S.pendingPadNoteMapRecompute = false;
        computePadNoteMap();
    }

    /* PHASE-1: edge-detect modal pad-dispatch mute changes that aren't
     * caught by explicit hooks (dialogs, ARP-step-edit, knob-touch state).
     * Cheap check — boolean compare. Tick is ~10.6 ms, more than fast
     * enough for non-button-CC modal transitions (dialog open / knob touch). */
    if (S.dspInboundEnabled) {
        const _muted = _padDispatchMutedNow();
        if (_muted !== S.lastPushedMuted) computePadNoteMap();
        /* Self-heal: every 5 ticks (~50ms), read back DSP's pad_dispatch_muted
         * via get_param and re-push the padmap if it diverged from JS truth.
         * Necessary because tN_padmap pushes can be dropped when set_param
         * loses to shadow_send_midi_to_dsp in the same audio buffer (see
         * feedback_set_param_coalescing). Without this, an un-mute push lost
         * to MIDI contention leaves DSP stuck with pad_dispatch_muted=1 and
         * all pads silent until the user happens to gesture a modifier
         * (which retriggers computePadNoteMap). Worst-case stuck pad
         * duration is now ~50ms instead of indefinite. */
        if ((S.tickCount % 5) === 0) {
            const _dspM = dget('pad_dispatch_muted');
            if (_dspM !== null && _dspM !== undefined) {
                const _dspMi = parseInt(_dspM, 10);
                const _jsM = _muted ? 1 : 0;
                if (_dspMi !== _jsM) computePadNoteMap();
            }
            const _dspMap0 = dget('pad_note_map_0');
            if (_dspMap0 !== null && _dspMap0 !== undefined) {
                const _dspMap0i = parseInt(_dspMap0, 10);
                const _jsMap0 = _muted && S.sessionView ? 0xFF
                    : Math.max(0, Math.min(127, (S.padNoteMap[0] | 0) +
                        (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM ? 0 : (S.trackOctave[S.activeTrack] | 0) * 12)));
                const _expect = S.padNoteMap[0] === 0xFF ? 255 : _jsMap0;
                if (_dspMap0i !== _expect) computePadNoteMap();
            }
        }
    }

    /* Drain live-note events queued by onMidiMessage handlers since the last
     * tick. One set_param per track per tick — survives same-buffer
     * coalescing of multiple pad presses in one audio buffer. */
    _drainLiveNotes();

    /* Reapply cable-2 channel remap if anything affecting it changed. */
    {
        const _rt = S.activeTrack;
        const _rr = S.trackRoute[_rt];
        const _rc = S.trackChannel[_rt];
        const _rm = S.midiInChannel;
        if (_rt !== S.lastRemapTrack || _rr !== S.lastRemapRoute ||
                _rc !== S.lastRemapChannel || _rm !== S.lastRemapMidiIn) {
            /* TARP latch is per-track musical intent — preserved across track/
             * route/channel/MIDI-in changes. Only Stop transport and Delete+Play
             * clear it deliberately. */
            /* BEFORE repointing the remap: release any ext notes still held on
             * a Move-routed track. Once the table is rewritten their physical
             * note-off can no longer reach Move on the old channel — stranded
             * firmware voice (finding 1; see flushHeldMoveExtNotes). */
            flushHeldMoveExtNotes();
            applyExtMidiRemap();
            S.lastRemapTrack = _rt; S.lastRemapRoute = _rr;
            S.lastRemapChannel = _rc; S.lastRemapMidiIn = _rm;
        }
    }

    /* Reset TARP latch when entering session view */
    if (S.sessionView && !_lastSessionView) {
        const _t = S.activeTrack;
        if (S.bankParams[_t][5][7] | 0) {
            S.bankParams[_t][5][7] = 0;
            host_module_set_param('t' + _t + '_tarp_latch', '0');
        }
    }
    /* Session-view edge re-pushes the padmap so DSP on_midi gates pad
     * dispatch (session pads launch clips, not notes). */
    if (S.sessionView !== _lastSessionView) {
        computePadNoteMap();
    }
    _lastSessionView = S.sessionView;

    /* Suspend detection: host swaps clear_screen to a no-op while we're parked.
     * Save state on the transition edge; let tick run normally (display is no-oped by host). */
    const isSuspended = S._origClearScreen && (clear_screen !== S._origClearScreen);
    if (isSuspended && !S._wasSuspended) {
        /* saveState() writes the sidecar synchronously and sets
         * pendingSuspendSave — drained at end of this tick (block below).
         * Keeps schema unified with the explicit save paths. */
        saveState();
        removeFlagsWrap();
        host_ext_midi_remap_enable(0);
    }
    if (!isSuspended && S._wasSuspended) {
        installFlagsWrap();
        applyExtMidiRemap();
        /* Clear any held-modifier state that may have got stuck on suspend
         * (key-up events fire after overtake exits, so onMidiMessage never sees them). */
        S.shiftHeld = false; S.deleteHeld = false; S.muteHeld = false;
        S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false;
        S.captureHeld = false; S.shiftTrackLEDActive = false;
        S.heldStep  = -1;    S.heldStepBtn = -1; S.heldStepNotes = []; S.stepReveal = false;
        S.stepWasEmpty = false; S.stepWasHeld = false;
        /* Sysex suppression needs no re-assert here: the host reset its
         * applied-claims snapshot on suspend, so the first reconcile after
         * resume re-derives the full declared set. */
        /* Check if the active set changed while we were parked. */
        const _as = readActiveSet();
        const _dspUuid = (host_module_get_param('state_uuid') || '');
        if (_as.uuid && _dspUuid !== _as.uuid) {
            S.currentSetUuid = _as.uuid;
            S.currentSetName = _as.name;
            S.pendingSetLoad = true;
        }
        /* Self-heal window: the host's set reload can land seconds AFTER we
         * resume (Move writes Settings.json lazily, so the host's detection
         * lags the actual load — observed racing the resume on hardware,
         * 2026-08-06). Keep re-checking active_set.txt for a while so a late
         * flip still triggers the reload instead of silently keeping the
         * previous project's data. */
        S.resumeSetRecheckTicks = 1200;   /* ~13 s @94 Hz, checked every 16 ticks */
        S.ledInitComplete = false;
        invalidateLEDCache();
        S.ledInitQueue = buildLedInitQueue();
        S.ledInitIndex = 0;
        forceRedraw();
    }
    S._wasSuspended = isSuspended;

    /* Post-resume self-heal: a set switch the host detected LATE flips
     * active_set.txt after our resume-edge check already passed. Poll it for
     * a window (cheap: one small file read every 16 ticks) and arm the same
     * reload path the resume edge uses. Inert once the window expires. */
    if (S.resumeSetRecheckTicks > 0 && !isSuspended) {
        S.resumeSetRecheckTicks--;
        if ((S.resumeSetRecheckTicks & 15) === 0 && !S.pendingSetLoad) {
            const _las = readActiveSet();
            if (_las.uuid && _las.uuid !== S.currentSetUuid) {
                console.log('post-resume set flip: ' + S.currentSetUuid +
                            ' -> ' + _las.uuid + ' — reloading');
                S.currentSetUuid = _las.uuid;
                S.currentSetName = _las.name;
                S.pendingSetLoad = true;
                S.resumeSetRecheckTicks = 0;   /* one heal per resume */
            }
        }
    }

    /* Age the select-handoff window. Observed handoff on hardware: ~6.5 s from
     * arm to resume (walk Move into its overview, replay the pad, load the set,
     * wake us). The timeout is generously above that — expiring early would
     * re-introduce the very race it exists to prevent — and its only job is to
     * make sure a handoff that never lands cannot disable the watchdog forever. */
    if (S.selectHandoffTicks > 0) S.selectHandoffTicks--;

    /* PROJECTS pad picker: modifier releases cancel its two-step flows, and
     * a live rename keyboard gets its tick (pad-typing timers + redraw). */
    if (S.projectPadPicker) {
        projectPadPickerModifiers();
        projectPickerTextEntryTick();
    }

    /* Fresh-session boot: open the picker once loading + LED init settle. */
    if (S.pendingOpenProjectPicker && !S.stateLoading && S.ledInitComplete &&
            !S.pendingSetLoad && S.pendingDspSync === 0) {
        S.pendingOpenProjectPicker = false;
        openProjectPadPicker();
    }

    /* SELECT-BEFORE-LOAD watchdog. "Awaiting, but no picker on screen" is a
     * DEAD END by construction: the LOADING screen is pinned, the transport is
     * locked, Back is inert, and there is no project to fall back to — the
     * device reads as hung and only a restart recovers it. So it is treated as
     * a state to repair rather than one to trust we never reach.
     *
     * Three known ways in, all real: backing out of the host set-select gate
     * (resumes with the picker closed and no set change, so no reload is
     * armed); an exception inside openProjectPadPicker, which _pppGuard
     * swallows after the arm was already consumed; and a resume that lands
     * with the arm spent. Rather than patch each, re-arm whenever the
     * condition holds and nothing else is in flight — the arm is idempotent
     * and the open re-lists projects, so a spurious re-arm costs nothing.
     * _pppFailOpen still backstops the case where the picker cannot open at
     * all, so this cannot spin forever. */
    /* ⚠ `S.selectHandoffTicks` is the load-bearing one, added 2026-08-11 after
     * this watchdog was caught FIRING DURING A HANDOFF and wedging the session
     * (device trace: actuator armed at T, this line at T+73ms). davebox declares
     * `suspend_keeps_js`, so its tick keeps running while it is parked for the
     * handoff — and mid-handoff every condition below is transiently true: the
     * picker was closed on the way out, and the DSP still says "awaiting"
     * because the chosen project has not loaded yet. The watchdog then armed a
     * picker reopen that landed AFTER the resume, so the session came back to
     * "Tap a pad to load a project" on top of the project it had just loaded,
     * with input gated by awaitingProjectSelect. Every control dead.
     *
     * The lesson is the general one: this is a repair for a DEAD END, so it
     * must not run while the thing that would end it is still in flight. */
    if (S.awaitingProjectSelect && !S.projectPadPicker &&
            S.selectHandoffTicks === 0 &&
            !S.pendingOpenProjectPicker && !S.pendingSetLoad &&
            S.pendingProjectSwitch === null &&
            !S.confirmStateWipe &&
            S.pendingDspSync === 0 && S.ledInitComplete) {
        console.log('SELECT-BEFORE-LOAD: awaiting with no picker — re-arming');
        S.pendingOpenProjectPicker = true;
    }

    /* Metro note-off */
    if (S.metroNoteOffTick >= 0 && S.tickCount >= S.metroNoteOffTick) {
        S.metroNoteOffTick = -1;
        move_midi_inject_to_move([0x09, 0x80, 108, 0]);
    }

    /* Drain deferred drum tap note-offs */
    for (let _t = 0; _t < NUM_TRACKS; _t++) {
        if (pendingDrumNoteOffs[_t].length === 0) continue;
        const offs = pendingDrumNoteOffs[_t].splice(0);
        for (const pitch of offs) liveSendNote(_t, 0x80, pitch, 0);
    }

    /* Clear CC step-edit active flag once the step is released */
    if (S.ccStepEditActive && S.heldStep < 0)
        S.ccStepEditActive = false;

    /* Deferred CC auto-bits/rest re-read (set from MIDI handlers where get_param
     * is null, e.g. Delete+step whole-step clear). */
    if (S.pendingCCBitsRefresh >= 0) {
        const _rt = S.activeTrack, _rc = S.pendingCCBitsRefresh;
        S.pendingCCBitsRefresh = -1;
        const _bits = host_module_get_param('t' + _rt + '_c' + _rc + '_cc_auto_bits');
        if (_bits !== null) S.trackCCAutoBits[_rt][_rc] = parseInt(_bits, 10) || 0;
        const _rest = host_module_get_param('t' + _rt + '_c' + _rc + '_cc_rest');
        if (_rest) {
            const _rp = _rest.split(' ');
            for (let _k = 0; _k < 8; _k++) {
                const _rv = parseInt(_rp[_k], 10);
                S.clipCCVal[_rt][_rc][_k] = (_rv >= 0 && _rv <= 127) ? _rv : -1;
            }
        }
        invalidateLEDCache();
    }

    /* Poll the defined output value at the playhead per knob (255 = "—") for the
     * realtime display + knob-LED feedback while the CC bank is visible & playing. */
    if (S.activeBank === 6 && S.playing && !S.sessionView && !S.ccStepEditActive) {
        const _lv = host_module_get_param('t' + S.activeTrack + '_cc_cur_vals');
        if (_lv) {
            const _lp = _lv.split(' ');
            for (let _k = 0; _k < 8 && _k < _lp.length; _k++) {
                const _v = parseInt(_lp[_k], 10);
                S.trackCCLiveVal[S.activeTrack][_k] = (_v >= 0 && _v <= 127) ? _v : -1;
            }
        }
    }

    /* Sch (chain knob) automation routing: poll cc_auto_cur_val for every
     * playing track that has Sch lanes, and push values to chain slots via
     * shadow_set_param. Runs regardless of active bank. */
    /* Sch label fetch: one shadow_get_param per tick to avoid blocking.
     * Triggered on bank-6 entry; fetches param name for each Sch lane. */
    if (S.schLabelFetchLane >= 0 && S.schLabelFetchLane < 8) {
        const _ft = S.activeTrack;
        const _fk = S.schLabelFetchLane;
        S.schLabelFetchLane++;
        if (S.trackCCType[_ft][_fk] === 2) {
            const _slot = schSlotForTrack(_ft);
            const _name = shadow_get_param(_slot, 'knob_' + S.trackCCAssign[_ft][_fk] + '_param');
            S.schLabel[_ft][_fk] = _name || null;
        }
        if (S.schLabelFetchLane >= 8) S.schLabelFetchLane = -1;
        S.screenDirty = true;
    }

    /* CC-bank step-LED gradient palette: 6 white brightness levels (the playhead
     * uses the track color instead). Written on bank-6 entry / track switch
     * (not per frame); the step LEDs themselves are driven in updateStepLEDs. */
    if (S.activeBank === 6 && !S.sessionView &&
            S.ccGradPaletteTrack !== S.activeTrack) {
        S.ccGradPaletteTrack = S.activeTrack;
        for (let _l = 0; _l < CC_GRADIENT_LEVELS; _l++) {
            const _w = Math.round(255 * CC_GRADIENT_SCALARS[_l]);
            setPaletteEntryRGB(CC_GRADIENT_BASE + _l, _w, _w, _w);
        }
        reapplyPalette();
        setButtonLED(MovePlay,   S.playing ? Green : LED_OFF, true);
        /* Rec carries Live Merge state (Shift+Rec): red armed, green capturing.
         * CAPTURED (4 — capture stopped, awaiting placement) reverts to OFF so
         * both Play and Rec go dark when the merge ends. */
        setButtonLED(MoveRec,    (S.recordArmed || S.recordScheduledStop) ? Red
                                 : (S.dspMergeState === 2 || S.dspMergeState === 3) ? Green
                                 : S.dspMergeState === 1 ? Red : LED_OFF, true);
        setButtonLED(MoveSample, DarkGrey, true);
        setButtonLED(MoveBack,
            (S.moveCoRunTrack < 0 && backTapWouldAct())
                ? White : LED_OFF, true);
        /* reapplyPalette reset the buttonCache — force-resend the 8 knob LEDs
         * next render (their stopped-state named colors would otherwise be
         * silently dropped) and the step LEDs. */
        S._forceKnobReemit = true;
        invalidateLEDCache();
    }

    /* Phase 1 / Bundle 2C-Rpt1: pendingRepeatLane queue removed. Lane swap
     * while holding a rate pad is now fired immediately on press from the
     * lane-pad branch in _onPadPress (different set_param key from the
     * other lane-pad pushes — no coalescing). */


    /* Set change detected in init(): send UUID so DSP constructs path and loads.
     * Suppressed while the inherit picker is open — state_load fires only
     * after the user picks a source (or "Start blank"). */
    if (S.pendingSetLoad) {
        S.pendingSetLoad = false;
        S.stateLoading = true;
        disarmRecord();
        S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = []; S.stepWasEmpty = false; S.stepWasHeld = false; S.stepReveal = false;
        S.seqActiveNotes.clear(); S.seqLastStep = -1; S.seqLastClip = -1;
        S.pendingDspSync = 5;
        host_module_set_param('state_load', S.currentSetUuid || '');
        /* NOTE: awaitingProjectSelect is deliberately NOT cleared here. Sending
         * the load is not evidence the load happened — see the pendingDspSync
         * completion path below, which clears it against the DSP's own
         * readback once the resync (and restoreUiSidecar) has landed. */
    }

    /* Drain first-run default set_params one per tick, after state is fully settled.
     * clearDrainHold defers the drain past the on_midi-context buffer where
     * a clearClip caller fired synchronous set_params (see clearClip comment). */
    if (S.clearDrainHold > 0) S.clearDrainHold--;
    else if (S.pendingDefaultSetParams.length > 0 && !S.pendingSetLoad && S.pendingDspSync === 0) {
        const _dp = S.pendingDefaultSetParams.shift();
        host_module_set_param(_dp.key, _dp.val);
        /* Device-originated clip edit (copy/cut/clear/row): the DSP will bump
         * rui_rev on the next audio buffer. Arm a short window so pollDSP treats
         * that bump as OURS — adopt the rev + cheap automation-only re-read of
         * S.localEditTouched — instead of the FULL syncClipsFromDsp() self-resync
         * (~1,540 get_params ≈ 4.3s). 12 ticks (~128ms) covers buffer-apply
         * latency + one POLL_INTERVAL. See ui_state.mjs localRevSuppressUntil. */
        if (_dp._local) S.localRevSuppressUntil = S.tickCount + 12;
    }

    /* Poll every 100 ticks (~0.5s): detect DSP hot-reload via instance nonce. */
    if ((S.tickCount % 100) === 0) {
        const newInstanceId = host_module_get_param('instance_id');
        if (newInstanceId && S.lastDspInstanceId !== '' && newInstanceId !== S.lastDspInstanceId) {
            pollDSP();
            for (let _t = 0; _t < NUM_TRACKS; _t++)
                S.trackCurrentPage[_t] = Math.max(0, Math.floor(S.trackCurrentStep[_t] / 16));
            syncClipsFromDsp();
            syncMuteSoloFromDsp();
            computePadNoteMap();
            invalidateLEDCache();
            forceRedraw();
        }
        if (newInstanceId) S.lastDspInstanceId = newInstanceId;
    }

    /* Deferred resync after set change: wait ~5 ticks for state_load to land on audio thread. */
    if (S.pendingDspSync > 0) {
        S.pendingDspSync--;
        if (S.pendingDspSync === 0) {
            pollDSP();
            for (let _t = 0; _t < NUM_TRACKS; _t++)
                S.trackCurrentPage[_t] = Math.max(0, Math.floor(S.trackCurrentStep[_t] / 16));
            syncClipsFromDsp();
            syncMuteSoloFromDsp();
            /* Restore the Conductor role from DSP. syncClipsFromDsp ->
             * readTrackConfig already reads t<idx>_pad_mode (PAD_MODE_CONDUCT=2
             * preserved, not clamped), but S.conductorTrack is not derived from
             * any per-track read — pull it from the conductor_track get_param so
             * a reloaded set isn't desynced (white color, inert Channel/Route).
             * Runs here (tick context) where get_param is valid. */
            const _ct = parseInt(host_module_get_param('conductor_track'), 10);
            if (!isNaN(_ct) && _ct >= 0 && _ct < NUM_TRACKS) {
                S.conductorTrack = _ct;
                S.trackPadMode[_ct] = PAD_MODE_CONDUCT;
                /* Pull the Conductor's per-clip bank values back from DSP.
                 * get_param is valid here (tick/sync context) but NOT in
                 * onMidiMessage. Read all 16 clips once on load/resume so the
                 * full per-clip mirror (condResp/condWhen/condOct) is hot —
                 * later clip switches just re-point S.condActiveClip and need
                 * no DSP reads at all. Mirror the active clip into
                 * S.condActiveClip (the clip whose values the OLED grid
                 * renders). GET shapes (Task 2.1): _cond_resp / _cond_when =
                 * 8-char '0'/'1' strings; _cond_oct = 8 space-separated
                 * signed ints. */
                S.condActiveClip = S.trackActiveClip[_ct] | 0;
                for (let _c = 0; _c < NUM_CLIPS; _c++) {
                    const _resp = host_module_get_param('t' + _ct + '_c' + _c + '_cond_resp');
                    const _when = host_module_get_param('t' + _ct + '_c' + _c + '_cond_when');
                    const _oct  = host_module_get_param('t' + _ct + '_c' + _c + '_cond_oct');
                    if (typeof _resp === 'string' && _resp.length >= NUM_TRACKS) {
                        for (let _k = 0; _k < NUM_TRACKS; _k++)
                            S.condResp[_c][_k] = (_resp.charAt(_k) === '1') ? 1 : 0;
                    }
                    if (typeof _when === 'string' && _when.length >= NUM_TRACKS) {
                        for (let _k = 0; _k < NUM_TRACKS; _k++)
                            S.condWhen[_c][_k] = (_when.charAt(_k) === '1') ? 1 : 0;
                    }
                    if (typeof _oct === 'string' && _oct.length > 0) {
                        const _op = _oct.split(' ');
                        for (let _k = 0; _k < NUM_TRACKS && _k < _op.length; _k++) {
                            const _ov = parseInt(_op[_k], 10);
                            if (!isNaN(_ov)) S.condOct[_c][_k] = _ov;
                        }
                    }
                    /* CdLk: single 0/1 per clip. */
                    const _clk = host_module_get_param('t' + _ct + '_c' + _c + '_cond_lock');
                    S.condLock[_c] = (_clk === '1' || _clk === 1) ? 1 : 0;
                }
            } else {
                S.conductorTrack = -1;
            }
            restoreUiSidecar(true);
            computePadNoteMap();
            S.stateLoading = false;
            /* Load completion is an INPUT-STATE BARRIER for touch state. The
             * resync above blocks the tick for seconds, the shim's UI MIDI
             * ring is 64 slots with silent tail-drop (shadow_ui_midi_publish),
             * so a touch RELEASE landing in that window can be lost for good —
             * observed as the jog touch from the picker's load click never
             * clearing, which pinned session view on the mixer page. A press
             * the user still holds re-arms on the next event; a dropped
             * release never does, so end every touch here. */
            S.jogTouched = false;
            S.knobTouched = -1;
            S.knobPhysIdx = -1;
            standDownBankDisplay(true);   /* a project switch: no window survives it */
            invalidateLEDCache();
            forceRedraw();
            /* SELECT-BEFORE-LOAD ends HERE, not when state_load was sent.
             *
             * Two reasons it cannot be the send site. (1) The DSP may have
             * REFUSED the load — a version mismatch returns early, and a
             * set_param can be coalesced away entirely — so only its own
             * awaiting_select readback proves a project is live. (2) Even on a
             * clean load, S still held startup defaults until restoreUiSidecar
             * ran just above; unlocking writeSidecar any earlier let a suspend
             * inside this multi-second window overwrite the project's sidecar
             * with defaults.
             *
             * The version-mismatch dialog is also raised here, and it has to
             * be: the mismatch is PRODUCED by the load, so nothing before the
             * load can see it. init() used to read it after create_instance
             * loaded; now that the load happens on selection, this is the only
             * point where the answer exists. Without it a v≠36 project opens
             * blank and silently refuses every save for the session. */
            const _aw = host_module_get_param('awaiting_select');
            const _awUnknown = (_aw === null || _aw === undefined || _aw === '');
            S.awaitingProjectSelect = _awUnknown ? false : (parseInt(_aw, 10) === 1);
            /* The handoff LANDED — this is the site that proves it, because it
             * is where the DSP's own readback says a project is live. Close the
             * window here rather than on resume: a resume can also arrive with
             * nothing loaded (backing out of the gate), and that case must go
             * back to being the watchdog's to repair. */
            S.selectHandoffTicks = 0;
            const _svm = host_module_get_param('state_version_mismatch');
            if (_svm && parseInt(_svm, 10) === 1 && !S.confirmStateWipe) {
                S.confirmStateWipe = true;
                S.confirmStateWipeSel = 1;
                S.screenDirty = true;
            }
        }
    }

    /* Deferred Move co-run entry inject — see enterMoveNativeCoRun(). Fire the
     * track-button press now that the shim's co-run path is active, so Move's
     * track + knob LED repaint passes through to hardware instead of being stripped. */
    if (S.pendingMoveCoRunInject > 0) {
        S.pendingMoveCoRunInject--;
        if (S.pendingMoveCoRunInject === 0 && S.moveCoRunTrack >= 0) {
            const ch = S.trackChannel[S.moveCoRunTrack] | 0;
            if (ch >= 1 && ch <= 4) {
                const coCC = 44 - ch;  /* ch 1 -> CC 43 (Track 1) ... ch 4 -> CC 40 (Track 4) */
                /* Reliable landing: alternate a neighbor track-button with the
                 * co-run track, ending on the co-run track (twice), so Move
                 * definitively selects + shows the routed track. Each neighbor->co-run
                 * transition forces a fresh selection; the doubled co-run tail covers
                 * a missed/coalesced final press. Well-spaced (gap below) so Move
                 * processes each as a distinct press. */
                const nb = (coCC === 43) ? 42 : 43;  /* any track button != co-run */
                S.moveCoRunPressQueue = [nb, coCC, nb, coCC];
                S.moveCoRunPressGap = 0;
            }
        }
    }
    /* Drain the co-run track-button press sequence (Option B full-row repaint):
     * one injected press every few ticks until the queue empties. Prefix each
     * press with a defensive Shift-off (CC 49=0) — Move firmware's internal
     * Shift state can be ambiguous when a tool entered co-run via Shift+Step
     * (the physical Shift release was zeroed shim-side in non-co-run mode, so
     * Move never saw it), and a plain track-button press with Shift "held"
     * lands on Move's track-routing menu instead of the preset editor. */
    if (S.moveCoRunPressQueue && S.moveCoRunPressQueue.length > 0) {
        if (S.moveCoRunPressGap > 0) {
            S.moveCoRunPressGap--;
        } else {
            const cc = S.moveCoRunPressQueue.shift();
            move_midi_inject_to_move([0x0B, 0xB0, 49, 0]);    /* Shift off (defensive) */
            move_midi_inject_to_move([0x0B, 0xB0, cc, 127]);
            move_midi_inject_to_move([0x0B, 0xB0, cc, 0]);
            S.moveCoRunPressGap = 5;
        }
    }

    /* Deferred targeted re-sync after undo/redo: re-read only the affected clip(s). */
    if (S.pendingUndoSync > 0) {
        S.pendingUndoSync--;
        if (S.pendingUndoSync === 0) {
            const _info = host_module_get_param('last_restore');
            syncClipsTargeted(_info);
            /* apply_clip_restore clears tr->recording on the DSP side; re-establish it.
             * Also flush stale JS note buffers since DSP called finalize_pending_notes. */
            if (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack >= 0) {
                _recordingNoteTrack.clear();
                S._recNoteOns.length   = 0;
                S._recNoteOffs.length  = 0;
                _drumRecNoteOns.length  = 0;
                _drumRecNoteOffs.length = 0;
                host_module_set_param('t' + S.recordArmedTrack + '_recording', '1');
            }
            invalidateLEDCache();
            forceRedraw();
        }
    }

    /* Deferred _steps re-read after _reassign: confirm DSP move in JS mirror */
    if (S.pendingAllLanesStretchCheck >= 0) {
        const _sat = S.pendingAllLanesStretchCheck;
        S.pendingAllLanesStretchCheck = -1;
        const _res = host_module_get_param('t' + _sat + '_all_lanes_stretch_result');
        if (_res !== null && parseInt(_res, 10) === -1) {
            showActionPopup('NO ROOM');
            S.bankParams[_sat][7][1] -= (S.knobLastDir[1] || 1);
        }
    }
    if (S.allLanesQntResetTick >= 0 && S.tickCount >= S.allLanesQntResetTick) {
        S.bankParams[S.allLanesQntResetTrack][7][3] = -1;
        S.allLanesQntResetTick  = -1;
        S.allLanesQntResetTrack = -1;
        S.screenDirty = true;
    }
    if (S.allLanesResResetTick >= 0 && S.tickCount >= S.allLanesResResetTick) {
        S.bankParams[S.allLanesResResetTrack][7][0] = -1;
        S.allLanesResResetTick  = -1;
        S.allLanesResResetTrack = -1;
        S.screenDirty = true;
    }
    if (S.allLanesDirResetTick >= 0 && S.tickCount >= S.allLanesDirResetTick) {
        S.bankParams[S.allLanesDirResetTrack][7][6] = -1;
        S.allLanesDirResetTick  = -1;
        S.allLanesDirResetTrack = -1;
        S.screenDirty = true;
    }
    if (S.pendingDrumResync > 0) {
        S.pendingDrumResync--;
        if (S.pendingDrumResync === 0) {
            syncDrumClipContent(S.pendingDrumResyncTrack);
            syncDrumLanesMeta(S.pendingDrumResyncTrack);
            syncDrumLaneSteps(S.pendingDrumResyncTrack, S.activeDrumLane[S.pendingDrumResyncTrack]);
            forceRedraw();
        }
    }
    /* Drain the record-off resend (see disarmRecord): re-asserts recording=0 for
     * a few ticks so a disarm coalesced in one audio buffer can't strand
     * recording=1 (which floods the automation lane). Idempotent DSP-side. The
     * re-arm guard stops the resend if recording is armed again in the window. */
    if (S.recOffTicks > 0 && S.recOffTrack >= 0) {
        if (S.recordArmed) {
            S.recOffTicks = 0; S.recOffTrack = -1;
        } else {
            S.recOffTicks--;
            host_module_set_param('t' + S.recOffTrack + '_recording', '0');
            if (S.recOffTicks <= 0) S.recOffTrack = -1;
        }
    }
    if (S.pendingDrumLaneResync > 0) {
        S.pendingDrumLaneResync--;
        if (S.pendingDrumLaneResync === 0) {
            const _drT = S.pendingDrumLaneResyncTrack;
            const _drL = S.pendingDrumLaneResyncLane;
            syncDrumLaneSteps(_drT, _drL);
            /* Also refresh per-lane bank params (NOTE FX, DELAY, Repeat Groove)
             * so post-reset and post-mutation pfx values reflect DSP. Without
             * this, Lane Reset would leave NOTE FX/DELAY mirrors showing the
             * pre-reset values until the next track switch. */
            refreshDrumLaneBankParams(_drT, _drL);
            forceRedraw();
        }
    }
    if (S.pendingStepsReread > 0) {
        S.pendingStepsReread--;
        if (S.pendingStepsReread === 0) {
            const prt  = S.pendingStepsRereadTrack;
            const prac = S.pendingStepsRereadClip;
            const bulk = host_module_get_param('t' + prt + '_c' + prac + '_steps');
            if (bulk && bulk.length >= NUM_STEPS) {
                for (let rs = 0; rs < NUM_STEPS; rs++)
                    S.clipSteps[prt][prac][rs] = bulk[rs] === '1' ? 1 : (bulk[rs] === '2' ? 2 : 0);
                S.clipNonEmpty[prt][prac] = clipHasContent(prt, prac);
            }
            const _plen = host_module_get_param('t' + prt + '_c' + prac + '_length');
            if (_plen !== null && _plen !== undefined) S.clipLength[prt][prac] = parseInt(_plen, 10) || 16;
            const _ptps = host_module_get_param('t' + prt + '_c' + prac + '_tps');
            if (_ptps !== null && _ptps !== undefined) {
                const _tv = parseInt(_ptps, 10);
                S.clipTPS[prt][prac] = TPS_VALUES.indexOf(_tv) >= 0 ? _tv : 24;
            }
            if (prac === S.trackActiveClip[prt]) refreshPerClipBankParams(prt);
            forceRedraw();
        }
    }
    if (S.pendingSceneBakeResync > 0) {
        S.pendingSceneBakeResync--;
        if (S.pendingSceneBakeResync === 0) {
            const sc = S.pendingSceneBakeClip;
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                if (S.trackPadMode[_t] === PAD_MODE_DRUM) {
                    if (S.trackActiveClip[_t] === sc) {
                        syncDrumClipContent(_t);
                        syncDrumLanesMeta(_t);
                        syncDrumLaneSteps(_t, S.activeDrumLane[_t]);
                    }
                } else {
                    const bulk = host_module_get_param('t' + _t + '_c' + sc + '_steps');
                    if (bulk && bulk.length >= NUM_STEPS) {
                        for (let rs = 0; rs < NUM_STEPS; rs++)
                            S.clipSteps[_t][sc][rs] = bulk[rs] === '1' ? 1 : (bulk[rs] === '2' ? 2 : 0);
                        S.clipNonEmpty[_t][sc] = clipHasContent(_t, sc);
                    }
                    const _plen = host_module_get_param('t' + _t + '_c' + sc + '_length');
                    if (_plen !== null && _plen !== undefined) S.clipLength[_t][sc] = parseInt(_plen, 10) || 16;
                    const _ptps = host_module_get_param('t' + _t + '_c' + sc + '_tps');
                    if (_ptps !== null && _ptps !== undefined) {
                        const _tv = parseInt(_ptps, 10);
                        S.clipTPS[_t][sc] = TPS_VALUES.indexOf(_tv) >= 0 ? _tv : 24;
                    }
                    if (sc === S.trackActiveClip[_t]) refreshPerClipBankParams(_t);
                }
            }
            forceRedraw();
        }
    }

    /* pendingClearLength drain removed (Group B): Clip Clear now preserves
     * length and loop window so the deferred length=16 reset is no longer
     * needed. The pendingClearLengthTrack/Clip fields are kept in ui_state
     * defaults (-1) but no setter remains. */

    /* Refresh step LEDs while drum repeat is recording into the active lane */
    if (S.recordArmed && S.playing && !S.sessionView &&
            S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM &&
            (S.drumRepeatHeldPad[S.activeTrack] >= 0 || S.drumRepeat2HeldLanes[S.activeTrack].size > 0 || S.drumRepeat2LatchedLanes[S.activeTrack].size > 0)) {
        syncDrumLaneSteps(S.activeTrack, S.activeDrumLane[S.activeTrack]);
        forceRedraw();
    }

    /* Real-time preview while editing any global menu parameter.
     * Only send set_param when the edit value actually changes — avoids flooding
     * the DSP param queue (which would starve tN_launch_clip / transport commands). */
    if (S.globalMenuOpen && S.globalMenuState && S.globalMenuItems) {
        const item = S.globalMenuItems[S.globalMenuState.selectedIndex];
        if (item && S.globalMenuState.editing && S.globalMenuState.editValue !== null) {
            if (item.set && S.globalMenuState.editValue !== S.lastSentMenuEditValue) {
                item.set(S.globalMenuState.editValue);
                S.lastSentMenuEditValue = S.globalMenuState.editValue;
                S.screenDirty = true;
            }
            S.bpmWasEditing = true;
        } else if (S.bpmWasEditing && !S.globalMenuState.editing) {
            if (item && item.set && item.get) item.set(item.get());
            S.bpmWasEditing = false;
            S.lastSentMenuEditValue = null;
        }
    }

    /* Transpose preview self-heal: cancel a stranded preview/dialog if we've left
     * the Key/Scale edit by any path the edit-exit hook above doesn't cover (whole
     * menu closed, navigated away). */
    if (S.xposePrevKey !== null || S.confirmXpose) {
        const _it = (S.globalMenuOpen && S.globalMenuState && S.globalMenuItems)
                    ? S.globalMenuItems[S.globalMenuState.selectedIndex] : null;
        const _onKeyScale = !!(_it && S.globalMenuState.editing &&
                               (_it.label === 'Key' || _it.label === 'Scale'));
        if (S.confirmXpose) {
            /* dialog stranded by Back / menu close (Back isn't a jog-click) → cancel */
            if (!_onKeyScale) { S.confirmXpose = false; xposeCancelPreview(); }
        } else if (!_onKeyScale) {
            xposeCancelPreview();
        }
    }


    if (!S.ledInitComplete) {
        drainLedInit();
    } else {
        /* Bank select display timeout: State 3 → State 4 after ~2000ms.
         * ⚠ Runs while LATCHED too, on purpose. The latch is a SEPARATE reason
         * to hold the screen (see inTimeout in ui_render), not a pause button on
         * this window — freezing the window here as well made two mechanisms for
         * one behaviour, and a mutation that deleted either was invisible
         * because the other still held the screen. One reason, one place. */
        if (S.bankSelectTick >= 0 && (S.clockMs - S.bankSelectTick) >= BANK_DISPLAY_MS) {
            standDownBankDisplay();
            S.screenDirty = true;
        }
        /* Overlay expiry: clear timer here so drawUI() can gate on flag alone */
        if (S.stretchBlockedEndTick >= 0 && S.clockMs >= S.stretchBlockedEndTick) {
            S.stretchBlockedEndTick = -1;
            S.screenDirty = true;
        }
        if (S.actionPopupEndTick >= 0 && S.clockMs >= S.actionPopupEndTick) {
            S.actionPopupEndTick = -1;
            S.screenDirty = true;
        }
        /* Auto-clear the highlight ~600ms after a turn — but ONLY for a turn that
         * arrived without a physical touch (knobPhysIdx < 0). While a finger is
         * actually on the knob, the highlight (and enum overlay) must persist
         * until the touch is released, so skip the timeout in that case. */
        if (S.knobTouched >= 0 && S.knobPhysIdx < 0 && S.knobTurnedTick[S.knobTouched] >= 0 &&
                (S.clockMs - S.knobTurnedTick[S.knobTouched]) >= KNOB_TURN_HIGHLIGHT_MS) {
            S.knobTouched = -1;
            S.screenDirty = true;
        }
        if (S.noNoteFlashEndTick >= 0 && S.clockMs >= S.noNoteFlashEndTick) {
            S.noNoteFlashEndTick = -1;
            S.screenDirty = true;
        }
        if (S.stepSaveFlashEndTick >= 0 && S.clockMs >= S.stepSaveFlashEndTick) {
            S.stepSaveFlashEndTick   = -1;
            S.stepSaveFlashStartTick = -1;
        }
        /* Session view hold-to-save: fire exactly when threshold reached, not on release */
        if (S.sessionStepHeld >= 0) {
            const _ssh = S.sessionStepHeld;
            if (S.clockMs - S.stepBtnPressedTick[_ssh] >= STEP_SAVE_HOLD_MS) {
                const _ctx = S.sessionStepHeldCtx;
                S.sessionStepHeld    = -1;
                S.sessionStepHeldCtx = 0;
                S.stepBtnPressedTick[_ssh] = -1;
                if (_ctx === 1) {
                    S.perfSnapshots[_ssh] = S.perfModsToggled | S.perfModsHeld;
                    showActionPopup('PERF PRESET', 'SAVED');
                } else {
                    const drumEffMutes = [];
                    for (let _t = 0; _t < NUM_TRACKS; _t++) {
                        const mMask = S.drumLaneMute[_t];
                        const sMask = S.drumLaneSolo[_t];
                        let effMask = mMask;
                        if (sMask) {
                            let notSoloed = 0;
                            for (let _l = 0; _l < DRUM_LANES; _l++) {
                                if (!(sMask & (1 << _l))) notSoloed |= (1 << _l);
                            }
                            effMask = (mMask | notSoloed) >>> 0;
                        }
                        drumEffMutes.push(effMask >>> 0);
                    }
                    S.snapshots[_ssh] = { mute: S.trackMuted.slice(), solo: S.trackSoloed.slice(), drumEffMute: drumEffMutes };
                    const mStr = S.trackMuted.map(function(m) { return m ? '1' : '0'; }).join(' ');
                    const sStr = S.trackSoloed.map(function(s) { return s ? '1' : '0'; }).join(' ');
                    const dStr = drumEffMutes.join(' ');
                    host_module_set_param('snap_save', _ssh + ' ' + mStr + ' ' + sStr + ' ' + dStr);
                    showActionPopup('MUTE STATE', 'SAVED');
                }
                S.stepSaveFlashStartTick = S.clockMs;
                S.stepSaveFlashEndTick   = S.clockMs + STEP_SAVE_FLASH_MS;
                forceRedraw();
            }
        }

        if ((S.tickCount % POLL_INTERVAL) === 0) { pollDSP(); S.screenDirty = true; }

        /* Per-parameter automation: drain what the DSP staged and push what it
         * cannot write itself. EVERY tick, not on the POLL_INTERVAL cadence —
         * automation is a value the user hears, and running it at the poll rate
         * would quantise every parameter move to that interval. It costs one
         * read only when something is staged, and its own write budget caps the
         * rest (see ui_automation.mjs). */
        automationTick();
        /* The two conditions only the DSP can see, on the slow cadence: neither
         * is per-tick news and each clears on read. */
        if ((S.tickCount % POLL_INTERVAL) === 0) {
            const lines = automationPollWarnings();
            if (lines) showActionPopup(...lines);
        }

        /* SESSION VIEW track levels: knob N drives track N's level.
         *
         * A track's level is its position in the mix, and a position is EITHER a
         * Schwung chain slot or a Move FX bus — the unified slot model. Both
         * flavours are resolved here, and only here, so the knob handler has a
         * single already-answered question to ask.
         *
         * Schwung: the level is the slot's OUTPUT (SLOT_LEVEL_KEY = the bus
         * fader). It was the sound generator's own level while Move tracks were
         * routed THROUGH Schwung slots — the fader would then have moved a Move
         * track sharing the slot too. Move tracks own their own buses now, so
         * nothing else is summed into a chain slot and the fader is simply the
         * track's level. The slot IS the track index (a track owns its
         * instrument), so each mask holds exactly the track's one addressed slot
         * — the old channel-match layering (and its "All"-channel hazard) is
         * gone.
         *
         * Move: the level is the bus fader itself (`move_fx:N:volume`), the same
         * value that track's sound mode shows on its VOLUME row. There is no
         * "synth" underneath to scale separately — Move's instrument is upstream
         * of us and the bus is where it arrives.
         *
         * Writes are synchronous SHM round-trips, so they stay budgeted here in
         * tick rather than in the MIDI handler. */
        if (S.sessionView && (S.tickCount % POLL_INTERVAL) === 0 &&
                SESS_KNOB_MODES[S.sessKnobMode].widget !== 'gateway') {
            /* The gateway has no per-track value — polling it would burn SHM
             * round-trips filling the cache from a key nobody serves. */
            const _modeKey = SESS_KNOB_KEYS[S.sessKnobMode];
            const _modeDef = SESS_KNOB_DEFAULTS[S.sessKnobMode];
            schSlotMasksAllTracks(_sessMaskScratch);
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _bus = S.trackRoute[_t] === 1 /* ROUTE_MOVE */
                    ? moveBusForChannel(S.trackChannel[_t]) : 0;
                if (S.sessVolBus[_t] !== _bus) {
                    S.sessVolBus[_t] = _bus;
                    S.sessVolLevel[_t] = -1;
                }
                if (_bus) {
                    S.sessVolSlots[_t] = 0;
                    if (S.sessVolLevel[_t] < 0) {
                        const _raw = parseFloat(engineGet(0, moveBusComp(_bus), _modeKey));
                        S.sessVolLevel[_t] = isFinite(_raw) && _raw >= 0 ? _raw : _modeDef;
                    }
                    continue;
                }
                if (S.trackRoute[_t] !== 0) { S.sessVolSlots[_t] = 0; continue; }
                const _m = _sessMaskScratch[_t];
                S.sessVolSlots[_t] = _m;
                if (_m !== 0 && S.sessVolLevel[_t] < 0) {
                    let _s0 = 0;
                    while (_s0 < CHAIN_SLOTS && !(_m & (1 << _s0))) _s0++;
                    const _raw = parseFloat(engineGetSlotParam(_s0, _modeKey));
                    S.sessVolLevel[_t] = isFinite(_raw) && _raw >= 0 ? _raw : _modeDef;
                }
            }
        }
        {
            const _wKey = SESS_KNOB_KEYS[S.sessKnobMode];
            let _wrote = 0;
            for (let _t = 0; _t < NUM_TRACKS && _wrote < 2; _t++) {
                if (!S.sessVolPending[_t]) continue;
                S.sessVolPending[_t] = false;
                const _v = S.sessVolLevel[_t].toFixed(3);
                const _bus = S.sessVolBus[_t] | 0;
                if (_bus > 0) {
                    engineSet(0, moveBusComp(_bus), _wKey, _v);
                } else {
                    const _m = S.sessVolSlots[_t] | 0;
                    for (let _s = 0; _s < CHAIN_SLOTS; _s++) {
                        if (_m & (1 << _s)) engineSetSlotParam(_s, _wKey, _v);
                    }
                }
                _wrote++;
            }
            /* Persist once the gesture is over, never per detent — neither the
             * host's slot-level setter nor its bus-strip setter saves, and
             * saving is a sync file write.
             *
             * ONE call covers both flavours: engineSaveState flushes every FX
             * bus family alongside the slots, so a bus level reaches the set's
             * move_fx_meta.json by the same act that writes slot_N.json. (This
             * is the same call sound mode's own VOLUME row ends its gesture
             * with — there is no second cadence to hit.)
             *
             * ⚠ "No writes pending" is NOT the end of a gesture. Encoder messages
             * arrive in bursts, so a continuous turn leaves quiet ticks all the
             * way through it; keying the save off that fired a whole-chain file
             * write mid-turn, over and over, and the knob visibly froze on each
             * one. The gesture is over when the LEVEL STOPS MOVING, so wait for
             * a real gap since the last turn — long enough to cover the pauses
             * inside one gesture, short enough that letting go and pulling the
             * battery still keeps the move. */
            if (S.sessVolSaveOwed && !_wrote && !S.sessVolPending.some(Boolean) &&
                ((S.clockMs - S.sessVolLastTurn) >= SESSVOL_SAVE_IDLE_MS ||
                 S.pendingSuspendSave)) {
                S.sessVolSaveOwed = false;
                engineSaveState();
            }
        }

        /* SOUND MODE.
         *
         * Entry (queued by the Shift+Note/Session release dispatch) still
         * resolves in tick: the slot itself is now a direct per-track state
         * read (derived from the track index), but entry drives shadow_get/set_param traffic
         * that must stay on the tick budget, not in a MIDI handler.
         *
         * soundTick() is where every shadow_get/set_param for sound mode
         * happens: queued writes drain at most 2 per tick and polling is
         * budgeted. This is the whole reason sound mode isn't the lab rig
         * copied across — the rig calls the engine straight from its MIDI
         * handler, and a sequencer cannot. Placed after pollDSP() and before
         * the LED/draw block, so its dirty flag reaches this tick's draw. */
        /* Bank-picker SETTLE fallback — it ABANDONS.
         *
         * The gesture normally ends when you let go of the jog wheel. But a
         * turn can arrive with no touch at all — the capacitive read can miss a
         * quick flick, and the remote UI has no wheel — and a picker with no way
         * to close would sit over the screen forever, swallowing the jog. So an
         * idle selection commits itself.
         *
         * ⚠⚠ It CLOSES the picker, it does not choose. Only the jog click
         * applies a bank (Josh, 2026-08-25), and a timeout is the one caller
         * that fires with nobody asking — committing there meant a picker you
         * forgot about quietly changed your bank.
         *
         * Gated on the touch being UP, so it can never pre-empt a hand that is
         * still on the wheel. */
        if (S.bankPickerSel >= 0 && !S.jogTouched && S.bankPickerIdleTick >= 0 &&
                (S.tickCount - S.bankPickerIdleTick) > BANK_PICKER_SETTLE_TICKS) {
            S.bankPickerSel = -1;
            S.bankPickerIdleTick = -1;
            S.screenDirty = true;
        }

        /* ⭑ THE INVARIANT, scoped to BANK MODE: with the bank view open,
         * activeBank === BANK_SOUND MEANS the gateway card is the screen —
         * sound mode standing at its prompt. The bank can arrive without the
         * screen (a sidecar load, a track switch, any future writer), and
         * BANKS[11] is a stub, so this is the one place that opens it rather
         * than each of those routes remembering to.
         *
         * ⚠ AT REST it must NOT fire (Josh, 2026-09-01, THE ONE LAW): a track
         * remembered on SOUND + CONFIG shows the resting overview like every
         * other bank. The unscoped version held sound mode open at rest, which
         * made soundActive() true at what looked like idle — the jog click's
         * `!soundActive()` gate then never latched bank mode and clicks fell
         * through into sound-mode handling (the S+C-as-active-bank bug).
         *
         * SILENT — arriving is not a bank gesture. ⚠ Conductor tracks never
         * take this bank (takeBankIdentity skips them); the pad-mode check keeps
         * a hand-edited sidecar from opening a screen they have no row for. */
        /* ⭑ BOTH sound banks open AT REST (unlatched — soundResting, 2026-09-03):
         * their knobs (the macros, the levels) work on the overview like any
         * bank's, and Back never changes the bank. The 09-01 bug was the
         * prompt being open AND active at rest; resting is not active. */
        if (!S.sessionView && !soundOpen() && isSoundBank(S.activeBank)
                && S.pendingSoundEnterTrack < 0 && S.moveCoRunTrack < 0
                && !S.awaitingProjectSelect
                && S.trackPadMode[S.activeTrack] !== PAD_MODE_CONDUCT) {
            S.pendingSoundEnterTrack = S.activeTrack;
            S.pendingSoundEnterSilent = true;
            S.pendingSoundEnterMacros = (S.activeBank === BANK_MACROS);
        }
        if (S.pendingSoundEnterTrack >= 0) {
            const _st = S.pendingSoundEnterTrack;
            S.pendingSoundEnterTrack = -1;
            /* ⚠ Cleared with the track, not after use: an entry that DECLINES
             * below (wrong track, already open) would otherwise leave the flag
             * armed for the next bank arrival, which would then open the menu
             * when the bank should have shown its prompt. */
            const _wantMenu = S.pendingSoundEnterMenu;
            S.pendingSoundEnterMenu = false;
            const _silent = S.pendingSoundEnterSilent;
            S.pendingSoundEnterSilent = false;
            const _macros = S.pendingSoundEnterMacros;
            S.pendingSoundEnterMacros = false;
            if (_st === S.activeTrack && !soundOpen()) {
                /* The ROUTE picks the flavour: a Move-routed track's sound is
                 * its Move instrument bus, a Schwung-routed one's is its chain.
                 * Slot is addressed directly per track — always resolvable. */
                if (S.trackRoute[_st] === 1) soundEnterMove(_st);
                else soundEnter(_st, schSlotForTrack(_st));
                /* ⭑ The ASK decides the screen. Every route above lands on the
                 * bank's prompt; a gesture that asked for the MENU by name gets
                 * the menu. Consumed here so the route logic stays in one
                 * place. */
                if (_wantMenu) soundShowMenu();
                /* The bank named MACROS: the same entry, landing on its page
                 * (the second identity of sound mode — see BANK_MACROS). */
                else if (_macros) soundSetBank(BANK_MACROS);
                /* A RETURN, not a gesture: the user switched tracks, they did
                 * not ask to see this screen. Both entry paths stamp the bank
                 * display window unconditionally (Shift+Note NEEDS that — see
                 * the 08-23 arm), so the return undoes it here rather than
                 * teaching the entries a second meaning. Without this the
                 * screen pops up over the track overview mid-switch, which is
                 * the very thing the display-law fix removed. */
                if (_silent) standDownBankDisplay(true);   /* a RETURN opens no window, by design */
            }
        }
        /* Sound mode asking for Move's own editor (the SYNTH row of a Move bus).
         * Co-run entry lives out here so ui_sound need not import ui_corun. */
        {
            const _cr = soundConsumeCoRunRequest();
            if (_cr >= 0) {
                /* 'sound' so Menu returns here rather than to track view. */
                soundExit();
                enterMoveNativeCoRun(_cr, 'sound');
            }
        }
        /* ---- sound mode: reconcile with the world it does not own ----
         *
         * Every screen here was opened under a CONDITION, and a condition that
         * is only tested at the door becomes a lie the moment the world moves.
         * All of them are re-checked in this block, deliberately together, so
         * the list can be read in one place instead of being inferred from the
         * write sites of five different flags:
         *
         *   opened when          | re-checked by
         *   ---------------------|--------------------------------------------
         *   the VIEW it was      | the view-binding check below -> soundExit
         *     called from        |
         *   OLED is ours         | co-run check below -> soundExit
         *   track is active      | _switchActiveTrack -> soundExit (see below)
         *   route picks FLAVOUR  | the follow below -> soundEnterMove / retarget
         *   track HAS a sound    | the follow below -> soundExit (Ext only)
         *
         * ⚠ THE FOLLOW IS RETIRED for user gestures (Josh, 2026-08-24). A track
         * switch now LEAVES sound mode, in _switchActiveTrack, for every route
         * alike — the bank itself is the memory (trackActiveBank holds
         * BANK_SOUND for a track left on it, and the invariant above reopens the
         * screen), which is what made following redundant. `_switchActiveTrack` and the sidecar restore are the only
         * two writers of S.activeTrack, so the branch below can now be reached
         * ONLY from the restore, and only if sound mode were somehow open
         * across a project load. Kept as a backstop rather than deleted,
         * because that one path was not worth proving cold.
         *
         * Track ROUTE cannot change while sound mode is up (route is set only
         * from the global menu, and the two are mutually exclusive), so it
         * needs no check of its own beyond the follow's — verified, not
         * assumed, 2026-07-29. */
        if (soundOpen()) {
            /* Sound mode and the bus screen are called from INSIDE a view, and
             * the view owns them: Shift+Note/Session opens the buses in session
             * view and the track's sound in track view. So leaving the view you
             * called it from ENDS it — both directions, no special case — and
             * you land back on the view you navigated to. Anything else leaves
             * a screen belonging to a view you are no longer in.
             *
             * Checked here rather than at each S.sessionView write site: there
             * are five, and spreading the bookkeeping across them is what
             * produced the earlier bugs of this shape. */
            if (soundEnteredInSession() !== S.sessionView) {
                /* ⭑ A LEAVE, not a close (Josh, 2026-08-25): "note/session should
                 * always jump to session view from track view without resetting
                 * the track's current bank place." The track comes WITH you —
                 * same shape as the track switch — so it stays RECORDED on
                 * SOUND + CONFIG and the invariant above re-opens the screen when
                 * you come back to track view. A plain close would land it on the
                 * default bank, which is the reset he saw.
                 * ⚠ Only the VIEW toggle. Shift+Note/Session still CLOSES (it is
                 * the deliberate way out), and lands on the default bank. */
                soundExit({ leaving: true });
                invalidateLEDCache();
                forceRedraw();
            }
            /* Move-native co-run took the OLED out from under us: sound mode
             * has nothing to draw on. */
            else if (S.moveCoRunTrack >= 0) soundExit();
            /* The track moved out from under us. Sound mode FOLLOWS it rather
             * than closing: re-point at the new track's slot, keeping the block
             * you were on, so switching tracks mid-edit compares two sounds
             * instead of dumping you back to the sequencer. Checked here rather
             * than at each switch site because there are several (Shift+pad,
             * session launchers, remote UI) and pads deliberately stay with the
             * sequencer, so sound mode never sees them.
             *
             * Only an EXT-routed track has no sound to edit and closes it: a
             * Schwung-routed track has its chain, a Move-routed one its Move
             * instrument bus (P8a 1b — before that, Move closed too). */
            /* ...but SESSION FX is not a track's sound. It reports track -1,
             * which never equals activeTrack, so without this the follow fired
             * on the very next tick and replaced the bus screen with the last
             * track module's editor — the screen appeared for one frame. */
            else if (!soundIsGlobal() && S.activeTrack !== soundTrack()) {
                const _nt = S.activeTrack;
                /* Follow the track ACROSS flavours: a Move-routed track has a
                 * sound too (its instrument bus), so switching onto one
                 * retargets into the Move flavour instead of closing.
                 *
                 * ⭑ An EXT-routed track USED to close Track Control, because it
                 * has no chain and no bus. It no longer does, and that is a
                 * correctness fix rather than a preference: `Track to` lives on
                 * this screen, so closing here would take away the only control
                 * that can route the track back — set a track to MIDI out and it
                 * would be stranded, unreachable from the device. It retargets
                 * to a screen with no sound on it, which is the truth about an
                 * EXT track, and the destination row is still there. */
                if (S.trackRoute[_nt] === 1) {
                    soundEnterMove(_nt);
                } else {
                    /* Slot is addressed directly per track — always resolvable. */
                    soundRetarget(_nt, schSlotForTrack(_nt));
                }
            }
            else soundTick();
            /* The name keyboard painted its own pad LEDs; put davebox's back. */
            if (soundConsumeLedDirty()) { invalidateLEDCache(); forceRedraw(); }
            if (soundDirty()) S.screenDirty = true;
        }

        /* ---- Shift+volume = ACTIVE TRACK volume (Josh, 2026-08-24) ----
         * Deltas accumulated by the CC handler land as ONE read-modify-write
         * here. The seed read happens once per gesture per track (Shift
         * release clears tvSeeded), so a level edited elsewhere between
         * gestures is re-read, never assumed. Route decides the store: a
         * chain track's slot level, a Move track's bus strip Volume — the
         * same two families the mixer rows use. An EXT track has no volume;
         * it says so once per gesture instead of silently doing nothing. */
        if (S.tvDeltaAcc) {
            const _tvD = S.tvDeltaAcc; S.tvDeltaAcc = 0;
            /* In Move-native co-run the gesture belongs to the track whose
             * instrument is on screen — its Move bus strip volume (Josh,
             * 2026-08-25). That is normally the active track, but co-run names
             * its own, so take it from the source of truth rather than assuming
             * the two agree. Everywhere else: the active track, as before. */
            const _tvT = S.moveCoRunTrack >= 0 ? S.moveCoRunTrack : S.activeTrack;
            if (S.trackRoute[_tvT] === 2) {
                /* A MIDI-routed track's volume IS standard MIDI volume: send
                 * CC 7 on the track's channel out the port (Josh, 2026-08-24).
                 * One CC per detent, 0-127, seeded from the session-local
                 * last-sent value — the receiver owns the real state, this is
                 * just where the knob left off. A `MIDI to Track N` follower
                 * does not reach the port (its output feeds another track),
                 * so it keeps the NO VOLUME popup instead of sending a CC
                 * nothing will hear. */
                if ((S.trackMidiTo[_tvT] | 0) > 0) {
                    if (!S.tvExtWarned) { S.tvExtWarned = true; showActionPopup('MIDI FOLLOWER', 'NO VOLUME'); }
                } else {
                    let _cc = (S.tvExtCC7[_tvT] | 0) + _tvD;
                    if (_cc < 0) _cc = 0;
                    if (_cc > 127) _cc = 127;
                    if (_cc !== S.tvExtCC7[_tvT]) {
                        S.tvExtCC7[_tvT] = _cc;
                        const _st = 0xB0 | ((S.trackChannel[_tvT] - 1) & 0x0F);
                        move_midi_external_send([0x0B, _st, 7, _cc]);
                    }
                    /* Same card, MIDI's own unit: CC 7 is 0-127, not a 0-2x
                     * level, and the bar shows the proportion either way. */
                    if (S.moveCoRunTrack < 0)
                        showTrackVolCard('Tr ' + (_tvT + 1) + '  CC7  ' + _cc, _cc / 127);
                }
            } else {
                const _tvBus = S.trackRoute[_tvT] === 1 ? moveBusForChannel(S.trackChannel[_tvT]) : 0;
                if (!S.tvSeeded || S.tvTrack !== _tvT) {
                    const _raw = S.trackRoute[_tvT] === 1
                        ? engineGet(0, moveBusComp(_tvBus), 'volume')
                        : engineGetSlotParam(slotIndex(_tvT), SLOT_LEVEL_KEY);
                    const _sv = parseFloat(_raw);
                    S.tvLevel = (isFinite(_sv) && _sv >= 0) ? _sv : 1;
                    S.tvSeeded = true; S.tvTrack = _tvT;
                }
                let _tvV = S.tvLevel + _tvD * SLOT_LEVEL_STEP;
                if (_tvV < 0) _tvV = 0;
                if (_tvV > SLOT_LEVEL_MAX) _tvV = SLOT_LEVEL_MAX;
                if (_tvV !== S.tvLevel) {
                    S.tvLevel = _tvV; S.tvDirty = true;
                    if (S.trackRoute[_tvT] === 1) engineSet(0, moveBusComp(_tvBus), 'volume', _tvV.toFixed(3));
                    else engineSetSlotParam(slotIndex(_tvT), SLOT_LEVEL_KEY, _tvV.toFixed(3));
                }
                /* ⚠ No card in co-run: Move owns the OLED, so it would draw
                 * into a buffer nobody composites — and worse, its timer would
                 * outlive the co-run exit and pop a stale level over the screen
                 * you land on. The gesture is deliberately blind there. */
                if (S.moveCoRunTrack < 0)
                    showTrackVolCard('Tr ' + (_tvT + 1) + '  LEVEL  ' + _tvV.toFixed(2) + 'x',
                                     _tvV / SLOT_LEVEL_MAX);
            }
        }
        /* The save is deferred off the release — a synchronous file write has
         * no business in a MIDI handler. */
        /* ⚠⚠ NO explicit save here. engineSaveState() is shadow_save_state_now(),
         * whose own log line calls it "flushed set state before exit" — it writes
         * ALL EIGHT SLOTS, every FX bus and the chain config, synchronously, on
         * the UI loop. Calling that after a volume tweak froze the loop for
         * 771 ms, MEASURED on Josh's device 2026-08-26 against a median tick of
         * 11-17 ms.
         *
         * ⭑ That one stall explains the whole chain we chased for two days: the
         * freeze let the 64-slot input ring overflow, the overflow dropped the
         * Shift RELEASE, and the stuck modifier left the track LEDs blinking —
         * the "LED linger". The ring reserve and the stuck-Shift reconcile were
         * both treating symptoms of this.
         *
         * The host already persists this correctly and incrementally: the write
         * marks the slot dirty, and shadow_ui's autosave scheduler saves ONE unit
         * after a quiet period ("a knob sweep is one edit, not 200"), with a
         * deferral cap so an edit cannot starve. Bypassing that to force a full
         * flush was never buying durability the scheduler did not already give.
         *
         * ⚠ tvDirty is still cleared here: it exists so the SAVE happens once per
         * gesture rather than per detent, and dropping the flag keeps the rest of
         * that bookkeeping honest. */
        if (S.tvSavePending) {
            S.tvSavePending = false;
            S.tvDirty = false;
        }

        /* Metro beat detection: checked every tick via dedicated get_param for minimal jitter */
        if (S.metronomeOn > 0) {
            const _mbcRaw = dget('metro_beat_count');
            if (_mbcRaw !== null && _mbcRaw !== undefined) {
                const _mbc = parseInt(_mbcRaw, 10) | 0;
                if (_mbc !== S.metroPrevBeat) {
                    S.metroPrevBeat = _mbc;
                    playMetronomeClick();
                    if (S.recordCountingIn) S.countInBeatStartTick = S.tickCount;
                }
            }
        }

        /* Step hold threshold: once elapsed, close the tap window so release won't toggle.
         * Also auto-assign empty step now so knobs work immediately in step edit. */
        if (S.heldStep >= 0 && S.heldStepBtn >= 0 && S.stepBtnPressedTick[S.heldStepBtn] >= 0 &&
                ((S.clockMs - S.stepBtnPressedTick[S.heldStepBtn]) >= STEP_HOLD_MS ||
                 S.stepHoldPromote)) {           /* a lock was dialled: that IS a hold */
            S.stepHoldPromote = false;
            S.stepBtnPressedTick[S.heldStepBtn] = -1;
            S.stepWasHeld = true;
            if (S.activeBank === 6) {
                /* CC step-edit: seed from the recorded point at this step (or "—"),
                 * plus the computed output value the lane produces there. The first
                 * knob-turn writes from the recorded point if set; otherwise it starts
                 * from the step's interpolated value (what the lane already outputs
                 * there), so inserting a new breakpoint continues the existing curve
                 * instead of jumping to 0. Falls back to clip resting value, else 0. */
                const _t6 = S.activeTrack, _c6 = effectiveClip(_t6);
                const _info = host_module_get_param('t' + _t6 + '_c' + _c6 + '_ccstepinfo_' + S.heldStep);
                const _ip = _info ? _info.split(' ') : [];
                for (let _ck = 0; _ck < 8; _ck++) {
                    const _pv = _ip.length > _ck     ? parseInt(_ip[_ck], 10)     : -1;
                    const _cv = _ip.length > _ck + 8 ? parseInt(_ip[_ck + 8], 10) : -1;
                    S.ccStepEditSet[_ck]      = _pv >= 0;
                    S.ccStepEditComputed[_ck] = (_cv >= 0 && _cv <= 127) ? _cv : -1;
                    const _rest = S.clipCCVal[_t6][_c6][_ck];
                    S.ccStepEditVal[_ck] = _pv >= 0 ? _pv
                        : (_cv >= 0 && _cv <= 127 ? _cv
                           : (_rest >= 0 ? _rest : 0));
                }
                S.screenDirty = true;
            } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
                /* ⭑ A HOLD NEVER CREATES (spec §2, Josh 2026-09-02): an empty
                 * drum step held past the threshold stays empty — heldStepNotes
                 * stays [], the knobs read `--`. A velocity-zone pad pressed
                 * while it is held creates the hit (ui_input_pads). The
                 * auto-assign that used to live here is gone. */
                if (S.drumHeldReadPending) {
                    /* Occupied drum step: the press handler couldn't read the
                     * step's real vel/gate/nudge/iter/rand/ratch (get_param
                     * null in MIDI context) — read them now from tick context
                     * so inspect-only holds don't clobber velocity with the
                     * placeholder 100 at release (audit js-input-2). */
                    const t    = S.activeTrack;
                    const lane = S.activeDrumLane[t];
                    const rv = host_module_get_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_vel');
                    const rg = host_module_get_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_gate');
                    const rn = host_module_get_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_nudge');
                    const ri = host_module_get_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_iter');
                    const rr = host_module_get_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_rand');
                    const rx = host_module_get_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_ratch');
                    S.stepEditVel   = rv !== null ? parseInt(rv, 10) : S.stepEditVel;
                    S.stepEditGate  = rg !== null ? parseInt(rg, 10) : S.stepEditGate;
                    S.stepEditNudge = rn !== null ? parseInt(rn, 10) : S.stepEditNudge;
                    S.stepEditIter  = ri !== null ? parseInt(ri, 10) : S.stepEditIter;
                    S.stepEditRand  = rr !== null ? parseInt(rr, 10) : S.stepEditRand;
                    S.stepEditRatch = rx !== null ? parseInt(rx, 10) : S.stepEditRatch;
                    S.drumHeldReadPending = false;
                }
                S.screenDirty = true;
            } else if (!S.stepWasEmpty && S.heldStepNotes.length === 0) {
                /* Non-empty step — notes not yet read (get_param null at press time).
                 * Read now from tick context where get_param works. */
                const ac_h2 = effectiveClip(S.activeTrack);
                const raw_h2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_notes');
                S.heldStepNotes = (raw_h2 && raw_h2.trim().length > 0)
                    ? raw_h2.trim().split(' ').map(Number).filter(function(n) { return n >= 0 && n <= 127; })
                    : [];
                const rv2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_vel');
                const rg2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_gate');
                const rn2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_nudge');
                const ri2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_iter');
                const rr2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_rand');
                const rx2 = host_module_get_param('t' + S.activeTrack + '_c' + ac_h2 + '_step_' + S.heldStep + '_ratch');
                S.stepEditVel   = rv2 !== null ? parseInt(rv2, 10) : 100;
                S.stepEditGate  = rg2 !== null ? parseInt(rg2, 10) : 12;
                S.stepEditNudge = rn2 !== null ? parseInt(rn2, 10) : 0;
                S.stepEditIter  = ri2 !== null ? parseInt(ri2, 10) : 0;
                S.stepEditRand  = rr2 !== null ? parseInt(rr2, 10) : 0;
                S.stepEditRatch = rx2 !== null ? parseInt(rx2, 10) : 0;
                S.screenDirty = true;
            } else if (S.stepWasEmpty && S.heldStepNotes.length === 0) {
                /* ⭑ A HOLD NEVER CREATES (spec §2, Josh 2026-09-02): an empty
                 * melodic step held past the threshold stays empty. A pad
                 * pressed while it is held creates the note (ui_input_pads,
                 * the step-first chord path). The lastPlayedNote auto-assign
                 * and its "NO NOTE" fallback that lived here are gone; the tap
                 * on an empty step still places the last note (release path).
                 * Nothing to do but mark the hold as such. */
                S.screenDirty = true;
            }
        }

        /* Chord-first phase 2: replace notes with full chord — fires the tick AFTER phase 1.
         * Must come before phase 1 so both can't fire in the same tick and coalesce. */
        if (S.pendingChordPhase2 !== null) {
            const _cp2 = S.pendingChordPhase2;
            if (_cp2.pitches.length > 1) {
                host_module_set_param('t' + _cp2.t + '_c' + _cp2.ac + '_step_' + _cp2.step + '_set_notes',
                    _cp2.pitches.join(' '));
            }
            S.heldStepNotes = _cp2.pitches.slice();
            refreshSeqNotesIfCurrent(_cp2.t, _cp2.ac, _cp2.step);
            S.screenDirty = true;
            S.pendingChordPhase2 = null;
        }

        /* Chord-first phase 1: activate empty step with first chord pitch so _set_notes works next tick.
         * _set_notes is a no-op on empty steps, so _toggle must fire first to activate.
         * Context is self-contained — does not depend on heldStep (may fire after quick release).
         * Sets pendingChordPhase2 for the NEXT tick; phase 2 check above ensures they never coalesce. */
        if (S.pendingChordToStep !== null && S.activeBank !== 6) {
            const _cp1 = S.pendingChordToStep;
            if (_cp1.wasEmpty) {
                host_module_set_param('t' + _cp1.t + '_c' + _cp1.ac + '_step_' + _cp1.step + '_toggle',
                    _cp1.pitches[0] + ' ' + _cp1.vel);
                S.clipSteps[_cp1.t][_cp1.ac][_cp1.step] = 1;
                S.clipNonEmpty[_cp1.t][_cp1.ac] = true;
            }
            S.pendingChordPhase2 = _cp1;
            S.pendingChordToStep = null;
        }

        /* Refresh scene state cache for O(1) lookups in LED update functions */
        for (let _i = 0; _i < 16; _i++) {
            S.cachedSceneAllPlaying[_i] = sceneAllPlaying(_i);
            S.cachedSceneAllQueued[_i]  = sceneAllQueued(_i);
            S.cachedSceneAnyPlaying[_i] = sceneAnyPlaying(_i);
        }

        /* STEP RECORD ends when the transport runs, whatever started it —
         * the Play button exits in its own handler; this belt catches the
         * remote UI, Link, and any DSP-side start. */
        if (S.stepRecActive && S.playing) stepRecExit();

        /* Transport LEDs */
        setButtonLED(MovePlay, S.playing ? Green : LED_OFF);
        if (S.moveCoRunTrack >= 0) {
            /* Co-run: keep Rec dark — you can't record while a co-run target owns
             * input, and in Move co-run Move firmware lights its own Record button
             * (passes through under skip_led_clear). Force OFF every POLL_INTERVAL
             * so our blanking re-asserts over that layer instead of being eaten. */
            setButtonLED(MoveRec, LED_OFF, (S.tickCount % POLL_INTERVAL) === 0);
        } else if (S.stepRecActive) {
            /* Step record: solid WHITE — red belongs to live recording, and
             * the cursor's white blink on the step row matches it. */
            setButtonLED(MoveRec, White);
        } else if (S.recordScheduledStop || S.recordPendingPage) {
            /* recordScheduledStop = waiting for end-of-page to stop; recordPendingPage =
             * waiting for next page boundary for DSP to flip recording=1. Both blink. */
            setButtonLED(MoveRec, Math.floor(S.clockMs / 75) % 2 === 0 ? Red : LED_OFF);
        } else if (S.mergeNoticePending) {
            /* Live Merge NOTICE up, waiting for you to press Rec to start the
             * count-in: flash red to draw the eye to the Record button. */
            setButtonLED(MoveRec, Math.floor(S.clockMs / 110) % 2 === 0 ? Red : LED_OFF);
        } else if (S.dspMergeState === 2 || S.dspMergeState === 3) {
            /* Live Merge capturing (Shift+Sample): green. */
            setButtonLED(MoveRec, Green);
        } else if (S.dspMergeState === 1) {
            /* Live Merge armed, waiting for the bar boundary: red. */
            setButtonLED(MoveRec, Red);
        } else {
            /* Idle or CAPTURED (capture ended → LED off with Play). */
            setButtonLED(MoveRec, S.recordArmed ? Red : LED_OFF);
        }
        /* Sample = bake, always available: dim ambient (same as Capture idle). */
        setButtonLED(MoveSample, DarkGrey);
        /* Back LED: lit where a TAP is functional (backs out of a dialog / menu /
         * perf lock / Track-view alt-view or non-default bank); off at the home
         * screens where a tap is a no-op. Hold-to-suspend works regardless. Dark
         * during co-run — Back is ceded to the peer there and never reaches us. */
        setButtonLED(MoveBack,
            (S.moveCoRunTrack < 0 && backTapWouldAct())
                ? White : LED_OFF);
        /* Loop LED: flash White at 1/8 rate while Perf Mode view is locked (Session
         * View only) or drum repeat latched; VividYellow for latch mode; dim available
         * indicator (16) otherwise (always functional in both views). */
        {
            let loopColor = LED_OFF;
            const _lt = S.activeTrack;
            const _rptLatched = S.drumRepeatLatched[_lt] || S.drumRepeat2LatchedLanes[_lt].size > 0;
            /* TARP-latched indicator: when the active track has ARP IN on +
             * latched with notes in the buffer, blink the Loop button at the
             * arp's step-fire rate in the track color. fire_count is a DSP
             * monotonic counter — parity drives a 50% duty cycle synced to
             * each fired note. Gated to melodic tracks (TARP doesn't run on
             * drum) and yields to perfViewLocked / drum-rpt latch above. */
            let _tarpBlinkActive = false;
            let _tarpBlinkOn = false;
            if (!(S.sessionView && S.perfViewLocked) && !_rptLatched) {
                const _tarpOn = parseInt(dget('t' + _lt + '_tarp_on'), 10) === 1;
                const _tarpLatch = parseInt(dget('t' + _lt + '_tarp_latch'), 10) === 1;
                if (_tarpOn && _tarpLatch) {
                    const _fc = parseInt(host_module_get_param('t' + _lt + '_tarp_fc'), 10) || 0;
                    _tarpBlinkActive = true;
                    _tarpBlinkOn = (_fc % 2) === 0;
                }
            }
            if (S.sessionView && S.perfViewLocked) {
                loopColor = flashAtRate(48) ? White : LED_OFF;
            } else if (_rptLatched) {
                loopColor = flashAtRate(48) ? White : LED_OFF;
            } else if (_tarpBlinkActive) {
                loopColor = _tarpBlinkOn ? trackColor(_lt) : LED_OFF;
            } else if (S.sessionView && S.perfLatchMode) {
                loopColor = VividYellow;
            } else {
                /* Loop's LED renders palette colors brighter than Delete/Copy;
                 * scratch index 60 is a custom-RGB dim grey set in drainLedInit
                 * so Loop's ambient visually matches Delete/Copy at idx 16. */
                loopColor = 60;
            }
            setButtonLED(MoveLoop, loopColor);
        }
        /* Capture: blink White only when a tap would actually commit buffered
         * input (S.captureArmed — playing, or stopped in an empty session), dim
         * ambient otherwise. Blinking on stopped+non-empty (a no-op) misled. */
        setButtonLED(MoveCapture,
            S.captureArmed
                ? ((Math.floor(S.clockMs / 220) % 2) ? White : LED_OFF)
                : DarkGrey);
        {
            const _muted      = S.trackMuted[S.activeTrack];
            const _soloed     = S.trackSoloed[S.activeTrack];
            const _muteBlink  = Math.floor(S.clockMs / 220) % 2;
            setButtonLED(MoveMute, _muted ? 124 : (_soloed ? (_muteBlink ? 124 : 0) : 16));
        }
        /* Contextual button LEDs: dim available indicator (16) on actionable buttons. */
        setButtonLED(MoveShift,       16);
        setButtonLED(MoveNoteSession, 16);
        /* Session/Track view button. In Schwung co-run the CC 50 press AND its
         * LED are owned by the Schwung chain editor (Menu opens master/send FX,
         * editor paints it white via its LED queue) — NOT a dAVEBOx exit. We
         * can't win that LED (the editor's queue flush lands after us each
         * frame), so just paint White to agree rather than fight. In Move co-run
         * the button is disabled + dark; force OFF to override Move firmware.
         * Global Menu / Tap Tempo keep the blink (no competing LED layer). */
        if (S.moveCoRunTrack >= 0) {
            /* Move co-run: Menu is the way OUT (P8a 1d), so it has to LOOK like
             * one — it was held dark back when it did nothing. Blink, the same
             * vocabulary Tap Tempo uses for "this button leaves". Forced every
             * POLL_INTERVAL to override Move firmware's pass-through writes,
             * which is why it is a force rather than a plain set. */
            setButtonLED(MoveNoteSession,
                         (Math.floor(S.clockMs / 220) % 2) ? White : LED_OFF,
                         (S.tickCount % POLL_INTERVAL) === 0);
        } else if (S.globalMenuOpen) {
            /* Menu open: steady-lit (no blink) — Back exits the menu now, so the
             * button doesn't need to flash to advertise itself as the exit. */
            setButtonLED(MoveNoteSession, White);
        } else if (S.tapTempoOpen) {
            const _exitBlink = (Math.floor(S.clockMs / 220) % 2) ? 16 : LED_OFF;
            setButtonLED(MoveNoteSession, _exitBlink);
        }
        setButtonLED(MoveUndo,        16);
        setButtonLED(MoveDelete,      16);
        setButtonLED(MoveCopy,        16);
        setButtonLED(MoveUp,          16);
        setButtonLED(MoveDown,        16);
        setButtonLED(MoveLeft,  S.sessionView ? LED_OFF : 16);
        setButtonLED(MoveRight, S.sessionView ? LED_OFF : 16);
        /* Shift-flash: buttons with a Shift-modified function blink 16/OFF while Shift is held.
         * Sample uses DarkGrey/OFF since index 16 (RoyalBlue) shows wrong on that button. */
        if (S.shiftHeld) {
            const _sf  = (Math.floor(S.clockMs / 220) % 2) ? 16 : LED_OFF;
            setButtonLED(MoveNoteSession, _sf);
            /* Shift+Rec = Live Merge; blink Rec only while merge is idle (an
             * active merge already owns the LED with its red/green state). */
            if (S.dspMergeState === 0 && !S.recordArmed)
                setButtonLED(MoveRec, (Math.floor(S.clockMs / 220) % 2) ? Red : LED_OFF);
            setButtonLED(MoveUndo,        _sf);
            setButtonLED(MoveCopy,        _sf);
            if (S.sessionView)  setButtonLED(MoveLoop, _sf);
            if (!S.sessionView) setButtonLED(MoveMute, _sf);
        }

        if (S.sessionView) {
            updateSessionLEDs();
            if (S.loopHeld || S.perfViewLocked) updatePerfModeLEDs();
            else updateSceneMapLEDs();
            /* Scene-merge count-in flash overrides the scene grid for the lead-in bar. */
            if (S.mergeCountingIn && S.countInQuarterTicks > 0) {
                const elapsed  = S.clockMs - S.countInBeatStartTick;
                const flashOn  = (elapsed % S.countInQuarterTicks) < (S.countInQuarterTicks / 8);
                const flashClr = flashOn ? White : LED_OFF;
                for (let _i = 0; _i < 16; _i++) setLED(16 + _i, flashClr);
            }
        } else {
            updateStepLEDs();
            /* Count-in flash: blink all step buttons white at quarter-note rate
             * (recording count-in, or a Track-View solo-merge count-in). */
            if (((S.recordArmed && S.recordCountingIn) || S.mergeCountingIn) && S.countInQuarterTicks > 0) {
                const elapsed  = S.clockMs - S.countInBeatStartTick;
                const flashOn  = (elapsed % S.countInQuarterTicks) < (S.countInQuarterTicks / 8);
                const flashClr = flashOn ? White : LED_OFF;
                for (let _i = 0; _i < 16; _i++) setLED(16 + _i, flashClr);
            }
        }
        updateTrackLEDs();

        /* Session overview blink: mark dirty when animation state toggles */
        if (S.sessionOverlayHeld) {
            const blinkOn = S.flashEighth;
            if (blinkOn !== S.lastBlinkOn) { S.lastBlinkOn = blinkOn; S.screenDirty = true; }
        } else {
            S.lastBlinkOn = null;
        }

        /* Solo blink: mark dirty when blink toggles and any track is soloed */
        if (S.trackSoloed.some(function(s) { return s; })) {
            const _sb = Math.floor(S.clockMs / 220) % 2;
            if (_sb !== S.lastSoloBlink) { S.lastSoloBlink = _sb; S.screenDirty = true; }
        } else {
            S.lastSoloBlink = null;
        }

        /* Loop jog OOB view: revert to pages view after ~500ms of inactivity */
        if (S.loopJogActive && S.loopHeld && S.loopJogLastTick !== undefined) {
            if ((S.clockMs - S.loopJogLastTick) > 750) {
                S.loopJogActive = false;
                S.screenDirty = true;
            }
        }

        /* Dave Box scan: the album's vertical pan is tick-driven, like the
         * blink below — the draw path only paints what the tick advanced. */
        if (S.daveBox) daveBoxTick();

        /* ALL LANES blink: mark dirty when "ALL" blink toggles (bank header + loop-held overlay) */
        if (S.activeBank === 7 && S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
            const _ab = Math.floor(S.clockMs / 220) % 2;
            if (_ab !== S.lastAllLanesBlink) { S.lastAllLanesBlink = _ab; S.screenDirty = true; }
        } else {
            S.lastAllLanesBlink = null;
        }
    }
    /* Flush buffered recording events — one batched set_param per tick to survive coalescing.
     * Note-ons take priority; note-offs wait until the next tick if both are pending.
     * Ext-origin entries (external cable-2 MIDI) carry a PER-NOTE 'e' marker in the
     * payload ("e64 100"): the DSP handlers use slot-if-active-else-fallback for
     * ext notes (non-Move ext never reaches on_midi, so no press slot exists) while
     * plain pad notes keep the slot requirement. A batch can mix pad + ext. */
    if (S.recordArmed && !S.recordCountingIn) {
        if (S._recNoteOns.length > 0) {
            const rt   = S._recNoteOns[0].rt;
            const pairs = S._recNoteOns.map(function(n) { return (n.ext ? 'e' : '') + n.pitch + ' ' + n.vel; }).join(' ');
            host_module_set_param('t' + rt + '_record_note_on', pairs);
            S._recNoteOns.length = 0;
        } else if (_drumRecNoteOns.length > 0) {
            /* Batch all queued drum note-ons (same recordArmedTrack) into one
             * payload so a chord-press lands in DSP in a single audio buffer
             * rather than trickling out one-per-tick. */
            const rt = _drumRecNoteOns[0].track;
            const pairs = _drumRecNoteOns.map(function(n) { return (n.ext ? 'e' : '') + n.laneNote + ' ' + n.vel; }).join(' ');
            host_module_set_param('t' + rt + '_drum_record_note_on', pairs);
            _drumRecNoteOns.length = 0;
        } else if (S._recNoteOffs.length > 0) {
            const rt     = S._recNoteOffs[0].rt;
            const pitches = S._recNoteOffs.map(function(n) { return (n.ext ? 'e' : '') + n.pitch; }).join(' ');
            host_module_set_param('t' + rt + '_record_note_off', pitches);
            S._recNoteOffs.length = 0;
        } else if (_drumRecNoteOffs.length > 0) {
            const rt = _drumRecNoteOffs[0].track;
            const pitches = _drumRecNoteOffs.map(function(n) { return (n.ext ? 'e' : '') + n.laneNote; }).join(' ');
            host_module_set_param('t' + rt + '_drum_record_note_off', pitches);
            _drumRecNoteOffs.length = 0;
        } else if (S.pendingPrerollGate !== null) {
            const pg = S.pendingPrerollGate;
            S.pendingPrerollGate = null;
            /* Write to the first step of the loop window — playback starts at loop_start,
             * not at absolute step 0. */
            if (pg.isDrum) {
                const _ls = S.drumLaneLoopStart[pg.track] | 0;
                host_module_set_param('t' + pg.track + '_l' + pg.lane + '_step_' + _ls + '_gate', String(pg.gate));
            } else {
                const _ls = S.clipLoopStart[pg.track][pg.clip] | 0;
                host_module_set_param('t' + pg.track + '_c' + pg.clip + '_step_' + _ls + '_gate', String(pg.gate));
            }
        } else if (S.pendingPrerollToggleQueue.length > 0) {
            const _ptq = S.pendingPrerollToggleQueue.shift();
            const _ls = S.clipLoopStart[_ptq.track][_ptq.clip] | 0;
            host_module_set_param('t' + _ptq.track + '_c' + _ptq.clip + '_step_' + _ls + '_toggle', _ptq.pitch + ' ' + _ptq.vel);
            if (_ptq.last)
                S.pendingPrerollGate = { isDrum: false, track: _ptq.track, clip: _ptq.clip, gate: _ptq.gate };
        } else if (S.pendingPrerollNote !== null && S.playing) {
            const pr = S.pendingPrerollNote;
            const _prLive = S.liveActiveNotes.has(pr.laneNote);
            if (pr.isDrum) {
                const elapsed = S.clockMs - S.transportStartTick;
                /* Wait for note released AND one step elapsed (skip first loop pass to avoid double-trigger) */
                if (!_prLive && elapsed >= 15000 / Math.max(20, S.bpm || 120)) {
                    S.pendingPrerollNote = null;
                    const _ls = S.drumLaneLoopStart[pr.track] | 0;
                    if (S.drumLaneSteps[pr.track][pr.lane][_ls] === '0') {
                        const countInDur = S.transportStartTick - pr.countInStart;
                        const dspPerJs = countInDur > 0 ? 384 / countInDur : 4;
                        const pressedDur = (pr.releasedAtTick || S.tickCount) - pr.pressedAtTick;
                        const gate = Math.max(1, Math.min(tps * 16, Math.round(pressedDur * dspPerJs)));
                        host_module_set_param('t' + pr.track + '_l' + pr.lane + '_step_' + _ls + '_toggle', String(pr.vel));
                        S.pendingPrerollGate = { isDrum: true, track: pr.track, lane: pr.lane, gate };
                        S.drumLaneSteps[pr.track][pr.lane][_ls] = '1';
                        S.drumLaneHasNotes[pr.track][pr.lane] = true;
                        invalidateLEDCache();
                        forceRedraw();
                    }
                }
            }
        } else if (S.pendingPrerollNotes.length > 0 && S.playing) {
            const pns = S.pendingPrerollNotes;
            const pr  = pns[0];
            /* TARP-on: DSP tarp_fire_step records arp output to clip directly. Skip
             * JS preroll capture so a held chord becomes an arpeggiated sequence
             * across steps instead of a chord stamped on step 0. */
            const _tarpOn = parseInt(host_module_get_param('t' + pr.track + '_tarp_on'), 10) === 1;
            if (_tarpOn) {
                S.pendingPrerollNotes       = [];
                S.pendingPrerollToggleQueue = [];
                S.pendingPrerollGate        = null;
            } else {
            const _prLive = pns.some(function(n) { return S.liveActiveNotes.has(n.pitch); });
            const elapsed = S.clockMs - S.transportStartTick;
            /* Wait for all chord notes released AND one step elapsed (a 16th at tempo) */
            if (!_prLive && elapsed >= 15000 / Math.max(20, S.bpm || 120)) {
                S.pendingPrerollNotes = [];
                const _ls = S.clipLoopStart[pr.track][pr.clip] | 0;
                if (S.clipSteps[pr.track][pr.clip][_ls] === 0) {
                    const countInDur = S.transportStartTick - pr.countInStart;
                    const dspPerJs   = countInDur > 0 ? 384 / countInDur : 4;
                    const lastRel    = pns.reduce(function(m, n) { return Math.max(m, n.releasedAtTick || S.tickCount); }, 0);
                    const pressedDur = lastRel - pr.pressedAtTick;
                    const gate       = Math.max(1, Math.min(tps * 16, Math.round(pressedDur * dspPerJs)));
                    host_module_set_param('t' + pr.track + '_c' + pr.clip + '_step_' + _ls + '_toggle', pr.pitch + ' ' + pr.vel);
                    if (pns.length === 1) {
                        S.pendingPrerollGate = { isDrum: false, track: pr.track, clip: pr.clip, gate };
                    } else {
                        for (let _qi = 1; _qi < pns.length; _qi++) {
                            S.pendingPrerollToggleQueue.push({
                                track: pns[_qi].track, clip: pns[_qi].clip,
                                pitch: pns[_qi].pitch,  vel: pns[_qi].vel,
                                gate, last: _qi === pns.length - 1
                            });
                        }
                    }
                    S.clipSteps[pr.track][pr.clip][_ls] = 1;
                    S.clipNonEmpty[pr.track][pr.clip] = true;
                    invalidateLEDCache();
                    forceRedraw();
                }
            }
            }
        } else {
            /* No note event this tick — safe to send a length set_param without coalescing. */
            const _art = S.recordArmedTrack >= 0 ? S.recordArmedTrack : S.activeTrack;
            const _arac = S.trackActiveClip[_art];
            const _arDrum = S.trackPadMode[_art] === PAD_MODE_DRUM;
            if (S.pendingScheduledDisarm) {
                /* Tick 2: send tN_recording=0 alone (length was locked last tick) */
                S.pendingScheduledDisarm = false;
                disarmRecord();
            } else if (S.recordScheduledStop) {
                /* Tick 1: lock clip length; disarm deferred to next tick.
                 * recordStopNow (punch-out) fires the lock on THIS tick; the
                 * page-boundary wait remains for any path still scheduling. */
                const _sStp = _arDrum ? S.drumCurrentStep[_art] : S.trackCurrentStep[_art];
                if (S.recordStopNow || (_sStp >= 0 && _sStp >= S.recordScheduledStopTarget - 1)) {
                    S.recordStopNow = false;
                    const _lockLen = S.recordScheduledStopTarget;
                    if (_arDrum) {
                        S.drumLaneLength[_art] = _lockLen;
                        host_module_set_param('t' + _art + '_all_lanes_length', String(_lockLen));
                    } else {
                        S.clipLength[_art][_arac] = _lockLen;
                        host_module_set_param('t' + _art + '_c' + _arac + '_length', String(_lockLen));
                    }
                    S.clipAdaptiveMode[_art][_arac] = false;
                    S.recordScheduledStop           = false;
                    S.recordScheduledStopTarget     = -1;
                    S.pendingScheduledDisarm        = true;
                }
            } else if (S.clipAdaptiveMode[_art][_arac]) {
                /* Adaptive extend: grow clip by one page when approaching boundary */
                if (_arDrum) {
                    const _adCur = S.drumLaneLength[_art];
                    const _adStp = S.drumCurrentStep[_art];
                    if (_adStp >= 0 && _adCur > 0 && _adCur < 256 && _adStp >= _adCur - 4) {
                        const _adNew = _adCur + 16;
                        S.drumLaneLength[_art] = _adNew;
                        host_module_set_param('t' + _art + '_all_lanes_length', String(_adNew));
                    }
                } else {
                    const _adCur = S.clipLength[_art][_arac];
                    const _adStp = S.trackCurrentStep[_art];
                    if (_adStp >= 0 && _adCur > 0 && _adCur < 256 && _adStp >= _adCur - 4) {
                        const _adNew = _adCur + 16;
                        S.clipLength[_art][_arac] = _adNew;
                        host_module_set_param('t' + _art + '_c' + _arac + '_length', String(_adNew));
                    }
                }
            }
        }
    }

    /* Suspend save: fires last so no subsequent set_param can overwrite it.
     * Quit/Shift+Back use the else-if branches below so the exit/hide call
     * only runs on a tick AFTER the save set_param has reached DSP — same-tick
     * exit would tear the module down before the buffer processes the save. */
    if (S.pendingSuspendSave) {
        S.pendingSuspendSave = false;
        host_module_set_param('save', '1');
    } else if (S.pendingExitAfterSave) {
        S.pendingExitAfterSave = false;
        removeFlagsWrap();
        S.ledInitComplete = false;
        invalidateLEDCache();
        clearAllLEDs();
        for (let _i = 0; _i < 4; _i++) setButtonLED(40 + _i, LED_OFF);
        /* Standalone session: dAVEBOx IS the session, so quitting hands the
         * device back to stock Schwung instead of unloading us onto an empty
         * shadow UI. The script only stops the dAVEBOx host — its launcher is
         * waiting on that and owns the restore, so we must NOT also try to
         * bring anything back.
         *
         * The teardown cmd itself fires from the farewell countdown at the
         * top of tick, not here: the EXITING frame and the LED clear above
         * need at least one flushed SPI frame ahead of the stack dying, and
         * the freeze keeps every later tick stage from repainting them. */
        S.exitFarewell = 8;
        S.screenDirty = true;
        return;
    } else if (S.pendingProjectRelaunch !== null) {
        /* A project CREATED THIS SESSION: Move has never seen it, because it
         * enumerates sets at LAUNCH. The select actuator would walk its overview
         * to a pad Move believes is empty and load nothing, leaving davebox in
         * the new project while Move still plays the old one's set — and Move
         * saves the set it HAS open, so edits would land in the wrong project.
         *
         * project-cmd `switch` writes relaunch_song_index + relaunch_requested
         * and TERMs Move; the launcher's supervisor applies the index after Move
         * has exited and runs it again, which is the only path that makes Move
         * re-read the set list. Same one-tick-after-the-save shape as the
         * actuator switch below. */
        const _prl = S.pendingProjectRelaunch;
        S.pendingProjectRelaunch = null;
        host_system_cmd('sh /data/UserData/dbx-host/scripts/project-cmd.sh switch ' + _prl);
        return;
    } else if (S.pendingProjectSwitch !== null) {
        /* Pad-picker project switch, one tick after the deferred save. The
         * host gate runs as a HEADLESS ACTUATOR: arm with the pad pre-queued,
         * park ourselves; the shim walks Move through its overview behind
         * the "Loading" screen and the selection RESUMES us (set-UUID reload
         * = the switch). */
        const _psw = S.pendingProjectSwitch;
        S.pendingProjectSwitch = null;
        removeFlagsWrap();
        S.ledInitComplete = false;
        invalidateLEDCache();
        clearAllLEDs();
        for (let _i = 0; _i < 4; _i++) setButtonLED(40 + _i, LED_OFF);
        /* Open the handoff window BEFORE arming: our own tick keeps running
         * while parked (`suspend_keeps_js`), so the SELECT-BEFORE-LOAD watchdog
         * gets a look in as soon as the next tick, and mid-handoff it would
         * read this as a dead end and re-arm the picker over the resume. */
        S.selectHandoffTicks = SELECT_HANDOFF_TICKS;
        shadow_select_arm(_psw);
        host_suspend_overtake();
        return;
    } else if (S.pendingHideAfterSave) {
        S.pendingHideAfterSave = false;
        removeFlagsWrap();
        S.ledInitComplete = false;
        invalidateLEDCache();
        clearAllLEDs();
        for (let _i = 0; _i < 4; _i++) setButtonLED(40 + _i, LED_OFF);
        host_hide_module();
    } else if (S.pendingSuspendManaged) {
        /* Self-managed Back suspend (tap-at-home / hold-anywhere). Same teardown
         * as the hide path, but calls host_suspend_overtake() so the host
         * parks us keeping JS in memory. */
        S.pendingSuspendManaged = false;
        removeFlagsWrap();
        S.ledInitComplete = false;
        invalidateLEDCache();
        clearAllLEDs();
        for (let _i = 0; _i < 4; _i++) setButtonLED(40 + _i, LED_OFF);
        host_suspend_overtake();
    } else if (S.pendingSnapshotCopy) {
        /* One tick after the 'save' above flushed live state to disk
         * synchronously — copy it into the snapshot + update manifest. */
        const _sc = S.pendingSnapshotCopy;
        S.pendingSnapshotCopy = null;
        commitSnapshot(S.currentSetUuid, _sc.id, _sc.label);
    }

    /* (The orphan-prune branch that lived here is GONE — Phase C of the
     * state-co-location plan. Both state halves live inside the set dir now,
     * so an orphan cannot exist and there is nothing left to sweep.) */

    /* Drive the alt-mode arrow flash: repaint on each blink-phase edge so the
     * down-arrow animates even when the UI is otherwise idle. Covers both altMode
     * (most alt banks) and stepIntervalMode (Arp Steps overlay on melodic 4/5). */
    if (altIndicatorActive(S.activeTrack, S.activeBank) ||
            (!S.sessionView && S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT)) {
        const _ph = Math.floor(S.clockMs / 220) % 2;
        if (_ph !== S._altBlinkPhase) { S._altBlinkPhase = _ph; S.screenDirty = true; }
    }
    if (S.screenDirty && !isSuspended) { S.screenDirty = false; drawUI(); }

};
