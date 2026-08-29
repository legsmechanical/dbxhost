/* ui_input_cc.mjs
 * CC input family: jog wheel, top-row buttons, transport, side (track) buttons,
 * step-edit CC handling, knob-bank CC input, plus the shared knob-acceleration
 * helper and view-switch cleanup. Imports _resolveLoopGesture from
 * ui_input_pads (its sibling family, extracted first) — hence last.
 * Extracted from ui.js (Phase 5b, increment 7 of the modularity refactor).
 */

import {
    MoveShift, MoveBack, MovePlay, MoveLeft, MoveRight, MoveUp, MoveDown,
    MoveMute, MoveDelete, Red
} from '/data/UserData/schwung/shared/constants.mjs';
import {
    setLED, setButtonLED, decodeDelta
} from '/data/UserData/schwung/shared/input_filter.mjs';
import {
    handleMenuInput
} from '/data/UserData/schwung/shared/menu_nav.mjs';
import {
    MoveNoteSession, MoveUndo, MoveLoop, MoveCopy, MoveRec,
    MoveCapture, MoveSample, MoveMainKnob, MoveMainTouch, MoveMainButton,
    LED_OFF, NUM_TRACKS, NUM_CLIPS,
    TRACK_PAD_BASE, TPS_VALUES,
    BANKS, PAD_MODE_DRUM, PAD_MODE_CONDUCT,
    BANK_RESPONDER, BANK_OCTAVE, BANK_WHEN, BANK_SOUND,
    TICK_HZ, STEP_ITER_LIST,
    fmtRes, fmtDiq, fmtPlayDir, fmtLen, fmtGateMod, fmtDly,
    fmtArpStyle, fmtArpRate, fmtArpSteps, fmtArpOct, fmtBool
} from './ui_constants.mjs';
import { S, conductorTrackIdx, armBankDisplay, standDownBankDisplay } from './ui_state.mjs';
import { SLOT_LEVEL_STEP, SLOT_LEVEL_MAX, SESS_KNOB_KEYS, SESS_KNOB_DEFAULTS,
         SESS_KNOB_MODES, SWEEP_UNITS, engineVolBlock } from './ui_engine.mjs';
import { scaleNudgeNote, stepEntryVelocity, BANK_CYCLE_DRUM, CONDUCT_BANK_CYCLE,
         bankCycleForMode } from './ui_pure.mjs';
import { saveState, writeSidecar, doClearSession, showActionPopup,
         showActionPopupGauge } from './ui_persistence.mjs';
import {
    openSaveSnapshot, closeSnapshotPicker,
    snapshotPickerRotate, snapshotPickerClick, openClearAutoMenu,
    clearAutoMenuRotate, clearAutoMenuClick, showMenuInfo, closeConvertConfirm,
    closeProjectPadPicker, projectPadPickerModifiers,
    projectPadPickerClick, projectPadPickerRotate, projectPadPickerBack,
    openGlobalEnumPick, closeGlobalEnumPick, globalEnumPickable
} from './ui_dialogs.mjs';
import { trackClipHasContent, sessionHasAnyContent } from './ui_scene.mjs';
import { computePadNoteMap, syncDrumLaneSteps, syncDrumLanesMeta,
    setDrumLanePage } from './ui_drummodel.mjs';
import { effectiveClip, forceRedraw, invalidateLEDCache,
    bankHasAltParams, clearAllLEDs, removeFlagsWrap, sendPerfMods } from './ui_leds.mjs';
import { exitMoveNativeCoRun, enterMoveNativeCoRun } from './ui_corun.mjs';
import { soundActive, soundExit, soundVolGestureEnd, soundOpenGenerator,
    soundAtBlockRoot, soundGestureReturn, soundShowMenu } from './ui_sound.mjs';
import { confirmExportStart, confirmExportCondClick } from './ui_export.mjs';
import { ensureGlobalMenuFresh } from './ui_menu.mjs';
import { applyTrackConfig, readBankParams, applyBankParam,
    refreshPerClipBankParams, resyncDrumTrack,
    unlatchAllTracks, queueLiveNoteOff } from './ui_dsp_bridge.mjs';
import { disarmRecord, handoffRecordingToTrack,
    closeTapTempo, extNoteOffAll } from './ui_record.mjs';
import { sceneBakeHasConductor, commitSceneBake, anyMelodicClipHasContent,
    xposeCancelPreview, xposeCommit } from './ui_xpose.mjs';
import { setTrackMute, setTrackSolo, clearAllMuteSolo,
    clearClip, hardResetClip, copyClip, cutClip, copyRow, cutRow,
    copyDrumClip, cutDrumClip, clearRow,
    _switchActiveTrack, allLanesGate,
    resetFxBanks, resetTarp, resetSingleFxBank, applyConductGridKnob } from './ui_editops.mjs';
import { _resolveLoopGesture } from './ui_input_pads.mjs';

/* View lock: double-tap Loop keeps Perf Mode alive after Loop is released.
 * Single tap while locked → unlock + stop loop. */
const LOOP_TAP_TICKS  = 40;

const STRETCH_BLOCKED_TICKS = 141;  /* ~1500ms at 94Hz (was 294, calibrated for the mistaken 196Hz) */

/* Session overview overlay (hold CC 50) */
const NOTE_SESSION_HOLD_TICKS = 19;  /* ~200ms at 94Hz, matching STEP_HOLD_TICKS (was 40 @196Hz — a ~300ms hold misread as tap, latching momentary views) */
const BACK_HOLD_TICKS = 42;          /* ~450ms at 94Hz — a deliberate long-press on Back = suspend from anywhere (vs a short tap = back out one UI level) */

