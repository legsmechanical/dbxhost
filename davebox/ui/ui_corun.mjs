/* ui_corun.mjs
 * Primary-surface cede declaration: which Schwung slot a track's MIDI
 * channel maps to, the keep-masks dAVEBOx declares when it opens host
 * services (chain-edit / Move-native co-run, overlays), and the
 * module-side cleanup run when a service returns. Ownership itself is
 * DERIVED by the host from the declared claims + the service stack
 * (docs/PRIMARY_SURFACE.md) — this file performs no ownership calls.
 * S stays shared via ui_state.mjs.
 */

import { S, nowMs, endLoopLatch } from './ui_state.mjs';
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
const CORUN_GRP_DELETE         = 1 << 19; /* CC 119 */
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
 * ⭑ DELETE is KEPT — Josh's own correction ("I was wrong about delete being
 * used in co-run").
 *
 * ⚠⚠ COPY IS NOT CEDEABLE AT ALL, and naming it here changes nothing. The
 * framework has a LEGACY CARVE-OUT (shadow_constants.h, corun_event_owner):
 *
 *     if (!cede_model && (grp & CORUN_GRP_EXTENDED_ALL)) return CORUN_OWNER_TOOL;
 *
 * CORUN_GRP_EXTENDED_ALL covers TRANSPORT | EDIT | NAV, and CORUN_GRP_EDIT is
 * Copy | Delete | Undo | Capture — so under the legacy model those four stay
 * with the TOOL regardless of keep_mask. Move firmware never sees CC 60, which
 * is why "hold Copy, tap pads" does nothing natively while the same shape works
 * for MUTE (CC 88 is not in that set, so it cedes normally, and the pad taps
 * reach Move because we INJECT them — see _onPadPress).
 *
 * ⭑ Two ways out, both real decisions rather than tweaks: inject CC 60 to Move
 * the way pad presses are already injected, or opt davebox into the cede model
 * (CORUN_F_CEDE_MODEL) and lose the carve-out for all four buttons at once.
 * COPY took the first road (see the MoveCopy handler in ui_input_cc).
 *
 * ✅ RULED by Josh, 2026-08-25: UNDO and CAPTURE stay with dAVEBOx — they are
 * NOT forwarded, and this is a decision, not an omission. Do not "finish the
 * set" by adding them.
 *   · Undo, because dAVEBOx's undo is the project's (redo included, on
 *     Shift+Undo). ⚠ The ORIGINAL reason — "dAVEBOx keeps Shift, so Move never
 *     sees it and a forwarded Shift+Undo would lose redo" — lapsed 2026-09-28,
 *     when Shift was ceded to Move; the ruling stands on the first reason.
 *     Injecting a synthetic Shift is the scheme that double-tap-latched Move's
 *     own Shift (see _onPadPress).
 *   · Capture, because its modifier gestures — Capture+scene row, and
 *     Capture+pad drum-lane select — would have to be given up in co-run, and
 *     the drum case IS the co-run case.
 *
 * ⚠⚠ Bit 3 is the RETIRED single-bit TRANSPORT (see above): the real transport
 * is the per-button composite, which is why Play/Rec/Loop silently did nothing
 * here for months.
 *
 * Modifier releases for CEDED keys still never reach us; the defensive clear in
 * cleanupAfterMoveNativeCoRun covers them. */
/* ⭑ SHIFT IS CEDED since 2026-09-28 (Josh: "we need to cede the shift button
 * in regular co-run b/c it's used for some instrument setting navigation" ·
 * "move only needs shift for shift+jog turn"). Move sees the real Shift, so
 * Shift+jog navigates its editor. dAVEBOx's own Shift gestures keep working
 * because it follows the PHYSICAL Shift instead (syncCoRunShift, ui_input_cc):
 * the shim reads CC 49 from the hardware buffer before any routing. Shift+pad
 * track switching is off in co-run — it moved dAVEBOx's track while Move's
 * screen and jog stayed on the old one (_onPadPressTrackView). */
