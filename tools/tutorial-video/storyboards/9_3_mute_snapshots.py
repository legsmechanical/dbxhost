"""9.3 — Mute snapshots: in Session View, Mute + the steps keep up to 16
mute/solo states. Two saved (the piano out; the piano in and the bass out),
then switched between while the music plays. Captions follow MANUAL-SA §11.4.
Starts as session_setup.PRE leaves it (Session View, the piano muted, stopped).
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import *                    # noqa: F401,F403

TITLE = "Mute snapshots"
NUMBER = "9.3"
BPM = 110

STEPS_ROW = tuple("n%d" % n for n in range(16, 32))


def save(slot):
    return [press(MUTE), wait(0.3), press(SHIFT), wait(0.3), tap(STEP(slot), 150), wait(0.3),
            release(SHIFT), wait(0.2), release(MUTE), wait(1.5)]


def recall(slot, secs=4.5):
    return [press(MUTE), wait(0.3), tap(STEP(slot), 150), wait(0.3), release(MUTE), wait(secs)]


def toggle(knob):
    return [press(MUTE), wait(0.3), tap(KNOB_TOUCH(knob), 200), wait(0.3), release(MUTE), wait(1.0)]


STEPS = [
    card("Mute snapshots", "Tutorial 9.3", 3.0),

    caption("A mute snapshot remembers which tracks are muted and soloed, so a whole "
            "breakdown is one press. Start the music.", title="Mute snapshots"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(3.0),
    caption("In Session View, hold Mute: the steps light, grey for empty. Mute + Shift + "
            "Step 1 saves this state, the piano out.", title="Saving"),
    wait(2.0), point(MUTE, secs=0.8), press(MUTE), wait(0.5), point(*STEPS_ROW, secs=1.4), release(MUTE),
    wait(0.5), point(MUTE, SHIFT, STEP(1), secs=1.2), *save(1),
    caption("Now bring the piano in and take the bass out (Mute + touch), and save that to "
            "Step 2.", title="Saving"),
    wait(2.5), point(MUTE, KNOB_TOUCH(3), secs=1.0), *toggle(3), point(MUTE, KNOB_TOUCH(2), secs=1.0),
    *toggle(2), wait(2.0), point(MUTE, SHIFT, STEP(2), secs=1.0), *save(2),

    caption("Mute + a step recalls one. Step 1…", title="Recalling"),
    wait(1.0), point(MUTE, STEP(1), secs=1.0), *recall(1),
    caption("…Step 2. They're kept with the project; Mute + Delete + a step clears one.",
            title="Recalling"),
    wait(1.0), point(MUTE, STEP(2), secs=1.0), *recall(2), *recall(1, 3.0),
    tap(PLAY), wait(2.0),

    card("Next: Master FX and the sends", "Tutorial 9.4", 3.0),
]
