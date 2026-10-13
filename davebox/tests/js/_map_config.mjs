/* tests/js/_map_config.mjs — open TRACK CONFIG the way a user does now: hold
 * the jog (the bank map shows), tap the CONFIG pad (bottom-left, note 68, on
 * every track type), let the jog go — a menu pad opens on the release.
 * Shift + Note/Session, which rigs used to press for this, was retired
 * 2026-10-04, and the click that left the map up on 2026-10-13.
 * The map paints on the press from an overview or a card, not from inside a
 * menu (there a short press is the menu's click), so a rig already in sound
 * mode steps out first, as a user would with Back. */
import { soundActive, soundOnCard, soundExit } from '../../ui/ui_sound.mjs';
export function openTrackConfigViaMap() {
    const m = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
    if (soundActive() && !soundOnCard()) soundExit();
    m(0xB0, 3, 127);                         /* jog down: the map */
    m(0x90, 68, 100); m(0x80, 68, 0);        /* CONFIG */
    m(0xB0, 3, 0);                           /* jog up: it opens */
}
