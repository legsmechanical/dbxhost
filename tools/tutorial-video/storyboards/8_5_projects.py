"""8.5 — Projects: saving as you go, the project picker (Shift + Step 1), the
shelf, copying the open project onto an empty pad, colouring the copy, and
deleting it again. Captions follow MANUAL-SA §3.9 and §17.5. Starts as
lead_setup.PRE leaves it.

The demo project is index 3 (n71); index 5 (n73) is empty on this device. The
take deletes its own copy; POST only reports a leftover, it never deletes —
the other projects on the shelf are not ours.
A selected project's rows are Load, Rename, Color.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Projects"
NUMBER = "8.5"
BPM = 110

DEMO, EMPTY = "n71", "n73"
SHELF = tuple("n%d" % n for n in range(68, 100))
COPY = "c60"
ROWS = "oled:0,14,128,40"


def POST(bus):
    import subprocess
    from take import SSH_OPTS, HOST
    out = subprocess.run(["ssh", *SSH_OPTS, "ableton@" + HOST,
                          "grep -o '\"name\": \"[^\"]*Copy\"' /data/UserData/dbx-host/projects.json"],
                         capture_output=True, text=True).stdout.strip()
    if out:
        print("POST: a copy is still on the shelf, delete it by hand:", out)


STEPS = [
    card("Projects", "Tutorial 8.5", 3.0),

    caption("dAVEBOx saves as you go: when you stop, after an edit, when you leave. There's "
            "no save button.", title="Saving"),
    wait(4.0),
    caption("Shift + Step 1 opens the project picker, from anywhere.", title="The picker"),
    wait(1.5), point(SHIFT, STEP(1), secs=1.2), press(SHIFT), wait(0.3), tap(STEP(1), 150, check=True),
    wait(0.3), release(SHIFT), wait(1.5),
    caption("The pads are your shelf: one project each, in its colour. Solid white is the one "
            "you're in, and the screen says CURRENT.", title="The picker"),
    wait(1.0), point(*SHELF, secs=1.6), point(DEMO, secs=1.2), wait(2.5),

    caption("Copy works here too: hold Copy, tap the project, then tap an empty pad.",
            title="Copying"),
    wait(2.0), point(COPY, secs=1.0), press(COPY), wait(0.4), tap(DEMO, 150), wait(0.6),
    point(EMPTY, secs=0.8), tap(EMPTY, 150), wait(0.4), release(COPY), wait(2.5),
    caption("Tap it to select it: Load, Rename, Color. Color runs through the palette, and "
            "the pad previews each one.", title="Copying"),
    wait(2.0), tap(EMPTY, 150), wait(1.5), point(ROWS, secs=1.2), turn(JOG_TURN, 2, ms=400), wait(1.0),
    tap(JOG, 100, check=True), wait(1.0), point(EMPTY, secs=0.8),
    turn(JOG_TURN, 1, ms=500), wait(0.8), turn(JOG_TURN, 1, ms=500), wait(0.8), turn(JOG_TURN, 1, ms=500),
    wait(1.0), tap(JOG, 100, check=True), wait(1.5),

    caption("Hold Delete and tap a project twice to remove it: it blinks red in between.",
            title="Deleting"),
    wait(2.0), point(DELETE, EMPTY, secs=1.2), press(DELETE), wait(0.4), tap(EMPTY, 150), wait(1.5),
    tap(EMPTY, 150), wait(0.5), release(DELETE), wait(2.0),
    caption("Tap an empty pad to start a new project. Back closes the picker.", title="The picker"),
    wait(2.0), tap(DEMO, 150), wait(1.0), point(BACK, secs=0.8), tap(BACK), wait(2.0),

    card("That's the tour", "dAVEBOx SA tutorials", 3.5),
]