function _onCC_jog(d1, d2) {
    if (S.shiftTrackLEDActive) { S.shiftTrackLEDActive = false; S.screenDirty = true; }
    /* ⭑⭑ BANK PICKER: the click is the ONLY thing that applies a bank (Josh,
     * 2026-08-25). Everything else abandons — the touch release, the settle
     * timeout, Shift+jog, Back.
     *
     * One rule, and it removes a class of bug rather than adding a case: the
     * settle timeout used to COMMIT, so a picker you forgot about quietly
     * changed your bank. Now nothing applies unless you say so.
     *
     * Click is also the app's existing verb for "choose this" — it is how a row
     * opens in sound mode — and committing without letting go keeps the card up
     * under your finger instead of making you re-touch to see where you landed.
     *
     * ⚠ FIRST among the click handlers, before the alt-param toggle further
     * down: while the overlay is up the click means commit. That is
     * context-dependent, but the context is a list filling the screen. */
    if (d1 === 3 && d2 === 127 && S.bankPickerSel >= 0 && !S.shiftHeld) {
        applyBankPick();
        return;
    }
    /* Tempo selector (post-capture): jog click keeps the current tempo. */
    if (d1 === 3 && d2 === 127 && S.tempoSelectActive) {
        host_module_set_param('t' + S.tempoSelectTrack + '_capture_confirm', '');
        S.tempoSelectActive = false;
        showActionPopup('TEMPO SET',
                        Math.round(S.tempoSelectBpms[S.tempoSelectIdx]) + ' BPM');
        S.screenDirty = true;
        return;
    }
    /* PROJECTS pad picker: jog click drives the overlay stack (create-confirm,
     * color pick, the Load/Rename/Color menu) — and with nothing open it opens
     * the menu on the CURRENT project, the keyboard-free path under
     * SELECT-BEFORE-LOAD where the session starts here. */
    if (d1 === 3 && d2 === 127 && S.projectPadPicker) {
        projectPadPickerClick();
        return;
    }
    /* Snapshot picker: jog click resolves a confirm or arms one. */
    if (d1 === 3 && d2 === 127 && S.snapshotPicker) {
        snapshotPickerClick();
        return;
    }
    /* CLEAR AUTOMATION modal: jog click toggles a row / executes CLEAR. */
    if (d1 === 3 && d2 === 127 && S.clearAutoMenu) {
        clearAutoMenuClick();
        return;
    }
    /* Scene bake confirm: two-phase jog flow — loop count, then wrap yes/no. */
    if (d1 === 3 && d2 === 127 && S.confirmBakeScene) {
        if (S.confirmBakeSceneCondPhase) {
            /* Apply-Conductor dialog: 0=YES, 1=NO, 2=CANCEL */
            if (S.confirmBakeSceneCondSel === 2) {
                /* Cancel: abort the whole scene bake. */
                S.confirmBakeSceneCondPhase = false;
                S.confirmBakeScene          = false;
                S.screenDirty               = true;
                return;
            }
            const _apply = S.confirmBakeSceneCondSel === 0 ? 1 : 0;
            commitSceneBake(S.confirmBakeSceneClip, S.confirmBakeSceneLoops,
                            S.confirmBakeSceneWrap, _apply);
            S.confirmBakeSceneCondPhase = false;
            S.confirmBakeScene          = false;
            S.screenDirty               = true;
            return;
        }
        if (S.confirmBakeSceneWrapPhase) {
            /* Wrap dialog: 0=YES, 1=NO, 2=CANCEL */
            if (S.confirmBakeSceneWrapSel < 2) {
                const _wrap = S.confirmBakeSceneWrapSel === 0 ? 1 : 0;
                if (sceneBakeHasConductor(S.confirmBakeSceneClip)) {
                    /* Advance to the Apply-Conductor phase; hold loop+wrap. */
                    S.confirmBakeSceneWrap      = _wrap;
                    S.confirmBakeSceneWrapPhase = false;
                    S.confirmBakeSceneCondPhase = true;
                    S.confirmBakeSceneCondSel   = 1; /* default: NO */
                    S.screenDirty               = true;
                    return;
                }
                /* No conductor / no responders: commit immediately (A=0). */
                commitSceneBake(S.confirmBakeSceneClip, S.confirmBakeSceneLoops, _wrap, 0);
            }
            S.confirmBakeSceneWrapPhase = false;
            S.confirmBakeScene          = false;
            S.screenDirty               = true;
            return;
        }
        if (S.confirmBakeSceneSel > 0) {
            /* Advance to wrap phase, hold loop count for the commit step. */
            S.confirmBakeSceneLoops     = [1, 2, 4][S.confirmBakeSceneSel - 1];
            S.confirmBakeSceneWrapPhase = true;
            S.confirmBakeSceneWrapSel   = 1; /* default: NO */
            S.screenDirty               = true;
            return;
        }
        S.confirmBakeScene = false;
        S.screenDirty      = true;
        return;
    }

    /* Lgto confirm: jog click commits (OK applies, CANCEL aborts). */
    if (d1 === 3 && d2 === 127 && S.confirmLgto) {
        const _sel = S.confirmLgtoSel | 0;
        S.confirmLgto = false;
        if (_sel === 0) {
            const _t = S.activeTrack;
            if (S.confirmLgtoIsDrum) {
                const _l = S.activeDrumLane[_t];
                host_module_set_param('t' + _t + '_l' + _l + '_lgto_apply', '1');
                S.pendingDrumResync      = 2;
                S.pendingDrumResyncTrack = _t;
            } else {
                host_module_set_param('t' + _t + '_lgto_apply', '1');
                S.pendingStepsReread      = 2;
                S.pendingStepsRereadTrack = _t;
                S.pendingStepsRereadClip  = S.trackActiveClip[_t];
            }
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            showActionPopup('LGTO', 'APPLIED');
        }
        S.screenDirty = true;
        forceRedraw();
        return;
    }

    /* State version mismatch dialog: Yes = wipe + clean start; No = exit module. */
    if (d1 === 3 && d2 === 127 && S.confirmStateWipe) {
        S.confirmStateWipe = false;
        if (S.confirmStateWipeSel === 0) {
            S.pendingSetLoad = true;
        } else {
            removeFlagsWrap();
            clearAllLEDs();
            host_exit_module();
        }
        S.screenDirty = true;
        forceRedraw();
        return;
    }

    /* BPM-controlled-by-Move info: jog click = OK (dismiss). */
    if (d1 === 3 && d2 === 127 && S.bpmMoveInfo) {
        S.bpmMoveInfo = false;
        forceRedraw();
        return;
    }

    /* REC Unavailable dialog: jog click commits selection (OK = dismiss,
     * BAKE NOW = open standard bake confirm pre-targeted at active clip). */
    if (d1 === 3 && d2 === 127 && S.recordBlockedDialog) {
        const _sel = S.recordBlockedDialogSel | 0;
        S.recordBlockedDialog = false;
        if (_sel === 1) {
            /* Open bake confirm at active clip — same path as Capture-bare-tap. */
            const _bt = S.activeTrack, _bc = S.trackActiveClip[_bt];
            const _isDrum = S.trackPadMode[_bt] === PAD_MODE_DRUM;
            S.confirmBake             = true;
            S.confirmBakeIsDrum       = _isDrum;
            S.confirmBakeIsMultiLoop  = !_isDrum;
            S.confirmBakeSel          = _isDrum ? 2 : 1;
            S.confirmBakeTrack        = _bt;
            S.confirmBakeClip         = _bc;
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBakeWrapPhase    = false;
        }
        S.screenDirty = true;
        forceRedraw();
        return;
    }

    /* Bake confirm: jog click confirms/cancels when dialog is open */
    if (d1 === 3 && d2 === 127 && S.confirmBake) {
        if (S.confirmBakeWrapPhase) {
            /* Wrap dialog: 0=YES, 1=NO, 2=CANCEL */
            if (S.confirmBakeWrapSel < 2) {
                const _wrap = S.confirmBakeWrapSel === 0 ? 1 : 0;
                const _loops = S.confirmBakeLoops;
                if (S.confirmBakeIsDrum) {
                    const _laneArg = S.confirmBakeDrumMode === 1 ? ' ' + S.activeDrumLane[S.confirmBakeTrack] : ' 0';
                    S.pendingDefaultSetParams.push({
                        key: 'bake',
                        val: S.confirmBakeTrack + ' ' + S.confirmBakeClip + ' ' + S.confirmBakeDrumMode + ' ' + _loops + _laneArg + ' ' + _wrap
                    });
                    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                    showActionPopup('BAKED', _loops + 'x');
                    S.pendingBankRefresh = S.confirmBakeTrack;
                    if (S.confirmBakeClip === S.trackActiveClip[S.confirmBakeTrack]) {
                        S.pendingDrumResync      = 2;
                        S.pendingDrumResyncTrack = S.confirmBakeTrack;
                    }
                } else {
                    S.pendingDefaultSetParams.push({
                        key: 'bake',
                        val: S.confirmBakeTrack + ' ' + S.confirmBakeClip + ' 0 ' + _loops + ' 0 ' + _wrap
                    });
                    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                    showActionPopup('BAKED', _loops + 'x');
                    S.pendingBankRefresh      = S.confirmBakeTrack;
                    S.pendingStepsReread      = 2;
                    S.pendingStepsRereadTrack = S.confirmBakeTrack;
                    S.pendingStepsRereadClip  = S.confirmBakeClip;
                }
            }
            S.confirmBakeWrapPhase    = false;
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBake  = false;
            S.screenDirty  = true;
            return;
        }
        if (S.confirmBakeIsMultiLoop) {
            if (S.confirmBakeSel > 0) {
                /* advance to wrap dialog */
                S.confirmBakeLoops     = [1, 2, 4][S.confirmBakeSel - 1];
                S.confirmBakeWrapPhase = true;
                S.confirmBakeWrapSel   = 1; /* default: NO */
                S.screenDirty = true;
                return;
            }
        } else if (!S.confirmBakeIsDrum) {
            if (S.confirmBakeSel === 0) {
                host_module_set_param('bake', S.confirmBakeTrack + ' ' + S.confirmBakeClip);
                S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                showActionPopup('BAKED');
                S.pendingBankRefresh = S.confirmBakeTrack;
                S.pendingStepsReread      = 2;
                S.pendingStepsRereadTrack = S.confirmBakeTrack;
                S.pendingStepsRereadClip  = S.confirmBakeClip;
            }
        } else if (S.confirmBakeDrumLoopOpen) {
            /* drum step 2: loop count — 0=CANCEL, 1-3 = 1x/2x/4x → wrap dialog */
            if (S.confirmBakeDrumLoopSel > 0) {
                S.confirmBakeLoops     = [1, 2, 4][S.confirmBakeDrumLoopSel - 1];
                S.confirmBakeWrapPhase = true;
                S.confirmBakeWrapSel   = 1; /* default: NO */
                S.screenDirty = true;
                return;
            }
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBake = false;
            S.screenDirty = true;
            return;
        } else {
            /* drum step 1: 0=CLIP, 1=LANE, 2=CANCEL */
            if (S.confirmBakeSel < 2) {
                S.confirmBakeDrumMode     = S.confirmBakeSel === 0 ? 2 : 1;
                S.confirmBakeDrumLoopOpen = true;
                S.confirmBakeDrumLoopSel  = 1;
                S.screenDirty = true;
                return;
            }
        }
        S.confirmBake = false;
        S.screenDirty = true;
        return;
    }

    /* CC 3 = jog wheel physical click */
    if (d1 === 3 && d2 === 127 && S.tapTempoOpen) {
        closeTapTempo();
        S.screenDirty = true;
        return;
    }
/* A modal dialog that can be raised from EITHER screen.
 *
 * The convert confirms and the info dialog used to belong to the global menu —
 * raised there, drawn inside drawGlobalMenu, and handled inside the
 * `S.globalMenuOpen` input branches. `Mode` moved to Track Control's Config
 * screen (2026-08-13), so they can now be raised with that menu shut, and a
 * modal that is invisible or unanswerable is worse than no modal.
 *
 * They are MODAL, so handling them first is correct whoever raised them. */
function modalDialogUp() {
    return !!(S.confirmConvertToDrum || S.confirmConvertToConduct ||
              (S.menuInfoLines && S.menuInfoLines.length > 0));
}

    if (d1 === 3 && d2 === 127 && (S.globalMenuOpen || modalDialogUp())) {
        if (S.exportDoneDialog) {            /* OK dismiss */
            S.exportDoneDialog = false;
            S.globalMenuOpen   = false;
            S.screenDirty = true;
            return;
        }
        if (S.confirmClearSession) {
            if (S.confirmClearSel === 0) doClearSession();
            else { S.confirmClearSession = false; }
            S.screenDirty = true;
            return;
        }
        if (S.confirmSaveState) {
            const yes = S.confirmSaveSel === 0;
            S.confirmSaveState = false;
            if (yes) openSaveSnapshot();
            S.screenDirty = true;
            return;
        }
        if (S.confirmConvertToDrum) {
            const _ct = S.confirmConvertTrack;
            const _yes = S.confirmConvertToDrumSel === 0;
            closeConvertConfirm();
            /* Defer to tick() — this runs in the on_midi path where get_param
             * (inside convertTrackType -> syncClipsFromDsp) returns null. */
            if (_yes) S.pendingTrackConvert = { t: _ct, toDrum: true };
            S.screenDirty = true;
            return;
        }
        if (S.confirmConvertToConduct) {
            const _ct  = S.confirmConvertTrack;
            const _yes = S.confirmConvertToConductSel === 0;
            closeConvertConfirm();
            /* Defer to tick() — convertTrackToConduct's role readback uses
             * get_param, which returns null in the on_midi path. */
            if (_yes) S.pendingConductConvert = _ct;
            S.screenDirty = true;
            return;
        }
        if (S.menuInfoLines.length > 0) {
            /* Single-button INFO dialog — any click dismisses. */
            S.menuInfoLines = [];
            S.screenDirty = true;
            return;
        }
        if (S.confirmExportCondPhase) {
            confirmExportCondClick();   /* 0=YES,1=NO commit; 2=CANCEL aborts export */
            S.screenDirty = true;
            return;
        }
        if (S.confirmExport) {
            if (S.confirmExportSel === 0) confirmExportStart();   /* Yes → cond stage or arm export */
            else S.confirmExport = false;
            S.screenDirty = true;
            return;
        }
        if (S.confirmXpose) {                 /* "Transpose all clips?" Yes/No */
            if (S.confirmXposeSel === 0) xposeCommit(S.confirmXposeKey, S.confirmXposeScale);
            else                         xposeCancelPreview();
            S.confirmXpose = false;
            if (S.globalMenuState) { S.globalMenuState.editing = false; S.globalMenuState.editValue = null; }
            S.lastSentMenuEditValue = null; S.bpmWasEditing = false;
            S.screenDirty = true;
            return;
        }
        /* Key/Scale: intercept the click that would finalize the enum edit.
         * No change → exit. Has melodic notes → confirm. Empty → commit silently. */
        {
            const _it = (S.globalMenuState && S.globalMenuItems)
                        ? S.globalMenuItems[S.globalMenuState.selectedIndex] : null;
            if (_it && S.globalMenuState.editing && (_it.label === 'Key' || _it.label === 'Scale')) {
                const ev    = S.globalMenuState.editValue !== null ? S.globalMenuState.editValue : _it.get();
                const candK = _it.label === 'Key'   ? ev : S.padKey;
                const candS = _it.label === 'Scale' ? ev : S.padScale;
                if (candK === S.padKey && candS === S.padScale) {
                    xposeCancelPreview();
                    S.globalMenuState.editing = false; S.globalMenuState.editValue = null;
                    S.lastSentMenuEditValue = null; S.bpmWasEditing = false;
                } else if (anyMelodicClipHasContent()) {
                    S.confirmXpose = true; S.confirmXposeSel = 0;
                    S.confirmXposeKey = candK; S.confirmXposeScale = candS;
                    /* keep editing + preview armed under the dialog */
                } else {
                    xposeCommit(candK, candS);
                    S.globalMenuState.editing = false; S.globalMenuState.editValue = null;
                    S.lastSentMenuEditValue = null; S.bpmWasEditing = false;
                }
                S.screenDirty = true;
                return;
            }
        }
        /* Mode (track type): DEFERRED COMMIT. The click that finalizes the Mode
         * edit triggers the conversion confirm; scrolling never does (Mode set()
         * is a no-op). No change → exit. Mirrors the Key/Scale interceptor. */
        {
            const _mi = (S.globalMenuState && S.globalMenuItems)
                        ? S.globalMenuItems[S.globalMenuState.selectedIndex] : null;
            /* The `Mode` commit-on-click intercept lived here while the row
             * was in this menu. The row moved to Track Control's Config screen
             * (2026-08-13) and the rules with it, into ui_dialogs'
             * requestTrackModeChange — so there is nothing to intercept. */
        }
        /* ⭑ An enum of more than two opens the PICKER instead of an in-place
         * edit — this menu holds the longest lists in the app (Scale is 14,
         * MIDI channel 17). Intercepted BEFORE handleMenuInput, which is the
         * host's shared editor and knows nothing about overlays. */
        if (S.globalEnumPick) { closeGlobalEnumPick(true); S.screenDirty = true; return; }
        {
            const _e = (S.globalMenuState && S.globalMenuItems)
                       ? S.globalMenuItems[S.globalMenuState.selectedIndex] : null;
            if (globalEnumPickable(_e) && !S.globalMenuState.editing) {
                openGlobalEnumPick(_e); return;
            }
        }
        handleMenuInput({
            cc: 3, value: d2,
            items: S.globalMenuItems, state: S.globalMenuState, stack: S.globalMenuStack,
            onBack: function() { S.globalMenuOpen = false; },
            shiftHeld: S.shiftHeld
        });
        S.screenDirty = true;
        return;
    }

    if (d1 === 3 && d2 === 127 && S.shiftHeld && S.deleteHeld && !S.sessionView) {
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
            /* Drum: Shift+Delete+jog = reset all real-time FX banks + Dir/RvSt/SqFl */
            const _dt = S.activeTrack, _dl = S.activeDrumLane[_dt], _dac = effectiveClip(_dt);
            resetFxBanks(_dt);
            S.drumLanePlaybackDir[_dt][_dl] = 0;
            S.drumLanePlaybackAudioReverse[_dt][_dl] = 0;
            S.bankParams[_dt][0][6] = 0;
            S.clipSeqFollow[_dt][_dac] = true;
            S.bankParams[_dt][0][7] = 1;
            S.pendingDefaultSetParams.push({ key: 't' + _dt + '_l' + _dl + '_playback_dir', val: '0' });
            S.pendingDefaultSetParams.push({ key: 't' + _dt + '_l' + _dl + '_playback_audio_reverse', val: '0' });
            showActionPopup('LANE PARAMS', 'RESET');
        } else {
            /* Melodic: full reset — NOTE FX, HARMZ, MIDI DLY, + SEQ ARP */
            const _arpTrack = S.activeTrack;
            const _arpParams = Array.from({length: 8}, function(_, k) {
                const pm = BANKS[4].knobs[k]; return pm ? S.bankParams[_arpTrack][4][k] : 0;
            });
            resetFxBanks(_arpTrack);
            for (let k = 0; k < 8; k++) {
                const pm = BANKS[4].knobs[k];
                if (pm) S.bankParams[_arpTrack][4][k] = pm.def;
            }
            /* Bank reset also clears ALL automation (CC + AT, + PB later) for the clip. */
            const _ac2 = effectiveClip(_arpTrack);
            S.trackCCAutoBits[_arpTrack][_ac2] = 0;
            S.trackCCLiveVal[_arpTrack] = new Array(8).fill(-1);
            S.clipCCVal[_arpTrack][_ac2] = new Array(8).fill(-1);
            S.clipAtHas[_arpTrack][_ac2] = false;
            S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_cc_auto_clear', val: String(_ac2) });
            S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_c' + _ac2 + '_at_clear', val: '1' });
            S.undoSeqArpSnapshot = { track: _arpTrack, params: _arpParams };
            const _mac = effectiveClip(_arpTrack);
            S.clipPlaybackDir[_arpTrack][_mac] = 0;
            S.clipPlaybackAudioReverse[_arpTrack][_mac] = 0;
            S.bankParams[_arpTrack][0][6] = 0;
            S.clipSeqFollow[_arpTrack][_mac] = true;
            S.bankParams[_arpTrack][0][7] = 1;
            S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_clip_playback_dir', val: '0' });
            S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_clip_playback_audio_reverse', val: '0' });
            showActionPopup('CLIP PARAMS', 'RESET');
        }
        return;
    }
    if (d1 === 3 && d2 === 127 && S.deleteHeld && !S.sessionView) {
        /* CC PARAM bank (bank 6): Delete+jog clears all CC automation for the
         * active clip. This branch must run regardless of pad mode or drum
         * perform mode — previously it was nested inside the melodic branch,
         * so on a drum track in Rpt mode it was silently shadowed by the
         * repeat-groove reset path. */
        if (S.activeBank === 6) {
            /* AUTOMATION bank: Delete+jog clears ALL automation types for the
             * active clip (CC + AT, and PB once implemented). */
            const _t = S.activeTrack, _c = effectiveClip(_t);
            S.trackCCAutoBits[_t][_c] = 0;
            S.trackCCLiveVal[_t] = new Array(8).fill(-1);
            /* Reset the resting values too → "—" (cc_auto_clear clears both
             * automation and rest_val DSP-side). */
            S.clipCCVal[_t][_c] = new Array(8).fill(-1);
            S.clipAtHas[_t][_c] = false;
            /* Defer clear pushes — synchronous from jog handler coalesces. */
            S.pendingDefaultSetParams.push({ key: 't' + _t + '_cc_auto_clear', val: String(_c) });
            S.pendingDefaultSetParams.push({ key: 't' + _t + '_c' + _c + '_at_clear', val: '1' });
            showActionPopup('AUTOMATION', 'CLEAR');
            invalidateLEDCache();
            return;
        }
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
            if (S.drumPerformMode[S.activeTrack] > 0) {
                /* Rpt/Rpt2 mode: Delete+jog = reset current lane groove params */
                const _rt = S.activeTrack;
                const _rl = S.activeDrumLane[_rt];
                S.drumRepeatGate[_rt][_rl]    = 0xFF;
                S.drumRepeatGateLen[_rt][_rl] = 8;
                for (let _s = 0; _s < 8; _s++) {
                    S.drumRepeatVelScale[_rt][_rl][_s] = 255;
                    S.drumRepeatNudge[_rt][_rl][_s]    = 0;
                }
                /* Defer reset push — synchronous from jog handler coalesces. */
                S.pendingDefaultSetParams.push({ key: 't' + _rt + '_l' + _rl + '_repeat_groove_reset', val: '1' });
                showActionPopup('RPT GROOVE', 'RESET');
            } else {
                /* Drum: Delete+jog = reset only the active real-time FX bank + Dir/RvSt/SqFl */
                const REAL_TIME_BANKS = [1, 2, 3];
                if (REAL_TIME_BANKS.indexOf(S.activeBank) >= 0) {
                    resetSingleFxBank(S.activeTrack, S.activeBank);
                }
                const _bt = S.activeTrack, _bl = S.activeDrumLane[_bt], _bac = effectiveClip(_bt);
                S.drumLanePlaybackDir[_bt][_bl] = 0;
                S.drumLanePlaybackAudioReverse[_bt][_bl] = 0;
                S.bankParams[_bt][0][6] = 0;
                S.clipSeqFollow[_bt][_bac] = true;
                S.bankParams[_bt][0][7] = 1;
                S.pendingDefaultSetParams.push({ key: 't' + _bt + '_l' + _bl + '_playback_dir', val: '0' });
                S.pendingDefaultSetParams.push({ key: 't' + _bt + '_l' + _bl + '_playback_audio_reverse', val: '0' });
                showActionPopup('BANK RESET');
            }
        } else if (S.activeBank === 5) {
            /* ARP IN bank: dedicated reset that clears every TARP param
             * (style/rate/oct/gate/steps_mode/retrigger/latch/sync + step arrays
             * + loop length). Shift+Delete+jog (above) intentionally leaves
             * ARP IN alone. */
            resetTarp(S.activeTrack);
            showActionPopup('LIVE ARP', 'RESET');
        } else {
            const _mt = S.activeTrack, _mac2 = effectiveClip(_mt);
            resetFxBanks(_mt);
            S.undoSeqArpSnapshot = null;
            S.clipPlaybackDir[_mt][_mac2] = 0;
            S.clipPlaybackAudioReverse[_mt][_mac2] = 0;
            S.bankParams[_mt][0][6] = 0;
            S.clipSeqFollow[_mt][_mac2] = true;
            S.bankParams[_mt][0][7] = 1;
            S.pendingDefaultSetParams.push({ key: 't' + _mt + '_clip_playback_dir', val: '0' });
            S.pendingDefaultSetParams.push({ key: 't' + _mt + '_clip_playback_audio_reverse', val: '0' });
            showActionPopup('BANK RESET');
        }
        return;
    }
    /* Plain jog click on SEQ ARP (bank 4) or TARP (bank 5) in Track View toggles
     * the Arp Steps interval-edit overlay: knobs K1-K8 become per-step scale-degree
     * offsets (±24), pad grid is the persistent step-vel level editor. Auto-clears
     * on next jog turn (handled in the main-knob delta branch below). */
    if (d1 === 3 && d2 === 127 && !S.shiftHeld && !S.deleteHeld && !S.copyHeld && !S.muteHeld &&
            !S.sessionView && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM &&
            (S.activeBank === 4 || S.activeBank === 5)) {
        S.stepIntervalMode = !S.stepIntervalMode;
        /* Repush padmap so pads stop dispatching notes while the overlay is on. */
        computePadNoteMap();
        S.screenDirty = true;
        forceRedraw();
        return;
    }
    /* ⭑ Shift + jog click: LATCH the bank card (Josh, 2026-08-25). Latched, the
     * bank page holds the screen instead of falling back to the track overview.
     *
     * ⚠ On Shift, not on the plain click, for two reasons: the plain click is
     * the ALT-PARAM toggle and is used constantly mid-edit, and Shift+knob —
     * the other candidate for alt-params — is already the fine step-velocity
     * page on the Arp Steps bank. Alt-params also USED to live on Shift+knob
     * and were deliberately moved here; moving them back would undo that and
     * collide with the step editor.
     *
     * Track view only: the fall-back this defeats is a track-view screen. */
    if (d1 === 3 && d2 === 127 && S.shiftHeld && !S.sessionView && !soundActive()) {
        /* Shift means the gesture is not about picking a bank, so an open
         * picker is abandoned here exactly as Shift+jog abandons it — never
         * committed by a chord that was reaching for something else. */
        if (S.bankPickerSel >= 0) { S.bankPickerSel = -1; S.bankPickerIdleTick = -1; }
        S.bankCardLatched = !S.bankCardLatched;
        if (S.bankCardLatched) armBankDisplay();
        S.screenDirty = true;
        forceRedraw();
        return;
    }

    /* Plain jog click on an alt-param bank: toggle sticky alt-param mode.
     * Perform-mode switching now lives only on Shift+step-8 (see _onStepButtons).
     * The Arp-Steps block above is gated melodic-only, so on drum tracks bank 5
     * (REPEAT GROOVE) correctly falls through here to toggle VEL/NUDGE. */
    if (d1 === 3 && d2 === 127 && !S.shiftHeld && !S.deleteHeld && !S.copyHeld && !S.muteHeld &&
            !S.sessionView && bankHasAltParams(S.activeTrack, S.activeBank)) {
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7 && !S.allLanesConfirmed) {
            S.allLanesConfirmed = true;
            S.screenDirty = true;
            forceRedraw();
            return;
        }
        S.altMode = !S.altMode;
        S.screenDirty = true;
        forceRedraw();
        return;
    }

    if (d1 === MoveMainKnob) {

        /* Capture chooser: plain wheel cycles the coarse candidates (BPMs, or
         * bar lengths in warp mode). Shift+wheel (warp only) is a FINE tick-
         * level scale of the take within the fixed bar length — accelerated on
         * the jog; expanding scrolls trailing notes off the last bar (dropped),
         * compressing packs the take toward the front. */
        if (S.tempoSelectActive) {
            if (S.shiftHeld && S.tempoSelectWarp) {
                const u = ccKnobDelta(d2, 0);   /* run-length accel (slot 0 free here) */
                if (u !== 0) {
                    host_module_set_param('t' + S.tempoSelectTrack + '_capture_fine',
                                          String(u * 6));   /* ~6 ticks/detent, faster when spun */
                    S.screenDirty = true;
                }
                return;
            }
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                const n = S.tempoSelectBpms.length;
                S.tempoSelectIdx = (S.tempoSelectIdx + (delta > 0 ? 1 : n - 1)) % n;
                host_module_set_param('t' + S.tempoSelectTrack + '_capture_retempo',
                                      String(S.tempoSelectIdx));
                S.screenDirty = true;
            }
            return;
        }

        /* Arp Steps interval mode: jog turn exits the overlay and swallows
         * the turn so the underlying bank knob param isn't nudged on exit. */
        if (S.stepIntervalMode) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.stepIntervalMode = false;
                computePadNoteMap();
                S.screenDirty = true;
                forceRedraw();
            }
            return;
        }

        /* PROJECTS pad picker: the wheel drives whichever overlay is open.
         * (Swallow the turn either way — the picker owns the surface; without
         * this the turn fell through to the bank knob handling underneath.) */
        if (S.projectPadPicker) {
            projectPadPickerRotate(decodeDelta(d2));
            return;
        }

        if (S.snapshotPicker) {
            snapshotPickerRotate(decodeDelta(d2));
            return;
        }
        if (S.clearAutoMenu) {
            clearAutoMenuRotate(decodeDelta(d2));
            return;
        }
        if (S.confirmBakeScene) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                if (S.confirmBakeSceneCondPhase)
                    S.confirmBakeSceneCondSel = (S.confirmBakeSceneCondSel + (delta > 0 ? 1 : 2)) % 3;
                else if (S.confirmBakeSceneWrapPhase)
                    S.confirmBakeSceneWrapSel = (S.confirmBakeSceneWrapSel + (delta > 0 ? 1 : 2)) % 3;
                else
                    S.confirmBakeSceneSel = (S.confirmBakeSceneSel + (delta > 0 ? 1 : 3)) % 4;
                S.screenDirty = true;
            }
            return;
        }
        if (S.confirmStateWipe) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.confirmStateWipeSel = S.confirmStateWipeSel === 0 ? 1 : 0;
                S.screenDirty = true;
            }
            return;
        }
        if (S.recordBlockedDialog) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.recordBlockedDialogSel = S.recordBlockedDialogSel === 0 ? 1 : 0;
                S.screenDirty = true;
            }
            return;
        }
        if (S.confirmLgto) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.confirmLgtoSel = S.confirmLgtoSel === 0 ? 1 : 0;
                S.screenDirty = true;
            }
            return;
        }
        if (S.confirmBake && S.confirmBakeWrapPhase) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.confirmBakeWrapSel = (S.confirmBakeWrapSel + (delta > 0 ? 1 : 2)) % 3;
                S.screenDirty = true;
            }
            return;
        }
        if (S.confirmBake && S.confirmBakeIsDrum && S.confirmBakeDrumLoopOpen) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.confirmBakeDrumLoopSel = (S.confirmBakeDrumLoopSel + (delta > 0 ? 1 : 3)) % 4;
                S.screenDirty = true;
            }
            return;
        }
        if (S.confirmBake) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                if (S.confirmBakeIsDrum) {
                    S.confirmBakeSel = (S.confirmBakeSel + (delta > 0 ? 1 : 2)) % 3;
                } else if (S.confirmBakeIsMultiLoop) {
                    S.confirmBakeSel = (S.confirmBakeSel + (delta > 0 ? 1 : 3)) % 4;
                } else {
                    S.confirmBakeSel = S.confirmBakeSel === 0 ? 1 : 0;
                }
                S.screenDirty = true;
            }
            return;
        }
        if (S.tapTempoOpen && !S.shiftHeld) {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                S.tapTempoBpm = Math.max(40, Math.min(250, S.tapTempoBpm + delta));
                host_module_set_param('bpm', String(S.tapTempoBpm));
                S.screenDirty = true;
            }
            return;
        }
        if ((S.globalMenuOpen || modalDialogUp()) && !S.shiftHeld) {
            if (S.globalMenuOpen) ensureGlobalMenuFresh();
            if (S.globalEnumPick) {
                /* The picker owns the jog while it is up — CLAMPED at the ends,
                 * the same as every other settings list (Josh, 2026-08-23). */
                const delta = decodeDelta(d2);
                if (delta !== 0) {
                    const n = S.globalEnumPick.options.length;
                    S.globalEnumPick.sel =
                        Math.max(0, Math.min(n - 1, S.globalEnumPick.sel + delta));
                    S.screenDirty = true;
                }
            } else if (S.exportDoneDialog) {
                /* single OK button — jog does nothing */
            } else if (S.confirmClearSession) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmClearSel = S.confirmClearSel === 0 ? 1 : 0; S.screenDirty = true; }
            } else if (S.confirmSaveState) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmSaveSel = S.confirmSaveSel === 0 ? 1 : 0; S.screenDirty = true; }
            } else if (S.confirmConvertToDrum) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmConvertToDrumSel = S.confirmConvertToDrumSel === 0 ? 1 : 0; S.screenDirty = true; }
            } else if (S.confirmConvertToConduct) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmConvertToConductSel = S.confirmConvertToConductSel === 0 ? 1 : 0; S.screenDirty = true; }
            } else if (S.menuInfoLines.length > 0) {
                /* Single-button INFO dialog — no selection to toggle; swallow jog turns. */
            } else if (S.confirmExportCondPhase) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmExportCondSel = (S.confirmExportCondSel + (delta > 0 ? 1 : 2)) % 3; S.screenDirty = true; }
            } else if (S.confirmExport) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmExportSel = S.confirmExportSel === 0 ? 1 : 0; S.screenDirty = true; }
            } else if (S.confirmXpose) {
                const delta = decodeDelta(d2);
                if (delta !== 0) { S.confirmXposeSel = S.confirmXposeSel === 0 ? 1 : 0; S.screenDirty = true; }
            } else if (S.globalMenuState.editing) {
                const delta = decodeDelta(d2);
                if (delta !== 0) {
                    const item = S.globalMenuItems[S.globalMenuState.selectedIndex];
                    if (item && item.type === 'value') {
                        const cur = S.globalMenuState.editValue !== null ? S.globalMenuState.editValue : item.get();
                        S.globalMenuState.editValue = Math.min(item.max, Math.max(item.min, cur + delta));
                    } else if (item && item.type === 'enum') {
                        /* Clamp, never wrap (Josh, 2026-08-23) — same law as
                         * menu_nav.adjustValue, which handles the other door
                         * into the same edit. */
                        const opts = item.options || [];
                        const idx  = opts.indexOf(S.globalMenuState.editValue);
                        const sign = delta > 0 ? 1 : -1;
                        S.globalMenuState.editValue = opts[Math.max(0, Math.min(opts.length - 1, idx + sign))];
                    }
                    S.screenDirty = true;
                }
            } else {
                handleMenuInput({
                    cc: MoveMainKnob, value: d2,
                    items: S.globalMenuItems, state: S.globalMenuState, stack: S.globalMenuStack,
                    onBack: function() { S.globalMenuOpen = false; },
                    shiftHeld: false
                });
                S.screenDirty = true;
            }
        } else {
            const delta = decodeDelta(d2);
            if (delta !== 0) {
                if (S.shiftHeld) {
                    /* Shift + jog (any view): step active track 0–7, clamp at
                     * ends. ⭑ Restored to every view on 2026-08-25: the bank
                     * picker moved onto the UNSHIFTED turn, so Shift no longer
                     * has to share this gesture with anything.
                     *
                     * ⭑ DROP the picker if it is up (Josh): pressing Shift means
                     * the jog is choosing a TRACK now, so leaving a bank list on
                     * screen — being scrolled under by a gesture that is no
                     * longer selecting banks — is a lie about what the wheel is
                     * doing. Dropped, NOT committed: the pick was abandoned, and
                     * a gesture you walked away from must not apply itself. */
                    if (S.bankPickerSel >= 0) {
                        S.bankPickerSel = -1;
                        S.bankPickerIdleTick = -1;
                    }
                    const next = Math.min(NUM_TRACKS - 1, Math.max(0, S.activeTrack + delta));
                    if (next !== S.activeTrack) {
                        /* SOUND + CONFIG is a BANK, and a bank is PER TRACK
                         * (Josh, 2026-08-24). So this gesture closes it and the
                         * new track lands on whatever bank IT was on, exactly
                         * like every other bank. Before, ui_tick's reconcile
                         * FOLLOWED the track and re-took the bank identity, so
                         * every track you scrolled through reported SOUND +
                         * CONFIG — visible only once the screen started standing
                         * down for the switch, but true long before that.
                         *
                         * ⚠ Only THIS route. The follow is still right for the
                         * other switch sites (Shift+pad, session launchers,
                         * remote UI), where you are deep in a module's editor
                         * and switching tracks to compare two sounds is the
                         * whole point — that is what tick's reconcile is for.
                         *
                         * ⚠ Placed INSIDE the `next !== activeTrack` guard, so a
                         * clamped turn at track 0 or 7 does not close the screen
                         * for a gesture that moved nothing; and BEFORE the
                         * switch, so sound mode's queued writes flush while the
                         * outgoing track is still their target (the same
                         * ordering flushForRetarget exists to protect). */
                        /* (Leaving sound mode is _switchActiveTrack's job now —
                         * every switch route means the same thing.) */
                        extNoteOffAll();
                        handoffRecordingToTrack(next);
                        _switchActiveTrack(next);
                        if (S.trackPadMode[next] === PAD_MODE_DRUM) {
                            if (S.activeBank === 2 || S.activeBank === 4) S.activeBank = 0;
                            resyncDrumTrack(next);
                        } else {
                            if (S.activeBank === 7) S.activeBank = 0;
                            refreshPerClipBankParams(next);
                        }
                        computePadNoteMap();
                        S.seqActiveNotes.clear();
                        S.seqLastStep = -1;
                        S.seqLastClip = -1;
                        forceRedraw();
                    }
                } else if (S.sessionView) {
                    /* Clamp, never wrap (Josh, 2026-08-24) — hard stop at
                     * VOLUME and at SEND B. Same law the settings enums and the
                     * Instrument picker took on 08-23: a list of choices has two
                     * ends, and rolling past one of them reads as the knob having
                     * skipped rather than as having arrived. */
                    const _skPrev = S.sessKnobMode;
                    S.sessKnobMode = Math.max(0, Math.min(SESS_KNOB_MODES.length - 1,
                                                          S.sessKnobMode + (delta > 0 ? 1 : -1)));
                    /* ⚠⚠ ONLY on a real change. The invalidator blanks all eight
                     * cached levels to -1, and a track with no level draws NO
                     * widget — so running it on a CLAMPED turn wiped the page
                     * and let the poll paint it back in, once per detent: the
                     * mixer flickered at both ends of the list (Josh, on device,
                     * the day the clamp landed). The wrap never exposed this
                     * because every turn used to change the mode, which is
                     * exactly when discarding the cache is the right thing. */
                    if (S.sessKnobMode !== _skPrev) _sessInvalidateAllLevels();
                    /* MASTER + SEND FX: one step PAST the last mixer mode is the
                     * session's own FX list, reached by the same jog that walks
                     * the mixer modes — the session-view twin of SOUND + CONFIG
                     * sitting one past AUTOMATION (Josh, 2026-08-24). The list's
                     * cursor clamps at its first row and a further left turn
                     * there steps back out to the mixer (soundOnCC), so the jog
                     * reads as ONE strip: VOLUME … SEND B · FX · (its rows…).
                     * Entry is the SAME door Shift+Note/Session uses, deferred
                     * to the tick because opening reads the chain — nothing is
                     * duplicated. `sessKnobMode` stays on SEND B, which is where
                     * the left turn back out lands. */
                    else if (delta > 0 && !soundActive()) {
                        S.pendingBusMenu = true;
                    }
                    /* No popup: turning the jog while touching it now reveals
                     * the mixer page itself, which already names the mode in its
                     * header and shows all 8 tracks in it. A popup here would
                     * cover the thing the turn was meant to show. A turn without
                     * the touch still opens the page for the timeout window
                     * (bankSelectTick), so the mode change is never silent. */
                    armBankDisplay();
                    forceRedraw();
                } else if (S.loopHeld) {
                    /* Track View + Loop held: adjust length ±1 step */
                    const _t  = S.activeTrack;
                    if (S.recordArmed && !S.recordCountingIn) {
                        /* Block length changes during active recording */
                    } else if (S.trackPadMode[_t] === PAD_MODE_DRUM && S.activeBank !== 6) {
                        if (allLanesGate()) return;
                        /* Drum: adjust length. In ALL LANES bank, length applies to all 32
                         * lanes atomically; in per-lane DRUM bank, just the active lane.
                         * (AUTO bank falls through to the CC-lane-length branch below — each
                         * automation param lane has its own loop length, like melodic.) */
                        const _lane = S.activeDrumLane[_t];
                        const _cur  = S.drumLaneLength[_t];
                        const _nv   = Math.max(1, Math.min(256, _cur + delta));
                        if (_nv !== _cur) {
                            S.drumLaneLength[_t] = _nv;
                            S.drumLaneLengthManuallySet[_t] = true;
                            /* Boundary page is window-aware: last absolute step is
                             * loop_start + length - 1, so the page containing it is
                             * floor((loop_start + length - 1) / 16). */
                            const _ls = S.drumLaneLoopStart[_t] | 0;
                            const _maxPage = Math.max(0, Math.floor((_ls + _nv - 1) / 16));
                            /* Show OOB step view in both modes — navigate to boundary page
                             * so the step-level OOB greying renders. */
                            S.loopJogActive = true;
                            S.loopJogLastTick = S.tickCount;
                            S.drumStepPage[_t] = _maxPage;
                            if (S.activeBank === 7) {
                                host_module_set_param('t' + _t + '_all_lanes_length', String(_nv));
                            } else {
                                host_module_set_param('t' + _t + '_l' + _lane + '_clip_length', String(_nv));
                            }
                            forceRedraw();
                        }
                    } else if (S.activeBank === 6) {
                        var _ac = effectiveClip(_t);
                        var _ccL = S.ccActiveLane[_t];
                        var _cur = S.ccLaneLength[_t][_ac][_ccL];
                        if (_cur === 0) {
                            var _cTps = S.clipTPS[_t][_ac] || 24;
                            var _lTps = S.ccLaneTps[_t][_ac][_ccL] || _cTps;
                            _cur = Math.max(1, Math.round(S.clipLength[_t][_ac] * _cTps / _lTps));
                        }
                        var _nv  = Math.max(1, Math.min(256, _cur + delta));
                        if (_nv !== _cur) {
                            S.ccLaneLength[_t][_ac][_ccL] = _nv;
                            S.loopJogActive = true;
                            S.loopJogLastTick = S.tickCount;
                            var _ls = S.ccLaneLoopStart[_t][_ac][_ccL] | 0;
                            S.trackCurrentPage[_t] = Math.max(0, Math.floor((_ls + _nv - 1) / 16));
                            host_module_set_param('t' + _t + '_c' + _ac + '_k' + _ccL + '_cc_lane_length', String(_nv));
                            forceRedraw();
                        }
                    } else {
                    const _ac = effectiveClip(_t);
                    const _cur = S.clipLength[_t][_ac];
                    const _nv  = Math.max(1, Math.min(256, _cur + delta));
                    if (_nv !== _cur) {
                        S.clipLength[_t][_ac] = _nv;
                        S.clipLengthManuallySet[_t][_ac] = true;
                        /* Show OOB step view: navigate to boundary page (window-aware) */
                        S.loopJogActive = true;
                        S.loopJogLastTick = S.tickCount;
                        const _ls = S.clipLoopStart[_t][_ac] | 0;
                        S.trackCurrentPage[_t] = Math.max(0, Math.floor((_ls + _nv - 1) / 16));
                        host_module_set_param('t' + _t + '_clip_length', String(_nv));
                        forceRedraw();
                    }
                    }
                } else {
                    /* ⭑⭑ THE UNSHIFTED JOG IS THE BANK PICKER (Josh, 2026-08-25).
                     *
                     * It used to WALK the banks one detent at a time, applying
                     * each step as it passed. Now the first turn opens the kit's
                     * list overlay ON TOP of the page you were already on, the
                     * turns move a selection, and NOTHING is applied until the
                     * gesture ends — you see where you are going instead of
                     * arriving somewhere and reading the header.
                     *
                     * Not applying in passing is the point, not a detail: the
                     * old walk read a bank's params on every step and ENTERED
                     * sound mode the moment it reached SOUND + CONFIG, so a
                     * scroll across the strip did all of that on the way.
                     *
                     * ⚠ The page underneath deliberately does not change while
                     * browsing — the picker is an overlay over the card it was
                     * entered on (Josh), which is what makes "cancel by not
                     * committing" legible.
                     *
                     * Commit is the release of the jog TOUCH (ui.js) — you have
                     * to be touching the wheel to turn it, so the gesture has a
                     * natural end. Sound mode is excluded here: inside it the
                     * jog belongs to that screen, and the picker comes back only
                     * on the left turn off its top row (soundOnCC). */
                    const cyc = bankCycleFor(S.activeTrack);
                    if (S.bankPickerSel < 0) {
                        /* Open where the track actually IS, so the first detent
                         * moves one step from here rather than from the top of
                         * the list. */
                        const at = cyc.indexOf(S.activeBank);
                        S.bankPickerSel = at >= 0 ? at : 0;
                    }
                    S.bankPickerSel = Math.max(0, Math.min(cyc.length - 1, S.bankPickerSel + delta));
                    S.bankPickerIdleTick = S.tickCount;
                    armBankDisplay();
                    forceRedraw();
                }
            }
        }
        return;
    }

}

const bankCycleFor = (track) => bankCycleForMode(S.trackPadMode[track]);

/* Commit the picker's selection: the same work an unshifted jog step does when
 * it lands on that bank, including the deferred entry for SOUND + CONFIG (the
 * screen has to be re-entered — BANKS[11] draws nothing on its own). */
export function applyBankPick() {
    const t = S.activeTrack;
    const cyc = bankCycleFor(t);
    const idx = S.bankPickerSel;
    S.bankPickerSel = -1;
    if (idx < 0 || idx >= cyc.length) return;
    const next = cyc[idx];
    if (next === BANK_SOUND) {
        if (!soundActive()) {
            S.globalMenuOpen = false;
            S.lastSentMenuEditValue = null;
            S.pendingSoundEnterTrack = t;
            armBankDisplay();
        }
        S.screenDirty = true;
        return;
    }
    if (next === S.activeBank) { forceRedraw(); return; }
    /* ⚠⚠ LEAVE sound mode when the walk lands on a different bank. While it is
     * active it OWNS the bank identity and re-asserts BANK_SOUND on the next
     * tick — so without this the jog appears to walk away and then snaps
     * straight back to the prompt (Josh, on device). The old bank-walk exit
     * lived in soundOnCC's left-turn-off-the-top-row branch; the prompt hands
     * the jog back instead, so the exit has to live where the bank is actually
     * committed. */
    if (soundActive()) soundExit();
    S.activeBank = next;
    S.trackActiveBank[t] = next;
    if (next === 7) S.allLanesConfirmed = false;
    if (next === 6) S.schLabelFetchLane = 0;
    readBankParams(t, next);
    armBankDisplay();
    writeSidecar();
    forceRedraw();
}

