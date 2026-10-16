"""3.3 — Lane loops and Note Repeat: Loop + jog sets one lane's length (a
polyrhythm), Shift + Step 8 turns the right pads into Note Repeat rates, hold
a rate pad to repeat the selected lane. Captions follow MANUAL-SA §7.2–7.3.
Starts as drum_setup.PRE_WITH_BEAT leaves it.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from drum_setup import *                       # noqa: F401,F403

TITLE = "Lane loops and Note Repeat"
NUMBER = "3.3"
BPM = 110
PRE = PRE_WITH_BEAT

RATES = tuple("n%d" % n for n in (72, 73, 74, 75, 80, 81, 82, 83))   # the right half's bottom two rows

STEPS = [
    card("Lane loops and Note Repeat", "Tutorial 3.3", 3.0),

    caption("Every lane has its own length. Start the beat.", title="Lane loops"),
    wait(1.5), point(PLAY, secs=1.0), tap(PLAY), wait(3.0),
    caption("Select the hat, hold Loop and turn the jog: 16 steps down to 12.",
            title="Lane loops"),
    wait(2.0), point(HAT, secs=1.0), tap(HAT, 150), wait(0.6),
    point(LOOP, JOG_TURN, secs=1.6), press(LOOP), wait(0.8), turn(JOG_TURN, -4, ms=300), wait(1.2),
    release(LOOP), wait(1.0),
    caption("The hat now loops every 12 steps against the 16-step kick: a polyrhythm "
            "from one clip.", title="Lane loops"),
    wait(7.0),

    caption("Shift + Step 8 turns the right pads into Note Repeat.", title="Note Repeat"),
    wait(1.5), point(SHIFT, STEP(8), secs=1.6),
    press(SHIFT), wait(0.3), tap(STEP(8), 150), wait(0.3), release(SHIFT), wait(2.0),
    caption("The bottom two rows are rates. Select a lane and hold a rate: it repeats "
            "until you let go.", title="Note Repeat"),
    wait(2.5), point(*RATES, secs=1.8), point(SNARE, secs=1.0), tap(SNARE, 150), wait(0.5),
    hold("n74", 2200), wait(0.8), hold("n80", 2200), wait(1.5),
    caption("Shift + Step 8 cycles on through a second repeat mode and back to velocity "
            "zones.", title="Note Repeat"),
    wait(1.5), point(SHIFT, STEP(8), secs=1.2),
    press(SHIFT), wait(0.3), tap(STEP(8), 150), wait(1.2), tap(STEP(8), 150), wait(0.3), release(SHIFT),
    wait(2.0), tap(PLAY), wait(2.0),

    card("Next: copying, muting and clearing lanes", "Tutorial 3.4", 3.0),
]
