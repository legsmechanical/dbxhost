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
 *     they were, Redo what Flatten made them);
 *   - when what was recorded is NOT the track's own slot — a Move instrument
 *     (its Move FX bus), or the instrument of a track it follows — that
 *     source's insert FX (module, state, bypass) and levels are COPIED onto
 *     the Audio track's slot at the conversion (bypassed for Post), so it
 *     sounds and mixes as the source did and its effects stay live (Josh,
 *     2026-11-02: "move instruments feed track buses with schwung effects").
 *     The source keeps its own; Undo puts the slot's own back exactly.
 * The screen's copy of the clips and the type is re-read from the engine
 * (its restore names the track, "f t", which re-reads everything).
 *
 * ⚠ Loading the instrument blocks the engine longer than a read waits (OB-Xd:
 * 243 ms against a 100 ms timeout), so a read of the slot just after the load
 * comes back null — and engineLoadedModule's "" for it reads as "no module".
 * So nothing here reads the slot after a load in the same tick: the bypass is
 * written before the instrument, unguarded (the capture's null marks an empty
 * block), and the Parallel pin waits for the tick that sees the module. Writes
 * are queued in order and are not lost. (Found on the device: Undo left a
 * Post-bypassed FX bypassed.) A block loaded here gets its state and bypass
 * from the tick that sees it loaded (S.flatPending, flatUndoTick). */

import { S, noteUndoUnit, markJsUndoPatch } from './ui_state.mjs';
import { PAD_MODE_AUDIO, PAD_MODE_CONDUCT, INSTR_NONE, padSampled } from './ui_constants.mjs';
import { engineLoadedModule, engineLoadModule, engineGetState, engineSetState, engineGet, engineSet,
         engineGetMany, engineSetSlotParam, moveBusForChannel, moveBusComp, slotIndex } from './ui_engine.mjs';
import { moduleIdOf } from './ui_discover.mjs';
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

const LEVELS = ['volume', 'pan', 'send_a', 'send_b'];

function fxBypass(slot) {
    return FX_BLOCKS.map((b) => (engineLoadedModule(slot, b) ? engineGet(slot, b, 'bypassed') : null));
}
function setFxBypass(slot, vals) {
    FX_BLOCKS.forEach((b, i) => {
        if (vals[i] !== null && vals[i] !== undefined) engineSet(slot, b, 'bypassed', String(vals[i]));
    });
}

const str = (v) => ((v === null || v === undefined) ? null : String(v));

/* A rack's four insert blocks, whole: [{id, state, bypass} | null]. `slot`,
 * `prefix` address it as the engine does — a chain slot ('', its own slot) or
 * a Move bus ('move_fx:N:' on slot 0). */
function blocksOf(slot, prefix) {
    return FX_BLOCKS.map((b) => {
        const comp = prefix + b;
        const id = moduleIdOf(engineLoadedModule(slot, comp));
        if (!id) return null;
        return { id, state: str(engineGetState(slot, comp)), bypass: str(engineGet(slot, comp, 'bypassed')) };
    });
}
function levelsOf(slot, comp) {
    const got = engineGetMany(slot, comp, LEVELS) || {};
    const out = {};
    for (const k of LEVELS) { const v = parseFloat(got[k]); if (isFinite(v)) out[k] = v; }
    return out;
}

/* What track t's notes play when it is not its own slot: a Move instrument's
 * bus, or the slot / bus of the track it follows. null = its own slot. */
function foreignSource(t) {
    let r = S.trackRoute[t] | 0, ch = S.trackChannel[t];
    if (r === 2) {
        const to = S.trackMidiTo[t] | 0;
        if (to <= 0) return null;
        r = S.trackRoute[to - 1] | 0; ch = S.trackChannel[to - 1];
        if (r === 0) return { slot: slotIndex(to - 1), prefix: '', levels: 'slot' };
    }
    if (r !== 1) return null;
    const bus = moveBusForChannel(ch);
    return { slot: 0, prefix: moveBusComp(bus) + ':', levels: moveBusComp(bus) };
}