const DAVEBOX_CORUN_KEEP_DEFAULT = CORUN_GRP_PADS | CORUN_GRP_STEPS | CORUN_GRP_TRANSPORT |
                                   CORUN_GRP_MENU | CORUN_GRP_TRACK |
                                   CORUN_GRP_DELETE;
/* Opt out of framework Back-as-exit. dAVEBOx uses Menu as the canonical exit
 * (existing muscle memory) and lets Back cede to the peer for sub-view nav
 * (chain editor pop-up, Move firmware preset/synth navigation). */
const CORUN_KEEP_BACK_BIT      = 1 << 15;
/* Back at the TOP of Move's editor ends the track co-run (Josh, 2026-09-28):
 * the host reads a Back that Move answers with silence as the top
 * (src/host/corun_back_top.h). A flag, not a group — shadow_constants.h
 * CORUN_KEEP_BACK_TOP_EXIT. The track co-run only: Move Settings follows its
 * own announcements out. */
const CORUN_KEEP_BACK_TOP_EXIT = 1 << 26;
const DAVEBOX_CORUN_KEEP_MASK  = DAVEBOX_CORUN_KEEP_DEFAULT | CORUN_KEEP_BACK_BIT;
/* Control-group bits matching Schwung's shadow_constants.h (OLED=0, PADS=1,
 * STEPS=2, TRANSPORT=3, JOG=4, TRACK=5, KNOBS=6, MASTER=7, SHIFT=8, BACK=9,
 * MENU=10, TOUCH=11). */
/* The jog is two groups (host, 2026-10-08): the turn and the click. */
const CORUN_GRP_OLED      = 1 << 0;
const CORUN_GRP_JOG_TURN  = 1 << 4;
const CORUN_GRP_JOG_CLICK = 1 << 27;
const CORUN_GRP_JOG       = CORUN_GRP_JOG_TURN | CORUN_GRP_JOG_CLICK;
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
        if (S.moveSettingsOpen) cleanupAfterMoveSettings();
        else cleanupAfterMoveNativeCoRun();
    }
    /* Host Settings is opened only from the Project menu: closing it returns
     * there. */
    if (id === "global_settings") S.pendingMenuAt = 'Host Settings...';
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
/* ⭑ THE BANK MAP IN CO-RUN (Josh, 2026-10-08: "jog-hold map in move co-run").
 * The jog TURN stays Move's; the CLICK is kept, so it can be timed like a click
 * on any other screen (bankMapDeferrable): a short one is passed on to Move at
 * the release (coRunJogClick), a held one is the map — and for as long as the
 * map is up the SCREEN is kept too, so it shows over Move's editor and Move's
 * comes back untouched when it goes. */
function coRunServiceOpts(t, mapUp) {
    return {
        track: t,
        keep_mask: DAVEBOX_CORUN_KEEP_MASK | CORUN_KEEP_BACK_TOP_EXIT | CORUN_GRP_JOG_CLICK |
                   (mapUp ? CORUN_GRP_OLED : 0),
        led_keep_mask: DAVEBOX_CORUN_LED_KEEP_MASK,
    };
}
/* The map came up or went away: take the screen, or give it back. */
export function coRunMapScreen(on) {
    if (S.moveCoRunTrack < 0) return;
    host_update_service("move_native", coRunServiceOpts(S.moveCoRunTrack, on));
}
/* A jog-click edge that is Move's: every one dAVEBOx sees in co-run and does
 * not turn into the map. */
export function coRunJogClick(d2) {
    move_midi_inject_to_move([0x0B, 0xB0, 3, d2 ? 127 : 0]);
}

