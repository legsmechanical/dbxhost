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
import { invalidateLEDCache, reapplyPalette, forceRedraw } from './ui_leds.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { showActionPopup } from './ui_persistence.mjs';

/* Keep-mask flags — mirrors the CORUN_GRP_* / CORUN_KEEP_* bits in
 * Schwung's shadow_constants.h. Keep in sync with docs/CORUN.md. */
const CORUN_GRP_PADS           = 1 << 1;
const CORUN_GRP_STEPS          = 1 << 2;
const CORUN_GRP_TRANSPORT      = 1 << 3;
const CORUN_GRP_MENU           = 1 << 10;
/* Default split: tool keeps pads / steps / transport / Menu, cedes the rest. */
const DAVEBOX_CORUN_KEEP_DEFAULT = CORUN_GRP_PADS | CORUN_GRP_STEPS | CORUN_GRP_TRANSPORT | CORUN_GRP_MENU;
/* Opt out of framework Back-as-exit. dAVEBOx uses Menu as the canonical exit
 * (existing muscle memory) and lets Back cede to the peer for sub-view nav
 * (chain editor pop-up, Move firmware preset/synth navigation). */
const CORUN_KEEP_BACK_BIT      = 1 << 15;
const DAVEBOX_CORUN_KEEP_MASK  = DAVEBOX_CORUN_KEEP_DEFAULT | CORUN_KEEP_BACK_BIT;
/* Control-group bits matching Schwung's shadow_constants.h (OLED=0, PADS=1,
 * STEPS=2, TRANSPORT=3, JOG=4, TRACK=5, KNOBS=6, MASTER=7, SHIFT=8, BACK=9,
 * MENU=10, TOUCH=11). */
const CORUN_GRP_JOG   = 1 << 4;
const CORUN_GRP_TRACK  = 1 << 5;  /* CC 40-43 — the side clip buttons */
const CORUN_GRP_KNOBS = 1 << 6;
const CORUN_GRP_SHIFT = 1 << 8;
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

/* Resolve the Schwung chain slot index for a dAVEBOx track's MIDI channel.
 * shadow_get_slots() returns {channel, name} per slot where channel is 1-16
 * (matching trackChannel) or 0 for "All". Returns -1 if no match. */
/* First (lowest-index) Schwung slot that receives a track's MIDI channel, or -1.
 * Thin wrapper over schSlotsForTrack so the match logic lives in one place. */
export function schSlotForTrack(t) {
    const m = schSlotsForTrack(t);
    if (m === 0) return -1;
    let i = 0;
    while (!(m & (1 << i))) i++;
    return i;
}

/* Bitmask (bits 0-3) of ALL Schwung slots that receive a track's MIDI channel —
 * i.e. every slot whose receive channel matches trackChannel[t] or is "All" (0).
 * Multiple slots on the same channel are layered (all play the track), so all of
 * them get a bit. 0 = no slot receives this track. Lowest set bit = the slot
 * sound mode edits. */
export function schSlotsForTrack(t) {
    const ch = S.trackChannel[t];
    const slots = shadow_get_slots();
    if (!slots) return 0;
    let mask = 0;
    for (let i = 0; i < slots.length && i < 4; i++) {
        if (slots[i].channel === ch || slots[i].channel === 0) mask |= (1 << i);
    }
    return mask;
}

/* Every track's mask from ONE chain enumeration, written into `out`.
 *
 * shadow_get_slots() enumerates the whole chain per call, so asking the helper
 * above about eight tracks in a loop paid for eight enumerations to answer one
 * question — at POLL_INTERVAL that ran a few hundred times a second and was
 * enough to hitch the display mid-knob-turn. The channels are read from the
 * same snapshot, which is also more correct: eight separate reads could
 * straddle a chain edit and disagree with each other. */
export function schSlotMasksAllTracks(out) {
    const slots = shadow_get_slots();
    if (!slots) { out.fill(0); return out; }
    for (let t = 0; t < out.length; t++) {
        const ch = S.trackChannel[t];
        let mask = 0;
        for (let i = 0; i < slots.length && i < 4; i++) {
            if (slots[i].channel === ch || slots[i].channel === 0) mask |= (1 << i);
        }
        out[t] = mask;
    }
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
export function enterMoveNativeCoRun(t) {
    /* Track view only (Josh, 2026-08-08) — see openSchwungSlotEditor. */
    if (S.sessionView) {
        showActionPopup('TRACK VIEW ONLY', 'Switch out of session', 'view to edit synths.');
        return;
    }
    S.moveCoRunTrack = t;
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
}