/* Load blocks into slot's fx1..fx4 (an empty one empties it); each one's state
 * and bypass follow from the tick that sees it (flatUndoTick). */
function putBlocks(slot, blocks, bypassAll, what) {
    S.flatPending = S.flatPending.filter((p) => !(p.slot === slot && p.comp !== 'synth'));
    FX_BLOCKS.forEach((b, i) => {
        const k = blocks[i];
        engineLoadModule(slot, b, k ? k.id : '');
        if (k) S.flatPending.push({ slot, comp: b, id: k.id, blob: k.state,
                                    bypass: bypassAll ? '1' : k.bypass, ticks: 0, what });
    });
}
function putLevels(slot, lv) {
    for (const k of LEVELS) if (lv && isFinite(lv[k])) engineSetSlotParam(slot, k, Number(lv[k]).toFixed(3));
}

/* Tick context (reads the slot), before the conversion's keys go. */
export function flatUndoCapture(t) {
    const slot = slotIndex(t);
    const synth = S.trackRoute[t] === 0 ? (engineLoadedModule(slot, 'synth') || '') : '';
    let state = null;
    if (synth) state = str(engineGetState(slot, 'synth'));
    const src = padSampled(S.trackPadMode[t]) ? null : foreignSource(t);
    return { t, slot, padMode: S.trackPadMode[t], conductor: S.conductorTrack === t,
             route: S.trackRoute[t], channel: S.trackChannel[t], midiTo: S.trackMidiTo[t] | 0,
             synth, state, fx: fxBypass(slot), fxAfter: null,
             /* the source's rack and levels, and the slot's own, for Undo */
             src: src ? { blocks: blocksOf(src.slot, src.prefix), levels: levelsOf(src.slot, src.levels) } : null,
             own: src ? { blocks: blocksOf(slot, ''), levels: levelsOf(slot, 'slot') } : null,
             after: null };
}

/* The conversion, after the instrument went: the source's effects and levels
 * onto the Audio track's slot (`post`: bypassed — the takes hold them).
 * Returns whether it copied (the caller then leaves the bypass to this). */
export function flatCopySourceFx(rec, post) {
    if (!rec || !rec.src) return false;
    putBlocks(rec.slot, rec.src.blocks, post, 'FLATTEN');
    putLevels(rec.slot, rec.src.levels);
    return true;
}

/* The step itself: the engine's (the conversion's "u") and this patch.
 * `mode`: what the track became (Audio, or a Slicer). */
export function flatUndoArm(rec, mode = PAD_MODE_AUDIO) {
    rec.toMode = mode;
    noteUndoUnit();
    markJsUndoPatch('flatten', () => flatUndo(rec), () => flatRedo(rec));
}

/* LEAVING Audio or a Slicer (Josh, 2026-11-02: "Yes" — undoable): the
 * engine's step ("u") brings the clips, samples and type back; this patch
 * takes away the instrument picked after the conversion (kept for Redo) and
 * makes the screen's copy the sampled track again. `toMode`: what it became. */