export function enterMoveNativeCoRun(t, origin) {
    /* Track view only (Josh, 2026-08-08) — see openSchwungSlotEditor. */
    if (S.sessionView) {
        showActionPopup('TRACK VIEW ONLY', 'Switch out of', 'session view to', 'edit synths.');
        return;
    }
    S.moveCoRunTrack = t;
    /* ⭑ Land on a CLIP bank (Josh, 2026-08-24: "entering co-run should always
     * land on a clip bank"). Co-run is reached through SOUND + CONFIG, which
     * sits one jog past AUTOMATION — so the bank underneath is whatever you
     * walked through to get there, and in practice that is AUTOMATION. Steps
     * then edit automation lanes and the row reads as dead, which is exactly
     * the "step buttons do nothing" report: measured as bank=6, no modifier
     * stuck, the presses arriving fine.
     *
     * Written to trackActiveBank too, not just activeBank — soundExit and the
     * track-switch sites both restore from there, so setting only the live
     * value would be undone the moment either ran. ⚠ Still required after the
     * 08-25 change, and MORE so: SOUND + CONFIG now records ITSELF there, so
     * without this write a track entering co-run from that screen would be
     * stored on BANK_SOUND and walk straight back into it on the way out. */
    /* ⭑ (Josh, 2026-09-25, accepting the plan): co-run no longer moves
     * the bank. The 08-24 clip-bank landing existed because the Sound menu used
     * to put the track on its own bank, so the one underneath was whatever the
     * jog last walked through (AUTOMATION). The menu no longer touches the bank:
     * the track is on the bank you left it on. */
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
    host_open_service("move_native", coRunServiceOpts(t, false));
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
    /* Shift is the exception: it is ceded in co-run and followed from the
     * hardware, so ask the hardware — a Shift still held as co-run ends
     * (Shift+pad leaves co-run) stays held, and the next Shift+pad hops on. */
    S.shiftHeld = !!shadow_get_shift_held();
    /* ...and Move never saw that release: Shift is ceded to Move only DURING the
     * co-run, so a Shift still held as it ends (the Shift+pad hop) comes up at
     * dAVEBOx. Tell Move, or its Shift stays down under the next thing it is
     * asked to do (advisor review, 2026-09-29). A release on a Shift that is
     * already up does nothing. */
    move_midi_inject_to_move([0x0B, 0xB0, 49, 0]);
    /* The jog click is ours to pass on in co-run: a press passed on whose
     * release now lands outside it must not stay down in Move; and a press
     * still undecided is nobody's click any more. */
    move_midi_inject_to_move([0x0B, 0xB0, 3, 0]);
    if (S.jogDeferred) { S.jogDeferred = false; S.jogPressMs = -1; }
    S.deleteHeld = false; S.muteHeld = false;
    S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false; endLoopLatch();
    S.captureHeld = false;
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
     * Guarded on the route still being Move, because re-entering a Move screen
     * for a track that is no longer Move-routed would be a screen with nothing
     * behind it.
     * ⚠ CORRECTED 2026-09-07: this used to say the route "can only have changed
     * from the global menu, which is unreachable during co-run". That has been
     * false since the Instrument row became the door (Josh, 2026-09-04) — its
     * Shift+click picker changes the route from the SOUND MENU, and a Move
     * track reached co-run through that very row. The guard was already right;
     * only the reasoning had rotted. Do not lean on "the route cannot change
     * here" anywhere else. */
    /* A Note/Session exit needs no carve-out here: the tick lands on Session
     * View first (pendingSessionAfterCoRun), and a sound entry never opens
     * there (test_move_settings_corun checks every tick). */
    if (_origin === 'sound' && _originTrack >= 0 && S.trackRoute[_originTrack] === 1) {
        S.pendingSoundEnterTrack = _originTrack;
        /* Back to the MENU, where the SYNTH row you came from is — the card
         * only exists on SOUND+CFG, and the bank never moved (2026-09-24). */
        S.pendingSoundEnterMenu = true;
    }
}


/* ==== MOVE'S OWN SETTINGS ================================================ *
 * Josh, 2026-09-28: "Need a co-run path into move's settings menu that can be
 * accessed from the global menu. need to have those settings be separate from
 * the main move install. shift+step 2 opens that settings menu in move native.
 * only needs back, jog turn and jog click for navigation."
 *
 * Project Settings' Move Settings... row opens it: the same move_native
 * service a track's co-run uses, ceding only the OLED, the jog and Back —
 * everything else (pads, steps, transport, knobs, Mute, Shift) stays ours, so
 * the session plays on underneath. Move is then sent its own Shift+Step 2.
 * The settings it changes are the SESSION's (set-swap.sh binds the session's
 * settings folder over Move's), never the user's own.
 *
 * Ways out: Shift+Step 2 again (Move's own close, then back to Project
 * Settings), Note/Session (to the overview), and Back at the top of Move's
 * menu — Move leaves by itself, and the host tells us: shadow_dbus.c marks
 * move_ui_mode SETTINGS (4) while Move announces a Settings row and drops it
 * on any other screen (src/host/move_settings_text.h).
 *
 * ⚠ moveCoRunTrack stays -1 the whole time: the track co-run's pad and Copy
 * injections key on it, and none of them may fire here. */