/* ⭑ THE SHIFT EDGE HAS ONE OWNER.
 *
 * Called by the CC 49 handler and by the tick's stuck-modifier reconcile, which
 * heals a Shift RELEASE that never arrived. Those two must do the SAME work: a
 * heal that only cleared `shiftHeld` would leave the volume claim raised, the
 * pending level unsaved and the pad map suppressed — a subtler wrong state than
 * the stuck LEDs it was fixing.
 *
 * Why a release can go missing: the shim publishes hardware MIDI to us through a
 * 64-slot ring that DROPS SILENTLY when full, and the consumer drains it only
 * between JS callbacks. A volume gesture is the worst case — a CC 79 detent
 * stream plus capacitive touch, with per-detent work on our side. A dropped
 * PRESS is self-healing (press again); a dropped RELEASE latches forever.
 * Reported by Josh 2026-08-25: the Shift+bottom-row track LEDs kept animating
 * after Shift was released. [[schwung-blocked-tick-drops-midi-releases]] had
 * predicted exactly this for the held-modifier flags and was waiting for a repro. */
export function applyShiftEdge(held) {
    S.shiftHeld = held;
    S.shiftTrackLEDActive = held;
        /* Shift IS the volume-knob claim (Josh, 2026-08-24): while held, Move's
         * native main output stands aside and CC 79 becomes the ACTIVE TRACK's
         * volume — in every view. Claimed on the press so the very first detent
         * cannot leak into Move's master; the release ends the gesture: the
         * per-gesture level cache drops (an edit made elsewhere is re-read next
         * time, never assumed) and the save lands once, not per detent. */
        engineVolBlock(S.shiftHeld);
        if (!S.shiftHeld) {
            S.tvSeeded = false;
            S.tvExtWarned = false;
            if (S.tvDirty) S.tvSavePending = true;
            soundVolGestureEnd();
        }
        /* PHASE-1: re-push padmap on Shift transitions so DSP on_midi sees
         * all-0xFF while Shift is held (suppress pad-shortcut notes) and
         * the real map again on release. See computePadNoteMap mute logic. */
        computePadNoteMap();
        /* Shift in Track View is a track-switch modifier (Shift+jog / Shift+pad),
         * not a param gesture. Cancel any transient param-bank display on BOTH
         * Shift edges so the OLED stays on the track overview while switching —
         * the usual gesture touches the jog (jogTouched→bank view) before pressing
         * Shift, and Shift-press never cleared it before. Mirrors the jog-release
         * clear in the MoveMainTouch handler. */
        /* ⚠ A teardown on an input edge — see standDownBankDisplay: it declines
         * if this same pass armed the window (the Shift+click latch arms it) or
         * if the card is latched. This site does NOT re-implement either rule. */
        if (!S.sessionView) { S.jogTouched = false; standDownBankDisplay(); }
        /* Arp step editor: Shift flips the Pitch <-> Velocity page — redraw on
         * both edges so the flip is immediate. */
        if (S.stepIntervalMode && !S.sessionView) forceRedraw();
        /* The Shift-RELEASE deferral that used to live here is gone (P8a 1b).
         * It existed because Shift+Note/Session on a Move-routed track went
         * straight into co-run, where the shim starts forwarding Shift to Move
         * firmware — so a still-held Shift leaked. That gesture now opens the
         * Move flavour of SOUND MODE, which forwards nothing, and both routes
         * fire on the PRESS like every other entry. */
        if (!S.sessionView) forceRedraw();
}

function _onCC_buttons(d1, d2) {
    if (d1 === MoveShift) {
        applyShiftEdge(d2 === 127);
    }

    /* Any non-Shift CC button press while Shift overlay is active clears the overlay */
    if (d1 !== MoveShift && d2 === 127 && S.shiftTrackLEDActive) {
        S.shiftTrackLEDActive = false;
    }

    if (d1 === MoveDelete) {
        S.deleteHeld = d2 === 127;
        /* Loop+Delete on auto bank: reset active lane's loop params */
        if (d2 === 127 && S.loopHeld && S.activeBank === 6 && !S.sessionView) {
            var _rdt = S.activeTrack, _rdac = effectiveClip(_rdt), _rdl = S.ccActiveLane[_rdt];
            S.ccLaneLoopStart[_rdt][_rdac][_rdl] = 0;
            S.ccLaneLength[_rdt][_rdac][_rdl] = 0;
            S.ccLaneTps[_rdt][_rdac][_rdl] = 0;
            S.ccLaneResTps[_rdt][_rdac][_rdl] = 0;
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            S.pendingDefaultSetParams.push({ key: 't' + _rdt + '_c' + _rdac + '_k' + _rdl + '_cc_lane_reset', val: '1' });
            showActionPopup('LANE LOOP', 'RESET');
            forceRedraw();
            computePadNoteMap();
            return;
        }
        /* AUTO-bank Delete-tap → CLEAR AUTOMATION menu. Arm on press (melodic
         * AUTO bank only); a clean release (nothing happened while held, see the
         * disqualify check at the top of this handler) opens the menu. */
        if (d2 === 127) {
            S.deleteTapArmed = (S.activeBank === 6 && !S.sessionView &&
                                !S.clearAutoMenu);
        } else if (S.deleteTapArmed) {
            S.deleteTapArmed = false;
            openClearAutoMenu();
        }
        /* delete_held now rides as the 34th token in the tN_padmap payload
         * (computePadNoteMap), so it shares the tick-based self-heal and
         * avoids the onMidiMessage coalescing risk the old separate
         * t0_delete_held push had. */
        computePadNoteMap();
    }

    if (d1 === MoveCopy) {
        /* ⚠⚠ In Move co-run, Copy is FORWARDED to Move rather than handled here
         * (Josh, 2026-08-24: "mute + pad works to mute move pads natively. so
         * copy should too, right?").
         *
         * It cannot be ceded through the mask: the framework's legacy carve-out
         * (corun_event_owner) keeps the EDIT group — Copy, Delete, Undo,
         * Capture — with the TOOL regardless of keep_mask, so Move firmware
         * never sees CC 60 no matter what we declare. Mute works today because
         * CC 88 is outside that group and cedes normally, and because pad
         * presses are already injected to Move. So Copy takes the same road as
         * the pads: inject it.
         *
         * ⭑ And stand OUR gesture down while we do — davebox owning Copy AND
         * forwarding it would run both copies off one press, on a surface where
         * the pad taps are already going to Move. */
        if (S.moveCoRunTrack >= 0) {
            move_midi_inject_to_move([0x0B, 0xB0, MoveCopy, d2 & 0x7F]);
            if (S.copyHeld || S.copySrc) {
                S.copyHeld = false;
                S.copySrc = null;
                invalidateLEDCache();
                computePadNoteMap();
            }
        } else {
            S.copyHeld = d2 === 127;
            if (!S.copyHeld) {
                S.copySrc = null;
                invalidateLEDCache();
            }
            computePadNoteMap();
        }
    }

    if (d1 === MoveMute) {
        /* Schwung chain-edit co-run: Mute is the host-side slot-bypass modifier
         * (Mute + jog-click bypasses the focused chain component, handled in
         * shadow_ui). Cede it entirely — dAVEBOx ignores Mute as its own
         * track-mute modifier while chain-edit co-running, so it never holds a
         * muteHeld state that would re-fire its own mute gestures. */
        {
            S.muteHeld = d2 === 127;
            if (d2 === 127) S.muteUsedAsModifier = false;
            if (S.sessionView) invalidateLEDCache();
            computePadNoteMap();
        }
    }

    if (d1 === MoveCapture) {
        if (d2 === 127) {
            S.captureHeld           = true;
            S.captureUsedAsModifier = false;
            /* Press also cancels in-flight bake dialogs — symmetric with
             * Sample's press behavior. (Scene-bake-picker cancel lives in the
             * any-button guard in _onCCMsg; merge-placement cancel is Record.) */
            if (S.confirmBake)            { S.confirmBake            = false; S.captureUsedAsModifier = true;
                                            S.confirmBakeDrumLoopOpen = false; S.confirmBakeWrapPhase = false; }
            if (S.confirmBakeScene)       { S.confirmBakeScene       = false; S.captureUsedAsModifier = true; }
            computePadNoteMap();
            forceRedraw();
        } else {
            S.captureHeld = false;
            /* Bare-tap release — Capture is CAPTURE-ONLY (bake lives on
             * Sample, Live Merge on Shift+Record):
             *   Shift+Capture          → discard buffered capture input (Move parity)
             *   buffered capture input → retrospective Capture commit into the
             *                            focused clip (Move-style Capture MIDI)
             *   nothing buffered       → hint popup.
             * Suppressed when Capture was used as a modifier (scene capture via
             * Capture+row, drum-lane select via Capture+pad). */
            if (!S.captureUsedAsModifier && S.shiftHeld) {
                if (S.capturePending > 0) {
                    S.pendingDefaultSetParams.push({
                        key: 't' + S.activeTrack + '_capture_clear', val: '1' });
                    S.capturePending = 0;
                    showActionPopup('CAPTURE', 'Input cleared');
                }
                S.captureUsedAsModifier = true;   /* consume the tap */
            }
            if (!S.captureUsedAsModifier) {
                const _ct = S.activeTrack;
                const _fc = S.trackActiveClip[_ct];
                if (S.capturePending <= 0) {
                    showActionPopup('CAPTURE', 'Nothing buffered', 'Play pads first');
                } else if (S.playing) {
                    /* Overdub into the focused clip (raw timing, no quantize). */
                    S.pendingDefaultSetParams.push({
                        key: 't' + _ct + '_capture_commit', val: String(_fc) });
                    S.capturePending     = 0;
                    S.captureCommitAwait = 40;
                } else if (!trackClipHasContent(_ct, _fc)) {
                    /* Stopped, focused clip empty → commit there (empty session =
                     * detect+set tempo; non-empty session = warp to fit tempo;
                     * the DSP picks the mode). */
                    S.pendingDefaultSetParams.push({
                        key: 't' + _ct + '_capture_commit', val: String(_fc) });
                    S.capturePending     = 0;
                    S.captureCommitAwait = 40;
                } else {
                    /* Stopped, focused clip occupied → pick an empty destination
                     * (Session View, empty clips on this track blink). */
                    S.capturePlaceTrack = _ct;
                    if (!S.sessionView) {
                        S.sessionView     = true;
                        S.heldStep        = -1; S.heldStepBtn = -1;
                        S.heldStepNotes   = []; S.stepWasEmpty = false;
                        S.stepWasHeld     = false;
                        S.sessionStepHeld = -1; S.sessionStepHeldCtx = 0;
                    }
                    invalidateLEDCache();
                    S.screenDirty = true;
                }
            }
            computePadNoteMap();
            forceRedraw();
        }
        return;
    }

    /* Move's Menu button (CC 50) is in CORUN_KEEP_DEFAULT so the shim routes
     * it to us during co-run — which makes it the ONLY button dAVEBOx can put an
     * exit on that Move firmware does not need for itself. */


    /* Note/Session view toggle: Shift+press = open global menu (Track View only);
     * tap = switch view; hold = session overview */
    if (d1 === MoveNoteSession) {
        /* ⭑ MOVE CO-RUN: Menu is THE WAY OUT, and it returns you where you came
         * in from (P8a 1d).
         *
         * Back cannot do this. **Move owns Back**, because it needs it to walk
         * its own menus, and there is no way to tell when it is at the top of
         * its structure (Josh, hardware, 2026-08-11) — so a Back intercept would
         * either steal Move's navigation or never fire. Menu is free.
         *
         * This REPLACES Menu-opens-the-FX-bus-picker. That was the buses' only
         * entry point, which is exactly why 1d had to wait for 1b: the Move
         * buses now live in their track's sound mode, which is also where this
         * exit returns you. Nothing is orphaned.
         *
         * Step 3 keeps working as the second exit (ui_input_pads.mjs) — it lands
         * on track view, since it is a step-grid affordance, not a return. */
        if (S.moveCoRunTrack >= 0) {
            if (d2 === 127) exitMoveNativeCoRun();
            return;
        }
        if (d2 === 127) {
            /* Co-run exit is the framework's job now — the shim catches Back
             * during corun_active() and calls shadow_corun_end() itself, and
             * pollDSP picks up target=NONE on the next frame and runs
             * exitMoveNativeCoRun() for the JS cleanup.
             * No Menu intercept needed here. */
            if (S.snapshotPicker) {
                /* Back out of a confirm to the list, else close the picker. */
                if (S.snapshotPicker.confirm) S.snapshotPicker.confirm = null;
                else closeSnapshotPicker();
                forceRedraw();
                return;
            }
            if (S.shiftHeld) {
                /* ⭑ DEFERRED TO THE RELEASE. The gesture has two meanings now
                 * and only its DURATION separates them, so the press records
                 * when it happened and does nothing else. */
                S.shiftNoteSessionTick = S.tickCount;
                S.screenDirty = true;
                return;
            } else if (soundGestureReturn()) {
                forceRedraw();
            } else if (S.tapTempoOpen) {
                closeTapTempo();
                forceRedraw();
            } else if (S.confirmStateWipe) {
                S.confirmStateWipe = false;
                removeFlagsWrap();
                clearAllLEDs();
                host_exit_module();
                forceRedraw();
            } else if (S.bpmMoveInfo) {
                S.bpmMoveInfo = false;
                forceRedraw();
            } else if (S.recordBlockedDialog) {
                S.recordBlockedDialog = false;
                forceRedraw();
            } else if (S.confirmLgto) {
                S.confirmLgto = false;
                forceRedraw();
            } else if (S.confirmBake) {
                S.confirmBake          = false;
                S.confirmBakeWrapPhase = false;
                forceRedraw();
            } else if (S.globalMenuOpen && S.confirmClearSession) {
                S.confirmClearSession = false;
                forceRedraw();
            } else if (S.globalMenuOpen && S.confirmSaveState) {
                S.confirmSaveState = false;
                forceRedraw();
            } else if (S.globalMenuOpen && S.confirmConvertToDrum) {
                closeConvertConfirm();
                forceRedraw();
            } else if (S.globalMenuOpen && S.confirmConvertToConduct) {
                closeConvertConfirm();
                forceRedraw();
            } else if (S.globalMenuOpen && S.menuInfoLines.length > 0) {
                S.menuInfoLines = [];
                forceRedraw();
            } else if (S.globalMenuOpen && S.exportDoneDialog) {
                S.exportDoneDialog = false;
                S.globalMenuOpen   = false;
                forceRedraw();
            } else if (S.globalMenuOpen && S.confirmExportCondPhase) {
                S.confirmExportCondPhase = false;   /* Back from cond stage aborts export */
                forceRedraw();
            } else if (S.globalMenuOpen && S.confirmExport) {
                S.confirmExport = false;
                forceRedraw();
            } else if (S.globalMenuOpen) {
                S.globalMenuOpen = false;
                S.lastSentMenuEditValue = null;
                forceRedraw();
            } else if (S.stepIntervalMode && !S.sessionView) {
                /* Arp Steps overlay: Note/Session exits the overlay without switching view. */
                S.stepIntervalMode = false;
                computePadNoteMap();
                forceRedraw();
            } else {
                /* Switch immediately (like Loop entering perf); tap vs hold resolved on release */
                S.noteSessionPressedTick = S.tickCount;
                S.sessionViewMomentary   = true;
                S.sessionView            = !S.sessionView;
                _switchViewCleanup();
                invalidateLEDCache();
                S.screenDirty = true;
            }
        } else if (d2 === 0) {
            /* ⭑ Shift+Note/Session resolves HERE, on the release, because only
             * the duration separates its two meanings. Read the flag recorded at
             * the PRESS, not S.shiftHeld now: letting go of Shift a moment
             * before the button would otherwise turn a deliberate hold into a
             * plain view toggle.
             *
             * ⚠ ~450ms (BACK_HOLD_TICKS), not the ~200ms this button already
             * uses for its momentary-view hold. That threshold is tuned for a
             * view flick; at 200ms a slightly slow tap would land you in the
             * instrument editor, and these two destinations are far enough apart
             * that the hold should feel deliberate. */
            if (S.shiftNoteSessionTick >= 0) {
                /* Still pending, so the threshold was never crossed: a TAP.
                 * checkShiftNoteHold clears the tick when it fires, which is
                 * what makes the release after a hold a no-op. */
                S.shiftNoteSessionTick = -1;
                shiftNoteSessionAction(false);
                return;
            }
            if (S.noteSessionPressedTick >= 0 &&
                    (S.tickCount - S.noteSessionPressedTick) < NOTE_SESSION_HOLD_TICKS) {
                /* Tap release: make permanent (don't switch back) */
                S.sessionViewMomentary = false;
            } else if (S.sessionViewMomentary) {
                /* Hold release: switch back to original view */
                S.sessionViewMomentary = false;
                S.sessionView          = !S.sessionView;
                _switchViewCleanup();
                invalidateLEDCache();
                forceRedraw();
            }
            S.noteSessionPressedTick = -1;
        }
    }

    /* Loop button (CC 58, Session View): enter/exit Performance Mode.
     * Pad presses in Perf Mode drive rate capture + modifier engage.
     * Double-tap locks the view after Loop is released. */
    if (d1 === MoveLoop && S.sessionView) {
        if (d2 === 127) {
            if (S.shiftHeld) {
                /* Shift+Loop: toggle perf latch mode (mod pads momentary vs sticky). */
                S.perfLatchMode = !S.perfLatchMode;
                forceRedraw();
                return;
            }
            S.loopPressTick = S.tickCount;
            S.loopHeld      = true;
            forceRedraw();
            return;
        }
        const heldDuration = S.tickCount - S.loopPressTick;
        const wasTap       = heldDuration < LOOP_TAP_TICKS;

        if (S.perfViewLocked) {
            /* Locked + tap → unlock + stop. */
            if (wasTap) {
                S.perfViewLocked    = false;
                S.loopHeld          = false;
                S.loopJogActive     = false;
                S.perfStack         = [];
                S.perfStickyLengths = new Set();
                S.perfHoldPadHeld   = false;
                S.perfModsHeld      = 0;
                sendPerfMods();
                host_module_set_param('looper_stop', '1');
                invalidateLEDCache();
                forceRedraw();
            }
            return;
        }

        if (wasTap) {
            /* Tap → lock Perf Mode; preserve running loop + mods. */
            S.perfViewLocked = true;
            S.loopHeld       = true;
            forceRedraw();
            return;
        }

        /* Hold release: exit Perf Mode. Sticky lengths/hold pad auto-lock if still active. */
        S.loopHeld      = false;
        S.loopJogActive = false;
        S.perfModsHeld = 0;
        if (S.perfStickyLengths.size > 0 || S.perfHoldPadHeld) {
            S.perfViewLocked = true;
            if (!S.perfHoldPadHeld)
                S.perfStack = S.perfStack.filter(function(e) { return S.perfStickyLengths.has(e.idx); });
            if (S.perfStack.length > 0)
                host_module_set_param('looper_arm', String(S.perfStack[S.perfStack.length - 1].ticks));
        } else {
            if (S.perfStack.length > 0)
                host_module_set_param('looper_stop', '1');
            S.perfStack = [];
        }
        sendPerfMods();
        invalidateLEDCache();
        forceRedraw();
        return;
    }

    /* Loop button (CC 58, Track View): hold + step buttons sets clip length */
    if (d1 === MoveLoop && !S.sessionView) {
        S.loopHeld = d2 === 127;
        computePadNoteMap();
        /* Arp Steps overlay: Loop is repurposed as a modifier for the pad-column
         * loop-length gesture. Skip every other Loop side-effect (TARP unlatch,
         * drum repeat latch, loop-window gesture) while the overlay is active. */
        if (S.stepIntervalMode) {
            if (!S.loopHeld && S.loopGestureStart >= 0) S.loopGestureStart = -1;
            forceRedraw();
            return;
        }
        if (S.loopHeld) {
            /* Latch or clear drum repeat on the active track */
            const _lrt = S.activeTrack;
            S.loopPressTick = S.tickCount;
            /* Tap-loop-alone unlatch eligibility (drum tracks only). Snapshot
             * "no fresh physical pad press" at press time so the release path
             * can distinguish a true alone-tap from a tap-while-latching
             * gesture. For Rpt1, drumRepeatHeldPad doubles as the latched-pad
             * reference once latched, so we must allow that case (latched +
             * no fresh press = the unlatch gesture we want). Rpt2 uses two
             * separate sets (held vs latched) so its check is simpler. */
            S.loopTapUnlatchTrack = -1;
            const _rpt1FreshHold = S.drumRepeatHeldPad[_lrt] >= 0 && !S.drumRepeatLatched[_lrt];
            const _rpt2FreshHold = S.drumRepeat2HeldLanes[_lrt].size > 0;
            if (S.trackPadMode[_lrt] === PAD_MODE_DRUM &&
                !_rpt1FreshHold && !_rpt2FreshHold &&
                S.liveActiveNotes.size === 0) {
                S.loopTapUnlatchTrack = _lrt;
            }
            /* Delete+Loop on auto bank: reset active lane's loop/res/zoom to clip defaults */
            if (S.deleteHeld && S.activeBank === 6) {
                var _rac = effectiveClip(_lrt);
                var _rl = S.ccActiveLane[_lrt];
                S.ccLaneLoopStart[_lrt][_rac][_rl] = 0;
                S.ccLaneLength[_lrt][_rac][_rl] = 0;
                S.ccLaneTps[_lrt][_rac][_rl] = 0;
                S.ccLaneResTps[_lrt][_rac][_rl] = 0;
                S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_c' + _rac + '_k' + _rl + '_cc_lane_reset', val: '1' });
                showActionPopup('LANE LOOP', 'RESET');
                forceRedraw();
                return;
            }
            /* Delete+Loop: unconditionally stop active drum repeat latch */
            if (S.deleteHeld && S.trackPadMode[_lrt] === PAD_MODE_DRUM) {
                if (S.drumPerformMode[_lrt] === 1 && S.drumRepeatLatched[_lrt]) {
                    S.drumRepeatLatched[_lrt] = false;
                    S.drumRepeatHeldPad[_lrt] = -1;
                    S.drumRepeatHeldPadsStack[_lrt].length = 0;
                    host_module_set_param('t' + _lrt + '_drum_repeat_stop', '1');
                } else if (S.drumPerformMode[_lrt] === 2 && S.drumRepeat2LatchedLanes[_lrt].size > 0) {
                    host_module_set_param('t' + _lrt + '_drum_repeat2_stop', '1');
                    S.drumRepeat2LatchedLanes[_lrt].clear();
                }
                forceRedraw();
                return;
            }
            /* TARP latch shortcut: Loop press while holding a pad on a melodic track */
            if (S.trackPadMode[_lrt] !== PAD_MODE_DRUM && S.liveActiveNotes.size > 0) {
                const _latchNow = (S.bankParams[_lrt][5][7] | 0) !== 0;
                if (_latchNow) {
                    /* Latch ON: holding any pad + loop turns it off */
                    S.bankParams[_lrt][5][7] = 0;
                    S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_tarp_latch', val: '0' });
                } else if ((S.bankParams[_lrt][5][0] | 0) !== 0) {
                    /* Latch OFF: turn it on (only when TARP style is set) */
                    S.bankParams[_lrt][5][7] = 1;
                    S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_tarp_latch', val: '1' });
                }
            } else if (S.trackPadMode[_lrt] !== PAD_MODE_DRUM &&
                       (S.bankParams[_lrt][5][7] | 0) !== 0 &&
                       S.tarpHeldNotes[_lrt].size > 0) {
                /* Loop press with no pads held + latch on + notes in buffer:
                 * clear the latched buffer without changing tarp_latch. */
                host_module_set_param('t' + _lrt + '_tarp_clear_latched', '1');
                S.tarpHeldNotes[_lrt].clear();
            }
            if (S.drumPerformMode[_lrt] === 2) {
                S.rpt2LoopPadUsed = false;
                if (S.drumRepeat2HeldLanes[_lrt].size > 0) {
                    for (const _ll of S.drumRepeat2HeldLanes[_lrt]) {
                        S.drumRepeat2LatchedLanes[_lrt].add(_ll);
                    }
                    /* Phase 1 / Bundle 2C-Rpt2: one atomic DSP push for all
                     * currently-held lanes. A per-lane loop here would coalesce
                     * (same set_param key, different values) — only the last
                     * lane would land. The DSP handler ORs active|pending into
                     * the latched bitmask. */
                    host_module_set_param('t' + _lrt + '_drum_repeat2_latch_held', '1');
                    S.rpt2LoopPadUsed = true;
                }
            } else if (S.drumRepeatHeldPad[_lrt] >= 0) {
                S.drumRepeatLatched[_lrt] = true;
                /* Phase 1 / Bundle 2C-Rpt1: also push DSP-side latched bit
                 * for parity (used by audio-thread unlatch-tap detection in
                 * drum_pad_event). Rpt1's release handler is still JS-driven
                 * so this isn't strictly required, but keeps DSP in sync. */
                S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_drum_repeat_latched', val: '1' });
            }
            S.heldStepBtn        = -1;
            S.heldStep           = -1;
            S.heldStepNotes      = [];
            S.stepWasEmpty       = false;
            S.stepWasHeld        = false;
            S.stepBtnPressedTick.fill(-1);
            S.sessionStepHeld    = -1;
            S.sessionStepHeldCtx = 0;
        } else {
            S.loopJogActive = false;
            /* Loop released before the held start step — treat as aborted
             * gesture and fire the length-only fallback (single-tap semantics). */
            if (S.loopGestureStart >= 0) {
                _resolveLoopGesture(true);
                S.loopTapUnlatchTrack = -1;
            }
            /* Tap-loop-alone: unlatch all latched repeats on active drum track.
             * Eligibility was snapshotted at press (no pads/lanes held + drum
             * track). A long hold disqualifies (treated like a gesture timeout). */
            if (S.loopTapUnlatchTrack >= 0 &&
                (S.tickCount - S.loopPressTick) < LOOP_TAP_TICKS) {
                const _ut = S.loopTapUnlatchTrack;
                if (S.drumRepeatLatched[_ut]) {
                    S.drumRepeatLatched[_ut] = false;
                    S.drumRepeatHeldPad[_ut] = -1;
                    S.drumRepeatHeldPadsStack[_ut].length = 0;
                    S.pendingDefaultSetParams.push({ key: 't' + _ut + '_drum_repeat_stop', val: '1' });
                }
                if (S.drumRepeat2LatchedLanes[_ut].size > 0) {
                    S.drumRepeat2LatchedLanes[_ut].clear();
                    S.pendingDefaultSetParams.push({ key: 't' + _ut + '_drum_repeat2_stop', val: '1' });
                }
            }
            S.loopTapUnlatchTrack = -1;
        }
        forceRedraw();
    }

}

