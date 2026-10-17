"""6.4 — Bake and Export: a HARMONY voice baked into the lead's clip as plain
notes (Sample, 2x, no wrap), then Project Settings → Export to Ableton and
where the bundle lands. Captions follow MANUAL-SA §16.1 and §16.3. Starts as
lead_setup.PRE_WITH_RIFF leaves it.

Bake asks the loop count (1x 2x 4x Cancel, on 1x), then Wrap tails (on No).
Export to Ableton is 20 rows below BPM — just past it are Suspend, Quit and
Bluetooth, so every click is checked; its confirm opens on No. The take writes
dbx-host/davebox-exports/dAVEBOx Tutorial-<date>.ablbundle: delete it after.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Bake and Export"
NUMBER = "6.4"
BPM = 110
PRE = PRE_WITH_RIFF

SAMPLE = "c118"
PAD_HARMONY = "n87"
PAGE_BAR = "oled:0,48,128,8"
DIALOG_BTNS = "oled:0,44,128,20"

STEPS = [
    card("Bake and Export", "Tutorial 6.4", 3.0),

    caption("Bake turns the sequencer effects into plain notes. Start the riff and give "
            "it a HARMONY voice.", title="Bake"),
    wait(2.5), point(PLAY, secs=0.8), tap(PLAY), wait(1.5),
    press(JOG), wait(0.8), point(PAD_HARMONY, secs=1.0), tap(PAD_HARMONY, 150), wait(0.4), release(JOG),
    wait(1.0), press(KNOB_TOUCH(2)), wait(0.5), turn(KNOB_TURN(2), 16, ms=14), wait(1.0),
    release(KNOB_TOUCH(2)), wait(3.0),
    caption("Press Sample to bake. It asks how many loops to write: 2x gives two passes.",
            title="Bake"),
    wait(2.0), point(SAMPLE, secs=1.2), tap(SAMPLE, check=True), wait(1.5),
    point(DIALOG_BTNS, secs=1.2), turn(JOG_TURN, 1, ms=400), wait(0.8), tap(JOG, 100, check=True), wait(1.5),
    caption("Wrap tails folds delay echoes past the end back to the start; there are none "
            "here, so No.", title="Bake"),
    wait(2.0), tap(JOG, 100, check=True), wait(2.0),
    caption("The clip now holds the harmony as notes, over two pages, and HARMONY is back at "
            "zero. It sounds the same.", title="Bake"),
    wait(1.0), point(PAGE_BAR, secs=2.0), wait(4.0), tap(PLAY), wait(1.0),

    caption("Export to Ableton, near the end of Project Settings, writes the whole "
            "project as a bundle desktop Live opens.", title="Export"),
    wait(2.5), point(SHIFT, STEP(2), secs=1.2),
    press(SHIFT), wait(0.3), tap(STEP(2), 150), wait(0.3), release(SHIFT), wait(1.5),
    turn(JOG_TURN, 20, ms=300), wait(1.0), point("oled:0,26,128,12", secs=1.2),
    tap(JOG, 100, check=True), wait(1.5),
    point(DIALOG_BTNS, secs=1.0), turn(JOG_TURN, 1, ms=400), wait(0.8), tap(JOG, 100, check=True),
    wait(5.0),
    caption("Download it from the Files page of the Schwung web manager (move.local:7700), "
            "in dbx-host/davebox-exports.", title="Export"),
    wait(6.0), tap(BACK), wait(1.0), hold(BACK, 800), wait(1.5),

    card("Next: pad layouts", "Tutorial 7.1", 3.0),
]
