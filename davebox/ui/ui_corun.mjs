/* ui_corun.mjs
 * Primary-surface cede declaration: which Schwung slot a track's MIDI
 * channel maps to, the keep-masks dAVEBOx declares when it opens host
 * services (chain-edit / Move-native co-run, overlays), and the
 * module-side cleanup run when a service returns. Ownership itself is
 * DERIVED by the host from the declared claims + the service stack
 * (docs/PRIMARY_SURFACE.md) — this file performs no ownership calls.
 * S stays shared via ui_state.mjs.
 */

import { S } from './ui_state.mjs';
import { slotIndex } from './ui_engine.mjs';
import { invalidateLEDCache, reapplyPalette, forceRedraw } from './ui_leds.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { showActionPopup } from './ui_persistence.mjs';

/* Keep-mask flags — mirrors the CORUN_GRP_* / CORUN_KEEP_* bits in
 * Schwung's shadow_constants.h. Keep in sync with docs/CORUN.md.
 * ⚠⚠ Bit 3 is the RETIRED single-bit TRANSPORT — corun_group_for_event never
 * returns it, so keeping it keeps NOTHING. This file carried it until
 * 2026-08-24, which meant Play/Rec/Sample/Loop were silently CEDED to Move
 * during co-run despite the mask reading as if the tool kept transport. The
 * real transport is the composite of the per-button bits below. */
const CORUN_GRP_SHIFT          = 1 << 8;  /* CC 49 */
const CORUN_GRP_TRACK          = 1 << 5;  /* CC 40-43 — the side clip buttons */
const CORUN_GRP_PADS           = 1 << 1;
const CORUN_GRP_STEPS          = 1 << 2;
const CORUN_GRP_MENU           = 1 << 10;
const CORUN_GRP_PLAY           = 1 << 13; /* CC 85 */
const CORUN_GRP_REC            = 1 << 14; /* CC 86 */
const CORUN_GRP_SAMPLE         = 1 << 16; /* CC 118 */
const CORUN_GRP_LOOP           = 1 << 17; /* CC 58 */
const CORUN_GRP_TRANSPORT      = CORUN_GRP_PLAY | CORUN_GRP_REC | CORUN_GRP_SAMPLE | CORUN_GRP_LOOP;
/* Co-run pass-through split (CORUN_PASSTHROUGH.md). RE-RULED by Josh
 * 2026-08-24, after living with the first cut:
 *
 *   "pads to preserve the distinct color scheme they have in co-run, but
 *    everything else except jog wheel/click, knobs, shift, mute, copy, and
 *    delete (things used to edit instruments in move native) to remain fully
 *    as they are outside of co-run in track view."
 *
 * So the CEDED list is exactly the instrument-editing controls — jog+click,
 * knobs+touch, Mute, Copy/Delete — plus the OLED and Back, which Move's editor
 * needs to navigate itself. Shift STAYS ours (Josh: he could not recall a use
 * for it in Move's editor).
 *
 * ⭑ TRACK (CC 40-43) moved from LED-only to fully KEPT in that ruling: they are
 * the clip buttons, and "as they are outside co-run" means they select clips.
 * They used to cede their presses to Move while we blinked a paired-track
 * indicator on them — the indicator is gone.
 *
 * ⚠⚠ Bit 3 is the RETIRED single-bit TRANSPORT (see above): the real transport
 * is the per-button composite, which is why Play/Rec/Loop silently did nothing
 * here for months.
 *
 * Modifier releases for CEDED keys still never reach us; the defensive clear in
 * cleanupAfterMoveNativeCoRun covers them. */
const DAVEBOX_CORUN_KEEP_DEFAULT = CORUN_GRP_PADS | CORUN_GRP_STEPS | CORUN_GRP_TRANSPORT |
                                   CORUN_GRP_MENU | CORUN_GRP_SHIFT | CORUN_GRP_TRACK;
/* Opt out of framework Back-as-exit. dAVEBOx uses Menu as the canonical exit
 * (existing muscle memory) and lets Back cede to the peer for sub-view nav
 * (chain editor pop-up, Move firmware preset/synth navigation). */
