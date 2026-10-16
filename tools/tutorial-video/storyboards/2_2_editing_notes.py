"""2.2 — Editing notes: a chord on one step, holding a step and turning the jog
right to its STEP page (Note, Length, Velocity), stretching a note. Captions
follow MANUAL-SA §6.2–6.3. Starts as lead_setup.PRE_WITH_RIFF leaves it: the
riff from 2.1 on steps 1 3 5 9 11 15.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Editing notes"
NUMBER = "2.2"
BPM = 110
PRE = PRE_WITH_RIFF

STEP_NOTE, STEP_LENG_VEL = "oled:0,8,40,26", "oled:44,8,84,26"   # the STEP page's top row

STEPS = [
    card("Editing notes", "Tutorial 2.2", 3.0),

    caption("Here's the clip from the last part. Start it playing.", title="Editing notes"),
    wait(1.5), point(PLAY, secs=1.2), tap(PLAY), wait(4.0),

    caption("A step holds up to eight notes. Hold several pads, then tap an empty step: "
            "a chord.", title="Chords"),
    wait(2.5), point(EB3, G3, BB3, secs=1.8),
    press(EB3), press(G3), press(BB3), wait(0.6), point(STEP(13), secs=1.0), tap(STEP(13), 150), wait(0.4),
    release(BB3), release(G3), release(EB3), wait(4.5),

    caption("Hold a step with notes and turn the jog right: the knobs now edit that step.",
            title="Editing a step"),
    wait(2.5), point(STEP(9), JOG_TURN, secs=1.8),
    press(STEP(9)), wait(1.2), turn(JOG_TURN, 1, ms=300), wait(2.5),
    caption("Knob 1 moves the note up the scale…", title="Editing a step"),
    point(KNOB_TOUCH(1), STEP_NOTE, secs=1.6),
    press(KNOB_TOUCH(1)), wait(0.6), turn(KNOB_TURN(1), 16, ms=14), wait(1.6),
    turn(KNOB_TURN(1), 16, ms=14), wait(2.0), release(KNOB_TOUCH(1)), wait(0.6),
    caption("…knob 3 sets its length, knob 4 its velocity.", title="Editing a step"),
    point(KNOB_TOUCH(3), KNOB_TOUCH(4), STEP_LENG_VEL, secs=1.8),
    press(KNOB_TOUCH(3)), wait(0.5), turn(KNOB_TURN(3), 8, ms=14), wait(2.0), release(KNOB_TOUCH(3)),
    wait(0.5), press(KNOB_TOUCH(4)), wait(0.5), turn(KNOB_TURN(4), -24, ms=14), wait(2.0),
    release(KNOB_TOUCH(4)), wait(0.5),
    caption("Let go of the step and you're back.", title="Editing a step"),
    wait(0.8), release(STEP(9)), wait(4.0),

    caption("Stretch a note: hold its step, wait for the card, then tap a later step.",
            title="Stretching"),
    wait(2.5), point(STEP(1), STEP(2), secs=1.8),
    press(STEP(1)), wait(1.4), tap(STEP(2), 150), wait(1.5), release(STEP(1)), wait(4.0),
    caption("Play stops.", title="Stretching"),
    wait(0.8), tap(PLAY), wait(2.0),

    card("Next: length and pages", "Tutorial 2.3", 3.0),
]
