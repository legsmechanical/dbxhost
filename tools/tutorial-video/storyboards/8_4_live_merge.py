"""8.4 — Live Merge: the lead's riff through DELAY, recorded as it actually
plays into an empty clip, which then holds the echoes as plain notes. Captions
follow MANUAL-SA §16.2. Starts as lead_setup.PRE_WITH_RIFF leaves it (track 4,
clip A, stopped).

From Track View the merge is the active track alone: Shift + Sample (stopped)
raises a notice, Record starts a 1-bar count-in, Record again stops at the
next page end, and Session View opens with track 4's empty clips blinking.
n87 is track 4's row-2 slot (clip B). The sequencer effects belong to a clip,
so clip B plays the echoes as notes with its own DELAY at zero.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Live Merge"
NUMBER = "8.4"
BPM = 110
PRE = PRE_WITH_RIFF

SAMPLE = "c118"
PAD_DELAY = "n79"
SLOT_B = "n87"
CLIP_B_SIDE = "c42"


def twist(knob, n, ms=14):
    return [press(KNOB_TOUCH(knob)), wait(0.6), turn(KNOB_TURN(knob), n, ms=ms), wait(1.0),
            release(KNOB_TOUCH(knob)), wait(0.5)]


STEPS = [
    card("Live Merge", "Tutorial 8.4", 3.0),

    caption("Live Merge records what a track actually plays, effects and all, into a plain "
            "clip. Give the riff some DELAY echoes.", title="Live Merge"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(1.0),
    press(JOG), wait(0.8), point(PAD_DELAY, secs=1.0), tap(PAD_DELAY, 150), wait(0.4), release(JOG),
    wait(1.0), *twist(3, 16), wait(1.2), *twist(3, 16), *twist(7, -48), wait(3.0), tap(PLAY), wait(1.5),

    caption("With the transport stopped, Shift + Sample arms it. From Track View it records "
            "this track alone.", title="Arming"),
    wait(2.5), point(SHIFT, SAMPLE, secs=1.2), press(SHIFT), wait(0.3), tap(SAMPLE, 150, check=True),
    wait(0.3), release(SHIFT), wait(2.5),
    caption("Press Record: a bar of count-in, then it records from the top. Record again "
            "stops it at the end of the page.", title="Recording"),
    wait(2.0), point(REC, secs=1.0), tap(REC), wait(7.5), tap(REC), wait(3.5),
    caption("Session View opens with the track's empty clips blinking: tap one to keep the "
            "take. Here, row 2.", title="Placing it"),
    wait(2.5), point(SLOT_B, secs=1.2), tap(SLOT_B, 150, check=True), wait(2.0),

    caption("Back in Track View, clip B holds the echoes as notes. Its own DELAY is at "
            "zero, so they play once.", title="The take"),
    wait(2.0), tap(NOTE_SESSION), wait(1.0), point(CLIP_B_SIDE, secs=1.0), tap(CLIP_B_SIDE), wait(1.0),
    point(*ALL_STEPS, secs=1.6), tap(PLAY), wait(7.0), tap(PLAY), wait(2.0),

    card("Next: projects", "Tutorial 8.5", 3.0),
]
