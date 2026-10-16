"""3.2 — One lane or all lanes: the DRUM LANE bank sets the selected lane, the
ALL LANES bank sets every lane at once; the pads tell them apart. Euclid on the
hat (DRUM LANE knob 5), then the whole beat's resolution (ALL LANES knob 1).
Captions follow MANUAL-SA §7, §8.2 and §8.3. Starts as drum_setup.PRE_WITH_BEAT
leaves it.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from drum_setup import *                       # noqa: F401,F403

TITLE = "One lane or all lanes"
NUMBER = "3.2"
BPM = 110
PRE = PRE_WITH_BEAT

PAD_DRUM_LANE, PAD_ALL_LANES = "n86", "n78"     # on the bank map
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))

STEPS = [
    card("One lane or all lanes", "Tutorial 3.2", 3.0),

    caption("A drum track's grid has two banks. DRUM LANE works on the selected lane; "
            "ALL LANES works on all 32 at once.", title="Two banks"),
    wait(3.0), point(JOG, secs=1.0), press(JOG), wait(0.8), point(PAD_DRUM_LANE, PAD_ALL_LANES, secs=2.5),
    wait(0.5), release(JOG), wait(1.0),
    caption("Start the beat. On DRUM LANE, select the hat.", title="DRUM LANE"),
    wait(1.5), point(PLAY, secs=0.8), tap(PLAY), wait(2.0), point(HAT, secs=1.0), tap(HAT, 150), wait(1.5),
    caption("Knob 5, Euclid, spreads extra hits evenly across the lane. Only the hat "
            "changes.", title="DRUM LANE"),
    wait(2.0), point(KNOB_TOUCH(5), secs=1.2), press(KNOB_TOUCH(5)), wait(0.6),
    turn(KNOB_TURN(5), 16, ms=14), wait(1.5), turn(KNOB_TURN(5), 16, ms=14), wait(1.5),
    turn(KNOB_TURN(5), 16, ms=14), wait(2.5), release(KNOB_TOUCH(5)), wait(3.0),

    caption("Now ALL LANES. The selected lane turns white and every lane with hits wears "
            "the track's colour: the knobs reach them all.", title="ALL LANES"),
    wait(2.5), press(JOG), wait(0.8), point(PAD_ALL_LANES, secs=1.2), tap(PAD_ALL_LANES, 150),
    wait(0.4), release(JOG), wait(1.0), point(*LANE_PADS, secs=2.5), wait(0.5),
    caption("Knob 1 sets the resolution for every lane at once: at 1/32 the whole beat "
            "plays twice as fast.", title="ALL LANES"),
    wait(2.0), point(KNOB_TOUCH(1), secs=1.2), press(KNOB_TOUCH(1)), wait(0.6),
    turn(KNOB_TURN(1), 16, ms=14), wait(2.0), release(KNOB_TOUCH(1)), wait(5.0),
    caption("Undo puts it back.", title="ALL LANES"),
    wait(1.0), point(UNDO, secs=1.0), tap(UNDO), wait(4.0),
    tap(PLAY), wait(2.0),

    card("Next: lane loops and Note Repeat", "Tutorial 3.3", 3.0),
]
