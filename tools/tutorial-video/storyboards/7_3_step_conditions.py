"""7.3 — Per-step conditions on the lead's riff: Ratchet (retrigger a step),
Probability (a chance of playing), Iteration (only on some passes), set on the
STEP page (hold a step, jog right; knobs 6 Iter, 7 Prob, 8 Ratch). Captions
follow MANUAL-SA §6.3 (Per-step conditions). Starts as lead_setup.PRE_WITH_RIFF
leaves it.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Probability, ratchets and more"
NUMBER = "7.3"
BPM = 110
PRE = PRE_WITH_RIFF

STEP_ROW2 = "oled:0,36,128,20"


def on_step(step, knob, detents, hold_after=2.0, ms=30):
    """Hold a step, jog right to its STEP page, touch and turn one knob, let go."""
    return [press(STEP(step)), wait(1.2), turn(JOG_TURN, 1, ms=300), wait(1.0),
            point(KNOB_TOUCH(knob), secs=1.0), press(KNOB_TOUCH(knob)), wait(0.4),
            turn(KNOB_TURN(knob), detents, ms=ms), wait(hold_after), release(KNOB_TOUCH(knob)), wait(0.3),
            release(STEP(step)), wait(1.0)]


STEPS = [
    card("Probability, ratchets and more", "Tutorial 7.3", 3.0),

    caption("Three settings decide whether, and how, a step plays. They're on its STEP "
            "page: hold the step and turn the jog right. Start the riff.", title="Step conditions"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(3.0),
    caption("Ratchet (knob 8) plays the step 2, 3 or 4 times in its slot.", title="Ratchet"),
    wait(1.5), *on_step(1, 8, 32), wait(5.0),
    caption("Probability (knob 7) gives a step a chance of playing: turn it down and the "
            "step plays only some of the time.", title="Probability"),
    wait(2.0), *on_step(9, 7, -40), wait(7.0),
    caption("Iteration (knob 6) plays a step only on some passes: 1:2 is the first of "
            "every two.", title="Iteration"),
    wait(2.0), *on_step(15, 6, 4, ms=150), wait(7.0),     # a list: a few slow notches
    tap(PLAY), wait(2.0),

    card("Next: LIVE ARP", "Tutorial 7.4", 3.0),
]
