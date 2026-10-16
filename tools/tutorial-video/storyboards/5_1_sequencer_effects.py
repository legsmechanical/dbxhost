"""5.1 — Sequencer effects: NOTE FX (octave), HARMONY (a voice a third up),
DELAY (repeats), SEQ ARP (style and octave range), each heard on the lead's
riff; they change how the clip plays, never the notes in it. Captions follow
MANUAL-SA §9.1–9.4. Starts as lead_setup.PRE_WITH_CHORDS leaves it: the riff on clip A, two long
chords on clip B for SEQ ARP. The arp is switched on while stopped: turning it
on while a note sounds leaves that note hanging (a dAVEBOx bug, 2026-10-16).

A 16-detent fast twist moves NOTE FX OCT, DELAY REPTS, SEQ ARP STYLE and OCT
one step, and HARMONY's HARM1 two.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Sequencer effects"
NUMBER = "5.1"
BPM = 110
PRE = PRE_WITH_CHORDS

PAD_NOTE_FX, PAD_HARMONY, PAD_DELAY, PAD_SEQ_ARP, PAD_CLIP = "n95", "n87", "n79", "n71", "n86"
CLIP_B = "c42"                                  # track 4's second clip (side button)
FX_COLUMN = (PAD_NOTE_FX, PAD_HARMONY, PAD_DELAY, PAD_SEQ_ARP)


def bank(pad):
    """Hold the jog, tap a bank's pad, let go."""
    return [press(JOG), wait(0.8), point(pad, secs=1.0), tap(pad, 150), wait(0.4), release(JOG), wait(1.0)]


def twist(knob, steps, gap=1.2):
    """Touch a knob and turn it `steps` notches (16 fast detents each)."""
    out = [press(KNOB_TOUCH(knob)), wait(0.6)]
    for _ in range(abs(steps)):
        out += [turn(KNOB_TURN(knob), 16 if steps > 0 else -16, ms=14), wait(gap)]
    return out + [release(KNOB_TOUCH(knob)), wait(0.5)]


STEPS = [
    card("Sequencer effects", "Tutorial 5.1", 3.0),

    caption("The sequencer effects reshape the notes as the clip plays, without touching "
            "the notes themselves. Start the lead's riff.", title="Sequencer effects"),
    wait(3.0), point(PLAY, secs=1.0), tap(PLAY), wait(3.0),
    caption("They're banks in the map's FX column: NOTE FX, HARMONY, DELAY and SEQ ARP.",
            title="Sequencer effects"),
    wait(1.5), press(JOG), wait(1.0), point(*FX_COLUMN, secs=2.5), wait(0.5), release(JOG), wait(1.0),

    caption("NOTE FX: knob 1 moves every note an octave.", title="NOTE FX"),
    wait(1.0), *bank(PAD_NOTE_FX), *twist(1, 1, gap=4.0), *twist(1, -1, gap=1.0),
    caption("HARMONY adds voices: knob 2 adds one a third above every note.", title="HARMONY"),
    wait(1.0), *bank(PAD_HARMONY), *twist(2, 1, gap=5.0),
    caption("DELAY echoes every note in time: knob 3 sets how many repeats…", title="DELAY"),
    wait(1.0), *bank(PAD_DELAY), *twist(3, 2, gap=3.0),
    caption("…and with knob 7, Retrigger, off, a new note no longer cuts the echoes short: "
            "they overlap.", title="DELAY"),
    wait(1.5), point(KNOB_TOUCH(7), secs=1.0), press(KNOB_TOUCH(7)), wait(0.6),
    turn(KNOB_TURN(7), -48, ms=14), wait(1.0), release(KNOB_TOUCH(7)), wait(5.0),   # a switch needs a longer turn

    caption("The effects belong to this clip, and its notes are untouched: Shift + Delete "
            "+ a jog click resets all four, and it plays as written again.",
            title="Sequencer effects"),
    wait(3.5), point(SHIFT, DELETE, JOG, secs=1.8),
    press(SHIFT), press(DELETE), wait(0.3), tap(JOG, 120), wait(0.3), release(DELETE), release(SHIFT),
    wait(4.0),

    caption("SEQ ARP plays held notes one at a time, so give it long ones. Stop, and switch "
            "track 4 to clip B: two long chords.", title="SEQ ARP"),
    wait(3.0), tap(PLAY), wait(1.0), point(CLIP_B, secs=1.2), tap(CLIP_B), wait(1.5),
    caption("Knob 1 picks a style; here, Up. Then play.", title="SEQ ARP"),
    wait(1.0), *bank(PAD_SEQ_ARP), *twist(1, 1, gap=1.0), point(PLAY, secs=1.0), tap(PLAY), wait(6.0),
    caption("Knob 3 adds octaves to the run.", title="SEQ ARP"),
    wait(1.0), *twist(3, 1, gap=6.0),
    caption("Like every effect here, the arp belongs to this clip.", title="SEQ ARP"),
    wait(3.0), tap(PLAY), wait(1.0), *bank(PAD_CLIP), wait(1.0),

    card("Next: automation", "Tutorial 5.2", 3.0),
]
