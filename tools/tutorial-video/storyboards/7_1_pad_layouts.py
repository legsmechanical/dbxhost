"""7.1 — Pad layouts: Scale (default), Chromatic, Piano, Chord (its card, the
chord row, a modifier from row 2), Custom, cycled with Shift + Step 8.
Captions follow MANUAL-SA §6.1 (Pad layouts, The Chord layout, The Custom
layout). Starts as lead_setup.PRE leaves it: track 4, pads from C3, stopped.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Pad layouts"
NUMBER = "7.1"
BPM = 110

ALL_PADS = tuple("n%d" % n for n in range(68, 100))
ROW1 = tuple("n%d" % n for n in range(68, 76))
ROW2 = tuple("n%d" % n for n in range(76, 84))
CHORD_I, CHORD_IV, CHORD_V, MOD_7 = "n68", "n71", "n72", "n76"


def next_layout():
    return [point(SHIFT, STEP(8), secs=1.0), press(SHIFT), wait(0.3), tap(STEP(8), 150), wait(0.3),
            release(SHIFT), wait(1.5)]


def run(pads, ms=220, gap=0.06):
    out = []
    for p in pads:
        out += [tap(p, ms), wait(gap)]
    return out


STEPS = [
    card("Pad layouts", "Tutorial 7.1", 3.0),

    caption("The pads have five layouts. Scale, the default, plays only the key's notes; "
            "the root is lit in the track's colour.", title="Scale"),
    wait(2.5), point(*ALL_PADS, secs=1.6), *phrase(tap, wait), wait(1.5),

    caption("Shift + Step 8 steps through them. Chromatic: all twelve notes, the key's "
            "notes brighter.", title="Chromatic"),
    wait(2.0), *next_layout(), *run(ROW1), wait(1.5),

    caption("Piano: two octaves laid out like a keyboard, white keys below, black keys "
            "above.", title="Piano"),
    wait(2.0), *next_layout(), *run(("n68", "n70", "n72", "n73", "n75")), wait(1.5),

    caption("Chord: a whole chord from one pad, always in key. A card explains the rows; "
            "click to close it.", title="Chord"),
    wait(2.0), *next_layout(), wait(2.5), tap(JOG, 100), wait(1.2),
    caption("The bottom row holds the key's chords.", title="Chord"),
    wait(1.0), point(*ROW1, secs=1.4), hold(CHORD_I, 900), wait(0.15), hold(CHORD_IV, 900), wait(0.15),
    hold(CHORD_V, 900), wait(0.15), hold(CHORD_I, 1200), wait(1.0),
    caption("Hold a pad on row 2 as you play to change the chord: here, a seventh.", title="Chord"),
    wait(1.5), point(MOD_7, secs=1.2), press(MOD_7), wait(0.2), hold(CHORD_I, 1200), wait(0.15),
    hold(CHORD_IV, 1200), wait(0.2), release(MOD_7), wait(1.5),

    caption("Custom puts chords you build yourself on the bottom row. Shift + Step 8 once "
            "more and you're back on Scale.", title="Custom"),
    wait(2.0), *next_layout(), wait(1.5), *next_layout(), *phrase(tap, wait), wait(1.5),

    card("Next: step recording", "Tutorial 7.2", 3.0),
]
