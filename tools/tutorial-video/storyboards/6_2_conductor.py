"""6.2 — The Conductor: track 5 made the Conductor from its Instmt/Dest picker,
its pads transposing the melodic tracks live, a two-step progression sequenced
on it with Cond Lock holding each shift. Captions follow MANUAL-SA §12. Starts
as lead_setup.PRE_WITH_RIFF leaves it (track 4 active, stopped).

The Conductor's zero is the root in C3; on a new Conductor that sits on the
second row's fifth pad (n80). n83 is three scale degrees up (F), n78 one down.
Conductor is the entry just above the first generator in the picker.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "The Conductor"
NUMBER = "6.2"
BPM = 110
PRE = PRE_WITH_RIFF

PAD_CONFIG, PAD_CLIP = "n68", "n86"
ROOT, FOURTH, SIXTH = "n80", "n83", "n77"
ROW1 = "oled:0,15,128,9"

STEPS = [
    card("The Conductor", "Tutorial 6.2", 3.0),

    caption("A Conductor plays no sound of its own: it transposes every melodic track, "
            "following the notes you give it. Let's make track 5 one.", title="The Conductor"),
    wait(3.0), point(SHIFT, JOG_TURN, secs=1.2), press(SHIFT), wait(0.4), turn(JOG_TURN, 1, ms=300),
    wait(0.6), release(SHIFT), wait(1.0),
    caption("With the transport stopped, open TRACK CONFIG and Shift + click Instmt/Dest.",
            title="Making one"),
    wait(2.0), press(JOG), wait(0.8), point(PAD_CONFIG, secs=1.0), tap(PAD_CONFIG, 150), wait(0.4),
    release(JOG), wait(1.2), point(ROW1, SHIFT, JOG, secs=1.4),
    press(SHIFT), wait(0.3), tap(JOG, 100, check=True), wait(0.3), release(SHIFT), wait(1.5),
    caption("Conductor sits just after Move's instruments. Click it, turn to Yes and click.", title="Making one"),
    wait(1.5), turn(JOG_TURN, -1, ms=400), wait(1.0), tap(JOG, 100, check=True), wait(1.5),
    point("oled:64,44,64,20", secs=1.2), turn(JOG_TURN, 1, ms=400), wait(0.8),   # the confirm opens on No
    tap(JOG, 100, check=True), wait(2.0), hold(BACK, 800), wait(1.5),

    caption("Start the music and play the Conductor's pads: the bass and the lead follow. "
            "The drums never do.", title="Conducting"),
    wait(2.5), point(PLAY, secs=0.8), tap(PLAY), wait(2.0),
    point(ROOT, secs=1.2), hold(ROOT, 2000), wait(0.3), hold(FOURTH, 2000), wait(0.3),
    hold(SIXTH, 2000), wait(0.3), hold(ROOT, 1500), wait(1.5),

    caption("Sequence it instead: the root on step 1, a fourth up on step 9.", title="A progression"),
    wait(2.0), tap(PLAY), wait(0.8),
    press(STEP(1)), wait(0.4), tap(ROOT, 200), wait(0.3), release(STEP(1)), wait(0.5),
    press(STEP(9)), wait(0.4), tap(FOURTH, 200), wait(0.3), release(STEP(9)), wait(1.0),
    caption("Cond Lock (CLIP knob 6) holds each shift until the next Conductor note.",
            title="A progression"),
    wait(2.0), point(KNOB_TOUCH(6), secs=1.2), press(KNOB_TOUCH(6)), wait(0.6),
    turn(KNOB_TURN(6), 48, ms=14), wait(1.0), release(KNOB_TOUCH(6)), wait(1.0),
    point(PLAY, secs=0.8), tap(PLAY), wait(9.0),
    tap(PLAY), wait(2.0),

    card("Next: Performance Mode", "Tutorial 6.3", 3.0),
]
