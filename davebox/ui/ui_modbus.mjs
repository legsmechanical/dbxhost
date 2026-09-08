/*
 * ui_modbus.mjs — MODULE BUSES: the data layer for a splittable module's voice
 * groups, their inserts and their sends.
 *
 * ⚠⚠ "BUS" ALREADY MEANS SOMETHING ELSE IN THIS MODULE, and that is the reason
 * this file is named modbus and not buses.
 *
 *   davebox's `bus`   a MIXER POSITION — a Move FX strip, the global/master
 *                     strip, or the chain slot that occupies the same place.
 *                     `S.bus.kind` is 'move' | 'global', VIEW_BUSES is the
 *                     master strip's screen.
 *
 *   a MODULE bus      a subset of ONE module's voices, rendered into its own
 *                     buffer, with its own insert chain and its own two send
 *                     levels. It lives inside a single slot. A drum module
 *                     putting its hats on one and its kick on another is the
 *                     case it exists for.
 *
 * They are not the same idea at any level, and one word for both would be a
 * mixer strip you cannot tell from a voice group on the screen that lists them.
 *
 * ⭐ SO: the KEYS stay `bus<N>:` — that is the module contract the DSP and every
 * module author speak (`default_buses`, `bus1:fx2`, `bus2:send1`), and renaming
 * them would fork the contract.
 *
 * ⚠ THE SEPARATION IS A SOURCE-LEVEL ONE, NOT A SCREEN-LEVEL ONE. This file is
 * modbus and its symbols are modBus* so the two ideas cannot be confused where
 * they are both written down. On the DISPLAY they never collide, because
 * davebox does not use the word for mixer strips at all — see MODBUS_LABEL.
 *
 * ================= WHY THIS FILE IS DATA-ONLY ==============================
 *
 * Every RULE about what a group is, what its rows say and what a write should
 * be lives in shared/bus_model.mjs, which tests/host runs under node. This file
 * is the READS and the CACHING — the parts that need a slot and a device — and
 * the screens are separate again. Nothing here draws.
 */

import * as BusModel from '/data/UserData/schwung/shared/bus_model.mjs';
import { engineGetChainParam, engineSetChainParam } from './ui_engine.mjs';

/*
 * davebox's word for a module bus, on screen. ONE constant, deliberately.
 *
 * ⭑ IT IS "Buses", and the collision above does NOT reach it — that was my
 * error, corrected by Josh and then by grep. davebox's UI says the word "bus"
 * to the user EXACTLY ONCE in the whole module: `bus moved: FX kept`, the
 * snapshot-recall warning in ui_devsnap.mjs. Every other occurrence is a
 * console.log, a comment, a key format, or an identifier. The mixer strips are
 * presented by their own names and their level rows (Volume, Send A/B, Mute,
 * Solo) — no screen calls them buses.
 *
 * So the user-facing word was never taken, and inventing a davebox-only
 * synonym ("Voice Groups", which this was for one commit) would have cost a
 * translation every time someone read a module's own documentation — where
 * these are buses, because `default_buses` is what the module declares.
 *
 * The collision is real in the CODE, which is why this file is ui_modbus and
 * its symbols are modBus*: `S.bus` is a mixer position and VIEW_BUSES is the
 * master strip's screen. Keep that separation in the source; it does not need
 * to reach the display.
 */
export const MODBUS_LABEL = 'Buses';

/* Re-exported from the model so a screen never re-derives a cap or a step.
 * SEND_LEVEL_STEP is 4 deliberately: a detent per unit makes a full sweep 127
 * turns of the jog, which is not a level anyone can ride. */
export const SEND_LEVEL_MAX = BusModel.SEND_LEVEL_MAX;
export const SEND_LEVEL_STEP = BusModel.SEND_LEVEL_STEP;

/* ==========================================================================
 * THE TRI-STATE, which is the whole reason this file exists
 * ==========================================================================
 *
 * `synth:split_voices` HAS THREE ANSWERS AND THEY ARE NOT TWO:
 *
 *   JSON   the module splits; these are its voices
 *   ""     the channel answered and the module declares none — it CANNOT
 *          split, and nothing is offered: no row, no door, no screen
 *   null   the read did not complete. NOT news about the module.
 *
 * ⚠⚠ THIS IS WHY probeCaps' `has()` PATTERN MUST NOT BE USED HERE. That helper
 * is `v !== null && v !== undefined && v !== ''` — it collapses the failed read
 * into the same answer as "declares none". For `send_a` that is harmless: the
 * next entry re-probes. Here it is not, because the answer REMOVES A DOOR: a
 * single timed-out read on entry would tell the user this module has no voice
 * groups, and nothing on the screen would ever say otherwise.
 *
 * So an unresolved read leaves the cache UNRESOLVED and the door simply absent
 * for that tick, and the next refresh asks again. Absent-because-unknown and
 * absent-because-none look the same on screen for one frame; they must never
 * be the same in the state.
 */

