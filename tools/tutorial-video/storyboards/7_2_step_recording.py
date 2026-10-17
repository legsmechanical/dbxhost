"""7.2 — Step recording: Shift + Record with the transport stopped, a pad per
step (the cursor moves on as you let go), Right for a rest, Right with a pad
held to tie, Left to step back, Shift + Record to leave, Play to hear it.
Captions follow MANUAL-SA §6.4 (Step recording). Starts as lead_setup.PRE
leaves it: track 4, clip A empty, pads from C3, stopped.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Step recording"
NUMBER = "7.2"
BPM = 110

STEPS = [
    card("Step recording", "Tutorial 7.2", 3.0),

    caption("Step recording writes notes one step at a time, no timing needed. With the "
            "transport stopped, press Shift + Record.", title="Step recording"),
    wait(3.0), point(SHIFT, REC, secs=1.4), press(SHIFT), wait(0.3), tap(REC), wait(0.3), release(SHIFT),
    wait(1.5),
    caption("One step blinks white: the cursor. Play a pad and the note lands there; let go "
            "and the cursor moves on.", title="Playing notes in"),
    wait(2.5), point(STEP(1), secs=1.2), tap(C4, 300), wait(0.6), tap(G3, 300), wait(0.6),
    tap(BB3, 300), wait(1.0),
    caption("Right on its own is a rest: the cursor moves on, writing nothing.", title="Rests"),
    wait(1.5), point(RIGHT, secs=1.0), tap(RIGHT), wait(0.8), tap(C4, 300), wait(1.0),
    caption("Hold a pad and press Right to tie it a step longer, once per step.", title="Ties"),
    wait(2.0), point(EB4, RIGHT, secs=1.4), press(EB4), wait(0.4), tap(RIGHT), wait(0.5), tap(RIGHT), wait(0.5),
    tap(RIGHT), wait(0.4), release(EB4), wait(1.0), tap(D4, 300), wait(0.6), tap(BB3, 300), wait(1.0),
    caption("Left steps back and erases what you just entered there.", title="Fixing a step"),
    wait(1.5), point(LEFT, secs=1.0), tap(LEFT), wait(0.8), tap(G3, 300), wait(1.0),
    caption("Shift + Record leaves; Play to hear it. One Undo would take back the whole "
            "session.", title="Done"),
    wait(2.0), point(SHIFT, REC, secs=1.2), press(SHIFT), wait(0.3), tap(REC), wait(0.3), release(SHIFT),
    wait(1.0), point(PLAY, secs=0.8), tap(PLAY), wait(6.0), tap(PLAY), wait(2.0),

    card("Next: probability, ratchets and more", "Tutorial 7.3", 3.0),
]