const MOVE_UI_MODE_SETTINGS = 4;   /* shadow_constants.h move_ui_mode */
export const DAVEBOX_MOVE_SETTINGS_KEEP_MASK =
    DAVEBOX_CORUN_KEEP_MASK | CORUN_GRP_KNOBS | CORUN_GRP_TOUCH | CORUN_GRP_MUTE | CORUN_GRP_SHIFT;
const DAVEBOX_MOVE_SETTINGS_LED_KEEP_MASK = DAVEBOX_MOVE_SETTINGS_KEEP_MASK | CORUN_GRP_TRACK;

/* Move's Shift+Step 2 as the hardware sends it: ONE Shift down/up pair around
 * one Step 2 press (two taps double-tap-latch Move's Shift — see
 * ui_input_pads). The gaps are the shim's select gate's, measured on hardware
 * for its Shift+Step 1 (schwung_shim.c): 250 ms Shift -> Step, 120 ms press,
 * 100 ms -> Shift up. Milliseconds, not ticks: the tick rate is not a constant.
 * ⭑ Opened by a Shift RELEASE, as the track co-run's entry presses are: Move
 * may still believe Shift is down (a Shift+pad hop leaves the co-run with
 * Shift held), and a press on a held Shift is the latch. */
const MOVE_STEP2 = 17;   /* step buttons are notes 16..31 */
function moveShiftStep2() {
    return [
        { pkt: [0x0B, 0xB0, 49, 0], gapMs: 30 },
        { pkt: [0x0B, 0xB0, 49, 127], gapMs: 250 },
        { pkt: [0x09, 0x90, MOVE_STEP2, 127], gapMs: 120 },
        { pkt: [0x08, 0x80, MOVE_STEP2, 0], gapMs: 100 },
        { pkt: [0x0B, 0xB0, 49, 0], gapMs: 0 },
    ];
}
/* How long after the open the first Settings row must have been announced
 * before the open is tried once more (Move may have been mid-transition). */
const MOVE_SETTINGS_RETRY_MS = 2000;
/* Settle before the first inject, as the track co-run's entry inject waits
 * for the service's split to go live in the shim. */
const MOVE_SETTINGS_SETTLE_MS = 150;
/* ⚠ LEAVING (advisor review, 2026-09-29: the screen could end up with Move
 * sitting in its Settings menu UNDER dAVEBOx, and show up on the next track
 * co-run). The close is done before the screen is handed back, in the tick:
 *   1. settle: an injection already going out finishes (never cut off half
 *      sent — Move would keep Shift or Step 2 down), and the host's 100 ms
 *      announcement poll catches up, so a Back that just left the menu is
 *      seen before we decide whether to close it;
 *   2. if Move's menu is up, send its Shift+Step 2 and wait to see it go;
 *      still up (or up AGAIN — a toggle sent to a menu that had just closed
 *      reopens it) → once more;
 *   3. then, and only then, pop the service. */
const MOVE_SETTINGS_CLOSE_SETTLE_MS = 150;
const MOVE_SETTINGS_CLOSE_CHECK_MS  = 400;    /* after the close sequence has gone out */
const MOVE_SETTINGS_SEQ_MS          = 500;    /* the sequence's own length, rounded up */

export function moveSettingsUiMode() {
    return shadow_get_move_ui_mode() | 0;
}