/* Suspend dAVEBOx to the background (self-managed Back). Mirrors the old
 * Shift+Back path: save first, then call the host suspend one tick later (once
 * the DSP 'save' has reached the buffer) via pendingSuspendManaged. */
function _suspendModule() {
    /* Sound mode is not persisted (its state is a live view onto the chain, not
     * session data). Leaving it active across a suspend means resuming into a
     * bank page whose values were read before the set changed. */
    if (soundActive()) soundExit();
    saveState();                    /* sets pendingSuspendSave */
    S.pendingSuspendManaged = true; /* drained one tick after save fires → host_suspend_overtake */
}

/* Abort a Live Merge that is still counting in (before any capture). Clears the
 * count-in flash, drops the armed state, and tells DSP to discard. Shared by the
 * Rec-during-count-in path and Back (via _backTap). */
function _cancelMergeCountIn() {
    S.mergeCountingIn = false;
    S.mergeSingleTrack = -1;
    S.pendingMergeArm = false;
    S.actionPopupEndTick = -1;   /* drop the "Count-in…" popup immediately */
    S.pendingDefaultSetParams.push({ key: 'merge_cancel', val: '1' });
    setButtonLED(MoveRec, S.recordArmed ? Red : LED_OFF);
    forceRedraw();
}

/* Back TAP: back out exactly ONE level of UI state, innermost → outermost
 * (ordered to match drawUI's overlay priority). First match consumes the tap.
 * Suspends ONLY at the true home screen (Session view, nothing open); a
 * long-press (checkBackHold) is the suspend-from-anywhere gesture instead.
 * Co-run is intentionally NOT handled here — Back is host/peer-owned during
 * co-run and never reaches us (deferred to a separate pass). */
/* Would a Back TAP do something right now (back out of a dialog / menu / perf
 * lock / Track-view alt-view or non-default bank)? Drives the Back button LED so
 * it's lit only where a tap is functional. MUST stay in sync with _backTap's
 * actionable branches. (Boot modals and the Session/Track home no-ops → false.
 * Hold-to-suspend works regardless and is not reflected here.) */
export function backTapWouldAct() {
    if (S.confirmStateWipe) return false;
    if (S.projectPadPicker) {
        const _p = S.projectPadPicker;
        /* An open overlay always peels; the bare grid closes unless the
         * session is still awaiting its selection. */
        if (_p.menu || _p.colorPick || _p.confirmNew) return true;
        return !S.awaitingProjectSelect;
    }
    if (S.snapshotPicker || S.clearAutoMenu || S.tempoSelectActive ||
        S.mergeNoticePending || S.mergeCountingIn ||
        S.pendingMergePlacement || S.mergeSoloPlacement >= 0 ||
        S.capturePlaceTrack >= 0 || S.pendingSceneBakePicker ||
        S.confirmBakeScene || S.confirmBakeDrumLoopOpen || S.confirmXpose ||
        S.confirmLgto || S.confirmBake || S.recordBlockedDialog ||
        S.bpmMoveInfo || S.tapTempoOpen || S.globalMenuOpen) return true;
    if (S.sessionView) return S.perfViewLocked;
    /* Track view: alt-view exits, then non-default bank steps back to 0. */
    return S.stepIntervalMode || S.altMode ||
           (S.activeBank === 7 && S.allLanesConfirmed) || S.activeBank !== 0;
}

function _backTap() {
    /* Boot-time decision modals (incompatible-state wipe, set-inherit picker):
     * leave to their own jog-click flow; Back must not act underneath them. */
    if (S.confirmStateWipe) return;

    /* 1. Transient dialogs / pickers / modes (one open at a time). */
    if (S.projectPadPicker) {
        /* Peel an open overlay (color -> menu -> grid) first. */
        if (projectPadPickerBack()) return;
        /* SELECT-BEFORE-LOAD: nothing is loaded, so Back has nowhere to go —
         * closing would leave an empty session with no picker and no project.
         * The picker is the session until a choice is made. (Shift+Back still
         * exits to stock; that path never reaches here.) */
        if (S.awaitingProjectSelect) return;
        closeProjectPadPicker();
        return;
    }
    if (S.snapshotPicker) {
        if (S.snapshotPicker.confirm) S.snapshotPicker.confirm = null;
        else closeSnapshotPicker();
        forceRedraw(); return;
    }
    if (S.globalEnumPick) { closeGlobalEnumPick(false); forceRedraw(); return; }
    if (S.clearAutoMenu)  { S.clearAutoMenu = null; S.deleteTapArmed = false; forceRedraw(); return; }
    if (S.tempoSelectActive) {
        /* Keep the currently-auditioned tempo (same as a jog-click) and close. */
        host_module_set_param('t' + S.tempoSelectTrack + '_capture_confirm', '');
        S.tempoSelectActive = false; forceRedraw(); return;
    }
    /* Live Merge pre-capture (merge-count-in branch): Back cancels the "Rec to
     * start" notice, and aborts a running count-in. (Guards are inert when the
     * merge-count-in branch isn't integrated — the fields stay undefined.) */
    if (S.mergeNoticePending) { S.mergeNoticePending = false; forceRedraw(); return; }
    if (S.mergeCountingIn) {
        S.mergeCountingIn = false; S.mergeSingleTrack = -1; S.pendingMergeArm = false;
        S.actionPopupEndTick = -1;   /* drop the "Count-in…" popup immediately */
        S.pendingDefaultSetParams.push({ key: 'merge_cancel', val: '1' });
        setButtonLED(MoveRec, S.recordArmed ? Red : LED_OFF);
        forceRedraw(); return;
    }
    if (S.pendingMergePlacement || S.mergeSoloPlacement >= 0) {
        S.pendingMergePlacement = false; S.mergeSoloPlacement = -1;
        S.pendingDefaultSetParams.push({ key: 'merge_cancel', val: '1' });
        forceRedraw(); return;
    }
    if (S.capturePlaceTrack >= 0)  { S.capturePlaceTrack = -1; forceRedraw(); return; }
    if (S.pendingSceneBakePicker)  { S.pendingSceneBakePicker = false; forceRedraw(); return; }
    if (S.confirmBakeScene)        { S.confirmBakeScene = false; S.confirmBakeSceneCondPhase = false; forceRedraw(); return; }
    if (S.confirmBakeDrumLoopOpen) { S.confirmBakeDrumLoopOpen = false; forceRedraw(); return; }
    if (S.confirmXpose)            { xposeCancelPreview(); S.confirmXpose = false; forceRedraw(); return; }
    if (S.confirmLgto)             { S.confirmLgto = false; forceRedraw(); return; }
    if (S.confirmBake)             { S.confirmBake = false; S.confirmBakeWrapPhase = false; forceRedraw(); return; }
    if (S.recordBlockedDialog)     { S.recordBlockedDialog = false; forceRedraw(); return; }
    if (S.bpmMoveInfo)             { S.bpmMoveInfo = false; forceRedraw(); return; }
    if (S.tapTempoOpen)            { closeTapTempo(); forceRedraw(); return; }

    /* 2. Global menu (+ its nested confirms): a nested confirm closes to the
     *    menu, otherwise the menu itself closes. */
    if (S.globalMenuOpen) {
        if (S.confirmClearSession)        { S.confirmClearSession = false; }
        else if (S.confirmSaveState)      { S.confirmSaveState = false; }
        else if (S.confirmConvertToDrum)  { closeConvertConfirm(); }
        else if (S.confirmConvertToConduct){ closeConvertConfirm(); }
        else if (S.menuInfoLines.length > 0){ S.menuInfoLines = []; }
        else if (S.exportDoneDialog)      { S.exportDoneDialog = false; S.globalMenuOpen = false; }
        else if (S.confirmExportCondPhase){ S.confirmExportCondPhase = false; }
        else if (S.confirmExport)         { S.confirmExport = false; }
        else { S.globalMenuOpen = false; S.lastSentMenuEditValue = null; }
        forceRedraw(); return;
    }

    /* 3. Session view: exit locked Perf Mode before it would count as home. */
    if (S.sessionView && S.perfViewLocked) {
        S.perfViewLocked    = false;
        S.loopHeld          = false;
        S.loopJogActive     = false;
        S.perfStack         = [];
        S.perfStickyLengths = new Set();
        S.perfHoldPadHeld   = false;
        S.perfModsHeld      = 0;
        sendPerfMods();
        host_module_set_param('looper_stop', '1');
        invalidateLEDCache(); forceRedraw(); return;
    }

    /* 4/5. Track view: exit an alt-view to the bank's default view; else step a
     *      non-default bank back to bank 0 (Clip / Drum Lane / Conduct). At
     *      bank 0 with no alt-view, Back is a no-op (does NOT jump to Session). */
    if (!S.sessionView) {
        if (S.stepIntervalMode)   { S.stepIntervalMode = false; computePadNoteMap(); forceRedraw(); return; }
        if (S.altMode)            { S.altMode = false; forceRedraw(); return; }
        if (S.activeBank === 7 && S.allLanesConfirmed) { S.allLanesConfirmed = false; forceRedraw(); return; }
        /* ⭑ Back DISMISSES the screen: unlatch if latched, stand the bank card
         * down, and show the track overview (Josh, 2026-08-25).
         *
         * ⚠ It used to step the bank back to 0 (CLIP / DRUM LANE / CONDUCT).
         * That made Back a hidden STATE change — you pressed it to get rid of a
         * screen and it silently moved you off the bank you were working on,
         * with no way back except navigating there again. Back now only ever
         * affects what is on screen; where you are is the jog's business. */
        if (S.bankCardLatched || S.bankSelectTick >= 0 || S.jogTouched) {
            S.bankCardLatched = false;
            standDownBankDisplay(true);      /* Back genuinely means "no window" */
            S.jogTouched = false;
            invalidateLEDCache(); forceRedraw(); return;
        }
        return;   /* Track view, nothing on screen to dismiss — stop here. */
    }

    /* 6. Session view home (nothing open) — a Back TAP no longer suspends
     * (Josh's call). Suspend is via a Back HOLD or the "Suspend session" menu item. */
}

/* Route a Back (CC 51) press/release. Plain Back: press starts tap/hold timing
 * (resolved on release by _backTap, or by checkBackHold if held). Shift+Back is
 * a pre-#165-host compatibility path only (a ≥#165 host owns Shift+Back itself
 * and never delivers it here); it suspends immediately like the old behavior. */
function _handleBack(d2) {
    if (d2 === 127) {
        if (S.shiftHeld) {
            if (soundActive()) soundExit();
            saveState();
            S.pendingHideAfterSave = true;
            return;
        }
        S.backPressTick = S.tickCount;
        S.backHoldFired = false;
    } else if (d2 === 0) {
        if (S.backPressTick >= 0 && !S.backHoldFired) _backTap();
        S.backPressTick = -1;
        S.backHoldFired = false;
    }
}

/* Fire the HOLD-Back suspend once the press crosses BACK_HOLD_TICKS. Called every
 * tick. Clears backPressTick so the subsequent release doesn't also tap. */
/* Shift+Note/Session's action, extracted so it can run from the RELEASE rather
 * than the press — which is what lets a TAP and a HOLD mean different things
 * (Josh, 2026-08-28):
 *   tap  -> the track's SOUND + CONFIG menu
 *   hold -> straight to instrument edit, which is what the tap did before
 *
 * ⭑⭑ AND THE GESTURE IS A DESTINATION NOW, NEVER A TOGGLE. It used to close
 * whatever was open and only open when nothing was — which needed a definition
 * of "open", and that definition is where it went wrong: the root screen had to
 * be carved out as an exception (08-26), and the respec would have needed a
 * second exception for the prompt. A destination has no such edge: the same
 * press means the same thing from any depth, and pressing it deep in a stack
 * collapses you back to the menu in ONE press instead of four Backs. Back is
 * the only thing that closes, and it means one thing everywhere.
 *
 * ⚠ The body below is the 08-26 gesture with its CLOSER removed and its
 * destination switched. What survives unchanged is the ROUTE test: "edit this
 * track's instrument" means the generator's canvas on a Schwung track, co-run
 * on a Move one, and an EXT track has neither and says so. */
function shiftNoteSessionAction(wantInstrument) {
if (S.sessionView) return;          /* session view has its own counterpart */
const _gt = S.activeTrack;
if (!wantInstrument) {
    /* TAP — the menu, from wherever you are. Idempotent: already there and
     * it simply stays there; deep in a stack and it collapses back to the
     * menu in one press.
     *
     * ⚠⚠ ROUTE-AWARE ENTRY, and it must go through the SAME deferred door
     * the bank uses. A Move-routed track's sound is its Move bus
     * (soundEnterMove), not a chain slot — calling soundEnter directly here
     * would open the wrong flavour, silently, for every Move track. Opening
     * also READS the chain, which is why the bank defers it to the tick
     * rather than doing it from the MIDI path. */
    if (soundActive()) { soundShowMenu(); }
    else {
        S.pendingSoundEnterTrack = _gt;
        S.pendingSoundEnterMenu  = true;
    }
    forceRedraw();
    return;
}
/* HOLD — the instrument itself. */
if (S.trackRoute[_gt] === 1) {
    enterMoveNativeCoRun(_gt);
} else if (S.trackRoute[_gt] === 2) {
    showActionPopup('MIDI TRACK', 'No generator to edit');
} else {
    /* An EMPTY generator opens the module picker itself (Josh, 2026-08-27)
     * with 'SELECT GENERATOR' over it — soundOpenGenerator always succeeds,
     * so there is no failure branch to write. */
    soundOpenGenerator(_gt);
}
forceRedraw();
}

/* ⭑ The Shift+Note/Session HOLD fires the moment it crosses the threshold, not
 * on the release (Josh, 2026-08-28: "shift+hold needs to happen after hold
 * duration, not release"). Same shape as checkBackHold below, and for the same
 * reason: a hold you have to let go of before anything happens does not feel
 * like a hold, it feels like a slow tap.
 *
 * The RELEASE then only has to notice the hold already fired — the tick is
 * cleared here, so a release with nothing pending does nothing. */
export function checkShiftNoteHold() {
    if (S.shiftNoteSessionTick < 0) return;
    /* Co-run owns this button while it is up (Menu is its way out), so abandon
     * a pending hold rather than firing into it. */
    if (S.moveCoRunTrack >= 0) { S.shiftNoteSessionTick = -1; return; }
    if ((S.tickCount - S.shiftNoteSessionTick) >= BACK_HOLD_TICKS) {
        S.shiftNoteSessionTick = -1;
        /* ⭑⭑ SPEND Shift before opening anything. The key is still physically
         * down — the gesture fires at the threshold, not on release — so the
         * editor this is about to open would see Shift held and come up with
         * its own Shift overlay already on screen (Josh, on device).
         *
         * `applyShiftEdge(false)` is the whole fix: every consumer runs its
         * release side-effects exactly as if the key had come up — the volume
         * claim ends, the padmap is restored, the LEDs settle — and the screens
         * opened below re-read a key that now reads UP.
         *
         * ⚠ It stays false without a latch, and that is worth knowing rather
         * than guarding: tick's stuck-Shift heal only ever asserts RELEASED
         * ("we do NOT assert Shift from the other direction"), so nothing can
         * bring it back until a real press. I did add a latch here first; a
         * mutation removing it survived, because it could never fire. */
        applyShiftEdge(false);
        shiftNoteSessionAction(true);          /* the instrument */
    }
}

export function checkBackHold() {
    if (S.backPressTick < 0) return;
    /* Co-run started while Back was held: abandon the pending hold (co-run owns
     * Back) rather than fire a suspend on/after its exit. */
    if (S.moveCoRunTrack >= 0) {
        S.backPressTick = -1; S.backHoldFired = false; return;
    }
    if ((S.tickCount - S.backPressTick) >= BACK_HOLD_TICKS) {
        S.backHoldFired = true;
        S.backPressTick = -1;
        _suspendModule();
    }
}

