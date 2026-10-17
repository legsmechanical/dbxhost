"""9.5 — Save state: a named backup of the whole project. Saved from Project
Settings, the riff then cleared, and the state loaded back. Captions follow
MANUAL-SA §3.9 and §17.3. Starts as lead_setup.PRE_WITH_RIFF leaves it.

From BPM, Save state is 17 rows down and Load state 18 (Export to Ableton is
20). Saving asks first and Load's confirm too, both opening on No. Snapshots
live in the project's folder, which every take restores from the pristine copy.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Save state"
NUMBER = "9.5"
BPM = 110
PRE = PRE_WITH_RIFF

CLIP_A_SIDE = "c43"
SEL_ROW = "oled:0,26,128,12"
DIALOG = "oled:0,44,128,20"


def settings():
    return [point(SHIFT, STEP(2), secs=1.0), press(SHIFT), wait(0.3), tap(STEP(2), 150, check=True), wait(0.3),
            release(SHIFT), wait(1.2)]


STEPS = [
    card("Save state", "Tutorial 9.5", 3.0),

    caption("dAVEBOx saves as you go, so there's no save button. Save state keeps a backup "
            "you can go back to: up to 16 per project.", title="Save state"),
    wait(3.5), point(PLAY, secs=0.8), tap(PLAY), wait(3.0), tap(PLAY), wait(1.0),
    caption("It's in Project Settings, after Projects. Click Save state, turn to Yes and click.",
            title="Saving"),
    wait(2.0), *settings(), turn(JOG_TURN, 17, ms=150), wait(1.0), point(SEL_ROW, secs=1.2),
    tap(JOG, 100, check=True), wait(1.2), point(DIALOG, secs=1.0), turn(JOG_TURN, 1, ms=400), wait(0.8),
    tap(JOG, 100, check=True), wait(2.5), tap(BACK), wait(1.5),

    caption("Now the riff gets wiped: Delete + the clip's button empties it.", title="Oops"),
    wait(2.0), point(DELETE, CLIP_A_SIDE, secs=1.2), press(DELETE), wait(0.3), tap(CLIP_A_SIDE, 150),
    wait(0.3), release(DELETE), wait(1.0), point(*ALL_STEPS, secs=1.4), wait(1.0),

    caption("Load state, just below, lists the backups by date and time. Pick one, turn to "
            "Yes and click.", title="Loading"),
    wait(2.0), *settings(), turn(JOG_TURN, 18, ms=150), wait(1.0), point(SEL_ROW, secs=1.0),
    tap(JOG, 100, check=True), wait(1.5), tap(JOG, 100, check=True), wait(1.0),
    point(DIALOG, secs=1.0), turn(JOG_TURN, 1, ms=400), wait(0.8), tap(JOG, 100, check=True), wait(4.0),
    caption("The project is back as it was saved, riff and all.", title="Loading"),
    wait(1.0), tap(BACK), wait(1.0), point(PLAY, secs=0.8), tap(PLAY), wait(5.0), tap(PLAY), wait(2.0),

    card("That's the tour", "dAVEBOx SA tutorials", 3.5),
]
