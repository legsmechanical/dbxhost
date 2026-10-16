"""6.1 — Macros: the MACROS bank, assigning knob 1 to the lead's filter cutoff
(touch + click, the instrument, the parameter), playing it, then a second
target on the same knob (resonance) so one knob moves both. Captions follow
MANUAL-SA §14.6. Starts as lead_setup.PRE_WITH_RIFF leaves it.

The picker: touch K1 + click opens (None) / NuSaw / MIDI / banks...; NuSaw's
list starts with cutoff, then resonance. On an assigned knob, touch + click
opens its list: the target, Lo, Hi, Travel, + Add target (four rows down).
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Macros"
NUMBER = "6.1"
BPM = 110
PRE = PRE_WITH_RIFF

PAD_MACROS = "n93"


def touch_click(knob):
    return [press(KNOB_TOUCH(knob)), wait(0.5), tap(JOG, 100), wait(0.3), release(KNOB_TOUCH(knob)), wait(1.2)]


def sweep(knob, n, ms=20):
    return [press(KNOB_TOUCH(knob)), wait(0.5), turn(KNOB_TURN(knob), -n, ms=ms), wait(0.6),
            turn(KNOB_TURN(knob), n, ms=ms), wait(0.5), release(KNOB_TOUCH(knob)), wait(1.0)]


STEPS = [
    card("Macros", "Tutorial 6.1", 3.0),

    caption("MACROS puts whatever parameters you choose on the eight knobs. Start the "
            "riff, hold the jog and tap MACROS.", title="Macros"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(1.5),
    point(JOG, secs=0.8), press(JOG), wait(0.8), point(PAD_MACROS, secs=1.2), tap(PAD_MACROS, 150),
    wait(0.4), release(JOG), wait(1.5),

    caption("Touch a knob and click the jog to assign it. Pick the instrument…", title="Assigning"),
    wait(2.0), point(KNOB_TOUCH(1), JOG, secs=1.6), *touch_click(1),
    turn(JOG_TURN, 1, ms=400), wait(1.0), tap(JOG, 100), wait(1.5),
    caption("…then the parameter: the filter cutoff.", title="Assigning"),
    wait(1.5), tap(JOG, 100), wait(2.0),
    caption("Knob 1 now plays the lead's filter.", title="Assigning"),
    wait(1.0), *sweep(1, 60), wait(2.0),

    caption("One knob can move several parameters. Touch and click it again: its list "
            "ends with + Add target.", title="More targets"),
    wait(2.5), *touch_click(1), turn(JOG_TURN, 4, ms=400), wait(1.5),
    caption("Add the resonance: NuSaw, then resonance, just under cutoff.", title="More targets"),
    wait(1.5), tap(JOG, 100), wait(1.2), turn(JOG_TURN, 1, ms=400), wait(0.8), tap(JOG, 100), wait(1.2),
    turn(JOG_TURN, 1, ms=400), wait(0.8), tap(JOG, 100), wait(2.0), point(BACK, secs=1.0), tap(BACK), wait(1.5),
    caption("Now the one knob sweeps the filter and its resonance together.", title="More targets"),
    wait(1.0), *sweep(1, 220, ms=8), wait(2.0),        # a percentage knob: a longer turn
    tap(PLAY), wait(2.0),

    card("Next: the Conductor", "Tutorial 6.2", 3.0),
]