function _onCC_transport(d1, d2) {
    /* SELECT-BEFORE-LOAD: transport is locked until a project is chosen. The
     * instance holds defaults, so Play would start an empty sequencer under the
     * picker — running, recording and undo all imply a project that isn't there
     * yet. One gate for the whole family rather than six at the set_param
     * sites, so a transport verb added later is locked by default. */
    if (S.awaitingProjectSelect) return;
    /* Undo button: press = undo; Shift+Undo = redo */
    if (d1 === MoveUndo && d2 === 127) {
        if (S.shiftHeld) {
            if (S.redoAvailable) {
                if (S.redoSeqArpSnapshot) {
                    const _t = S.redoSeqArpSnapshot.track;
                    S.undoSeqArpSnapshot = { track: _t, params: S.bankParams[_t][4].slice() };
                } else {
                    S.undoSeqArpSnapshot = null;
                }
                host_module_set_param('redo_restore', '1');
                if (S.redoSeqArpSnapshot) {
                    const { track, params } = S.redoSeqArpSnapshot;
                    for (let k = 0; k < 8; k++) {
                        const pm = BANKS[4].knobs[k];
                        if (pm) S.bankParams[track][4][k] = params[k];
                    }
                }
                S.undoAvailable = true;
                S.redoAvailable = false;
                S.pendingUndoSync = 5;
                showActionPopup('REDO');
            } else {
                showActionPopup('NOTHING TO', 'REDO');
            }
        } else {
            if (S.undoAvailable) {
                if (S.undoSeqArpSnapshot) {
                    const _t = S.undoSeqArpSnapshot.track;
                    S.redoSeqArpSnapshot = { track: _t, params: S.bankParams[_t][4].slice() };
                } else {
                    S.redoSeqArpSnapshot = null;
                }
                host_module_set_param('undo_restore', '1');
                if (S.undoSeqArpSnapshot) {
                    const { track, params } = S.undoSeqArpSnapshot;
                    for (let k = 0; k < 8; k++) {
                        const pm = BANKS[4].knobs[k];
                        if (pm) S.bankParams[track][4][k] = params[k];
                    }
                }
                S.redoAvailable = true;
                S.undoAvailable = false;
                S.pendingUndoSync = 5;
                showActionPopup('UNDO');
            } else {
                showActionPopup('NOTHING TO', 'UNDO');
            }
        }
        S.screenDirty = true;
    }

    /* Play: toggle transport; Shift+Play = restart transport; Delete+Play = deactivate_all; Mute+Play = toggle metro */
    if (d1 === MovePlay && d2 === 127) {
        if (S.deleteHeld) {
            if (!S.playing) {
                /* Stopped: panic clears will_relaunch + all clip state atomically for all tracks. */
                host_module_set_param('transport', 'panic');
                for (let t = 0; t < NUM_TRACKS; t++) {
                    S.trackWillRelaunch[t] = false;
                    S.trackQueuedClip[t]   = -1;
                }
                /* Mirror the playing-branch sweep so LEDs/UI stay in sync with audio panic. */
                unlatchAllTracks();
            } else {
                host_module_set_param('transport', 'deactivate_all');
                /* Unlatch Rpt1/Rpt2/TARP across all tracks — queued one-per-tick via pendingDefaultSetParams to avoid coalescing */
                unlatchAllTracks();
            }
        } else if (S.muteHeld) {
            S.muteUsedAsModifier = true;
            if (S.metronomeOn !== 0) S.metronomeOnLast = S.metronomeOn;
            S.metronomeOn = S.metronomeOn === 0 ? S.metronomeOnLast : 0;
            host_module_set_param('metro_on', String(S.metronomeOn));
            showActionPopup('METRO ' + (S.metronomeOn === 0 ? 'OFF' : 'ON'));
        } else if (S.loopHeld && !S.sessionView) {
            /* Loop+Play (Track View only): restart with active clip starting at
             * the first step of the visible page; other tracks land at the
             * musically-equivalent offset. Atomic single set_param. */
            const _lpAt   = S.activeTrack;
            const _lpIsDr = S.trackPadMode[_lpAt] === PAD_MODE_DRUM;
            const _lpPage = _lpIsDr ? (S.drumStepPage[_lpAt] | 0) : (S.trackCurrentPage[_lpAt] | 0);
            const _lpLane = _lpIsDr ? (S.activeDrumLane[_lpAt] | 0) : -1;
            host_module_set_param('transport', 'restart_at:' + _lpAt + ':' + _lpPage + ':' + _lpLane);
        } else if (S.shiftHeld) {
            /* Restart: atomic DSP-side stop+play. Single set_param avoids
             * coalescing flakiness when stop+play land in same audio block. */
            host_module_set_param('transport', S.playing ? 'restart' : 'play');
        } else {
            if (S.recordCountingIn) {
                disarmRecord();
            } else {
                /* Use the combined `transport=play_focus:T:C` set_param so the
                 * DSP arms the focused track's clip + sets playing=1 in a
                 * single buffer. Sending launch_clip + transport=play as two
                 * separate set_params coalesces (same buffer same channel),
                 * leaving clip_playing=0 on the first cycle after a clip
                 * clear (since clear leaves will_relaunch=0). */
                if (!S.playing && !S.sessionView
                        && !S.trackClipPlaying[S.activeTrack]
                        && !S.trackWillRelaunch[S.activeTrack]) {
                    const _at = S.activeTrack;
                    const _ac = S.trackActiveClip[_at];
                    host_module_set_param('transport', 'play_focus:' + _at + ':' + _ac);
                    S.trackQueuedClip[_at] = _ac;
                } else {
                    host_module_set_param('transport', S.playing ? 'stop' : 'play');
                }
            }
        }
    }

    /* Record button (CC 86): toggle arm/disarm */
    /* Shift+Record: Live Merge arm/stop (moved off Sample — Sample is now
     * bake-only, Capture is capture-only). View decides the scope:
     *   Session View → classic all-8-tracks capture; destination scene row
     *     picked post-stop via the placement dialog.
     *   Track View   → SINGLE-CLIP merge: only the active track's output is
     *     captured (DSP merge_arm "tN" solo mode) and on stop it commits
     *     straight into that track's focused clip — no placement dialog.
     * Merge state shows on the Record LED (red armed, green capturing). */
    /* Rec (Shift or plain) while the merge count-in is running → CANCEL the
     * merge (nothing is captured; back to idle). Must precede the notice/stop
     * checks below so a mid-count-in press aborts rather than stops. */
    if (d1 === MoveRec && d2 === 127 && S.mergeCountingIn) {
        _cancelMergeCountIn();
        return;
    }
    if (d1 === MoveRec && d2 === 127 && S.shiftHeld) {
        if (S.dspMergeState !== 0) {
            /* Active capture → stop it (finalizes; opens placement). */
            S.pendingDefaultSetParams.push({ key: 'merge_stop', val: '1' });
            /* LED stays green until DSP finalizes at page boundary. */
        } else if (S.mergeNoticePending) {
            /* Notice already up → ignore repeat Shift+Rec. */
        } else if (!S.playing) {
            /* Shift+Rec no longer starts the merge directly — it raises a NOTICE.
             * The user then presses plain Rec to begin the count-in, or Back to
             * cancel. (Live Merge is a stopped-transport op; ignored if playing.) */
            S.mergeNoticePending     = true;
            S.mergeNoticeSingleTrack = S.sessionView ? -1 : S.activeTrack;
            forceRedraw();
        }
        /* else: transport playing + no active merge → ignored (merge is stopped-only) */
        return;
    }
    /* Plain Rec while the Live Merge NOTICE is up → begin the 1-bar count-in.
     * It reuses the record count-in machinery, then starts the transport and
     * captures from the top. */
    if (d1 === MoveRec && d2 === 127 && !S.shiftHeld && S.mergeNoticePending) {
        S.mergeNoticePending = false;
        if (S.playing) {
            /* Transport was started while the notice was up — merge is a
             * stopped-transport op, so just dismiss the notice. */
            forceRedraw();
            return;
        }
        const _bpm = (S.bpmMirror > 0 && isFinite(S.bpmMirror)) ? S.bpmMirror : 120;
        S.mergeCountingIn      = true;
        S.countInBeatStartTick = S.tickCount;
        S.countInQuarterTicks  = Math.round(TICK_HZ * 60 / _bpm);
        const _solo = S.mergeNoticeSingleTrack;
        if (_solo < 0) {
            S.mergeSingleTrack = -1;
            S.pendingDefaultSetParams.push({ key: 'merge_arm', val: '1' });
            showActionPopup('LIVE MERGE', 'Count-in, then', 'capturing all 8.', 'Rec to stop.');
        } else {
            S.mergeSingleTrack = _solo;
            S.pendingDefaultSetParams.push({ key: 'merge_arm', val: 't' + _solo });
            showActionPopup('LIVE MERGE', 'Count-in, then', 'this track.', 'Rec to stop.');
        }
        S.pendingMergeArm     = true;
        S.actionPopupEndTick  = S.tickCount + 280;
        return;
    }
    /* Plain Record while a Live Merge is armed/capturing STOPS the merge
     * (in addition to Play). Without this, only Shift+Record stopped it. */
    if (d1 === MoveRec && d2 === 127 && !S.shiftHeld && S.dspMergeState !== 0) {
        S.pendingDefaultSetParams.push({ key: 'merge_stop', val: '1' });
        return;
    }
    if (d1 === MoveRec && d2 === 127) {
        if (S.recordArmed) {
            if (S.recordCountingIn) {
                /* Record pressed during count-in → cancel queued transport+record */
                disarmRecord();
            } else {
            const _recT  = S.recordArmedTrack >= 0 ? S.recordArmedTrack : S.activeTrack;
            const _recAc = S.trackActiveClip[_recT];
            if (S.clipAdaptiveMode[_recT][_recAc] && !S.recordScheduledStop && S.playing) {
                /* Schedule stop at end of current page */
                const _recDrum = S.trackPadMode[_recT] === PAD_MODE_DRUM;
                const _recStp  = _recDrum ? S.drumCurrentStep[_recT] : S.trackCurrentStep[_recT];
                S.recordScheduledStop       = true;
                S.recordScheduledStopTarget = (Math.floor(_recStp / 16) + 1) * 16;
            } else {
                disarmRecord();
            }
            } /* end else (not counting in) */
        } else {
            /* Arming path. First gate: refuse if the active clip / lane is
             * playing in any non-Forward direction. Recording into Bwd / PPf /
             * PPb is confusing because the visual playhead is captured but
             * next-loop semantics fire the note at a shifted position. RvSt
             * (Step/Audio) is only meaningful during reverse motion, so it's
             * a no-op when Dir=Fwd and doesn't need to gate recording. */
            const _at = S.activeTrack;
            const _aac = S.trackActiveClip[_at];
            const _aIsDrum = S.trackPadMode[_at] === PAD_MODE_DRUM;
            const _apd = _aIsDrum
                ? (S.drumLanePlaybackDir[_at][S.activeDrumLane[_at]] | 0)
                : (S.clipPlaybackDir[_at][_aac] | 0);
            if (_apd !== 0) {
                S.recordBlockedDialog    = true;
                S.recordBlockedDialogSel = 0;  /* default OK */
                forceRedraw();
            } else if (!S.playing) {
            /* Stopped → DSP-side 1-bar count-in; transport+recording fire from render thread */
            /* MIDI-handler context: get_param is null here — use the tick-
             * maintained mirror (audit js-input-3). */
            const bpm = (S.bpmMirror > 0 && isFinite(S.bpmMirror)) ? S.bpmMirror : 120;
            S.recordArmed         = true;
            S.recordCountingIn    = true;
            S.recordArmedTrack    = S.activeTrack;
            S.countInStartTick    = S.tickCount;
            S.countInBeatStartTick = S.tickCount;
            S.countInQuarterTicks = Math.round(TICK_HZ * 60 / bpm);
            S.pendingPrerollNotes       = [];
            S.pendingPrerollToggleQueue = [];
            host_module_set_param('record_count_in', String(S.activeTrack));
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            setButtonLED(MoveRec, Red);
            /* Adaptive mode: entered when count-in finishes (transport start edge in tick) */
        } else {
            /* Playing → arm with no count-in. Two paths by mode:
             *   Adaptive (empty clip + length not manually set): defer DSP
             *     recording=1 to next bar boundary AND reset playhead to
             *     loop_start at fire time (next page becomes new step 0,
             *     avoiding an empty leading page). Record LED blinks until
             *     DSP fires. JS sends recording=2.
             *   Fixed (clip exists / length locked): record immediately at
             *     the current step — the existing clip grid is the meaningful
             *     frame. JS sends recording=1 (legacy). No blink. */
            const _at = S.activeTrack, _ac = S.trackActiveClip[_at];
            const _isDrum = S.trackPadMode[_at] === PAD_MODE_DRUM;
            const _adaptive = _isDrum
                ? (!S.drumClipNonEmpty[_at][_ac] && !S.drumLaneLengthManuallySet[_at])
                : (!S.clipNonEmpty[_at][_ac] && !S.clipLengthManuallySet[_at][_ac]);
            S.recordArmed       = true;
            S.recordCountingIn  = false;
            S.recordArmedTrack  = _at;
            S.recordPendingPage = _adaptive;
            if (_adaptive) S.clipAdaptiveMode[_at][_ac] = true;
            setButtonLED(MoveRec, Red);
            host_module_set_param('t' + _at + '_recording', _adaptive ? '2' : '1');
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        }
        } /* end arming else (direction-gated) */
    }

    /* Sample press (no modifier): track held state; cancel dialogs/merge immediately on press */
    if (d1 === MoveSample && d2 === 127 && !S.shiftHeld) {
        S.sampleHeld           = true;
        S.sampleUsedAsModifier = false;
        if (S.confirmBakeScene) {
            S.confirmBakeScene     = false;
            S.sampleUsedAsModifier = true;
            forceRedraw();
        } else if (S.confirmBake) {
            S.confirmBake             = false;
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBakeWrapPhase    = false;
            S.sampleUsedAsModifier    = true;
            forceRedraw();
        }
    }
    /* Sample release (no modifier): BAKE — clip-bake confirm (Track View) or
     * scene-bake picker (Session View). Moved here off Capture, which is now
     * capture-only; Live Merge moved to Shift+Record. Sample-held + scene row
     * still opens scene bake directly (Sample is also a modifier — flagged
     * via sampleUsedAsModifier). */
    if (d1 === MoveSample && d2 === 0 && !S.shiftHeld) {
        S.sampleHeld = false;
        if (!S.sampleUsedAsModifier) {
            if (S.sessionView) {
                S.pendingSceneBakePicker = true;
                S.screenDirty = true;
            } else {
                const _bt = S.activeTrack, _bc = S.trackActiveClip[_bt];
                const _isDrum = S.trackPadMode[_bt] === PAD_MODE_DRUM;
                S.confirmBake             = true;
                S.confirmBakeIsDrum       = _isDrum;
                S.confirmBakeIsMultiLoop  = !_isDrum;
                S.confirmBakeSel          = _isDrum ? 2 : 1;
                S.confirmBakeTrack        = _bt;
                S.confirmBakeClip         = _bc;
                S.confirmBakeDrumLoopOpen = false;
                S.confirmBakeWrapPhase    = false;
                S.screenDirty             = true;
            }
        }
    }

    /* Mute button: Delete+Mute = clear all (both views); toggle mute/solo on active track (Track View only).
     * Press: handle Delete+Mute immediately. Release: toggle mute/solo, but only if Mute was not used as
     * a modifier key (e.g. Mute+Play = metro toggle).
     * Skipped entirely during Schwung chain-edit co-run — Mute is ceded to the host as the slot-bypass
     * modifier there (see the MoveMute press tracker above). */
    if (d1 === MoveMute && d2 === 127) {
        if (S.deleteHeld) {
            if (!S.sessionView && S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
                /* Delete+Mute in drum track view: clear all drum lane mute/solo */
                S.drumLaneMute[S.activeTrack] = 0;
                S.drumLaneSolo[S.activeTrack] = 0;
                host_module_set_param('t' + S.activeTrack + '_drum_mute_all_clear', '1');
                S.muteUsedAsModifier = true;
                forceRedraw();
            } else {
                clearAllMuteSolo();
            }
        }
    }
    if (d1 === MoveMute && d2 === 0) {
        if (!S.muteUsedAsModifier && !S.deleteHeld && !S.sessionView) {
            if (S.shiftHeld) setTrackSolo(S.activeTrack, !S.trackSoloed[S.activeTrack]);
            else           setTrackMute(S.activeTrack, !S.trackMuted[S.activeTrack]);
        }
    }

    /* Left/Right: page nav in Track View — clamp to the loop window so
     * step-edit nav never lands on a page that won't play. */
    if ((d1 === MoveLeft || d1 === MoveRight) && d2 === 127 && !S.sessionView) {
        var _t_lr = S.activeTrack;
        if (S.loopHeld && S.activeBank === 6) {
            var RES_TPS = [12, 24, 48, 96, 384];
            var _ac_lr = effectiveClip(_t_lr);
            var _ccL_lr = S.ccActiveLane[_t_lr];
            var _dispTpsLr = S.ccLaneTps[_t_lr][_ac_lr][_ccL_lr] || (S.clipTPS[_t_lr][_ac_lr] || 24);
            var _curTps = S.ccLaneResTps[_t_lr][_ac_lr][_ccL_lr] || _dispTpsLr;
            var _ci = RES_TPS.indexOf(_curTps);
            if (_ci < 0) _ci = 1;
            if (d1 === MoveLeft && _ci > 0) _ci--;
            else if (d1 === MoveRight && _ci < RES_TPS.length - 1) _ci++;
            S.ccLaneResTps[_t_lr][_ac_lr][_ccL_lr] = RES_TPS[_ci];
            host_module_set_param('t' + _t_lr + '_c' + _ac_lr + '_k' + _ccL_lr + '_cc_lane_res_tps',
                                  String(RES_TPS[_ci]));
            forceRedraw();
            return;
        }
        if (S.trackPadMode[_t_lr] === PAD_MODE_DRUM && S.activeBank !== 6) {
            var lsBase = S.drumLaneLoopStart[_t_lr] | 0;
            var startPage = lsBase >> 4;
            var lastPage  = startPage + Math.max(1, Math.ceil(S.drumLaneLength[_t_lr] / 16)) - 1;
            if (d1 === MoveLeft)
                S.drumStepPage[_t_lr] = Math.max(startPage, S.drumStepPage[_t_lr] - 1);
            else
                S.drumStepPage[_t_lr] = Math.min(lastPage, S.drumStepPage[_t_lr] + 1);
        } else {
            var ac = effectiveClip(_t_lr);
            var lsBase, startPage, lastPage;
            if (S.activeBank === 6) {
                var _ccL2 = S.ccActiveLane[_t_lr];
                var _llen = S.ccLaneLength[_t_lr][ac][_ccL2];
                if (_llen > 0) {
                    lsBase = S.ccLaneLoopStart[_t_lr][ac][_ccL2] | 0;
                    startPage = lsBase >> 4;
                    lastPage = startPage + Math.max(1, Math.ceil(_llen / 16)) - 1;
                }
            }
            if (lastPage === undefined) {
                lsBase = S.clipLoopStart[_t_lr][ac] | 0;
                startPage = lsBase >> 4;
                lastPage = startPage + Math.max(1, Math.ceil(S.clipLength[_t_lr][ac] / 16)) - 1;
            }
            if (d1 === MoveLeft)
                S.trackCurrentPage[_t_lr] = Math.max(startPage, S.trackCurrentPage[_t_lr] - 1);
            else
                S.trackCurrentPage[_t_lr] = Math.min(lastPage, S.trackCurrentPage[_t_lr] + 1);
        }
        /* Manual navigation disables SeqFollow so the view stays where the user navigated */
        const _sfAc = effectiveClip(S.activeTrack);
        if (S.clipSeqFollow[S.activeTrack][_sfAc]) {
            S.clipSeqFollow[S.activeTrack][_sfAc] = false;
            S.bankParams[S.activeTrack][0][7] = 0;
        }
        S.screenDirty = true;
    }

    /* Up/Down: scene group nav in Session View or while overview held; octave shift in Track View */
    if (d1 === MoveDown && d2 === 127 && (S.sessionView || S.sessionOverlayHeld) && S.sceneRow < NUM_CLIPS - 4) { S.sceneRow = Math.min(NUM_CLIPS - 4, S.sceneRow + 1); forceRedraw(); }
    if (d1 === MoveUp   && d2 === 127 && (S.sessionView || S.sessionOverlayHeld) && S.sceneRow > 0)              { S.sceneRow = Math.max(0, S.sceneRow - 1);              forceRedraw(); }
    if ((d1 === MoveUp || d1 === MoveDown) && d2 > 0 && !S.sessionView && !S.sessionOverlayHeld &&
            S.loopHeld && S.activeBank === 6) {
        var RES_TPS = [12, 24, 48, 96, 384];
        var _zt = S.activeTrack, _zac = effectiveClip(_zt), _zL = S.ccActiveLane[_zt];
        var _zOldTps = S.ccLaneTps[_zt][_zac][_zL] || (S.clipTPS[_zt][_zac] || 24);
        var _zci = RES_TPS.indexOf(_zOldTps);
        if (_zci < 0) _zci = 1;
        if (d1 === MoveDown && _zci > 0) _zci--;
        else if (d1 === MoveUp && _zci < RES_TPS.length - 1) _zci++;
        var _zNewTps = RES_TPS[_zci];
        if (_zNewTps !== _zOldTps) {
            var _zOldLen = S.ccLaneLength[_zt][_zac][_zL] || S.clipLength[_zt][_zac];
            var _zOldTicks = _zOldLen * _zOldTps;
            var _zNewLen = Math.ceil(_zOldTicks / _zNewTps);
            if (_zNewLen <= 256) {
                S.ccLaneTps[_zt][_zac][_zL] = _zNewTps;
                S.ccLaneLength[_zt][_zac][_zL] = _zNewLen;
                var _zOldRes = S.ccLaneResTps[_zt][_zac][_zL];
                if (_zOldRes > 0) {
                    var _zNewRes = Math.round(_zOldRes * _zNewTps / _zOldTps);
                    var _zResValid = RES_TPS.indexOf(_zNewRes) >= 0;
                    S.ccLaneResTps[_zt][_zac][_zL] = _zResValid ? _zNewRes : 0;
                }
                var _zPre = 't' + _zt + '_c' + _zac + '_k' + _zL;
                S.pendingDefaultSetParams.push({ key: _zPre + '_cc_lane_tps', val: String(_zNewTps) });
                S.pendingDefaultSetParams.push({ key: _zPre + '_cc_loop_set',
                    val: String(((S.ccLaneLoopStart[_zt][_zac][_zL] | 0) << 16) | (_zNewLen & 0xFFFF)) });
                if (_zOldRes > 0)
                    S.pendingDefaultSetParams.push({ key: _zPre + '_cc_lane_res_tps',
                        val: String(S.ccLaneResTps[_zt][_zac][_zL]) });
                var _zMaxPage = Math.max(0, Math.ceil(_zNewLen / 16) - 1);
                if (S.trackCurrentPage[_zt] > _zMaxPage) S.trackCurrentPage[_zt] = _zMaxPage;
                forceRedraw();
            }
        }
        return;
    }
    if (d1 === MoveUp   && d2 > 0 && !S.sessionView && !S.sessionOverlayHeld) {
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
            setDrumLanePage(S.activeTrack, 1);
            syncDrumLanesMeta(S.activeTrack);
            syncDrumLaneSteps(S.activeTrack, S.activeDrumLane[S.activeTrack]);
            computePadNoteMap();  /* PHASE-1: drum page change shifts lane mapping; re-push */
            forceRedraw();
        } else {
        for (const p of S.liveActiveNotes) queueLiveNoteOff(S.activeTrack, p);
        S.liveActiveNotes.clear();
        S.trackOctave[S.activeTrack] = Math.min(4, S.trackOctave[S.activeTrack] + 1);
        computePadNoteMap();  /* PHASE-1: re-bake octave offset into DSP padmap */
        S.screenDirty = true;
        if (S.heldStep >= 0) forceRedraw();
        }
    }
    if (d1 === MoveDown && d2 > 0 && !S.sessionView && !S.sessionOverlayHeld) {
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
            setDrumLanePage(S.activeTrack, 0);
            syncDrumLanesMeta(S.activeTrack);
            syncDrumLaneSteps(S.activeTrack, S.activeDrumLane[S.activeTrack]);
            computePadNoteMap();  /* PHASE-1: drum page change shifts lane mapping; re-push */
            forceRedraw();
        } else {
        for (const p of S.liveActiveNotes) queueLiveNoteOff(S.activeTrack, p);
        S.liveActiveNotes.clear();
        S.trackOctave[S.activeTrack] = Math.max(-4, S.trackOctave[S.activeTrack] - 1);
        computePadNoteMap();  /* PHASE-1: re-bake octave offset into DSP padmap */
        S.screenDirty = true;
        if (S.heldStep >= 0) forceRedraw();
        }
    }

}

function _onCC_side(d1, d2) {
    /* Track buttons CC40-43 */
    if (d1 >= 40 && d1 <= 43 && d2 === 127) {
        const idx     = d1 - 40;
        const clipIdx = S.sceneRow + (3 - idx);
        /* Scene-bake picker (set by Session-View Capture tap): row press selects
         * the scene to bake and goes straight to the scene-bake confirm dialog.
         * Picker is consumed before any other gesture so it doesn't double-fire. */
        if (S.pendingSceneBakePicker) {
            S.pendingSceneBakePicker    = false;
            S.confirmBakeScene          = true;
            S.confirmBakeSceneWrapPhase = false;
            S.confirmBakeSceneCondPhase = false;
            S.confirmBakeSceneSel       = 1;
            S.confirmBakeSceneClip      = clipIdx;
            S.screenDirty               = true;
            return;
        }
        /* Multi-track live merge placement: post-stop, row press picks
         * destination row and commits captured clips (per-track skip when
         * no notes captured — preserves existing clips on those tracks). */
        if (S.pendingMergePlacement) {
            S.pendingMergePlacement = false;
            S.mergePlacing      = true;      /* show "Placing…" until DSP → IDLE */
            S.mergePlacingScene = true;
            S.pendingDefaultSetParams.push({ key: 'merge_place_row', val: String(clipIdx) });
            S.screenDirty = true;
            return;
        }
        if (S.copyHeld) {
            if (S.copySrc && (S.copySrc.kind === 'step' || S.copySrc.kind === 'cut_step')) {
                /* step copy/cut in progress: swallow track/scene buttons — don't mix copy types */
            } else if (S.sessionView) {
                /* Copy/Cut: row-to-row gesture */
                if (!S.copySrc) {
                    S.copySrc = S.shiftHeld
                        ? { kind: 'cut_row', row: clipIdx }
                        : { kind: 'row', row: clipIdx };
                    invalidateLEDCache();
                    showActionPopup(S.shiftHeld ? 'CUT' : 'COPIED');
                } else if (S.copySrc.kind === 'row') {
                    copyRow(S.copySrc.row, clipIdx);
                    invalidateLEDCache();
                    forceRedraw();
                    showActionPopup('PASTED');
                } else if (S.copySrc.kind === 'cut_row') {
                    cutRow(S.copySrc.row, clipIdx);
                    S.copySrc = { kind: 'row', row: clipIdx };
                    invalidateLEDCache();
                    forceRedraw();
                    showActionPopup('PASTED');
                }
                /* clip/cut_clip kinds: swallow — don't mix copy types */
            } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
                /* Track View drum clip copy/cut via track button */
                if (!S.copySrc) {
                    S.copySrc = S.shiftHeld
                        ? { kind: 'cut_drum_clip', track: S.activeTrack, clip: clipIdx }
                        : { kind: 'drum_clip',     track: S.activeTrack, clip: clipIdx };
                    invalidateLEDCache();
                    showActionPopup(S.shiftHeld ? 'CUT' : 'COPIED');
                } else if (S.copySrc.kind === 'drum_clip') {
                    copyDrumClip(S.copySrc.track, S.copySrc.clip, S.activeTrack, clipIdx);
                    invalidateLEDCache();
                    forceRedraw();
                    showActionPopup('PASTED');
                } else if (S.copySrc.kind === 'cut_drum_clip') {
                    cutDrumClip(S.copySrc.track, S.copySrc.clip, S.activeTrack, clipIdx);
                    S.copySrc = { kind: 'drum_clip', track: S.activeTrack, clip: clipIdx };
                    invalidateLEDCache();
                    forceRedraw();
                    showActionPopup('PASTED');
                }
                /* Other kinds: swallow — don't mix copy types */
            } else {
                /* Track View melodic clip copy/cut via track button */
                if (!S.copySrc) {
                    S.copySrc = S.shiftHeld
                        ? { kind: 'cut_clip', track: S.activeTrack, clip: clipIdx }
                        : { kind: 'clip', track: S.activeTrack, clip: clipIdx };
                    invalidateLEDCache();
                    showActionPopup(S.shiftHeld ? 'CUT' : 'COPIED');
                } else if (S.copySrc.kind === 'clip') {
                    copyClip(S.copySrc.track, S.copySrc.clip, S.activeTrack, clipIdx);
                    invalidateLEDCache();
                    forceRedraw();
                    showActionPopup('PASTED');
                } else if (S.copySrc.kind === 'cut_clip') {
                    cutClip(S.copySrc.track, S.copySrc.clip, S.activeTrack, clipIdx);
                    S.copySrc = { kind: 'clip', track: S.activeTrack, clip: clipIdx };
                    invalidateLEDCache();
                    forceRedraw();
                    showActionPopup('PASTED');
                }
                /* row/cut_row kinds: swallow — don't mix copy types */
            }
        } else if (S.shiftHeld && S.deleteHeld) {
            if (S.sessionView) {
                /* Shift+Delete+scene row (Session View): hard reset all 8 clips in row */
                for (let t = 0; t < NUM_TRACKS; t++) hardResetClip(t, clipIdx);
                forceRedraw();
                showActionPopup('CLIPS', 'CLEARED');
            } else {
                /* Shift+Delete+clip (Track View): full factory reset */
                hardResetClip(S.activeTrack, clipIdx);
                forceRedraw();
                showActionPopup('CLIP', 'CLEARED');
            }
        } else if (S.deleteHeld) {
            if (S.sessionView) {
                /* Delete + scene row button (Session View): clear all 8 clips in that row */
                clearRow(clipIdx);
                forceRedraw();
                showActionPopup('SEQUENCES', 'CLEARED');
            } else {
                /* Delete + track button (Track View): clear the clip; keep S.playing if it's currently active */
                clearClip(S.activeTrack, clipIdx, true);
                forceRedraw();
                showActionPopup('SEQUENCE', 'CLEARED');
            }
        } else if (S.captureHeld) {
            /* Capture + scene row: copy each track's currently *playing* or
             * *queued* clip into this row. Inactive/focused-but-not-playing
             * clips are skipped — only what's actually live participates in
             * the capture. Mark Capture as consumed so the upcoming release
             * doesn't open the
             * scene-bake picker. */
            S.captureUsedAsModifier = true;
            let scooped = 0;
            for (let t = 0; t < NUM_TRACKS; t++) {
                /* Only tracks whose active clip is *playing* (sequencer running)
                 * OR is currently queued contribute to the scene capture.
                 * Inactive/focused-but-silent tracks don't paint into the row. */
                const isLive = (S.trackClipPlaying[t] && S.trackActiveClip[t] !== clipIdx)
                            || (S.trackQueuedClip[t] >= 0 && S.trackQueuedClip[t] !== clipIdx);
                if (!isLive) continue;
                const srcC = S.trackQueuedClip[t] >= 0 ? S.trackQueuedClip[t] : S.trackActiveClip[t];
                if (srcC === clipIdx) continue;
                if (!trackClipHasContent(t, srcC)) continue;
                if (S.trackPadMode[t] === PAD_MODE_DRUM) {
                    copyDrumClip(t, srcC, t, clipIdx);
                } else {
                    copyClip(t, srcC, t, clipIdx);
                }
                scooped++;
            }
            invalidateLEDCache();
            forceRedraw();
            if (scooped > 0) showActionPopup('CAPTURED', 'TO ROW ' + (clipIdx + 1));
            else             showActionPopup('NOTHING', 'TO CAPTURE');
        } else if (S.sessionView) {
            S.sceneBtnFlashTick[idx] = S.tickCount;
            /* Shift+side-button forces next-bar boundary launch regardless of
             * global launch_quant. Plain press honors launch_quant as before. */
            const _scKey = S.shiftHeld ? 'launch_scene_quant' : 'launch_scene';
            S.pendingDefaultSetParams.push({ key: _scKey, val: String(clipIdx) });
        } else {
            const t            = S.activeTrack;
            const isActiveClip = S.trackActiveClip[t] === clipIdx;
            if (S.trackClipPlaying[t] && isActiveClip) {
                if (S.trackPendingPageStop[t]) {
                    /* Pending stop → cancel by re-launching legato */
                    host_module_set_param('t' + t + '_launch_clip', String(clipIdx));
                } else {
                    /* Playing → arm stop at next page boundary */
                    host_module_set_param('t' + t + '_stop_at_end', '1');
                }
            } else if (S.trackWillRelaunch[t] && isActiveClip) {
                /* Transport stopped, clip primed to restart → cancel */
                host_module_set_param('t' + t + '_deactivate', '1');
            } else if (S.trackQueuedClip[t] === clipIdx) {
                /* Queued to launch → cancel */
                host_module_set_param('t' + t + '_deactivate', '1');
            } else {
                /* Focus immediately so pads/OLED show the selected clip even
                 * while the prior clip is still playing toward its legato
                 * switch boundary. pollDSP will keep trackActiveClip in sync
                 * when DSP actually crosses the boundary.
                 * Page snaps to the page containing the clip's loop_start so
                 * a clip with a non-zero loop window doesn't briefly render
                 * its OOB region on select. Drum tracks: leave at 0 (drum
                 * loop_start is per-lane and refreshed by pendingDrumResync). */
                S.trackActiveClip[t]  = clipIdx;
                S.trackCurrentPage[t] = S.trackPadMode[t] === PAD_MODE_DRUM
                    ? 0
                    : Math.floor((S.clipLoopStart[t][clipIdx] | 0) / 16);
                refreshPerClipBankParams(t);
                if (S.trackPadMode[t] === PAD_MODE_DRUM) {
                    S.pendingDrumResync      = 2;
                    S.pendingDrumResyncTrack = t;
                }
                host_module_set_param('t' + t + '_launch_clip', String(clipIdx));
            }
        }
    }

}

/* ---- Unified knob response (2026-08-26 — matched to the generated canvas) ----
 *
 * Josh: "the generated canvas ui knobs feel perfect. i want that." So this is a
 * port of the host's own `src/shared/knob_engine.mjs`, not a fresh curve.
 *
 * ⚠⚠ THE PREMISE THE OLD CURVE WAS BUILT ON WAS FALSE AT THIS LAYER. Its comment
 * read: "The Move knobs fire ~2-4 ±1 detent messages per physical click at
 * ~8-35ms apart, so timing can't tell slow from fast." That describes the RAW
 * HARDWARE STREAM. It is not what a tool receives. shadow_ui BATCHES encoder
 * CCs and flushes ONE synthetic message per knob per frame, with the summed
 * detent count in the value — its own comment says so: "Modules using
 * decodeDelta() will get direction; modules reading the raw value get the
 * magnitude for acceleration" (shadow_ui.js, overtake flush).
 *
 * So `ccKnobDelta()` read the SIGN of an already-summed batch and threw the sum
 * away. Spin fast enough to land six detents in one frame and dAVEBOx saw "one
 * event, clockwise" — which is precisely the "slow as hell" Josh reported, and
 * why the generated editors (which DO read the magnitude) feel different on the
 * same hardware. Measured 2026-08-26, one fast flick of knob 3: 48% of detents
 * carried more than 1, up to ±6.
 *
 * Because the delivery is one call per knob per FRAME, the engine's divisor
 * curve transfers directly — same cadence it was tuned against. The rule:
 *
 *   first motion after idle (or a gap > KNOB_STALE_MS) → divisor 1
 *       an immediate ±1 "click", so a single detent still dials exactly.
 *   gap > KNOB_ACCEL_MED_MS  → divisor 16   (fine)
 *   gap > KNOB_ACCEL_FAST_MS → divisor 8
 *   otherwise                → divisor 4    (sweep)
 *
 * Accumulate the signed MAGNITUDE, emit whole units of the divisor, keep the
 * remainder. The accumulator must drain before reversing — that is the engine's
 * anti-jitter behaviour, and Math.trunc (toward zero) preserves it in both
 * directions.
 *
 * Three classes, one feel each:
 *  'cont'  — continuous values: the divisor curve above.
 *  'pick'  — discrete options (enums, octaves, small counts): a FIXED divisor,
 *            never accelerated, so a binary toggle and a 47-option picker feel
 *            the same. KNOB_PICK matches the engine's enum divisor exactly.
 *  'delib' — toggles, one-shot actions, destructive things: the same fixed-
 *            divisor accumulator at KNOB_DELIB, so an accidental brush cannot
 *            fire. Deliberately 2x 'pick'; it has no canvas counterpart.
 * Every knob site routes through ccKnobDelta or knobPick — no private
 * thresholds. */