const CORUN_KEEP_BACK_BIT      = 1 << 15;
const DAVEBOX_CORUN_KEEP_MASK  = DAVEBOX_CORUN_KEEP_DEFAULT | CORUN_KEEP_BACK_BIT;
/* Control-group bits matching Schwung's shadow_constants.h (OLED=0, PADS=1,
 * STEPS=2, TRANSPORT=3, JOG=4, TRACK=5, KNOBS=6, MASTER=7, SHIFT=8, BACK=9,
 * MENU=10, TOUCH=11). */
const CORUN_GRP_JOG   = 1 << 4;
const CORUN_GRP_KNOBS = 1 << 6;
const CORUN_GRP_BACK  = 1 << 9;
const CORUN_GRP_TOUCH = 1 << 11;
const CORUN_GRP_MUTE  = 1 << 12;  /* CC 88 — the Mute button */
/* LED-keep mask (lights/input split): dAVEBOx paints the side clip buttons
 * (CC 40-43, paintCoRunSideButtons) as a paired-track indicator, but must let
 * Move/Schwung handle the *presses* (switching the active Move track / Schwung
 * slot). So we own the TRACK group for LEDs only — input keep_mask is unchanged,
 * so the presses still cede to the peer. Without this, Move's playback repaints
 * fight our indicator. */
const DAVEBOX_CORUN_LED_KEEP_MASK = DAVEBOX_CORUN_KEEP_MASK | CORUN_GRP_TRACK;
/* Mute (CC 88) split (schwung-davebox #8): during MOVE_NATIVE co-run dAVEBOx
 * CEDES Mute to Move so the user can mute Move's instruments and drum pads —
 * the base masks above omit CORUN_GRP_MUTE, so the move-native begin cedes
 * Mute automatically, and the FX picker's mask omits it too. */

/* Mask while the FX-picker overlay is open: the normal Move-co-run mask PLUS the
 * UI elements the overlay should own — jog (turn/click), the Back *routing* group,
 * the param knobs (turn → FX value), knob touch (param pop-up), and Shift (CC 49).
 * Keeping a group routes it to shadow_ui's intercept instead of ceding it to Move
 * firmware; shadow_ui's uniform coRunWants() rule then handles exactly what we keep.
 * Shift specifically: the overlay/chain editor's Shift-modified nav (FX-bus zoom,
 * fx_picker entry) is gated on coRunWants(CORUN_GRP_SHIFT) in shadow_ui — so unless
 * we KEEP Shift here, CC 49 cedes to Move firmware and isShiftHeld() never updates,
 * making Shift dead in every fx-picker-accessed chain. NOTE: the normal mask keeps
 * only CORUN_KEEP_BACK (1<<15, the framework-exit opt-out), NOT CORUN_GRP_BACK (the
 * routing group) — so the Back/jog/knob/shift groups must be added explicitly here
 * or those elements never reach shadow_ui. */
export const DAVEBOX_PICKER_KEEP_MASK =
    DAVEBOX_CORUN_KEEP_MASK | CORUN_GRP_JOG | CORUN_GRP_BACK | CORUN_GRP_KNOBS | CORUN_GRP_TOUCH | CORUN_GRP_SHIFT;

/* ==== PRIMARY SURFACE ==================================================== *
 * dAVEBOx registers as the session's primary surface and reaches host
 * screens only through the service stack. Ownership (co-run split, LED
 * keep, sysex suppression, ...) is DERIVED by the host from the declared
 * claims + the stack — closing a service restores every claim by
 * derivation, so this file contains no assertion or re-assertion sites.
 * The classic overtake path was deleted in P4b (2026-08-08); the
 * primary.json toggle is gone with it. See docs/PRIMARY_SURFACE.md. */

/* The surface's declared baseline (overtake mode 2, sysex suppression so
 * Move's clip/grid LED sysex doesn't fight ours under Clock Follow, CC 79
 * passthrough from module.json). Declaring the real baseline matters:
 * services override these keys and the pop must restore them BY
 * DERIVATION, not by luck. */
const DAVEBOX_PRIMARY_CLAIMS = {
    overtake_mode: 2,
    suppress_sysex: 1,
    passthrough: "79",
};

/* Called once from init(). Registration survives suspend/resume (the JS is
 * parked, not reloaded), so init re-running on a warm relaunch simply
 * re-registers — idempotent on the host side, which also neutralizes any
 * co-run state a warm restart left in SHM. */
