"""6.3 — Performance Mode: tap Loop in Session View to lock it on, hold a
length pad to loop a slice, Shift + a length to keep it looping, toggle mods
(Latch on), Hold to clear the lengths, Loop to leave. Captions follow
MANUAL-SA §13. Starts as session_setup.PRE leaves it (Session View, stopped).

The grid: bottom row n68-n75 = lengths 1/32 1/16 1/8 1/4 1/2, Hold, Sync,
Latch; row 2 (n76-) pitch mods, row 3 (n84-) velocity/gate, top (n92-) wild.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import *                    # noqa: F401,F403

TITLE = "Performance Mode"
NUMBER = "6.3"
BPM = 110

LEN_QUARTER, LEN_HALF, HOLD_PAD = "n71", "n72", "n73"
LENGTHS = ("n68", "n69", "n70", "n71", "n72")
PITCH_ROW = tuple("n%d" % n for n in range(76, 84))
VEL_ROW = tuple("n%d" % n for n in range(84, 92))
WILD_ROW = tuple("n%d" % n for n in range(92, 100))
OCT_UP, BACKWARDS = "n76", "n99"

STEPS = [
    card("Performance Mode", "Tutorial 6.3", 3.0),

    caption("Performance Mode grabs a short loop of what's playing and lets you twist it "
            "live. Start the music in Session View.", title="Performance Mode"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(3.0),
    caption("Tap Loop to lock it on. The pads become its grid.", title="Performance Mode"),
    wait(1.5), point(LOOP, secs=1.0), tap(LOOP), wait(2.0),
    caption("The bottom row sets the loop length. Hold one: the music repeats that slice "
            "until you let go.", title="Loop lengths"),
    wait(2.5), point(*LENGTHS, secs=1.6), point(LEN_QUARTER, secs=0.8), hold(LEN_QUARTER, 3000), wait(2.0),
    caption("Shift + a length keeps it looping hands-free.", title="Loop lengths"),
    wait(1.5), point(SHIFT, LEN_HALF, secs=1.2), press(SHIFT), wait(0.3), tap(LEN_HALF, 150), wait(0.3),
    release(SHIFT), wait(3.0),

    caption("The rows above are mods: pitch, then velocity and gate, then wild ones. Tap "
            "one to switch it on.", title="Mods"),
    wait(2.5), point(*PITCH_ROW, secs=1.0), point(*VEL_ROW, secs=1.0), point(*WILD_ROW, secs=1.0),
    point(OCT_UP, secs=0.8), tap(OCT_UP, 150), wait(4.0),
    caption("Backwards plays each loop's notes in reverse order.", title="Mods"),
    wait(1.0), point(BACKWARDS, secs=0.8), tap(BACKWARDS, 150), wait(4.0),
    caption("Tap a lit mod to switch it off; Hold clears the looping length.", title="Mods"),
    wait(1.5), tap(OCT_UP, 150), wait(0.5), tap(BACKWARDS, 150), wait(1.0),
    point(HOLD_PAD, secs=1.0), tap(HOLD_PAD, 150), wait(3.0),
    caption("Loop again leaves Performance Mode.", title="Performance Mode"),
    wait(1.0), point(LOOP, secs=0.8), tap(LOOP), wait(3.0),
    tap(PLAY), wait(2.0),

    card("Next: Bake and Export", "Tutorial 6.4", 3.0),
]
