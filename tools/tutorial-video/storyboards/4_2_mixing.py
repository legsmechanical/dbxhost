"""4.2 — Mixing in Session View: the knobs are a mixer (the bank map's MIXER column
picks Volume, Pan, Send A, Send B), Mute + touch a knob, Shift + Mute + touch to solo,
Delete + Mute. Captions follow MANUAL-SA §11 and §11.3. Starts as
session_setup.PRE leaves it, the piano (track 3) muted.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import *                    # noqa: F401,F403

TITLE = "Mixing"
MIX_VOL, MIX_PAN = "n92", "n84"
MIXER_COL = ("n92", "n84", "n76", "n68")          # the Session map: VOLUME, PAN, SEND A, SEND B
NUMBER = "4.2"
BPM = 110

STEPS = [
    card("Mixing", "Tutorial 4.2", 3.0),

    caption("Start scene 1.", title="Mixing"),
    wait(1.0), point(PLAY, secs=1.0), tap(PLAY), wait(3.0),
    caption("In Session View the eight knobs are a mixer, one per track. Touch one to "
            "see the page; turn it to set the level.", title="The mixer"),
    wait(3.0), point(*KNOBS, secs=1.8), point(KNOB_TOUCH(2), secs=1.0),
    press(KNOB_TOUCH(2)), wait(1.2), turn(KNOB_TURN(2), -120, ms=3), wait(3.0),
    turn(KNOB_TURN(2), 120, ms=3), wait(1.5), release(KNOB_TOUCH(2)), wait(1.0),
    caption("Hold the jog for the map: its MIXER column picks what the knobs set. "
            "Tap PAN…", title="The mixer"),
    wait(2.5), point(JOG, secs=1.2), press(JOG), wait(1.0), point(*MIXER_COL, secs=1.8),
    point(MIX_PAN, secs=1.0), tap(MIX_PAN, 150), wait(0.6), release(JOG), wait(1.5),
    caption("…and the same knob now pans the bass.", title="The mixer"),
    wait(0.5), press(KNOB_TOUCH(2)), wait(0.8), turn(KNOB_TURN(2), -60, ms=3), wait(2.5),
    turn(KNOB_TURN(2), 60, ms=3), wait(1.0), release(KNOB_TOUCH(2)), wait(1.0),
    caption("VOLUME, at the top of the column, takes them back.", title="The mixer"),
    wait(1.0), press(JOG), wait(0.8), point(MIX_VOL, secs=1.0), tap(MIX_VOL, 150), wait(0.5),
    release(JOG), wait(1.5),

    caption("Hold Mute and touch a knob to mute or unmute its track. The piano on "
            "track 3 has been muted: bring it in.", title="Mute and solo"),
    wait(3.0), point(MUTE, KNOB_TOUCH(3), secs=1.8),
    press(MUTE), wait(0.3), tap(KNOB_TOUCH(3), 200), wait(0.3), release(MUTE), wait(5.0),
    caption("Shift + Mute + touch solos a track: just the drums…", title="Mute and solo"),
    wait(2.0), point(SHIFT, MUTE, KNOB_TOUCH(1), secs=1.8),
    press(SHIFT), press(MUTE), wait(0.3), tap(KNOB_TOUCH(1), 200), wait(0.3), release(MUTE),
    release(SHIFT), wait(5.0),
    caption("…and Delete + Mute clears every mute and solo.", title="Mute and solo"),
    wait(1.5), point(DELETE, MUTE, secs=1.6),
    press(DELETE), wait(0.3), tap(MUTE), wait(0.3), release(DELETE), wait(5.0),
    tap(PLAY), wait(2.0),

    card("Next: sequencer effects", "Tutorial 5.1", 3.0),
]