export function initPrimarySurface() {
    const ok = host_register_primary({
        id: "davebox-sound",
        claims: DAVEBOX_PRIMARY_CLAIMS,
        onServiceReturn: onServiceReturn,
    });
    /* One line per session confirming the ownership model came up — without
     * it the live model is invisible in every log. A false return is a host
     * defect (there is no fallback path left); say so loudly. */
    console.log(ok
        ? "PRIMARY: registered as primary surface (derived claims live)"
        : "PRIMARY: registration FAILED — host defect, ownership claims not live");
    return ok;
}

/* Service-close notifications — including framework-initiated closes (the
 * shim's Back handler), which the host reconciles from SHM and reports here.
 * This replaces the pollDSP target=NONE reconcile on the primary path: ONE
 * return path, with the module-side cleanup the exit helpers used to carry. */
function onServiceReturn(id, _result) {
    if (id === "move_native") {
        cleanupAfterMoveNativeCoRun();
    }
    /* Overlay services (fx_picker) need no module-side cleanup. */
    S.screenDirty = true;
}

/* The Schwung chain slot a dAVEBOx track addresses. Direct: each track
 * IS the track index — a track owns its instrument, so there is no mapping to
 * resolve and nothing stored that could disagree. `slotIndex` stays as the
 * bound: it clamps if the slot count is ever less than the track count, which
 * would be a build mistake rather than a routing choice.
 * (Historical: this read S.trackSlot / DSP tN_slot, a per-track CHOICE, and the host dispatches
 * to it by index — the old receive-channel matching (and its "All"-channel
 * layering, its per-tick shadow_get_slots() enumeration, and its "NO SCHWUNG
 * SLOT for channel N" failure mode) is gone. */
export function schSlotForTrack(t) {
    return slotIndex(t);
}

/* Bitmask form kept for the session-view per-track level loop: exactly one
 * bit now — the track's addressed slot. */
export function schSlotsForTrack(t) {
    return 1 << slotIndex(t);
}

/* Every track's mask written into `out` (same one-call shape the tick loop
 * already uses; no chain enumeration needed anymore). */
export function schSlotMasksAllTracks(out) {
    for (let t = 0; t < out.length; t++) out[t] = 1 << slotIndex(t);
    return out;
}

/* Enter Move-native co-run for dAVEBOx track t. Asks the shim to (a) yield
 * the OLED to Move firmware and (b) flip its sh_midi filter / shadow_ui
 * forward so the nav-CC + touch-note set routes to Move firmware instead
 * of dAVEBOx. Fires one cable-0 track-button tap so Move firmware lands
 * on the preset browser for the relevant track without the user touching
 * the front panel. Move's track-button CC mapping is REVERSED
 * (CC 43 = Track 1 ... CC 40 = Track 4), and dAVEBOx tracks 5-8 with
 * ROUTE_MOVE rely on the user's trackChannel to address one of Move's
 * 4 tracks — if trackChannel is outside 1-4 we just enter co-run without
 * an auto-tap and let the user pick the Move track manually. */
export function enterMoveNativeCoRun(t, origin) {
    /* Track view only (Josh, 2026-08-08) — see openSchwungSlotEditor. */
    if (S.sessionView) {
        showActionPopup('TRACK VIEW ONLY', 'Switch out of session', 'view to edit synths.');
        return;
    }
    S.moveCoRunTrack = t;
    /* WHERE you came in from, so Menu can put you back there (P8a 1d).
     * 'sound' = the SYNTH row of the track's Move sound mode; anything else
     * (the track menu's `Edit Synth...`) means track view, which is where a
     * plain co-run close lands you anyway. Recorded at ENTRY because by the
     * time the service returns there is nothing left to infer it from —
     * sound mode was exited on the way in. */
    S.moveCoRunOrigin = (origin === 'sound') ? 'sound' : 'track';
    /* Re-push the padmap so the left-column lane pads become 0xFF (DSP on_midi
     * skips sounding them; Move handles sound+select via the injected pad).
     * Also queue a tick recompute in case this set_param push coalesces away. */
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    /* The move_native service's claims carry the whole split, including
     * skip_led_clear (Move's LED passthrough) — derived, and restored by
     * derivation on close. */
    host_open_service("move_native", {
        track: t,
        keep_mask: DAVEBOX_CORUN_KEEP_MASK,
        led_keep_mask: DAVEBOX_CORUN_LED_KEEP_MASK,
    });
    /* Defer the track-button "press" that lands Move on the device-edit page and
     * makes it repaint its track + knob LEDs. Injecting it immediately fails: Move's
     * repaint lands before the shim's co-run LED passthrough + OLED bypass go live
     * (corun_move_native_track hasn't propagated to the shim yet), so the repaint is
     * stripped and the LEDs don't show until a manual press. Fire it from tick() a
     * few ticks later, once co-run is fully active. */
    S.pendingMoveCoRunInject = 12;
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;
    S.screenDirty = true;
}

