"""8.1 — Audio effects: TRACK CONFIG's FX 1 row on the drum track, the effect
browser, FILTER loaded, its editor opening, cutoff swept on the beat, Back out.
Captions follow MANUAL-SA §3.8 and §14.2. Starts as drum_setup.PRE_WITH_BEAT
leaves it.

The browser opens on 4K EQ (after List: All and [ none ]); FILTER is 12 down.
Loading it opens its editor: CUTOFF on knob 1.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from drum_setup import *                       # noqa: F401,F403

TITLE = "Audio effects"
NUMBER = "8.1"
BPM = 110
PRE = PRE_WITH_BEAT

PAD_CONFIG = "n68"
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))
FX1_ROW = "oled:0,22,128,9"

STEPS = [
    card("Audio effects", "Tutorial 8.1", 3.0),

    caption("Each track has four audio effect slots after its instrument, in TRACK CONFIG. "
            "Start the beat and open the drums' menu.", title="Audio effects"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(1.5),
    press(JOG), wait(0.8), point(PAD_CONFIG, secs=1.0), tap(PAD_CONFIG, 150), wait(0.4), release(JOG),
    wait(1.5),
    caption("Turn to FX 1, an empty slot, and click it.", title="Adding one"),
    wait(1.5), turn(JOG_TURN, 1, ms=400), wait(0.8), point(FX1_ROW, secs=1.2), tap(JOG, 100, check=True),
    wait(1.5),
    caption("Every installed effect is listed. Turn to FILTER and click to load it.", title="Adding one"),
    wait(2.0), turn(JOG_TURN, 12, ms=150), wait(1.2), tap(JOG, 100, check=True), wait(2.0),
    caption("Its editor opens. Knob 1 is the cutoff: sweep it down and back up.", title="Editing it"),
    wait(2.0), point(KNOB_TOUCH(1), secs=1.0), press(KNOB_TOUCH(1)), wait(0.5),
    turn(KNOB_TURN(1), -90, ms=40), wait(1.5), turn(KNOB_TURN(1), 90, ms=40), wait(0.8),
    release(KNOB_TOUCH(1)), wait(2.0),
    caption("Back returns to TRACK CONFIG, where FX 1 now names the effect; hold Back for "
            "the overview.", title="Editing it"),
    wait(2.0), point(BACK, secs=0.8), tap(BACK), wait(2.5), hold(BACK, 800), wait(1.5),
    tap(PLAY), wait(2.0),

    card("Next: swing", "Tutorial 8.2", 3.0),
]