const KNOB_ACCEL_FAST_MS = 50;    /* pinned against src/shared/knob_engine.mjs */
const KNOB_ACCEL_MED_MS  = 150;
const KNOB_STALE_MS      = 2000;
export const KNOB_PICK = 10, KNOB_DELIB = 20;

/* Gap-based divisor, per knob. Mirrors knob_engine.mjs::tickDivisor, including
 * its self-reset: a long pause makes the next turn a cold start rather than the
 * continuation of a stale curve. */
function knobDivisor(k, now) {
    const last = S.knobAccelLast[k] || 0;
    if (last === 0) return 1;
    const gap = now > last ? now - last : 0;
    if (gap > KNOB_STALE_MS) { S.knobAccelLast[k] = 0; S.knobAccelAcc[k] = 0; return 1; }
    if (gap > KNOB_ACCEL_MED_MS)  return 16;
    if (gap > KNOB_ACCEL_FAST_MS) return 8;
    return 4;
}

/* Fixed-divisor accumulator for the discrete classes. Takes the batch MAGNITUDE
 * like ccKnobDelta, so a fast spin pages through options at the speed of the
 * turn while a slow one still needs `need` detents per step. */
function knobPick(k, dir, need) {
    if (!dir) return 0;
    if ((dir > 0) !== (S.knobLastDir[k] > 0)) { S.knobAccum[k] = 0; S.knobLastDir[k] = dir > 0 ? 1 : -1; }
    S.knobAccum[k] += dir;
    const steps = Math.trunc(S.knobAccum[k] / need);
    if (steps === 0) return 0;
    S.knobAccum[k] -= steps * need;
    return steps;
}

/* ONE discrete step per fire, at a rate that respects the batch magnitude.
 *
 * The shape 20 knob sites had hand-rolled, each with its own copy:
 *
 *     const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;   // SIGN ONLY
 *     S.knobAccum[knobIdx]++;                       // one per FRAME
 *     if (S.knobAccum[knobIdx] >= NEED) { S.knobAccum[knobIdx] = 0; ... }
 *
 * Both halves are wrong for the same reason the bank knobs were: a tool receives
 * ONE batched message per knob per frame carrying the frame's whole detent
 * count, so counting frames throws the spin speed away. Those 20 sites paged at
 * a fixed rate however fast you turned, and they spanned conductor, melodic AND
 * drum banks -- this was never a drum problem, it was an "every branch invents
 * its own feel" problem (Josh, 2026-08-26: "there's nothing special about the
 * patterns in those banks that should require special treatment").
 *
 * ⭑ The return is CLAMPED to a single step deliberately. These are discrete,
 * one-shot and destructive controls -- a confirm dialog, a bool toggle, a DSP
 * key that takes a ±1 DIRECTION rather than an amount. Making them faster must
 * not make them fire twice or skip an option, so the magnitude speeds up HOW
 * OFTEN a step fires, never how big it is. Params that genuinely want a
 * proportional jump use ccKnobDelta instead.
 *
 * The sign always matches the caller's own `dir`, so a body written against
 * `dir` keeps working untouched -- which is what made converting 20 sites a
 * mechanical change rather than 20 judgement calls. */
function knobStep(k, d2, need) {
    const steps = knobPick(k, decodeDelta(d2), need);
    return steps === 0 ? 0 : (steps > 0 ? 1 : -1);
}

/* BANKS knobDef -> response class (generic bank path). */
const KNOB_PICK_FMTS = [fmtRes, fmtDiq, fmtPlayDir, fmtLen, fmtGateMod,
                        fmtDly, fmtArpStyle, fmtArpRate, fmtArpSteps, fmtArpOct];
function knobClass(pm) {
    if (pm.lock || pm.scope === 'action' || pm.fmt === fmtBool) return 'delib';
    if (KNOB_PICK_FMTS.indexOf(pm.fmt) >= 0 || (pm.max - pm.min) <= 16) return 'pick';
    return 'cont';
}

/* ---- Drum NOTE FX (bank 1): the DECLARATIVE half ----------------------------
 *
 * The drum flavour of NOTE FX edits the SAME eight params as the melodic one and
 * writes them to the active LANE instead of the track. That difference is the
 * only thing that was ever special about it — Josh, 2026-08-26: "there's nothing
 * special about the patterns in those banks that should require special
 * treatment." He was right, and this is that claim expressed in code.
 *
 * Each entry says WHERE the value lives; everything else — range, response class,
 * accumulation, scaling, clamping — is read from `BANKS[1].knobs[i]`, the exact
 * metadata the melodic path uses. So the two cannot drift again: there is no
 * second copy of the range to fall out of step, and no second choice of feel.
 *
 * ⚠ That drift is not hypothetical. Both of Josh's drum knob reports came from
 * it — first the whole branch ran unscaled while melodic ran scaled, then its
 * hardcoded clamps sat beside a metadata copy of the same numbers.
 *
 * `get`/`set` stay per-entry because the JS-side mirrors genuinely differ (some
 * params shadow into bankParams, some into a per-lane array, Qnt into both).
 * Those are STORAGE, not feel, which is exactly the split worth making. */
const drumPfx = (t, lane, name, v) =>
    host_module_set_param('t' + t + '_l' + lane + '_pfx_set', name + ' ' + v);

export const DRUM_NOTEFX_SITES = {
    2: { pfx: 'velocity_offset', meta: () => BANKS[1].knobs[2],
         get: (t, lane) => S.bankParams[t][1][1] | 0,
         set: (t, lane, v) => { S.bankParams[t][1][1] = v; drumPfx(t, lane, 'velocity_offset', v); } },
    3: { pfx: 'quantize', meta: () => BANKS[1].knobs[3],
         get: (t, lane) => S.drumLaneQnt[t] | 0,
         set: (t, lane, v) => { S.drumLaneQnt[t] = v; S.bankParams[t][1][2] = v;
                                drumPfx(t, lane, 'quantize', v); } },
    4: { pfx: 'note_length_mode', meta: () => BANKS[1].knobs[4],
         get: (t, lane) => S.drumLaneLenMode[t][lane] | 0,
         set: (t, lane, v) => { S.drumLaneLenMode[t][lane] = v;
                                drumPfx(t, lane, 'note_length_mode', v); } },
    5: { pfx: 'gate_time', meta: () => BANKS[1].knobs[5],
         get: (t, lane) => S.bankParams[t][1][0] | 0,
         set: (t, lane, v) => { S.bankParams[t][1][0] = v; drumPfx(t, lane, 'gate_time', v); } },
};

/* ---- The remaining PURE sites, by bank ---------------------------------------
 *
 * ⚠ These banks publish STUB metadata on purpose (`_X`, `_XR`, `_XQ` in
 * BANKS[0]/BANKS[7]): their labels and their "unset" defaults are drawn by
 * custom render branches, so there is no real range to inherit the way the drum
 * NOTE FX table inherits BANKS[1]. The range is therefore DECLARED here, and
 * this table is its only home — not a second copy of something the metadata
 * already knows. That distinction is why `meta` is optional on a site.
 *
 * Everything else is identical to the NOTE FX table: storage varies, feel does
 * not. Each `cls` below reproduces exactly what its branch had hand-picked, so
 * this is a move, not a retune. */
export const DRUM_CONFIG_SITES = {          /* ALL LANES bank (drum, bank 7) */
    0: { cls: 'pick', min: 0, max: 5,        /* Res — all-lane resolution */
         get: (t) => S.bankParams[t][7][0] < 0 ? -1 : S.bankParams[t][7][0],
         set: (t, lane, v) => {
             S.bankParams[t][7][0] = v;
             S.drumLaneTPS[t] = TPS_VALUES[v];
             host_module_set_param('t' + t + '_all_lanes_clip_resolution', String(v));
             S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
         } },
    3: { cls: 'cont', min: 0, max: 100,      /* Qnt — quantize all lanes */
         get: (t) => S.bankParams[t][7][3] < 0 ? 0 : S.bankParams[t][7][3],
         set: (t, lane, v) => {
             S.bankParams[t][7][3] = v; S.drumLaneQnt[t] = v; S.bankParams[t][1][2] = v;
             host_module_set_param('t' + t + '_drum_lanes_qnt', String(v));
         } },
    5: { cls: 'pick', min: 0, max: 8,        /* InQ — per-track input quantize */
         get: (t) => S.drumInpQuant[t] | 0,
         set: (t, lane, v) => {
             S.drumInpQuant[t] = v; S.bankParams[t][7][5] = v;
             host_module_set_param('t' + t + '_diq', String(v));
         } },
    7: { cls: 'delib', min: 0, max: 1,       /* SyncRpt — bool, must resist a brush */
         get: (t) => S.bankParams[t][7][7] | 0,
         set: (t, lane, v) => {
             S.bankParams[t][7][7] = v;
             host_module_set_param('t' + t + '_drum_repeat_sync', String(v));
         } },
};

export const DRUM_LANE_SITES = {            /* per-lane drum config bank (bank 0) */
    4: { cls: 'pick', min: 0,                /* Eucl — Bjorklund hit count */
         /* ⭑ A DYNAMIC ceiling: the hit count cannot exceed the lane's length.
          * Supporting a function here is what let this site join the table at
          * all — the alternative was leaving it bespoke over one expression. */
         max: (t) => S.drumLaneLength[t],
         get: (t, lane) => Math.min(S.drumLaneEuclidN[t][lane] | 0, S.drumLaneLength[t]),
         set: (t, lane, v, prev) => {
             /* Needs the PREVIOUS value: the DSP stamps a transition, not a
              * level. That is why the applier hands `set` the old value too. */
             host_module_set_param('t' + t + '_l' + lane + '_euclid_stamp',
                                   prev + ' ' + v + ' ' + stepEntryVelocity(t, -1, true));
             S.drumLaneEuclidN[t][lane] = v;
             S.bankParams[t][0][4] = v;
             S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t;
             S.pendingDrumLaneResyncLane = lane;
         } },
};

/* Melodic CLIP K5 = InQ. The SAME param as DRUM_CONFIG_SITES[5] — same DSP key,
 * same range, same pace — differing only in which mirror the bank overview
 * reads. Declared beside its twin deliberately: this pairing is exactly the
 * shape that drifted on the NOTE FX banks, and a reader who changes one will
 * now see the other. */
export const CLIP_MELODIC_SITES = {
    4: { cls: 'pick', min: 0, max: 8,
         get: (t) => S.drumInpQuant[t] | 0,
         set: (t, lane, v) => {
             S.drumInpQuant[t] = v; S.bankParams[t][0][4] = v;
             host_module_set_param('t' + t + '_diq', String(v));
         } },
};

/* Apply one TABLE-DRIVEN knob turn. Returns true if the knob is in the table, so
 * the caller can `return` — an unknown knob falls through to whatever bespoke
 * branch follows rather than being silently swallowed.
 *
 * A site declares only what genuinely varies:
 *   meta   — () => a BANKS entry, when the bank publishes a real one. Range and
 *            response class then come from there and CANNOT drift from the UI.
 *   cls / min / max — the same three, declared inline, for banks whose metadata
 *            is a deliberate stub (see DRUM_CONFIG_SITES). `max` may be a
 *            function when the ceiling is dynamic.
 *   get/set — where the value lives, and what applying it entails.
 *
 * Everything else — accumulation, magnitude, scaling, deceleration, clamping —
 * happens here, once, for every site. That is the whole point: a branch can
 * choose its storage, never its feel. */
function applyTableKnob(site, knobIdx, d2, t, lane) {
    if (!site) return false;
    const pm  = site.meta ? site.meta() : site;
    const min = typeof pm.min === 'function' ? pm.min(t, lane) : pm.min;
    const max = typeof pm.max === 'function' ? pm.max(t, lane) : pm.max;
    const cls = site.cls || knobClass(pm);
    const step = cls === 'cont'
        ? ccKnobDelta(d2, knobIdx, bankStep({ min, max }))
        : knobStep(knobIdx, d2, cls === 'delib' ? KNOB_DELIB : KNOB_PICK);
    if (step !== 0) {
        const cur = site.get(t, lane);
        const nv  = Math.max(min, Math.min(max, cur + step));
        if (nv !== cur) site.set(t, lane, nv, cur);
        S.screenDirty = true;
    }
    return true;
}

function applyDrumNoteFxKnob(knobIdx, d2, t, lane) {
    return applyTableKnob(DRUM_NOTEFX_SITES[knobIdx], knobIdx, d2, t, lane);
}


/* How much VALUE one detent is worth at full speed, scaled so a sweep costs the
 * same GESTURE whatever the parameter's range — an analog pot's feel, where the
 * distance your fingers travel maps to a proportion of the range rather than to
 * a count of integers (Josh, 2026-08-26).
 *
 * SWEEP_UNITS is the one tunable: the knob units a full-range sweep should cost.
 * 128 is chosen so a 0-127 parameter — the commonest range on the device, and
 * the anchor everything else was tuned against — keeps a step of exactly 1 and
 * feels precisely as it does today. Only WIDER ranges are scaled.
 *
 * ⭑ The host's own hosted-canvas cells already do this (`ui_cells.mjs`:
 * `inc = cell.step || (max - min) / 100`), which is part of why those knobs feel
 * right on wide params and dAVEBOx's did not.
 *
 * ⚠ Floors at 1, never below: a step of 0 would make a knob completely dead.
 *
 * ⚠ pm.step (declared by two params, Quant and Gate) is STILL not read here. It
 * has never been read by anything since the factory gained it, so honouring it
 * now would silently change two params on the strength of a declaration nobody
 * has ever felt. Left as its own decision. */
/* SWEEP_UNITS — the ONE tunable, and now it means something you can measure:
 * a full min-to-max sweep costs about this many encoder counts at normal turning
 * speed. Lower = faster knobs, everywhere.
 *
 * ⚠⚠ Move's encoder sends SEVERAL COUNTS PER PHYSICAL CLICK — measured
 * 2026-08-26, ~2800 counts from a few seconds of flicking one knob, far more
 * than that knob has detents. That is why the first cut felt slow: it treated a
 * count as a click, so 0-127 cost ~508 counts (roughly four revolutions) at full
 * speed. Josh: "i can't do the full travel without breaking my wrist... and i'm
 * testing with delay level, which is only 0-127."
 *
 * The MEASURED canvas figure is 80 — see below. It ships at 100: Josh, having
 * felt 80, asked for "a tad slower", and the same move shrinks the fast-spin
 * leap (a 0-127 param steps +9/+10 at 80, +7/+8 at 100) because both are the
 * same quantity — value-per-count. Slower and smoother are not a trade here.
 *
 * 80 is MEASURED FROM THE THING WE ARE MIMICKING, not guessed. A canvas float
 * param (freeverb room_size: min 0, max 1, step 0.05) is 20 steps across its
 * range, and knob_engine moves step/divisor per count — so a full canvas sweep
 * costs 20 x 4 = 80 counts. dAVEBOx's delay level (0-127, one value per 4
 * counts) was costing 508. That 6x IS the difference Josh could feel.
 *
 * ⭑ This is also what makes the range irrelevant to the FEEL, which is what he
 * asked for: a 0-5 param and a 0-400 param both cross in the same gesture,
 * because the value each count buys is derived from the range rather than being
 * a fixed 1. */
/* SWEEP_UNITS now lives in ui_engine.mjs (imported above) so the TESTS can read
 * the live value instead of hard-coding it. Tuning it must stay a ONE-NUMBER
 * change — Josh, 2026-08-26: "i just want to make sure that we can fine tune
 * knobs that use the general rules without it turning into a big thing." */

/* The divisor the curve uses at normal turning speed. Everything is expressed
 * RELATIVE to it: at speed a count is worth a full unit, and easing off into
 * divisor 8 or 16 makes each count worth a half or a quarter of that. Without
 * this normalisation the fast band was itself divided by 4, which is precisely
 * the four-revolution sweep above. */
const KNOB_FAST_DIVISOR = 4;

/* Value one encoder count buys at normal speed. Deliberately FRACTIONAL — a
 * narrow param is worth a fraction of a value per count, and the accumulator in
 * ccKnobDelta carries the remainder so nothing is lost. Flooring this at 1 (the
 * first cut did) is what pinned narrow params to one-value-per-count and made
 * the feel range-dependent again. */
function bankStep(pm) {
    const range = Math.abs(pm.max - pm.min);
    if (!(range > 0)) return 1;
    return range / SWEEP_UNITS;
}

function ccKnobDelta(d2, k, stepScale) {
    /* decodeDelta, NOT a sign test: the value carries the whole frame's detent
     * count and discarding it is the bug this replaced. */
    const dir = decodeDelta(d2);
    if (!dir) return 0;
    const now = Date.now();
    const div = knobDivisor(k, now);
    S.knobAccelLast[k] = now;

    /* ---- DECELERATION, which is the actual ask ----
     * A wide param needs a big step to sweep in a human gesture, and a step of
     * ONE to be dialled exactly. Both, from the same knob, chosen by how fast it
     * is turning: the value moved per detent is `step / divisor`, accumulated as
     * a FRACTION and spent when it reaches a whole unit.
     *
     *   turning normally (divisor 4)  → the full range-scaled step: an analog
     *                                   pot, same gesture whatever the range.
     *   turning slowly   (divisor 16) → a QUARTER of it, so the knob decelerates
     *                                   into single-unit precision as you ease off.
     *
     * This is exactly what the host's engine does for FLOAT params — step/divisor
     * per tick — and why those knobs feel right at both ends. Integer params
     * could not express a fractional move, which is why dAVEBOx needed the
     * accumulator to carry the remainder rather than rounding it away.
     *
     * ⚠ The FIRST motion after idle is pinned to one unit of value, never the
     * scaled step. That is the "click" that makes an exact value dialable: tap
     * the knob one detent and the param moves by exactly 1, on any range. */
    if ((dir > 0) !== (S.knobAccelDir[k] > 0)) S.knobAccelDir[k] = dir > 0 ? 1 : -1;
    /* Normalised against the FAST divisor: at normal speed a count is worth a
     * whole unit of `scale`, and easing off divides it down from there.
     *
     * ⚠ The cold-start case is NOT scaled at all — it contributes exactly one
     * unit of value, on any range. Running it through the same expression gave
     * it `1 * 4 / 1` = four, so the deliberate single tap moved by 4 on a narrow
     * param. The test caught that within a minute of the normalisation landing;
     * it is the reason the branch is written out rather than folded in. */
    const scale = (stepScale > 0) ? stepScale : 1;
    let inc = (div === 1) ? dir : dir * scale * KNOB_FAST_DIVISOR / div;

    /* ⭑ THE FINE BANDS NEVER MOVE MORE THAN ONE VALUE PER COUNT. Deceleration
     * is only half the promise — "can be dialed in to a single dent when turning
     * pretty slowly" (Josh) means the slow end must reach the SMALLEST possible
     * increment, on any range. Without this cap a 0-400 param eased right down
     * still moved 1.25 per count, stepping 1,1,1,2,1,1,1,2 — visibly not
     * dialable, and caught by the test rather than by reading the arithmetic.
     * Narrow params are already far below the cap, so it only binds where the
     * range scaling would otherwise overshoot. */
    if (div > KNOB_FAST_DIVISOR) {
        const cap = Math.abs(dir);
        if (Math.abs(inc) > cap) inc = inc > 0 ? cap : -cap;
    }
    S.knobAccelAcc[k] += inc;
    const units = Math.trunc(S.knobAccelAcc[k]);
    if (units === 0) return 0;
    S.knobAccelAcc[k] -= units;
    return units;
}

function _onCC_stepedit(d1, d2) {
    /* CC step-edit: bank 6 + held step — all 8 knobs write CC automation at step's tick */
    if (S.heldStep >= 0 && S.activeBank === 6 && d1 >= 71 && d1 <= 78) {
        const _kIdx = d1 - 71;
        const _acc  = ccKnobDelta(d2, _kIdx);  /* run-length acceleration */
        if (_acc === 0) return;
        const _t    = S.activeTrack;
        const _ac   = effectiveClip(_t);
        S.knobTouched          = _kIdx;
        S.knobTurnedTick[_kIdx] = S.tickCount;
        S.ccActiveLane[_t]      = _kIdx;
        S.screenDirty  = true;
        var _laneTps = S.ccLaneTps[_t][_ac][_kIdx];
        const _tps   = (_laneTps > 0) ? _laneTps : (S.clipTPS[_t][_ac] || 24);
        const _tick  = S.heldStep * _tps;
        const _hold  = Math.min(65535, _tick + _tps - 1);
        /* New point at an unset step: the value is seeded at the interpolated value
         * (computed at step-hold time), and this turn's delta is applied immediately,
         * so EITHER direction creates the point and sets it above OR below the
         * interpolated value on the first turn. From a set step, down past 0 clears
         * it back to "—" (and Delete+step clears a step outright). */
        if (!S.ccStepEditSet[_kIdx]) {
            S.ccStepEditSet[_kIdx] = true;
            const _nv0 = S.ccStepEditVal[_kIdx] + _acc;
            S.ccStepEditVal[_kIdx] = Math.max(0, Math.min(127, _nv0));
        } else {
            const _nv = S.ccStepEditVal[_kIdx] + _acc;
            if (_nv < 0) {
                /* down past 0 → "—": drop this knob's point(s) in the step window */
                S.ccStepEditSet[_kIdx] = false;
                host_module_set_param('t' + _t + '_cc_auto_clear_range',
                    _ac + ' ' + _kIdx + ' ' + _tick + ' ' + _hold);
                /* refresh the auto bit (knob may still have points elsewhere) */
                return;
            }
            S.ccStepEditVal[_kIdx] = Math.min(127, _nv);
        }
        host_module_set_param('t' + _t + '_cc_auto_set2',
            _ac + ' ' + _kIdx + ' ' + _tick + ' ' + _hold + ' ' + S.ccStepEditVal[_kIdx]);
        S.trackCCAutoBits[_t][_ac] |= (1 << _kIdx);
        return;
    }

    /* Drum step edit: K1 Leng, K2 Vel, K3 Nudg, K4 —, K5 Iter, K6 Prob, K7 Ratch, K8 —.
     * Bank-gated off the AUTO bank (6): there the held-step + knob edits CC
     * automation (the CC step editor above), mirroring the melodic NOTE editor. */
    if (S.heldStep >= 0 && S.heldStepNotes.length > 0 && d1 >= 71 && d1 <= 78 &&
            S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank !== 6) {
        const knobIdx = d1 - 71;
        const dir     = (d2 >= 1 && d2 <= 63) ? 1 : -1;
        const t       = S.activeTrack;
        const lane    = S.activeDrumLane[t];
        S.knobTouched          = knobIdx;
        S.knobTurnedTick[knobIdx] = S.tickCount;
        S.screenDirty = true;
        if (knobIdx === 3 || knobIdx === 7) return;
        if (knobIdx === 0) {
            const _tpsD = S.drumLaneTPS[t] || 24;
            const _gmaxD = Math.min(65535, 256 * _tpsD);
            const _acc = ccKnobDelta(d2, knobIdx);
            if (_acc === 0) return;
            const _steps = S.stepEditGate / _tpsD;
            const _inc = _steps <= 16 ? Math.round(_tpsD / 4)
                       : _steps <= 64 ? _tpsD
                       :                 _tpsD * 8;
            let _nv = S.stepEditGate + _acc * _inc;
            if (_inc > 1) _nv = Math.round(_nv / _inc) * _inc;
            S.stepEditGate = Math.max(1, Math.min(_gmaxD, _nv));
            host_module_set_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_gate', String(S.stepEditGate));
        } else if (knobIdx === 1) {
            const _sv = ccKnobDelta(d2, knobIdx);   /* unified: cont accel */
            if (_sv === 0) return;
            S.stepEditVel = Math.max(0, Math.min(127, S.stepEditVel + _sv));
            host_module_set_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_vel', String(S.stepEditVel));
        } else if (knobIdx === 2) {
            const _sn = ccKnobDelta(d2, knobIdx);   /* unified: cont accel */
            if (_sn !== 0) {
                const _tpsN1 = (S.drumLaneTPS[t] || 24) - 1;
                S.stepEditNudge = Math.max(-_tpsN1, Math.min(_tpsN1, S.stepEditNudge + _sn));
                host_module_set_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_nudge', String(S.stepEditNudge));
            }
        } else if (knobIdx === 4) {
            /* K5 Iter: one entry per detent (no accel — 36-entry list, ~1 turn end-to-end) */
            S.knobAccum[knobIdx] = (dir === S.knobLastDir[knobIdx]) ? S.knobAccum[knobIdx] + 1 : 1;
            S.knobLastDir[knobIdx] = dir;
            if ((S._iterKd = ccKnobDelta(d2, knobIdx)) !== 0) {   /* unified: cont accel */
                let idx = STEP_ITER_LIST.indexOf(S.stepEditIter);
                if (idx < 0) idx = 0;
                idx = Math.max(0, Math.min(STEP_ITER_LIST.length - 1, idx + S._iterKd));
                S.stepEditIter = STEP_ITER_LIST[idx];
                host_module_set_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_iter', String(S.stepEditIter));
            }
        } else if (knobIdx === 5) {
            /* K6 Prob: 0..100 with accel */
            const acc = ccKnobDelta(d2, knobIdx);
            if (acc !== 0) {
                {
                    /* raw 0 = unset sentinel = 100%: sweep as a real 1-100 knob,
                     * storing 100 back as the 0 sentinel (DSP semantics unchanged) */
                    const _eff = S.stepEditRand === 0 ? 100 : S.stepEditRand;
                    const _nv = Math.max(1, Math.min(100, _eff + acc));
                    S.stepEditRand = _nv === 100 ? 0 : _nv;
                }
                host_module_set_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_rand', String(S.stepEditRand));
            }
        } else if (knobIdx === 6) {
            /* K7 Ratch: 0..4, sens=8 (10 detents per step at low gain) */
            S.knobAccum[knobIdx] = (dir === S.knobLastDir[knobIdx]) ? S.knobAccum[knobIdx] + 1 : 1;
            S.knobLastDir[knobIdx] = dir;
            if (S.knobAccum[knobIdx] >= KNOB_PICK) {
                S.knobAccum[knobIdx] = 0;
                S.stepEditRatch = Math.max(0, Math.min(4, S.stepEditRatch + dir));
                host_module_set_param('t' + t + '_l' + lane + '_step_' + S.heldStep + '_ratch', String(S.stepEditRatch));
            }
        }
        return;
    }
    /* Melodic step edit: K1 Note, K2 Oct, K3 Leng, K4 Vel, K5 Nudg, K6 Iter, K7 Prob, K8 Ratch */
    if (S.heldStep >= 0 && S.heldStepNotes.length > 0 && d1 >= 71 && d1 <= 78 && S.activeBank !== 6) {
        const knobIdx = d1 - 71;
        const dir     = (d2 >= 1 && d2 <= 63) ? 1 : -1;
        const t       = S.activeTrack;
        const ac      = effectiveClip(t);
        const pfx     = 't' + t + '_c' + ac + '_step_' + S.heldStep;
        S.knobTouched          = knobIdx;
        S.knobTurnedTick[knobIdx] = S.tickCount;
        S.screenDirty   = true;
        if (knobIdx === 0) {
            /* K1 Note: shift each note ±1 scale degree (or ±1 semitone if scale-aware off), sens=10 */
            S.knobAccum[knobIdx] = (dir === S.knobLastDir[knobIdx]) ? S.knobAccum[knobIdx] + 1 : 1;
            S.knobLastDir[knobIdx] = dir;
            if (S.knobAccum[knobIdx] >= KNOB_PICK) {
                S.knobAccum[knobIdx] = 0;
                S.heldStepNotes = S.heldStepNotes.map(function(n) {
                    return scaleNudgeNote(n, dir, S.padKey, S.padScale);
                });
                host_module_set_param(pfx + '_set_notes', S.heldStepNotes.join(' '));
            }
        } else if (knobIdx === 1) {
            /* K2 Oct: shift all notes ±12 semitones, sens=12 */
            S.knobAccum[knobIdx] = (dir === S.knobLastDir[knobIdx]) ? S.knobAccum[knobIdx] + 1 : 1;
            S.knobLastDir[knobIdx] = dir;
            if (S.knobAccum[knobIdx] >= KNOB_PICK) {
                S.knobAccum[knobIdx] = 0;
                S.heldStepNotes = S.heldStepNotes.map(function(n) {
                    return Math.max(0, Math.min(127, n + dir * 12));
                });
                host_module_set_param(pfx + '_set_notes', S.heldStepNotes.join(' '));
            }
        } else if (knobIdx === 2) {
            /* K3 Dur: accelerated with breakpoints at 16/64 steps */
            { const _acD = effectiveClip(S.activeTrack);
              const _tpsD = S.clipTPS[S.activeTrack][_acD] || 24;
              const _gmaxD = Math.min(65535, 256 * _tpsD);
              const _acc = ccKnobDelta(d2, knobIdx);
              if (_acc === 0) return;
              const _steps = S.stepEditGate / _tpsD;
              const _inc = _steps <= 16 ? Math.round(_tpsD / 4)
                         : _steps <= 64 ? _tpsD
                         :                 _tpsD * 8;
              let _nv = S.stepEditGate + _acc * _inc;
              if (_inc > 1) _nv = Math.round(_nv / _inc) * _inc;
              S.stepEditGate = Math.max(1, Math.min(_gmaxD, _nv)); }
            host_module_set_param(pfx + '_gate', String(S.stepEditGate));
        } else if (knobIdx === 3) {
            /* K4 Vel: velocity 0-127, cont accel */
            const _sv = ccKnobDelta(d2, knobIdx);
            if (_sv === 0) return;
            S.stepEditVel = Math.max(0, Math.min(127, S.stepEditVel + _sv));
            host_module_set_param(pfx + '_vel', String(S.stepEditVel));
        } else if (knobIdx === 4) {
            /* K5 Nudge: tick offset ±(TPS-1), cont accel */
            const _sn = ccKnobDelta(d2, knobIdx);
            if (_sn !== 0) {
                const _acN = effectiveClip(S.activeTrack);
                const _tpsN1 = (S.clipTPS[S.activeTrack][_acN] || 24) - 1;
                S.stepEditNudge = Math.max(-_tpsN1, Math.min(_tpsN1, S.stepEditNudge + _sn));
                host_module_set_param(pfx + '_nudge', String(S.stepEditNudge));
            }
        } else if (knobIdx === 5) {
            /* K6 Iter: discrete step, sens=3 (no accel) */
            S.knobAccum[knobIdx] = (dir === S.knobLastDir[knobIdx]) ? S.knobAccum[knobIdx] + 1 : 1;
            S.knobLastDir[knobIdx] = dir;
            if ((S._iterKd = ccKnobDelta(d2, knobIdx)) !== 0) {   /* unified: cont accel */
                let idx = STEP_ITER_LIST.indexOf(S.stepEditIter);
                if (idx < 0) idx = 0;
                idx = Math.max(0, Math.min(STEP_ITER_LIST.length - 1, idx + S._iterKd));
                S.stepEditIter = STEP_ITER_LIST[idx];
                host_module_set_param(pfx + '_iter', String(S.stepEditIter));
            }
        } else if (knobIdx === 6) {
            /* K7 Rand: 0..100 with accel */
            const acc = ccKnobDelta(d2, knobIdx);
            if (acc !== 0) {
                {
                    /* raw 0 = unset sentinel = 100%: sweep as a real 1-100 knob,
                     * storing 100 back as the 0 sentinel (DSP semantics unchanged) */
                    const _eff = S.stepEditRand === 0 ? 100 : S.stepEditRand;
                    const _nv = Math.max(1, Math.min(100, _eff + acc));
                    S.stepEditRand = _nv === 100 ? 0 : _nv;
                }
                host_module_set_param(pfx + '_rand', String(S.stepEditRand));
            }
        } else if (knobIdx === 7) {
            /* K8 Ratch: 0..4, sens=8 */
            S.knobAccum[knobIdx] = (dir === S.knobLastDir[knobIdx]) ? S.knobAccum[knobIdx] + 1 : 1;
            S.knobLastDir[knobIdx] = dir;
            if (S.knobAccum[knobIdx] >= KNOB_PICK) {
                S.knobAccum[knobIdx] = 0;
                S.stepEditRatch = Math.max(0, Math.min(4, S.stepEditRatch + dir));
                host_module_set_param(pfx + '_ratch', String(S.stepEditRatch));
            }
        }
        return;
    }

}