/* The cache. `split.unresolved` is the resting state at boot and after every
 * module change — never `{voices: []}`, which is a CLAIM. */
export function modBusInitState() {
    return {
        slot: -1,
        split: { unresolved: true, voices: [] },
        config: { unresolved: true, buses: [], mainSends: [] },
    };
}

/*
 * Re-read the module's declared voice list for `slot`.
 *
 * Costs ONE round trip (~2.9 ms). Call it on entry and on a module change, not
 * per frame — the answer only moves when the loaded module does.
 * See [[schwung-performance-and-snappy-ui-are-a-priority]].
 */
export function modBusRefreshSplit(st, slot) {
    /* Same rule, and here it is automatic: the parse REPLACES the cache
     * unconditionally, so a failed read on a new slot lands as 'unknown' rather
     * than carrying the previous module's voice list forward. Stated because
     * the config's sibling above needs an explicit discard and a reader will
     * ask why this one does not. */
    if (st.slot !== slot) st.config = { unresolved: true, buses: [], mainSends: [] };
    const raw = engineGetChainParam(slot, 'synth:split_voices');
    st.slot = slot;
    st.split = BusModel.parseSplitVoices(raw);
    return st.split;
}

/*
 * Re-read the slot's bus configuration. Also one round trip.
 *
 * An unresolved answer keeps the LAST GOOD config rather than replacing it with
 * an empty one: the screens draw "Reading..." off `unresolved`, and a caller
 * that overwrote a good list with an empty one would flash an empty list — a
 * claim the slot never made — every time a read was slow.
 */
export function modBusRefreshConfig(st, slot) {
    /* ⚠⚠ LAST-GOOD IS ONLY GOOD FOR THE SAME SLOT. Keeping a stale list across a
     * TRACK CHANGE would draw the previous track's buses under this track's
     * name — a wrong answer that looks exactly like a right one, which is worse
     * than the "Reading..." it would replace. So a slot change discards first,
     * and only then does the unresolved-keeps-last-good rule apply. */
    if (st.slot !== slot) {
        st.config = { unresolved: true, buses: [], mainSends: [] };
        st.split = { unresolved: true, voices: [] };
    }
    const raw = engineGetChainParam(slot, 'buses:config');
    const parsed = BusModel.parseBusesConfig(raw);
    st.slot = slot;
    if (!parsed.unresolved) st.config = parsed;
    else if (!st.config || st.config.unresolved) st.config = parsed;
    /* else: keep the last good one — every row in it was true a moment ago, and
     * an empty list is a claim the slot never made. */
    return st.config;
}

/*
 * DOES THIS SLOT OFFER VOICE GROUPS AT ALL?
 *
 * True ONLY on a resolved, non-empty answer. The two false cases are different
 * and the difference is why modBusDoorState exists below — a caller that only
 * needs a yes/no for a row can use this, but a caller that wants to explain
 * itself must not, or it will say "none" when it means "not yet".
 */
export function modBusSplits(st) {
    return !!(st && st.split && !st.split.unresolved && st.split.voices.length > 0);
}

/*
 * The door's three states, spelled out so a screen can tell them apart:
 *
 *   'open'    the module splits — offer the row
 *   'absent'  it resolved and declares no voices — offer nothing, ever
 *   'unknown' the read has not completed — offer nothing YET, and ask again
 *
 * A caller that treats 'unknown' as 'absent' has reintroduced the bug this
 * whole file is shaped around, so the two are never one value.
 */
export function modBusDoorState(st) {
    if (!st || !st.split || st.split.unresolved) return 'unknown';
    return st.split.voices.length > 0 ? 'open' : 'absent';
}

/* ==========================================================================
 * THE ROWS — thin wrappers, so a screen never calls bus_model with the wrong
 * arguments and every screen counts the same rows.
 * ========================================================================== */

/** The group list: every present group, then "New Group" if one is free. */
export function modBusRows(st, abbrev) {
    return BusModel.busListRows(st ? st.config : null, abbrev);
}

/*
 * A row's LABEL and its VALUE column, straight from the model.
 *
 * Wrapped rather than imported at each screen so there is ONE place a row
 * becomes text: the orphan mark ("!") is part of the LABEL because it is a fact
 * about the group rather than about its sends, and it has to survive the value
 * column being truncated.
 */
