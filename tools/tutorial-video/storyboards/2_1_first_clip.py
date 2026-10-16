"""2.1 — Your first clip: the steps, placing notes (pad then step, step then
pad), playing it back, clearing a step, Undo / Shift + Undo. Captions follow
MANUAL-SA §6.1 and §6.7. Starts as lead_setup.PRE leaves it.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403 — the shared track-4 setup and names

TITLE = "Your first clip"
NUMBER = "2.1"
BPM = 110

STEPS = [
    card("Your first clip", "Tutorial 2.1", 3.0),

    caption("Track 4 has a synth lead and an empty clip. Play a few pads to hear it.",
            title="The lead"),
    wait(2.0), point(*BOTTOM_ROW, secs=1.6), *phrase(tap, wait), wait(2.0),
    caption("The 16 step buttons along the bottom are the clip's steps: one bar, in "
            "sixteenths.", title="The steps"),
    wait(2.0), point(*ALL_STEPS, secs=3.0), wait(0.5),

    caption("Play a pad, then tap an empty step: the step gets the note you just played.",
            title="Placing notes"),
    wait(2.5), point(C4, secs=1.4), tap(C4, 300), wait(0.8),
    point(STEP(1), secs=1.2), tap(STEP(1), 150), wait(1.2), tap(STEP(7), 150), wait(2.0),
    caption("Or hold a step and tap a pad: that note goes on that step.", title="Placing notes"),
    wait(2.0), point(STEP(3), G3, secs=1.8),
    press(STEP(3)), wait(0.5), tap(G3, 200), wait(0.3), release(STEP(3)), wait(1.0),
    press(STEP(5)), wait(0.5), tap(BB3, 200), wait(0.3), release(STEP(5)), wait(0.6),
    press(STEP(9)), wait(0.5), tap(EB4, 200), wait(0.3), release(STEP(9)), wait(0.6),
    press(STEP(11)), wait(0.5), tap(D4, 200), wait(0.3), release(STEP(11)), wait(0.6),
    press(STEP(15)), wait(0.5), tap(G3, 200), wait(0.3), release(STEP(15)), wait(1.0),

    caption("Press Play to hear it. The lit steps are the ones with notes.", title="Playing it"),
    wait(2.0), point(PLAY, secs=1.2), tap(PLAY), wait(6.0),
    caption("Tap a step with a note to clear it.", title="Clearing"),
    wait(1.5), point(STEP(7), secs=1.4), tap(STEP(7), 150), wait(4.0),

    caption("Undo brings it back…", title="Undo"),
    wait(1.0), point(UNDO, secs=1.4), tap(UNDO), wait(4.0),
    caption("…and Shift + Undo redoes what Undo took back.", title="Undo"),
    wait(1.5), point(SHIFT, UNDO, secs=1.6),
    press(SHIFT), wait(0.3), tap(UNDO), wait(0.3), release(SHIFT), wait(4.0),
    caption("Play stops.", title="Undo"),
    wait(0.8), tap(PLAY), wait(2.0),

    card("Next: editing notes", "Tutorial 2.2", 3.0),
]
