/* ui_print.mjs — PRINT: Bake of a clip whose track has an active POST MIDI FX
 * module (Josh, 2026-10-14).
 *
 * The offline bake renders dAVEBOx's own sequencer effects and cannot run a
 * MIDI FX module, so a clip whose track has one in play (loaded, not bypassed,
 * Position Post) is baked by PLAYING it: the engine records what the module
 * actually puts out for the chosen number of passes and writes it over the
 * clip (print_arm … print_finish in the engine). Then the module is bypassed,
 * so the clip is not processed twice — kept, not removed, so the bake can be
 * undone and the module reused.
 *
 * While it runs the screen says so and the surface is held, as Live Merge's
 * notice holds it: Back cancels (the clip is left as it was), everything else
 * is swallowed. Every other bake stays instant.
 */
import { S } from './ui_state.mjs';
import { slotIndex, engineLoadedModule, engineGet, engineSet, engineSetChainParam,
         engineSaveState } from './ui_engine.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { noteUndoUnit } from './ui_state.mjs';
import { ROUTE_NONE, PAD_MODE_DRUM } from './ui_constants.mjs';
import { MoveBack, MoveShift } from '/data/UserData/schwung/shared/constants.mjs';

/* { t, c, loops, slot, polled } while a print runs; null otherwise. */
let printing = null;
export function printActive() { return printing !== null; }

/* Does a bake of track t's clip need a print? Two reads, at the dialog's
 * confirm only. */
export function bakeNeedsPrint(t) {
    if (S.trackRoute[t] === ROUTE_NONE || S.trackFxPre[t]) return false;
    const slot = slotIndex(t);
    if (!engineLoadedModule(slot, 'midi_fx1')) return false;
    return engineGet(slot, 'midi_fx1', 'bypassed') !== '1';
}

/* The tracks (1-based, as shown) whose MIDI FX module an OFFLINE bake or an
 * export leaves out — a scene bake and Export to Live do not print. Two reads
 * per track, at the commit only. */
export function midiFxLeftOut() {
    const out = [];
    for (let t = 0; t < 8; t++) if (bakeNeedsPrint(t)) out.push(t + 1);
    return out;
}

/* Start one. False (and a notice) when it cannot: the transport must be
 * stopped, as for Live Merge. */
export function printStart(t, c, loops) {
    if (S.playing) {
        showActionPopupFor(2500, 'STOP TO BAKE', 'MIDI FX bakes by playing');
        return false;
    }
    const slot = slotIndex(t);
    /* Nothing to re-route: the module runs first, so the track's own output
     * -- what the engine records -- already has it in. */
    host_module_set_param('print_arm', t + ' ' + c + ' ' + loops);
    printing = { t, c, loops, slot, polled: 0 };
    showActionPopupFor(60000, 'PRINTING ' + loops + 'x', 'MIDI FX, live', 'Back cancels');
    return true;
}

export function printCancel() {
    if (!printing) return;
    const p = printing;
    printing = null;
    host_module_set_param('print_cancel', '1');
    showActionPopupFor(1500, 'BAKE CANCELLED');
}

/* From the tick: read the engine's state now and then; on DONE, finish. */
export function printTick() {
    if (!printing) return;
    if (++printing.polled % 10) return;                 /* ~10 Hz is plenty */
    const raw = host_module_get_param('print_state');
    const st = parseInt(raw, 10);
    if (st === 3) {
        const p = printing;
        printing = null;
        engineSet(p.slot, 'midi_fx1', 'bypassed', '1');   /* or the clip plays through it twice */
            host_module_set_param('print_done', '1');
        engineSaveState();
        noteUndoUnit(); S.undoSeqArpSnapshot = null;
        showActionPopupFor(2500, 'BAKED', p.loops + 'x', 'MIDI FX bypassed');
        S.pendingBankRefresh      = p.t;
        S.pendingStepsReread      = 2;
        S.pendingStepsRereadTrack = p.t;
        S.pendingStepsRereadClip  = p.c;
        if (S.trackPadMode[p.t] === PAD_MODE_DRUM) {
            S.pendingDrumResync      = 2;
            S.pendingDrumResyncTrack = p.t;
        }
        S.screenDirty = true;
    } else if (st === 0 && printing.polled > 30) {
        /* the engine dropped it (refused, or stopped under it) */
        const p = printing;
        printing = null;
            showActionPopupFor(2000, 'BAKE STOPPED');
    } else if (printing.polled % 50 === 0) {
        showActionPopupFor(60000, 'PRINTING ' + printing.loops + 'x', 'MIDI FX, live', 'Back cancels');
    }
}

/* The surface while a print runs: Back cancels; Shift passes; every other
 * button press and release is swallowed. Returns true if it took the event. */
export function printModalCC(d1, d2) {
    if (!printing) return false;
    if (d1 === MoveShift) return false;
    if (d1 === MoveBack) { if (d2 === 127) printCancel(); return true; }
    /* knobs, touches and the jog are not buttons; leave them be */
    if ((d1 >= 71 && d1 <= 79) || (d1 >= 102 && d1 <= 109) || d1 === 14 || d1 === 8 || d1 === 9) return false;
    return true;
}
