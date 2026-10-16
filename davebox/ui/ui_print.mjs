/* ui_print.mjs — PRINT: Bake of a clip whose track has an active POST MIDI FX
 * module (Josh, 2026-10-14).
 *
 * A clip whose track has one in play (loaded, not bypassed, Position Post) is
 * baked OFFLINE (2026-10-15): the host runs a private copy of the module on
 * the clip's notes against a virtual transport, and the engine puts the
 * track's own effects on what it made (print_offline; seq8_bake_post.c). With
 * Shift held on the confirm it is PRINTED live instead:
 * the engine plays the clip and records what the track puts out for the
 * chosen number of passes (print_arm … print_finish). Either way the module
 * is then bypassed, so the clip is not processed twice — kept, not removed,
 * so the bake can be undone and the module reused.
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

/* Start one. OFFLINE by default (print_offline): the host runs a copy of the
 * module on the clip's notes, at once, while the transport does whatever it
 * does. Shift held on the confirm PRINTS it live instead
 * (print_arm), which needs the transport stopped, as Live Merge does. False
 * (and a notice) when it cannot start. */
export function printStart(t, c, loops) {
    const slot = slotIndex(t);
    if (!S.shiftHeld) {
        host_module_set_param('print_offline', t + ' ' + c + ' ' + loops + ' 0');
        printing = { t, c, loops, slot, polled: 0, offline: true };
        showActionPopupFor(60000, 'BAKING ' + loops + 'x', 'MIDI FX', 'Back cancels');
        return true;
    }
    if (S.playing) {
        showActionPopupFor(2500, 'STOP TO BAKE', 'MIDI FX bakes by playing');
        return false;
    }
    /* Nothing to re-route: the module runs first, so the track's own output
     * -- what the engine records -- already has it in. */
    host_module_set_param('print_arm', t + ' ' + c + ' ' + loops);
    printing = { t, c, loops, slot, polled: 0, offline: false };
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
    /* ~10 Hz is plenty for a live print; an offline one lands in a few ms */
    if (++printing.polled % (printing.offline ? 2 : 10)) return;
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
    } else if (st === 0 && printing.polled > (printing.offline ? 10 : 30)) {
        /* the engine dropped it (refused, failed, or stopped under it) */
        const p = printing;
        printing = null;
        if (p.offline) showActionPopupFor(2500, 'BAKE FAILED', 'MIDI FX would not run', 'Shift+bake prints it live');
        else           showActionPopupFor(2000, 'BAKE STOPPED');
    } else if (!printing.offline && printing.polled % 50 === 0) {
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