export function enterMoveSettingsCoRun() {
    if (S.awaitingProjectSelect || S.moveSettingsOpen) return;
    if (S.shiftHeld) return;               /* mid-gesture: Move would see a second Shift */
    if (S.moveCoRunTrack >= 0) exitMoveNativeCoRun();
    S.moveSettingsOpen = true;
    S.moveSettingsClosing = false;
    S.moveSettingsPopped = false;
    S.moveSettingsSeen = false;
    S.moveSettingsReturn = 'menu';
    S.moveSettingsTries = 1;
    host_open_service("move_native", {
        track: 0,
        keep_mask: DAVEBOX_MOVE_SETTINGS_KEEP_MASK,
        led_keep_mask: DAVEBOX_MOVE_SETTINGS_LED_KEEP_MASK,
    });
    const now = nowMs();
    S.moveSettingsQueue = moveShiftStep2();
    S.moveSettingsNextAt = now + MOVE_SETTINGS_SETTLE_MS;
    S.moveSettingsRetryAt = now + MOVE_SETTINGS_SETTLE_MS + MOVE_SETTINGS_RETRY_MS;
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;
    S.screenDirty = true;
}

/* `dest`: 'menu' (back to Project Settings) or 'overview'. Starts the close;
 * moveSettingsTick finishes it (see MOVE_SETTINGS_CLOSE_SETTLE_MS). */
export function exitMoveSettingsCoRun(dest) {
    /* Once: every tick until the service returns would otherwise ask again. */
    if (!S.moveSettingsOpen || S.moveSettingsClosing) return;
    S.moveSettingsClosing = true;
    S.moveSettingsReturn = (dest === 'overview') ? 'overview' : 'menu';
    S.moveSettingsCloseTries = 0;
    S.moveSettingsCloseAt = nowMs() + MOVE_SETTINGS_CLOSE_SETTLE_MS;
}

/* From tick(): drain the injection, follow Move out of its menu, and close. */
export function moveSettingsTick() {
    const now = nowMs();
    const q = S.moveSettingsQueue;
    if (q && q.length > 0 && now >= S.moveSettingsNextAt) {
        const step = q.shift();
        move_midi_inject_to_move(step.pkt);
        S.moveSettingsNextAt = now + step.gapMs;
        if (q.length === 0) S.moveSettingsQueue = null;
    }
    if (!S.moveSettingsOpen || S.moveSettingsPopped) return;
    const mode = moveSettingsUiMode();
    if (S.moveSettingsClosing) {
        if (S.moveSettingsQueue || now < S.moveSettingsCloseAt) return;
        if (mode === MOVE_UI_MODE_SETTINGS && S.moveSettingsCloseTries < 2) {
            S.moveSettingsCloseTries++;
            S.moveSettingsQueue = moveShiftStep2();
            S.moveSettingsNextAt = now;
            S.moveSettingsCloseAt = now + MOVE_SETTINGS_SEQ_MS + MOVE_SETTINGS_CLOSE_CHECK_MS;
            return;
        }
        S.moveSettingsPopped = true;
        host_close_service(null);
        return;
    }
    if (mode === MOVE_UI_MODE_SETTINGS) {
        S.moveSettingsSeen = true;
    } else if (S.moveSettingsSeen) {
        /* Back at the top level: Move has left by itself. */
        exitMoveSettingsCoRun('menu');
    } else if (!S.moveSettingsQueue && now >= S.moveSettingsRetryAt && S.moveSettingsTries < 2) {
        S.moveSettingsTries++;
        S.moveSettingsQueue = moveShiftStep2();
        S.moveSettingsNextAt = now;
        S.moveSettingsRetryAt = now + MOVE_SETTINGS_RETRY_MS;
    }
}

function cleanupAfterMoveSettings() {
    const dest = S.moveSettingsReturn;
    S.moveSettingsOpen = false;
    S.moveSettingsClosing = false;
    S.moveSettingsPopped = false;
    S.moveSettingsSeen = false;
    S.moveSettingsReturn = null;
    /* Move repainted the jog/Back LEDs while it had them. */
    reapplyPalette();
    invalidateLEDCache();
    S._forceKnobReemit = true;
    forceRedraw();
    /* The tick reopens Project Settings on the row (it owns the menu import). */
    if (dest !== 'overview') S.pendingMenuAt = 'Move Settings...';
}
