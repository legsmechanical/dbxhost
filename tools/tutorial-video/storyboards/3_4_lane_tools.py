"""3.4 — Lane tools: Mute + lane, Copy + lane then another lane, Delete +
lane, Undo. Captions follow MANUAL-SA §7.4. Starts as drum_setup.PRE_WITH_BEAT
leaves it.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from drum_setup import *                       # noqa: F401,F403

TITLE = "Copying, muting and clearing lanes"
NUMBER = "3.4"
BPM = 110
PRE = PRE_WITH_BEAT

STEPS = [
    card("Copying, muting and clearing lanes", "Tutorial 3.4", 3.0),

    caption("Start the beat.", title="Lane tools"),
    wait(1.0), point(PLAY, secs=1.0), tap(PLAY), wait(3.0),
    caption("Hold Mute and tap a lane to mute it; again to bring it back.", title="Muting"),
    wait(2.0), point(MUTE, HAT, secs=1.6),
    press(MUTE), wait(0.3), tap(HAT, 150), wait(0.3), release(MUTE), wait(4.0),
    press(MUTE), wait(0.3), tap(HAT, 150), wait(0.3), release(MUTE), wait(3.0),

    caption("Hold Copy, tap a lane, then tap another: the second plays the first's "
            "hits with its own sound. Here, the snare's onto the clap.", title="Copying"),
    wait(3.0), point(COPY, SNARE, CLAP, secs=1.8),
    press(COPY), wait(0.3), tap(SNARE, 150), wait(0.6), tap(CLAP, 150), wait(0.3), release(COPY),
    wait(5.0),

    caption("Delete + a lane clears its hits.", title="Clearing"),
    wait(1.5), point(DELETE, CLAP, secs=1.6),
    press(DELETE), wait(0.3), tap(CLAP, 150), wait(0.3), release(DELETE), wait(4.0),
    caption("Undo brings them back.", title="Clearing"),
    wait(1.0), point(UNDO, secs=1.2), tap(UNDO), wait(4.0),
    tap(PLAY), wait(2.0),

    card("Next: Session View", "Tutorial 4.1", 3.0),
]
