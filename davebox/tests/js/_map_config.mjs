/* tests/js/_map_config.mjs — open TRACK CONFIG the way a user does now: click
 * the jog (the bank map opens), tap the CONFIG pad (bottom-left, note 68, on
 * every track type). Shift + Note/Session, which rigs used to press for this,
 * was retired 2026-10-04 — the menu is a pad on the map.
 * The map opens from an overview or a card, not from inside a menu (there the
 * click is the menu's), so a rig already in sound mode steps out first, as a
 * user would with Back. */
import { soundActive, soundOnCard, soundExit } from '../../ui/ui_sound.mjs';
export function openTrackConfigViaMap() {
    const m = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
    if (soundActive() && !soundOnCard()) soundExit();
    m(0xB0, 3, 127); m(0xB0, 3, 0);          /* jog click: the map */
    m(0x90, 68, 100); m(0x80, 68, 0);        /* CONFIG */
}