export function leaveUndoArm(rec, toMode) {
    rec.toMode = toMode;
    rec.leave = true;
    /* a sampled track plays through its own slot with no instrument: what
     * the capture may have seen loaded is the one being picked */
    rec.route = 0; rec.synth = ''; rec.state = null; rec.conductor = false;
    noteUndoUnit();
    markJsUndoPatch('leave', () => flatUndo(rec), () => flatRedo(rec));
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
    /* leaving: what was picked since — kept for Redo, then let go */
    if (rec.leave) {
        const synth = S.trackRoute[t] === 0 ? (engineLoadedModule(rec.slot, 'synth') || '') : '';
        rec.afterInstr = { route: S.trackRoute[t], channel: S.trackChannel[t], midiTo: S.trackMidiTo[t] | 0,
                           synth, state: synth ? str(engineGetState(rec.slot, 'synth')) : null };
        if (S.conductorTrack === t) S.conductorTrack = -1;
        applyInstrChoice(t, INSTR_NONE);
    }
    /* recordings still loading into the clips stop: the clips are MIDI again */
    if (S.auApply && S.auApply.t === t) S.auApply = null;
    if (S.auPanel && S.auPanel.t === t) closeAudioPanel();     /* and its WAVE editor */
    if (S.auChooser && S.auChooser.t === t) closeAudioChooser();
    auForgetTrack(t);
    if (rec.own) {
        /* the copied rack and levels go; the slot's own come back */
        rec.after = { blocks: blocksOf(rec.slot, ''), levels: levelsOf(rec.slot, 'slot') };
        putBlocks(rec.slot, rec.own.blocks, false, 'UNDO');
        putLevels(rec.slot, rec.own.levels);
    } else {
        rec.fxAfter = fxBypass(rec.slot);
        setFxBypass(rec.slot, rec.fx);
    }
    if (rec.route === 0) {
        if (S.trackRoute[t] !== 0) applyTrackConfig(t, 'route', 0);
        if (rec.synth) {
            engineLoadModule(rec.slot, 'synth', rec.synth);
            S.flatPending.push({ slot: rec.slot, comp: 'synth', id: rec.synth, blob: rec.state,
                                 bypass: null, ticks: 0, what: 'UNDO' });
        }
    } else {
        applyTrackConfig(t, 'midi_to', rec.route === 2 ? rec.midiTo : 0);
        applyTrackConfig(t, 'channel', rec.channel);
        applyTrackConfig(t, 'route', rec.route);
    }
    if (rec.conductor) S.conductorTrack = t;
    trackChanged(t, rec.padMode);
}

function flatRedo(rec) {
    const t = rec.t;
    S.flatPending = S.flatPending.filter((p) => p.slot !== rec.slot);
    if (rec.fxAfter) setFxBypass(rec.slot, rec.fxAfter);
    if (rec.after) { putBlocks(rec.slot, rec.after.blocks, false, 'REDO'); putLevels(rec.slot, rec.after.levels); }
    if (rec.leave) {
        /* leaving again: the instrument it had been given comes back */
        if (S.auPanel && S.auPanel.t === t) closeAudioPanel();
        if (S.auChooser && S.auChooser.t === t) closeAudioChooser();
        auForgetTrack(t);
        const a = rec.afterInstr;
        if (a && a.route === 0) {
            if (S.trackRoute[t] !== 0) applyTrackConfig(t, 'route', 0);
            if (a.synth) {
                engineLoadModule(rec.slot, 'synth', a.synth);
                S.flatPending.push({ slot: rec.slot, comp: 'synth', id: a.synth, blob: a.state,
                                     bypass: null, ticks: 0, what: 'REDO' });
            }
        } else if (a) {
            applyTrackConfig(t, 'midi_to', a.route === 2 ? a.midiTo : 0);
            applyTrackConfig(t, 'channel', a.channel);
            applyTrackConfig(t, 'route', a.route);
        }
        if (rec.toMode === PAD_MODE_CONDUCT) S.conductorTrack = t;
        trackChanged(t, rec.toMode);
        return;
    }
    applyInstrChoice(t, INSTR_NONE);
    if (S.conductorTrack === t) S.conductorTrack = -1;
    trackChanged(t, rec.toMode || PAD_MODE_AUDIO);
}

/* Every tick: each loaded block's state and bypass (and an instrument's
 * Parallel pin), once its slot has the module. */
export function flatUndoTick() {
    const q = S.flatPending;
    if (!q.length) return;
    let lost = '';
    for (let i = q.length - 1; i >= 0; i--) {
        const p = q[i];
        if (moduleIdOf(engineLoadedModule(p.slot, p.comp)) === moduleIdOf(p.id)) {
            q.splice(i, 1);
            if (p.blob !== null) engineSetState(p.slot, p.comp, p.blob);
            if (p.bypass !== null) engineSet(p.slot, p.comp, 'bypassed', p.bypass);
            if (p.comp === 'synth') reconcileParallelSlot(p.slot);
        } else if (++p.ticks > STATE_WAIT_TICKS) {
            q.splice(i, 1);
            lost = p.what;
        }
    }
    if (lost) showActionPopupFor(2500, lost, 'Sound not restored');
}