export function modBusRowLabel(row) { return BusModel.busRowLabel(row); }
export function modBusRowValue(row) { return BusModel.busRowValue(row); }

/** How many groups this slot has; -1 for an unresolved read, never 0. */
export function modBusCount(st) {
    return BusModel.busCount(st ? st.config : null);
}

/** The voice rows for one group, including its unresolved (orphan) ids. */
export function modBusVoiceRows(st, groupIndex) {
    if (!st || !st.split || st.split.unresolved) return [];
    return BusModel.voiceRows(st.config, st.split.voices, groupIndex);
}

/*
 * One bus's action menu, and the value a send row shows.
 *
 * ONLY a bus has a menu — the New row creates, and a list must never carry a
 * row that answers a click by doing nothing. modBusActionItems answers [] for
 * anything else, which is what keeps that true.
 */
export function modBusActionItems(row) { return BusModel.busActionItems(row); }
export function modBusSendValueForRow(row, id) { return BusModel.busSendValue(row, id); }

/*
 * A voice row's value column: whose it is. "*" for this bus, another bus's NAME
 * when it belongs to one (so moving it is informed), "!" for an orphan, and
 * nothing for a voice on Main.
 */
export function modBusVoiceRowValue(row, st) {
    return BusModel.voiceRowValue(row, st ? st.config : null);
}

/** The lowest free bus index, or -1 — what the New row acts on. */
export function modBusFirstFree(st) { return BusModel.firstFreeBus(st ? st.config : null); }

/* ==========================================================================
 * THE WRITES
 *
 * Each is the whole of one edit, so a screen never assembles a key. The
 * spelling is bus_model's — see busSendGridRealKey, which is the ONE producer
 * of a send key in this fork (test_bus_model.sh pins that there is no second).
 * ========================================================================== */

/*
 * Assign or unassign `voiceId` on `groupIndex`.
 *
 * A voice renders into exactly ONE buffer, so taking it MOVES it: the write to
 * this group is preceded by a write to whichever other group holds it.
 * Orphaned ids are carried through untouched — the list write is a whole-list
 * replace, and rebuilding it from only the resolvable voices would erase the
 * very ids the orphan count reports.
 *
 * Returns the number of writes issued, so a caller can budget: this is 1 or 2
 * round trips, never per-voice.
 */
export function modBusToggleVoice(st, slot, groupIndex, voiceId) {
    if (!st || !st.config || st.config.unresolved) return 0;
    let writes = 0;
    for (const mv of BusModel.voiceMoveWrites(st.config, groupIndex, voiceId)) {
        engineSetChainParam(slot, `bus${mv.bus + 1}:voices`, mv.ids.join(','));
        writes++;
    }
    const ids = BusModel.toggledVoiceIds(st.config, groupIndex, voiceId);
    engineSetChainParam(slot, `bus${groupIndex + 1}:voices`, ids.join(','));
    return writes + 1;
}

/** Create the lowest free group, or -1 if the slot is full / unresolved. */
export function modBusCreate(st, slot) {
    const at = BusModel.firstFreeBus(st ? st.config : null);
    if (at < 0) return -1;
    engineSetChainParam(slot, `bus${at + 1}:create`, '1');
    return at;
}

/** Delete a group. Its voices fall back to Main; its inserts are retired. */
export function modBusDelete(st, slot, groupIndex) {
    engineSetChainParam(slot, `bus${groupIndex + 1}:delete`, '1');
}

/** Rename a group. */
export function modBusRename(st, slot, groupIndex, name) {
    engineSetChainParam(slot, `bus${groupIndex + 1}:name`, String(name || ''));
}

/*
 * Set one of a group's two send levels, 0..SEND_LEVEL_MAX.
 *
 * `which` is 1 or 2. The key comes from bus_model so this cannot become a
 * second spelling — see the one-spelling invariant in test_bus_model.sh.
 */
export function modBusSetSend(st, slot, groupIndex, which, level) {
    const row = { index: groupIndex };
    const key = BusModel.busSendGridRealKey(BusModel.sendGridKey(row, which));
    if (!key) return false;
    const v = Math.max(0, Math.min(BusModel.SEND_LEVEL_MAX, Math.round(level)));
    engineSetChainParam(slot, key, String(v));
    return true;
}

/** A group's current send level, from the cached config. */
export function modBusSendValue(st, groupIndex, which) {
    const b = st && st.config && !st.config.unresolved ? st.config.buses[groupIndex] : null;
    if (!b || !b.sends) return 0;
    return b.sends[which === 2 ? 1 : 0] || 0;
}