/* Adjust one track's slot level. The engine writes happen in tick(): they are
 * synchronous SHM round-trips, which don't belong in a MIDI handler. Here we
 * only move a number and raise a flag. (The slot itself is a direct
 * slot derived from the track index now — no resolution step.) */
/* Raw detents, NOT ccKnobDelta. That helper halves the count (BASE=2) and
 * carries per-knob acceleration state shared with the bank-param path, which
 * made this both slow and inconsistent on device.
 *
 * Step and decode are now IDENTICAL to sound mode's master-knob level
 * (SLOT_LEVEL_STEP) — same law, same feel, one constant. 1/16 was 4x too fast
 * and, against decodeDelta's batched counts, jerky with it. */


function _sessInvalidateAllLevels() {
    S.sessVolLevel.fill(-1);
    S.sessVolSlots.fill(-1);
    S.sessVolBus.fill(-1);
}

function _sessionKnobParam(knobIdx, d2) {
    if (knobIdx >= NUM_TRACKS) return;
    if (S.sessVolBus[knobIdx] <= 0) {
        if (S.trackRoute[knobIdx] !== 0) return;
        if (S.sessVolSlots[knobIdx] === 0) return;
    }
    const lvl = S.sessVolLevel[knobIdx];
    if (lvl < 0) return;
    const mode = SESS_KNOB_MODES[S.sessKnobMode];
    const d = (d2 >= 1 && d2 <= 63) ? d2 : (d2 >= 65) ? d2 - 128 : 0;
    if (!d) return;
    /* The SAME law as the bank knobs, in each mode's OWN UNITS.
     *
     * ⚠ This used to be a third law — `knobAccumSteps(.., KNOB_SENS)`, a flat
     * two-counts-per-position drain with no speed curve — costing 510 counts a
     * sweep against the bank knobs' tuned 100. It came from copying canvaskit's
     * CONTINUOUS-CELL default rather than what a real param declares, which is
     * the same mistake that made the bank knobs slow before `6ff275a0`.
     * [[mimic-means-read-the-inputs]]
     *
     * ⭑ The unit is the mode's own `units` — the increment its formatter PRINTS
     * (pan a percentage point, a send one percent, volume 0.01). That is what
     * makes ease-off fine tuning mean something: the curve pins a cold detent to
     * exactly ONE unit and caps the fine bands at one unit per count, so a slow
     * turn moves the READOUT by exactly 1. With the old 1/255-of-range unit the
     * same law slid between displayed values instead of landing on them — same
     * rate as a bank knob (measured: 121 counts a sweep against Vel's ~120) with
     * no grain, which is what read as "faster" under the finger.
     *
     * ⭑ Per-knob accumulator state lives in the shared S.knobAccel* arrays, keyed
     * by the same knob index — eight strips still cannot steal each other's
     * partial turns, and a strip cannot be turned as a bank knob at the same
     * time, so there is nothing for the two contexts to fight over. */
    const steps = ccKnobDelta(d2, knobIdx, mode.units / (mode.sweep || SWEEP_UNITS));
    const acc = { steps };
    if (!acc.steps) {
        /* Partial detent: nothing moves, but the finger is clearly ON this
         * strip, so show its value. Otherwise the first touch of a slow turn
         * reads as a dead knob. */
        S.sessVolLastKnob = knobIdx;
        S.sessVolLastTurn = S.tickCount;
        armBankDisplay();
        forceRedraw();
        return;
    }
    let v = lvl + acc.steps * mode.step;
    if (v < 0) v = 0;
    if (v > mode.max) v = mode.max;
    if (mode.snap !== undefined) {
        const prev = lvl, next = v;
        if ((prev < mode.snap && next >= mode.snap - mode.snapZone && next <= mode.snap + mode.snapZone) ||
            (prev > mode.snap && next >= mode.snap - mode.snapZone && next <= mode.snap + mode.snapZone))
            v = mode.snap;
    }
    if (v === lvl) return;
    S.sessVolLevel[knobIdx] = v;
    S.sessVolPending[knobIdx] = true;
    S.sessVolSaveOwed = true;
    S.sessVolLastTurn = S.tickCount;
    S.sessVolLastKnob = knobIdx;       /* this strip's number swaps to its value */
    /* The MIXER PAGE is the read-out now — all 8 tracks in this mode, with the
     * turned knob's cell highlighted and its value in the header. A gauge popup
     * would cover seven of the eight values the page exists to show, and it is
     * the one track you already know about.
     *
     * Stamping bankSelectTick keeps the page up for the usual window after the
     * finger lifts, so a turn made without touching first still shows its
     * result — the same timeout the clip param banks use. */
    armBankDisplay();
    forceRedraw();
}