/* Exit Move-native co-run. Pops the service; onServiceReturn carries the
 * module-side cleanup and the host derives skip_led_clear + sysex back —
 * no toggles here. */
export function exitMoveNativeCoRun() {
    if (S.moveCoRunTrack < 0) return;
    host_close_service(null);
}

/* Module-side cleanup, run from onServiceReturn. No ownership calls —
 * the host derives the split teardown; this is state, modifiers, palette,
 * LED cache only. */
function cleanupAfterMoveNativeCoRun() {
    /* Return to origin (P8a 1d). Read + cleared BEFORE the track index is, and
     * acted on at the END of this function — see the tail. */
    const _origin = S.moveCoRunOrigin;
    const _originTrack = S.moveCoRunTrack;
    S.moveCoRunOrigin = null;
    S.moveCoRunTrack = -1;
    S.pendingMoveCoRunInject = 0;  /* cancel any pending entry inject */
    S.moveCoRunPressQueue = null;  /* cancel any in-flight track-row press sequence */
    /* Restore the real drum padmap (left-column lane pads sound via DSP again);
     * also queue a tick recompute in case this set_param push coalesces away. */
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    /* If any drum pad hold injects were in flight, send a note-off for EACH
     * before the co-run session ends so Move doesn't get a stuck note — a
     * scalar here used to leak a note-off for every held pad but the first
     * (js-input-1); a Set lets us drain them all. */
    if (S.moveCoRunDrumHeld.size > 0) {
        for (const _heldPad of S.moveCoRunDrumHeld)
            move_midi_inject_to_move([0x08, 0x80, _heldPad, 0]);  /* plain pad off (no Shift was sent) */
    }
    S.moveCoRunDrumHeld.clear();
    /* Modifier-key release CCs the user pressed inside Move firmware never
     * reach us during co-run — clear defensively so a stuck Shift/Mute/etc.
     * can't silence pad dispatch on return. Mirrors resume-from-suspend. */
    S.shiftHeld = false; S.deleteHeld = false; S.muteHeld = false;
    S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false;
    S.captureHeld = false; S.shiftTrackLEDActive = false;
    /* Move firmware may have rewritten palette scratch entries (knob rings,
     * Shift/Back, etc.) while we were ceded. Reapply our palette before
     * invalidating the LED cache so forceRedraw below repaints with the
     * right colors, not stale ones left by Move firmware. */
    reapplyPalette();
    invalidateLEDCache();
    /* Force the knob-ring LEDs (CC 71-78) to repaint over Move's native colors on
     * the next draw. invalidateLEDCache clears the JS LED cache, but reapplyPalette
     * leaves the hardware buttonCache stale so the normal (non-forced)
     * cachedSetButtonLED knob writes get dropped — Move's knob colors then persist
     * until the user happens to change a knob value. One-shot force in updateTrackLEDs
     * (mirrors the force=true the track-button reclaim already uses). */
    S._forceKnobReemit = true;
    forceRedraw();
    /* LAST: back to where you came in from.
     *
     * Deliberately after every restore above — soundEnterMove claims the volume
     * knob and reads the bus, and doing that before the palette/LED/modifier
     * teardown would have it undone underneath. A 'track' origin needs nothing:
     * closing the service already lands on track view.
     *
     * Guarded on the route still being Move: the only way it changed is the
     * global menu, which is unreachable during co-run, but re-entering a Move
     * screen for a track that is no longer Move-routed would be a screen with
     * nothing behind it. */
    if (_origin === 'sound' && _originTrack >= 0 && S.trackRoute[_originTrack] === 1) {
        S.pendingSoundEnterTrack = _originTrack;
    }
}

