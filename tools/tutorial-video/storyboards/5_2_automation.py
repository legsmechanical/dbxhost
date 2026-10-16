"""5.2 — Automation: record a knob move (Record + turn), see it play back, lock
one step (hold a step + turn), clear a knob's automation (Delete + touch).
Captions follow MANUAL-SA §10 and §10.1. Starts as lead_setup.PRE_WITH_RIFF
leaves it; the take opens the lead's editor (NuSaw, CUTOFF on knob 1, RES on
knob 2) from the bank map's INST pad.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Automation"
NUMBER = "5.2"
BPM = 110
PRE = PRE_WITH_RIFF

PAD_INST = "n70"
CUTOFF_CELL = "oled:0,8,40,30"

STEPS = [
    card("Automation", "Tutorial 5.2", 3.0),

    caption("Almost any knob can be automated. Open the lead's sound: hold the jog and "
            "tap INST.", title="Automation"),
    wait(2.5), point(JOG, secs=1.0), press(JOG), wait(0.8), point(PAD_INST, secs=1.2),
    tap(PAD_INST, 150), wait(0.4), release(JOG), wait(2.0),
    caption("Knob 1 is the filter cutoff. Start the riff.", title="Automation"),
    wait(1.0), point(KNOB_TOUCH(1), CUTOFF_CELL, secs=1.6), point(PLAY, secs=0.8), tap(PLAY), wait(3.0),

    caption("Press Record and turn the knob: the move is written into the clip for as "
            "long as your hand is on it.", title="Recording a move"),
    wait(3.0), point(REC, secs=1.2), tap(REC), wait(0.3), press(KNOB_TOUCH(1)), wait(0.3),
    turn(KNOB_TURN(1), -70, ms=25), turn(KNOB_TURN(1), 70, ms=25),
    release(KNOB_TOUCH(1)), wait(0.2), tap(REC), wait(1.0),
    caption("Let go, and it plays the move back every time round. A dot on the cell "
            "marks an automated knob.", title="Recording a move"),
    wait(8.0),

    caption("Or lock one step: hold the step and turn a knob. Only that step jumps to the "
            "value.", title="Step locks"),
    wait(2.5), point(STEP(9), KNOB_TOUCH(2), secs=1.6),
    press(STEP(9)), wait(0.6), press(KNOB_TOUCH(2)), wait(0.4), turn(KNOB_TURN(2), 60, ms=14),
    wait(0.8), release(KNOB_TOUCH(2)), wait(0.3), release(STEP(9)), wait(6.0),

    caption("Delete + touch a knob clears its automation.", title="Clearing"),
    wait(1.5), point(DELETE, KNOB_TOUCH(1), secs=1.6),
    press(DELETE), wait(0.3), tap(KNOB_TOUCH(1), 300), wait(0.3), release(DELETE), wait(4.0),
    press(DELETE), wait(0.3), tap(KNOB_TOUCH(2), 300), wait(0.3), release(DELETE), wait(3.0),
    tap(PLAY), wait(2.0),

    card("Next: going further", "Tutorial 6.1", 3.0),
]