function _onCC_knobs(d1, d2) {
    /* Knob CCs 71-78: apply delta to active bank parameter.
     * Relative encoder: d2 1-63 = CW (+1), d2 64-127 = CCW (-1).
     * pm.sens > 1 = accumulate that many ticks before firing one unit change.
     * pm.lock = true: fire once then block until touch release (S.knobLocked). */
    if (d1 >= 71 && d1 <= 78) {
        /* Exclusive overlays — knob turns have no visible effect and should be swallowed. */
        if (S.heldStep >= 0) return;
        if (S.globalMenuOpen || S.tapTempoOpen || S.confirmBake || S.confirmClearSession || S.confirmConvertToDrum || S.confirmConvertToConduct || S.menuInfoLines.length > 0 || S.confirmExport || S.exportDoneDialog || S.recordBlockedDialog || S.confirmStateWipe || S.bpmMoveInfo) return;
        const knobIdx = d1 - 71;
        S.knobTouched          = knobIdx;
        S.knobTurnedTick[knobIdx] = S.tickCount;
        S.screenDirty = true;

        /* SESSION VIEW: knob N is track N's Schwung slot level.
         *
         * This also closes a real hole. S.activeBank stays live across the view
         * switch, so before this every knob turn in the session grid was
         * editing the ACTIVE track's bank params — invisibly, since the grid
         * doesn't draw them. Returning here means the session grid no longer
         * reaches the bank editor at all. */
        if (S.sessionView) { _sessionKnobParam(knobIdx, d2); return; }

        const bank    = S.activeBank;
        /* Arp Steps interval-mode overlay: K1-K8 set per-step scale-degree
         * offset (±24) for SEQ ARP (bank 4, per-clip) or TARP (bank 5, per-track).
         * Sens=2: ~ half-turn covers the full range. */
        if (S.stepIntervalMode && (bank === 4 || bank === 5)) {
            const t   = S.activeTrack;
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            const _kd = ccKnobDelta(d2, knobIdx);   /* unified: cont accel */
            if (_kd !== 0) {
                if (S.shiftHeld) {
                    /* Shift page: fine ABSOLUTE step velocity, floor 5 so fine
                     * values never collide with legacy 0-4 levels in saved
                     * state (pads handle step-off). Turning a dead (0) step
                     * brings it in at the floor. */
                    if (bank === 4) {
                        const ac = effectiveClip(t);
                        const cur = S.seqArpStepVel[t][ac][knobIdx] | 0;
                        /* 5..127 absolute; past the top = Thru (255) */
                        const nxt = cur === 0 ? (dir > 0 ? 5 : 0)
                                  : cur === 255 ? (dir > 0 ? 255 : 127)
                                  : (cur === 127 && dir > 0) ? 255
                                  : Math.max(5, Math.min(127, cur + _kd));
                        if (nxt !== cur) {
                            S.seqArpStepVel[t][ac][knobIdx] = nxt;
                            host_module_set_param('t' + t + '_seq_arp_step_vel', knobIdx + ' ' + nxt);
                        }
                    } else {
                        const cur = S.tarpStepVel[t][knobIdx] | 0;
                        const nxt = cur === 0 ? (dir > 0 ? 5 : 0)
                                  : cur === 255 ? (dir > 0 ? 255 : 127)
                                  : (cur === 127 && dir > 0) ? 255
                                  : Math.max(5, Math.min(127, cur + _kd));
                        if (nxt !== cur) {
                            S.tarpStepVel[t][knobIdx] = nxt;
                            host_module_set_param('t' + t + '_tarp_step_vel', knobIdx + ' ' + nxt);
                        }
                    }
                } else if (bank === 4) {
                    const ac = effectiveClip(t);
                    const cur = S.seqArpStepInt[t][ac][knobIdx] | 0;
                    const nxt = Math.max(-24, Math.min(24, cur + _kd));
                    if (nxt !== cur) {
                        S.seqArpStepInt[t][ac][knobIdx] = nxt;
                        /* Writes to active-clip pfx_params via pfx_set; matches the
                         * tN_seq_arp_step_vel routing. */
                        host_module_set_param('t' + t + '_seq_arp_step_int', knobIdx + ' ' + nxt);
                    }
                } else {
                    const cur = S.tarpStepInt[t][knobIdx] | 0;
                    const nxt = Math.max(-24, Math.min(24, cur + _kd));
                    if (nxt !== cur) {
                        S.tarpStepInt[t][knobIdx] = nxt;
                        host_module_set_param('t' + t + '_tarp_step_int', knobIdx + ' ' + nxt);
                    }
                }
            }
            return;
        }
        /* Conductor Responder/Octave/When banks: knob k edits track k's per-clip
         * value. Gated strictly on the active track being a Conductor AND one of
         * the three banks, so normal bank editing is untouched. The Move emits
         * MULTIPLE CC msgs per physical detent, so we route through the SAME
         * accumulation siblings use → ONE detent = ONE action:
         *   - Octave: knobAccum threshold (sens=16, matches drum LaneOct/LaneNote
         *     at ~9424) → one ±1 step per detent.
         *   - Responder/When: knobLocked one-action-per-gesture (matches K2 Stch
         *     ~9150 / K4 Lgto ~9196) → one toggle flip per physical turn,
         *     regardless of msg count; lock clears on knob touch-release. */
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT &&
                (bank === BANK_RESPONDER || bank === BANK_OCTAVE || bank === BANK_WHEN)) {
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            if (bank === BANK_OCTAVE) {
                /* sens=16 — matches drum NOTE FX LaneOct/LaneNote ±1 stepping */
                if (knobStep(knobIdx, d2, KNOB_PICK) !== 0) {
                    applyConductGridKnob(BANK_OCTAVE, knobIdx, dir);
                }
            } else {
                /* Responder / When: single-fire toggle, locked per gesture */
                if (S.knobLocked[knobIdx]) return;
                if (knobStep(knobIdx, d2, KNOB_DELIB) !== 0) {
                    S.knobLocked[knobIdx] = true;
                    applyConductGridKnob(bank, knobIdx, dir);
                }
            }
            return;
        }
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 0) {
            const t    = S.activeTrack;
            const ac   = effectiveClip(t);
            const lane = S.activeDrumLane[t];
            const dir  = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }

            if (knobIdx === 0) {
                /* K1 = Res (normal=proportional rescale; alt=zoom, sens=8) */
                if (knobStep(knobIdx, d2, KNOB_PICK) !== 0) {
                    const curIdx = Math.max(0, TPS_VALUES.indexOf(S.drumLaneTPS[t]));
                    const nv = Math.max(0, Math.min(5, curIdx + dir));
                    if (nv !== curIdx) {
                        if (S.altMode) {
                            const newTps = TPS_VALUES[nv];
                            const newLen = Math.ceil(S.drumLaneLength[t] * S.drumLaneTPS[t] / newTps);
                            if (newLen > 256) {
                                showActionPopup('NOTES OUT', 'OF RANGE');
                                forceRedraw();
                            } else if (S.heldStep >= 0) {
                                /* blocked during step edit */
                            } else {
                                S.drumLaneTPS[t]    = newTps;
                                S.drumLaneLength[t] = newLen;
                                S.bankParams[t][0][knobIdx] = nv;
                                const maxPage = Math.max(0, Math.ceil(newLen / 16) - 1);
                                if (S.drumStepPage[t] > maxPage) S.drumStepPage[t] = maxPage;
                                host_module_set_param('t' + t + '_l' + lane + '_clip_resolution_zoom', String(nv));
                                S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = lane;
                                forceRedraw();
                            }
                        } else {
                            S.drumLaneTPS[t] = TPS_VALUES[nv];
                            S.bankParams[t][0][knobIdx] = nv;
                            host_module_set_param('t' + t + '_l' + lane + '_clip_resolution', String(nv));
                            S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
                        }
                    }
                    S.screenDirty = true;
                }
                return;
            }
            if (knobIdx === 1) {
                /* K2 = Stch (beat stretch, lock, sens=16) */
                if (S.knobLocked[knobIdx]) return;
                const len = S.drumLaneLength[t];
                const canFire = dir === 1 ? (len * 2 <= 256) : (len >= 2);
                if (!canFire) return;
                if (knobStep(knobIdx, d2, KNOB_DELIB) !== 0) {
                    host_module_set_param('t' + t + '_l' + lane + '_beat_stretch', String(dir));
                    S.knobLocked[knobIdx] = true;
                    const blocked = host_module_get_param('t' + t + '_beat_stretch_blocked') === '1';
                    if (dir === -1 && blocked) {
                        S.stretchBlockedEndTick = S.tickCount + STRETCH_BLOCKED_TICKS;
                    } else {
                        S.drumLaneLength[t] = dir === 1 ? len * 2 : Math.floor(len / 2);
                        const maxPage = Math.max(0, Math.ceil(S.drumLaneLength[t] / 16) - 1);
                        if (S.drumStepPage[t] > maxPage) S.drumStepPage[t] = maxPage;
                        S.bankParams[t][0][1] = dir;
                        S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
                    }
                    S.screenDirty = true;
                }
                return;
            }
            if (knobIdx === 2) {
                /* K3 = Shft (clock shift, sens=8). Alt = Nudge (sens=4, faster). */
                if (knobStep(knobIdx, d2, (S.altMode ? 4 : 8)) !== 0) {
                    if (S.altMode) {
                        S.bankParams[t][0][knobIdx] += dir;
                        host_module_set_param('t' + t + '_l' + lane + '_nudge', String(dir));
                    } else {
                        S.clockShiftTouchDelta += dir;
                        S.bankParams[t][0][knobIdx] = S.clockShiftTouchDelta;
                        host_module_set_param('t' + t + '_l' + lane + '_clock_shift', String(dir));
                    }
                    S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = lane;
                    S.screenDirty = true;
                }
                return;
            }
            if (knobIdx === 3) {
                /* K4 = Lgto: destructive one-shot. Right-turn opens confirm dialog. */
                if (S.knobLocked[knobIdx]) return;
                if (dir !== 1) return;
                if (knobStep(knobIdx, d2, KNOB_DELIB) !== 0) {
                    S.confirmLgto       = true;
                    S.confirmLgtoSel    = 0;
                    S.confirmLgtoIsDrum = true;
                    S.knobLocked[knobIdx] = true;
                    forceRedraw();
                }
                return;
            }
            if (applyTableKnob(DRUM_LANE_SITES[knobIdx], knobIdx, d2, t, lane)) return;
            if (knobIdx === 6) {
                /* K7 = Dir (per-lane playback direction, sens=16).
                 * AltMode flips this to Step / Audio playback style (sens=4). */
                const _k7Sens = KNOB_PICK;
                if (knobStep(knobIdx, d2, _k7Sens) !== 0) {
                    if (S.altMode) {
                        const _cur = S.drumLanePlaybackAudioReverse[t][lane] | 0;
                        const _nv  = Math.max(0, Math.min(1, _cur + dir));
                        if (_nv !== _cur) {
                            S.drumLanePlaybackAudioReverse[t][lane] = _nv;
                            host_module_set_param('t' + t + '_l' + lane + '_playback_audio_reverse', String(_nv));
                        }
                    } else {
                        const _cur = S.drumLanePlaybackDir[t][lane] | 0;
                        const _nv  = Math.max(0, Math.min(3, _cur + dir));
                        if (_nv !== _cur) {
                            S.drumLanePlaybackDir[t][lane] = _nv;
                            S.bankParams[t][0][6] = _nv;
                            host_module_set_param('t' + t + '_l' + lane + '_playback_dir', String(_nv));
                        }
                    }
                    S.screenDirty = true;
                }
                return;
            }
            if (knobIdx === 7) {
                /* K8 = SqFl: sens=16 — matches melodic */
                if (knobStep(knobIdx, d2, KNOB_DELIB) !== 0) {
                    const _cur = S.clipSeqFollow[t][ac] ? 1 : 0;
                    const _nv  = Math.max(0, Math.min(1, _cur + dir));
                    if (_nv !== _cur) {
                        S.clipSeqFollow[t][ac] = _nv !== 0;
                        S.bankParams[t][0][7]  = _nv;
                        S.screenDirty = true;
                    }
                }
                return;
            }
        }
        /* ALL LANES bank (drum, bank 7): K1=Res K2=Stch K3=Shft K4=Qnt K5=VelIn K6=InQ K7=Dir K8=SyncRpt */
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 7 && !S.allLanesConfirmed) {
            S.screenDirty = true;
            return;
        }
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 7) {
            const t   = S.activeTrack;
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            /* Res · Qnt · InQ · SyncRpt — table-driven; see DRUM_CONFIG_SITES. */
            if (applyTableKnob(DRUM_CONFIG_SITES[knobIdx], knobIdx, d2, t, lane)) return;
            if (knobIdx === 1) {
                /* K2 = Stch: beat stretch all lanes, lock, sens=16 */
                if (S.knobLocked[knobIdx]) return;
                if (knobStep(knobIdx, d2, KNOB_DELIB) !== 0) {
                    host_module_set_param('t' + t + '_all_lanes_beat_stretch', String(dir));
                    S.knobLocked[knobIdx] = true;
                    S.bankParams[t][7][1] += dir;
                    S.pendingAllLanesStretchCheck = t;
                    S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
                    S.screenDirty = true;
                }
                return;
            }
            if (knobIdx === 2) {
                /* K3 = Shft: clock shift all lanes, sens=8. Alt = Nudge (sens=1). */
                if (knobStep(knobIdx, d2, (S.altMode ? 1 : KNOB_PICK)) !== 0) {
                    if (S.altMode) {
                        S.bankParams[t][7][2] += dir;
                        host_module_set_param('t' + t + '_all_lanes_nudge', String(dir));
                    } else {
                        S.clockShiftTouchDelta += dir;
                        S.bankParams[t][7][2] = S.clockShiftTouchDelta;
                        host_module_set_param('t' + t + '_all_lanes_clock_shift', String(dir));
                    }
                    S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
                    S.screenDirty = true;
                }
                return;
            }
            if (knobIdx === 4) {
                /* K5 = VelIn: track velocity override, cont accel */
                const _v5 = ccKnobDelta(d2, knobIdx);
                if (_v5 === 0) return;
                const cur7v = S.trackVelOverride[t];
                const nv = Math.max(0, Math.min(127, cur7v + _v5));
                if (nv !== cur7v) applyTrackConfig(t, 'track_vel_override', nv);
                S.screenDirty = true;
                return;
            }
            if (knobIdx === 6) {
                /* K7 = Dir: set playback direction on all 32 lanes, sens=16.
                 * Alt = RvSt (audio reverse on all lanes), sens=4. */
                const _k7Sens = KNOB_PICK;
                if (knobStep(knobIdx, d2, _k7Sens) !== 0) {
                    if (S.altMode) {
                        const curRv = S.bankParams[t][7][6] < 0 ? -1 : S.bankParams[t][7][6];
                        const nvRv = Math.max(0, Math.min(1, curRv + dir));
                        if (nvRv !== curRv) {
                            S.bankParams[t][7][6] = nvRv;
                            host_module_set_param('t' + t + '_all_lanes_playback_audio_reverse', String(nvRv));
                        }
                    } else {
                        const curDir = S.bankParams[t][7][6] < 0 ? -1 : S.bankParams[t][7][6];
                        const nvDir = Math.max(0, Math.min(3, curDir + dir));
                        if (nvDir !== curDir) {
                            S.bankParams[t][7][6] = nvDir;
                            host_module_set_param('t' + t + '_all_lanes_playback_dir', String(nvDir));
                        }
                    }
                    S.screenDirty = true;
                }
                return;
            }
            return;
        }
        /* Drum NOTE FX bank (bank 1): K1=LaneOct K2=LaneNote K3=Vel K4=Qnt K5=Len(placeholder) K6=Gate; K7/K8 blocked */
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 1) {
            if (knobIdx >= 6) return;
            const t    = S.activeTrack;
            const lane = S.activeDrumLane[t];
            const dir  = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            if (knobIdx === 0 || knobIdx === 1) {
                /* K1 = LaneOct (±12 semitones, picker pace), K2 = LaneNote (cont accel) */
                /* knobPick takes the batch MAGNITUDE (decodeDelta), not `dir` —
                 * `dir` above is the SIGN, still used for the reset below and by
                 * the one-way action knobs. A fast spin therefore pages octaves
                 * at the speed of the turn. */
                const delta = knobIdx === 0 ? knobPick(knobIdx, decodeDelta(d2), KNOB_PICK) * 12
                                            : ccKnobDelta(d2, knobIdx);
                if (delta !== 0) {
                    const nv = Math.max(0, Math.min(127, S.drumLaneNote[t][lane] + delta));
                    if (nv !== S.drumLaneNote[t][lane]) {
                        S.drumLaneNote[t][lane] = nv;
                        host_module_set_param('t' + t + '_l' + lane + '_lane_note', String(nv));
                        /* PHASE-1: DSP padmap caches the resolved lane notes; re-push
                         * so on_midi dispatches the new note for this lane's pads. */
                        if (t === S.activeTrack) computePadNoteMap();
                        S.screenDirty = true;
                    }
                }
                return;
            }
            /* K3 Vel · K4 Qnt · K5 Len · K6 Gate — all four are the same shape:
             * take the melodic param's own metadata, write the result to this
             * LANE. See DRUM_NOTEFX_SITES for why they are a table and not four
             * branches: the four hand-written versions carried their own copies
             * of the ranges and their own choice of feel, and both of Josh's
             * drum knob reports came from those copies drifting. */
            if (applyDrumNoteFxKnob(knobIdx, d2, t, lane)) return;
            return;
        }
        /* Repeat Groove bank (bank 6 on drum tracks): vel scale (unshifted) or nudge (Shift) */
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 5) {
            const t    = S.activeTrack;
            const lane = S.activeDrumLane[t];
            const dir  = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            const _kd = ccKnobDelta(d2, knobIdx);   /* unified: cont accel */
            if (_kd !== 0) {
                const step = knobIdx;
                if (S.altMode) {
                    const nv = Math.max(-50, Math.min(50, (S.drumRepeatNudge[t][lane][step] | 0) + _kd));
                    if (nv !== S.drumRepeatNudge[t][lane][step]) {
                        S.drumRepeatNudge[t][lane][step] = nv;
                        host_module_set_param('t' + t + '_l' + lane + '_repeat_nudge', step + ' ' + nv);
                    }
                } else {
                    /* absolute 1-127; past the top = Thru (255 = held-pad vel) */
                    const cv = S.drumRepeatVelScale[t][lane][step] | 0;
                    const nv = cv === 255 ? (dir > 0 ? 255 : 127)
                             : (cv === 127 && dir > 0) ? 255
                             : Math.max(1, Math.min(127, cv + _kd));
                    if (nv !== S.drumRepeatVelScale[t][lane][step]) {
                        S.drumRepeatVelScale[t][lane][step] = nv;
                        host_module_set_param('t' + t + '_l' + lane + '_repeat_vel_scale', step + ' ' + nv);
                    }
                }
                S.screenDirty = true;
            }
            return;
        }
        /* CC PARAM bank (bank 6): see notes/cc-automation-redesign.md §5/§8.
         * Shift+turn = pick type (AT) / CC number; normal turn = set the clip's
         * resting value, record automation (armed), or audition (automated+playing);
         * Delete+turn = clear the knob's automation + resting value → "—". */
        if (bank === 6) {
            const t  = S.activeTrack;
            const ac = effectiveClip(t);
            const _setp = (k, v) => { host_module_set_param("t" + t + "_" + k, v); };
            /* Active lane = last-touched knob; persistent (no timeout). */
            S.ccActiveLane[t] = knobIdx;
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }

            /* alt mode: type/number ladder — Sch1..Sch8 (type 2) ↔ AT (type 1) ↔ CC0..CC127 (type 0).
             * Sch (chain knob) only available when patched Schwung is present.
             * Unified position: CC0..127 = 0..127, AT = -1, Sch1 = -2, Sch2 = -3, ..., Sch8 = -9.
             * When type=2, trackCCAssign holds the chain knob number (1-8). */
            if (S.altMode) {
                /* ⚠ The accumulator advance moved INSIDE this branch. It used to
                 * run for both paths, but only alt mode reads it — the plain path
                 * goes through ccKnobDelta, which keeps its own state. Advancing
                 * it unconditionally meant turning in plain mode silently primed
                 * the alt ladder. */
                if (knobStep(knobIdx, d2, KNOB_PICK) !== 0) {
                    const cur = (S.trackCCType[t][knobIdx] === 2) ? -(S.trackCCAssign[t][knobIdx] + 1)
                              : (S.trackCCType[t][knobIdx] === 1) ? -1
                              : S.trackCCAssign[t][knobIdx];
                    const minVal = -9;
                    const nx  = Math.max(minVal, Math.min(127, cur + dir));
                    if (nx <= -2) {
                        const schKnob = -(nx + 1);
                        S.trackCCType[t][knobIdx] = 2;
                        S.trackCCAssign[t][knobIdx] = schKnob;
                        S.schLabel[t][knobIdx] = null;
                        _setp('cc_type_assign', knobIdx + ' 2 ' + schKnob);
                    } else if (nx === -1) {
                        S.trackCCType[t][knobIdx] = 1;
                        _setp('cc_type_assign', knobIdx + ' 1 ' + S.trackCCAssign[t][knobIdx]);
                    } else {
                        S.trackCCType[t][knobIdx] = 0;
                        S.trackCCAssign[t][knobIdx] = nx;
                        _setp('cc_type_assign', knobIdx + ' 0 ' + nx);
                    }
                    S.screenDirty = true;
                }
                return;
            }

            /* Held step: the step editor (_onCC_stepedit) is the sole writer. */
            if (S.heldStep >= 0) return;  /* held step → CC step editor owns it (drum + melodic) */

            /* Delete+turn: clear this knob's automation AND resting value → "—". */
            if (S.deleteHeld) {
                S.trackCCAutoBits[t][ac] &= ~(1 << knobIdx);
                S.trackCCLiveVal[t][knobIdx] = -1;
                S.clipCCVal[t][ac][knobIdx]  = -1;
                _setp('cc_auto_clear_k', ac + ' ' + knobIdx);
                showActionPopup('CC', 'CLEAR');
                invalidateLEDCache();
                return;
            }

            /* Normal turn: run-length acceleration (first few clicks ±1, sustained turning ramps up). */
            const accel = ccKnobDelta(d2, knobIdx);
            if (accel === 0) return;
            /* Gate the record path on S.playing rather than !S.recordCountingIn:
             * recordCountingIn only clears when pollDSP catches the count-in 1->0
             * edge (~every POLL_INTERVAL), so for up to ~43ms after the count-in
             * downbeat a knob turn would be misrouted to cc_rest and never engage
             * the DSP latch. S.playing is 0 for the whole count-in and flips to 1
             * atomically with tr->recording at fire, so it tracks the real arm. */
            const armed   = S.recordArmed && S.recordArmedTrack === t && S.playing;
            const hasAuto = (S.trackCCAutoBits[t][ac] >> knobIdx) & 1;

            if (armed) {
                /* Record automation. */
                const base = (S.trackCCLiveVal[t][knobIdx] >= 0) ? S.trackCCLiveVal[t][knobIdx]
                           : (S.clipCCVal[t][ac][knobIdx] >= 0 ? S.clipCCVal[t][ac][knobIdx] : 0);
                const nv = Math.max(0, Math.min(127, base + accel));
                S.trackCCLiveVal[t][knobIdx] = nv;
                _setp('cc_send', knobIdx + ' ' + nv);
                S.trackCCAutoBits[t][ac] |= (1 << knobIdx);
                S.screenDirty = true;
                return;
            }
            if (S.playing && hasAuto) {
                /* Automated lane, playing, not armed: transient live audition only. */
                const base = (S.trackCCLiveVal[t][knobIdx] >= 0) ? S.trackCCLiveVal[t][knobIdx] : 0;
                const nv = Math.max(0, Math.min(127, base + accel));
                S.trackCCLiveVal[t][knobIdx] = nv;
                _setp('cc_send', knobIdx + ' ' + nv);
                S.screenDirty = true;
                return;
            }
            /* Stopped, or playing on an un-automated lane: set the clip resting value.
             * "—" floor: crossing below 0 → "—"; from "—" the first up-step lands on 0. */
            const cur = S.clipCCVal[t][ac][knobIdx];
            let nv;
            if (cur < 0) nv = (accel > 0) ? (accel - 1) : -1;
            else        { nv = cur + accel; if (nv < 0) nv = -1; }
            nv = Math.max(-1, Math.min(127, nv));
            if (nv === cur) return;
            S.clipCCVal[t][ac][knobIdx]  = nv;
            S.trackCCLiveVal[t][knobIdx] = nv;
            _setp('cc_rest', ac + ' ' + knobIdx + ' ' + (nv < 0 ? 255 : nv));
            S.screenDirty = true;
            return;
        }
        /* Alt+K8 on NOTE FX (bank 1) or DELAY (bank 3), melodic: cycle random algorithm (Pure/Gaus/Walk) */
        if (S.altMode && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM &&
                ((bank === 1 && knobIdx === 7) || (bank === 3 && knobIdx === 7))) {
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            if (knobStep(knobIdx, d2, KNOB_PICK) !== 0) {
                const t = S.activeTrack;
                const isMidi = bank === 3;
                const cur = isMidi ? (S.midiDlyRandomMode[t] || 0) : (S.noteFXRandomMode[t] || 0);
                const nv = ((cur + dir) % 3 + 3) % 3;
                if (isMidi) { S.midiDlyRandomMode[t] = nv; }
                else        { S.noteFXRandomMode[t]  = nv; }
                /* Must be tN_-prefixed: bare-global module keys are silently
                 * dropped by the Schwung host (see root CLAUDE.md), and the
                 * DSP pfx_set handler is only reachable via the tN_ catch-all
                 * anyway. Sending the bare key meant note_random_mode /
                 * fb_note_random_mode never reached the clip pfx_params, so
                 * the mode reverted on every snapshot resync/reload. */
                host_module_set_param('t' + t + (isMidi ? '_delay_pitch_random_mode' : '_noteFX_random_mode'), String(nv));
                S.screenDirty = true;
            }
            return;
        }
        /* Shift+K1 on DELAY bank (melodic): clock feedback. K7 now hosts
         * delay_retrig (replaces the prior standalone Clk knob); clock_fb
         * folds onto the unused Shift modifier on K1 with a label flip
         * "Rate"↔"ClkF" in the OLED render. Mirror stored in S.delayClockFb
         * since bankParams[t][3][6] now stores retrig. */
        if (S.altMode && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM &&
                bank === 3 && knobIdx === 0) {
            const t   = S.activeTrack;
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            const _q = ccKnobDelta(d2, knobIdx);
            if (_q !== 0) {
                const nv = Math.max(-100, Math.min(100, (S.delayClockFb[t] | 0) + _q));
                if (nv !== S.delayClockFb[t]) {
                    S.delayClockFb[t] = nv;
                    host_module_set_param('t' + t + '_delay_clock_fb', String(nv));
                }
                S.screenDirty = true;
            }
            return;
        }
        /* Melodic CLIP K6 = InQ — per-track input quantize, mirrors drum
         * ALL LANES K5. Custom path keeps S.drumInpQuant (the shared JS
         * mirror used by both bank-overview render paths) in sync with
         * bankParams[t][0][4]. The DSP field is `tr->drum_inp_quant` —
         * historical name; now per-track-type-agnostic. */
        if (S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM && bank === 0 && knobIdx === 4) {
            /* Melodic CLIP K5 = InQ — the same param as the drum ALL LANES K6,
             * declared beside it in CLIP_MELODIC_SITES so the pair cannot drift. */
            if (applyTableKnob(CLIP_MELODIC_SITES[knobIdx], knobIdx, d2, S.activeTrack, 0)) return;
        }
        /* Conduct bank (CLIP bank 0 on a Conductor) K6 = CdLk lock toggle.
         * Single-fire per gesture (knobLocked), matching Responder/When.
         * Off=gate-hold, Lock=sample-and-hold. Pushes per-clip cond_lock to
         * DSP (N=conductor track, C=active conductor clip). Melodic/drum CLIP
         * K6 is unassigned and falls through to the generic stub (no-op). */
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT && bank === 0 && knobIdx === 5) {
            if (S.knobLocked[knobIdx]) return;
            const t   = S.activeTrack;
            const ac  = S.trackActiveClip[t] | 0;
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
            if (knobStep(knobIdx, d2, KNOB_DELIB) !== 0) {
                S.knobLocked[knobIdx] = true;
                S.condLock[ac] = S.condLock[ac] ? 0 : 1;   /* single-fire toggle */
                host_module_set_param('t' + t + '_c' + ac + '_cond_lock', String(S.condLock[ac]));
                S.screenDirty = true;
            }
            return;
        }
        /* Conductor NOTE FX (bank 1) is slimmed: only K1(Oct)/K2(Ofs)/K8(Rnd)
         * + alt-K8 random-mode (handled above) apply. K3-K6 (Vel/Qnt/Len/Gate)
         * are inert — swallow the detent so nothing writes. K1/K2/K8 fall
         * through to the generic param handler (writes per-clip pfx via the
         * tN_noteFX_* → active-clip pfx_set path). */
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT && bank === 1 &&
                (knobIdx === 2 || knobIdx === 3 || knobIdx === 4 || knobIdx === 5)) {
            return;
        }
        const pm      = BANKS[bank].knobs[knobIdx];
        if (pm && pm.abbrev && pm.scope !== 'stub' && !S.knobLocked[knobIdx]) {
            const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
            /* Unified response: class decides the feel. Clock Shift (+alt
             * Nudge) fires one discrete step at picker pace — its DSP key
             * takes a ±1 direction, so it can't take accelerated deltas
             * (set_param coalescing forbids bursts). */
            let _cls = knobClass(pm);
            if (pm.dspKey === 'clock_shift') _cls = 'pick';
            let _delta = _cls === 'cont' ? ccKnobDelta(d2, knobIdx, bankStep(pm))
                       : knobPick(knobIdx, decodeDelta(d2), _cls === 'delib' ? KNOB_DELIB : KNOB_PICK);
            /* ⚠ Two consumers cannot take a multi-step delta, so clamp AFTER the
             * accumulator (the remainder is kept either way — clamping the input
             * would silently slow the knob instead):
             *   'delib'      — toggles and one-shot/destructive actions. Firing
             *                  a confirm dialog twice from one flick is not a
             *                  faster knob, it is a bug.
             *   clock_shift  — its DSP key takes a ±1 DIRECTION, not an amount,
             *                  and set_param coalescing forbids bursts. This is
             *                  why it is forced to 'pick' just above. */
            if (_delta !== 0 && (_cls === 'delib' || pm.dspKey === 'clock_shift'))
                _delta = _delta > 0 ? 1 : -1;
            if (_delta !== 0) {
                S.screenDirty = true;
                if (pm.scope === 'action') {
                    const t   = S.activeTrack;
                    const ac  = S.trackActiveClip[t];
                    const len = S.clipLength[t][ac];
                    /* Lgto knob (CLIP K8): right-turn opens the destructive
                     * confirm dialog. Left-turn is a no-op (one-way action). */
                    if (pm.dspKey === 'lgto_apply') {
                        if (dir !== 1) return;
                        S.confirmLgto       = true;
                        S.confirmLgtoSel    = 0;  /* default OK */
                        S.confirmLgtoIsDrum = false;
                        S.knobLocked[knobIdx] = true;
                        forceRedraw();
                        return;
                    }
                    if (pm.lock) {
                        /* Beat Stretch: one-shot, then lock until touch release */
                        const canFire = dir === 1 ? (len * 2 <= 256) : (len >= 2);
                        if (canFire) {
                            host_module_set_param('t' + t + '_' + pm.dspKey, String(dir));
                            S.knobLocked[knobIdx] = true;
                            /* For compress: check if DSP blocked due to step collision */
                            if (dir === -1 && host_module_get_param('t' + t + '_beat_stretch_blocked') === '1') {
                                S.stretchBlockedEndTick = S.tickCount + STRETCH_BLOCKED_TICKS;
                            } else {
                                /* Mirror DSP step rewrite in JS S.clipSteps */
                                const steps = S.clipSteps[t][ac];
                                if (dir === 1) {
                                    for (let si = len - 1; si >= 1; si--) {
                                        steps[si * 2] = steps[si];
                                        steps[si] = 0;
                                    }
                                    for (let si = 1; si < len * 2; si += 2) steps[si] = 0;
                                    S.clipLength[t][ac] = len * 2;
                                } else {
                                    const halfLen = len >> 1;
                                    const tmp = new Array(halfLen).fill(0);
                                    for (let si = 0; si < len; si++) {
                                        if (steps[si] === 1 && !tmp[si >> 1]) tmp[si >> 1] = 1;
                                    }
                                    for (let si = 0; si < len; si++) {
                                        if (steps[si] === 2 && !tmp[si >> 1]) tmp[si >> 1] = 2;
                                    }
                                    for (let si = 0; si < len; si++) steps[si] = 0;
                                    for (let si = 0; si < halfLen; si++) steps[si] = tmp[si];
                                    S.clipLength[t][ac] = halfLen;
                                }
                                /* Clamp page index to new length */
                                const newPages = Math.max(1, Math.ceil(S.clipLength[t][ac] / 16));
                                if (S.trackCurrentPage[t] >= newPages)
                                    S.trackCurrentPage[t] = newPages - 1;
                                /* Per-touch label: dir +1 → fmtStretch shows 'x2', -1 → '/2' */
                                S.bankParams[t][bank][knobIdx] = dir;
                            }
                        }
                    } else if (pm.dspKey === 'clock_shift') {
                        if (S.altMode) {
                            /* alt = Nudge — fire DSP, mirror counter for display, schedule re-read */
                            host_module_set_param('t' + t + '_nudge', String(dir));
                            S.bankParams[t][bank][knobIdx] += dir;
                            S.pendingStepsReread      = 2;
                            S.pendingStepsRereadTrack = t;
                            S.pendingStepsRereadClip  = ac;
                        } else if (len >= 2) {
                            /* Clock Shift: continuous rotation, no lock */
                            host_module_set_param('t' + t + '_' + pm.dspKey, String(dir));
                            const steps = S.clipSteps[t][ac];
                            if (dir === 1) {
                                const last = steps[len - 1];
                                for (let si = len - 1; si > 0; si--) steps[si] = steps[si - 1];
                                steps[0] = last;
                            } else {
                                const first = steps[0];
                                for (let si = 0; si < len - 1; si++) steps[si] = steps[si + 1];
                                steps[len - 1] = first;
                            }
                            S.clockShiftTouchDelta += dir;
                            S.bankParams[t][bank][knobIdx] = S.clockShiftTouchDelta;
                        }
                    }
                } else if (S.altMode && pm && pm.dspKey === 'clip_playback_dir' &&
                           S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM) {
                    /* AltMode CLIP K5: toggle Step / Audio playback style on
                     * the active melodic clip. Values 0..1, clamped. */
                    const _t  = S.activeTrack;
                    const _ac = effectiveClip(_t);
                    const _cur = S.clipPlaybackAudioReverse[_t][_ac] | 0;
                    const _nv  = Math.max(0, Math.min(1, _cur + dir));
                    if (_nv !== _cur) {
                        S.clipPlaybackAudioReverse[_t][_ac] = _nv;
                        host_module_set_param('t' + _t + '_clip_playback_audio_reverse', String(_nv));
                    }
                } else {
                    const cur  = S.bankParams[S.activeTrack][bank][knobIdx];
                    /* _delta already carries acceleration for 'cont' knobs;
                     * slow turns are always ±1 so exact values stay dialable
                     * (the old step-2 skips are gone).
                     *
                     * ⭑ ...and one unit is scaled to the param's RANGE. Without
                     * that, a knob unit was always one integer value, so the
                     * detents needed to cross a param were proportional to its
                     * range: Res (0-5) swept in 5, Gate (0-400) needed 400 —
                     * eighty times the travel for the same gesture. Josh,
                     * 2026-08-26: "it feels like larger ranges move slower from
                     * min to max than smaller ranges." They did. */
                    let nv  = Math.max(pm.min, Math.min(pm.max, cur + _delta));
                    if (nv !== cur) {
                        if (S.altMode && pm.dspKey === 'clip_resolution') {
                            const _t   = S.activeTrack;
                            const _ac  = effectiveClip(_t);
                            const _old_tps = S.clipTPS[_t][_ac];
                            const _new_tps = TPS_VALUES[nv];
                            const _old_ticks = S.clipLength[_t][_ac] * _old_tps;
                            const _new_len = Math.ceil(_old_ticks / _new_tps);
                            if (_new_len > 256) {
                                showActionPopup('NOTES OUT', 'OF RANGE');
                                forceRedraw();
                            } else if (S.heldStep >= 0 || (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === _t)) {
                                /* blocked — do nothing */
                            } else {
                                S.bankParams[S.activeTrack][bank][knobIdx] = nv;
                                S.clipTPS[_t][_ac]    = _new_tps;
                                S.clipLength[_t][_ac] = _new_len;
                                const _maxPage = Math.max(0, Math.ceil(_new_len / 16) - 1);
                                if (S.trackCurrentPage[_t] > _maxPage) S.trackCurrentPage[_t] = _maxPage;
                                host_module_set_param('t' + _t + '_clip_resolution_zoom', String(nv));
                                S.pendingStepsReread      = 2;
                                S.pendingStepsRereadTrack = _t;
                                S.pendingStepsRereadClip  = _ac;
                                refreshPerClipBankParams(_t);
                                forceRedraw();
                            }
                        } else {
                            S.bankParams[S.activeTrack][bank][knobIdx] = nv;
                            applyBankParam(S.activeTrack, bank, knobIdx, nv);
                            if (bank === 5 && knobIdx === 0 && nv !== 0)
                                S.lastTarpStyle[S.activeTrack] = nv;
                        }
                    }
                }
            }
        }
    }
}

function _switchViewCleanup() {
    S.heldStepBtn        = -1;
    S.heldStep           = -1;
    S.heldStepNotes      = [];
    S.stepWasEmpty       = false;
    S.stepWasHeld        = false;
    S.stepBtnPressedTick.fill(-1);
    S.sessionStepHeld    = -1;
    S.sessionStepHeldCtx = 0;
    /* Leaving Session View stops any active loop; mods/latch persist. */
    if (!S.sessionView && (S.perfViewLocked || S.perfStack.length > 0)) {
        const _hadLoop = S.perfStack.length > 0;
        S.perfStack         = [];
        S.perfStickyLengths = new Set();
        S.perfHoldPadHeld   = false;
        S.perfViewLocked    = false;
        S.loopHeld          = false;
        S.loopJogActive     = false;
        S.perfModsHeld      = 0;
        sendPerfMods();
        if (_hadLoop)
            host_module_set_param('looper_stop', '1');
    }
    if (S.sessionView) {
        for (let i = 0; i < 16; i++) setLED(16 + i, LED_OFF);
        for (let t = 0; t < 8; t++) setLED(TRACK_PAD_BASE + t, LED_OFF);
    } else {
        for (let row = 0; row < 4; row++)
            for (let t = 0; t < 8; t++) setLED(92 - row * 8 + t, LED_OFF);
    }
}

export function _onCCMsg(d1, d2) {
    /* Swallow the release of a button whose press was consumed by a modal
     * guard below, so tap-on-release handlers (Capture, Sample, ...) don't
     * fire from a press they never saw. */
    if (S._modalSwallowCC >= 0 && d1 === S._modalSwallowCC) {
        if (d2 === 0) S._modalSwallowCC = -1;
        return;
    }
    /* Self-managed Back button: centralize ALL Back handling here (press/hold/
     * release) BEFORE the press-based modal catch-alls below, so Back never
     * double-fires (cancel on press via a catch-all AND tap on release). See
     * _handleBack. (On a pre-#165 host plain Back is swallowed by the host and
     * never arrives; only Shift+Back reaches us — _handleBack handles that too.)
     * Co-run is excluded: Back there is host/peer-owned (deferred to a later
     * pass), so we don't claim it and never run our back-stack over co-run. */
    if (d1 === MoveBack && S.moveCoRunTrack < 0) {
        _handleBack(d2); return;
    }
    /* Live Merge NOTICE up (Shift+Rec pressed, count-in not started): modal —
     * only Rec (start the count-in) and Back (cancel) do anything; every other
     * button/knob is swallowed, press + release. Shift passes so its held state
     * stays accurate for the plain-Rec start. */
    if (S.mergeNoticePending && d1 !== MoveRec && d1 !== MoveBack && d1 !== MoveShift) {
        return;
    }
    /* Scene-bake picker: "any other btn cancels". The picking controls are
     * the scene launchers (40-43) and session step buttons (16-31); knobs,
     * knob touches, jog and the master knob aren't buttons. Any OTHER
     * button press (Shift excepted — plain modifier) dismisses the picker
     * and is swallowed, press + release. */
    if (S.pendingSceneBakePicker && d2 === 127) {
        const _pick = (d1 >= 40 && d1 <= 43) || (d1 >= 16 && d1 <= 31);
        const _nonBtn = (d1 >= 71 && d1 <= 78) || (d1 >= 102 && d1 <= 109)
            || d1 === MoveMainKnob || d1 === MoveMainTouch
            || d1 === MoveMainButton || d1 === 79 || d1 === MoveShift;
        if (!_pick && !_nonBtn) {
            S.pendingSceneBakePicker = false;
            S._modalSwallowCC = d1;
            forceRedraw();
            return;
        }
    }
    /* Live-merge placement (scene or single-clip): cancel is BACK now (handled
     * in _backTap → merge_cancel), not Record. Record is inert during placement
     * so a stray press can't discard the take. */
    /* Capture placement: Record cancels the pick (buffered input is kept, so
     * the user can try again or Shift+Capture to discard). */
    if (S.capturePlaceTrack >= 0 && d2 === 127 && d1 === MoveRec) {
        S.capturePlaceTrack = -1;
        S._modalSwallowCC = d1;
        forceRedraw();
        return;
    }
    /* Shift+volume: accumulate here, apply in ONE read-modify-write per tick
     * (ui_tick) — engine reads do not belong in the MIDI handler. Plain CC 79
     * never reaches this function (ui.js drops it; Move native). Sound mode's
     * track flavour consumed the CC before dispatch got here, so this handler
     * covers everywhere else — track view, session view, the session-FX
     * screen — with one meaning. */
    if (d1 === 79) {
        if (S.shiftHeld) { S.tvDeltaAcc += decodeDelta(d2); }
        return;
    }
    _onCC_jog(d1, d2);
    _onCC_buttons(d1, d2);
    _onCC_transport(d1, d2);
    _onCC_side(d1, d2);
    _onCC_stepedit(d1, d2);
    _onCC_knobs(d1, d2);
}
