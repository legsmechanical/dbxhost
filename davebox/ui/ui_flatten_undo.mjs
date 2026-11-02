/* ui_flatten_undo.mjs — UNDO AFTER A TRACK IS MADE AUDIO (Josh, 2026-11-02:
 * "undo" — one Undo, the step every other edit takes).
 *
 * Flatten (and Audio picked in Instmt/Dest) clears the notes, makes the track
 * Audio and removes its instrument. The engine keeps the clips and the track's
 * type (tN_convert_to_audio "u": all 16 clips in the undo slots, the rest
 * swapped back by undo_restore, again by redo_restore). What it cannot reach
 * rides the same step as a JS patch (markJsUndoPatch), captured here before
 * the conversion:
 *   - the instrument: its module and its whole state (the preset blob), loaded
 *     again and its state set once the slot has it (the chain instantiates
 *     asynchronously — flatUndoTick waits for it);
 *   - the route, MIDI channel and the track it follows;
 *   - the insert FX's bypass (Flatten Post bypasses them; Undo puts back what
 *     they were, Redo what Flatten made them).
 * The screen's copy of the clips and the type is re-read from the engine
 * (its restore names the track, "f t", which re-reads everything). */

import { S, noteUndoUnit, markJsUndoPatch } from './ui_state.mjs';
import { PAD_MODE_AUDIO, INSTR_NONE } from './ui_constants.mjs';
import { engineLoadedModule, engineLoadModule, engineGetState, engineSetState, engineGet, engineSet,
         slotIndex } from './ui_engine.mjs';
import { applyInstrChoice, applyTrackConfig } from './ui_dsp_bridge.mjs';
import { auForgetTrack } from './ui_audio.mjs';
import { closeAudioChooser } from './ui_audio_chooser.mjs';
import { closeAudioPanel } from './ui_audio_editor.mjs';
import { bankListForMode } from './ui_pure.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { invalidateLEDCache, forceRedraw } from './ui_leds.mjs';
import { reconcileParallelSlot } from './ui_parallel.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
/* a cycle (ui_sound imports the conversion): used only inside function bodies */
import { soundTrackTypeChanged } from './ui_sound.mjs';

const FX_BLOCKS = ['fx1', 'fx2', 'fx3', 'fx4'];
const STATE_WAIT_TICKS = 400;           /* ~4 s for the slot to take the module */

function fxBypass(slot) {
    return FX_BLOCKS.map((b) => (engineLoadedModule(slot, b) ? engineGet(slot, b, 'bypassed') : null));
}
function setFxBypass(slot, vals) {
    FX_BLOCKS.forEach((b, i) => {
        if (vals[i] !== null && vals[i] !== undefined && engineLoadedModule(slot, b))
            engineSet(slot, b, 'bypassed', String(vals[i]));
    });
}

/* Tick context (reads the slot), before the conversion's keys go. */
export function flatUndoCapture(t) {
    const slot = slotIndex(t);
    const synth = S.trackRoute[t] === 0 ? (engineLoadedModule(slot, 'synth') || '') : '';
    let state = null;
    if (synth) {
        const s = engineGetState(slot, 'synth');
        state = (s === null || s === undefined) ? null : String(s);
    }
    return { t, slot, padMode: S.trackPadMode[t], conductor: S.conductorTrack === t,
             route: S.trackRoute[t], channel: S.trackChannel[t], midiTo: S.trackMidiTo[t] | 0,
             synth, state, fx: fxBypass(slot), fxAfter: null };
}

/* The step itself: the engine's (the conversion's "u") and this patch. */
export function flatUndoArm(rec) {
    noteUndoUnit();
    markJsUndoPatch('flatten', () => flatUndo(rec), () => flatRedo(rec));
}

function trackChanged(t, mode) {
    S.trackPadMode[t] = mode;
    if (bankListForMode(mode, t).indexOf(S.trackActiveBank[t]) < 0) S.trackActiveBank[t] = 0;
    if (t === S.activeTrack && bankListForMode(mode, t).indexOf(S.activeBank) < 0) S.activeBank = 0;
    soundTrackTypeChanged(t);
    computePadNoteMap();
    invalidateLEDCache();
    forceRedraw();
}

function flatUndo(rec) {
    const t = rec.t;
    /* recordings still loading into the clips stop: the clips are MIDI again */
    if (S.auApply && S.auApply.t === t) S.auApply = null;
    if (S.auPanel && S.auPanel.t === t) closeAudioPanel();     /* and its WAVE editor */
    if (S.auChooser && S.auChooser.t === t) closeAudioChooser();
    auForgetTrack(t);
    rec.fxAfter = fxBypass(rec.slot);
    if (rec.route === 0) {
        if (S.trackRoute[t] !== 0) applyTrackConfig(t, 'route', 0);
        if (rec.synth) {
            engineLoadModule(rec.slot, 'synth', rec.synth);
            reconcileParallelSlot(rec.slot);
            if (rec.state !== null) S.flatUndoState = { slot: rec.slot, id: rec.synth, blob: rec.state, ticks: 0 };
        }
    } else {
        applyTrackConfig(t, 'midi_to', rec.route === 2 ? rec.midiTo : 0);
        applyTrackConfig(t, 'channel', rec.channel);
        applyTrackConfig(t, 'route', rec.route);
    }
    setFxBypass(rec.slot, rec.fx);
    if (rec.conductor) S.conductorTrack = t;
    trackChanged(t, rec.padMode);
}

function flatRedo(rec) {
    const t = rec.t;
    S.flatUndoState = null;
    applyInstrChoice(t, INSTR_NONE);
    if (rec.fxAfter) setFxBypass(rec.slot, rec.fxAfter);
    if (S.conductorTrack === t) S.conductorTrack = -1;
    trackChanged(t, PAD_MODE_AUDIO);
}

/* Every tick: the instrument's state, once its slot has the module. */
export function flatUndoTick() {
    const p = S.flatUndoState;
    if (!p) return;
    if (engineLoadedModule(p.slot, 'synth') === p.id) {
        S.flatUndoState = null;
        engineSetState(p.slot, 'synth', p.blob);
        return;
    }
    if (++p.ticks > STATE_WAIT_TICKS) {
        S.flatUndoState = null;
        showActionPopupFor(2500, 'UNDO', 'Sound not restored');
    }
}
