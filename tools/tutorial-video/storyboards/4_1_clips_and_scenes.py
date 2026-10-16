"""4.1 — Session View, clips and scenes: the grid, Play, launching a clip,
launching a scene (side buttons, then step buttons), stopping a clip,
Shift + clip to open it. Captions follow MANUAL-SA §11, §11.1 and §11.2.
Starts as session_setup.PRE leaves it: two scenes, every track on row 1.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import *                    # noqa: F401,F403

TITLE = "Clips and scenes"
NUMBER = "4.1"
BPM = 110

T1_ROW1, T1_ROW2 = COL(1)

STEPS = [
    card("Clips and scenes", "Tutorial 4.1", 3.0),

    caption("Session View holds the clips: a column per track, a row per scene. Row 1 "
            "has the beat and the bass (the chords on track 3 wait, muted)…", title="The grid"),
    wait(2.5), point(*ROW1[:4], secs=2.5), wait(0.5),
    caption("…row 2 a busier beat and a lead on track 4.", title="The grid"),
    wait(1.0), point(*ROW2[:4], secs=2.5), wait(0.5),
    caption("Play starts scene 1.", title="Launching"),
    wait(1.0), point(PLAY, secs=1.0), tap(PLAY), wait(5.0),

    caption("Tap a clip to launch it: track 1 switches to its busier beat.", title="Launching"),
    wait(1.5), point(T1_ROW2, secs=1.4), tap(T1_ROW2, 150), wait(5.0),
    caption("A side button launches a whole row at once: a scene. Scene 2 brings in the "
            "lead.", title="Scenes"),
    wait(2.5), point(SIDE2, secs=1.4), tap(SIDE2), wait(7.0),
    caption("The step buttons launch scenes too: Step 1 is scene 1.", title="Scenes"),
    wait(1.5), point(STEP(1), secs=1.4), tap(STEP(1), 150), wait(5.0),

    caption("Tap a playing clip to stop it at the end of its page; tap it again to "
            "bring it back.", title="Stopping a clip"),
    wait(2.5), point(T1_ROW1, secs=1.4), tap(T1_ROW1, 150), wait(5.0), tap(T1_ROW1, 150), wait(4.0),

    caption("Shift + a clip opens it in Track View, ready to edit. Note/Session comes "
            "back.", title="Opening a clip"),
    wait(2.5), point(SHIFT, T1_ROW1, secs=1.6),
    press(SHIFT), wait(0.3), tap(T1_ROW1, 150), wait(0.3), release(SHIFT), wait(3.0),
    point(NOTE_SESSION, secs=1.0), tap(NOTE_SESSION), wait(2.5),
    tap(PLAY), wait(2.0),

    card("Next: mixing", "Tutorial 4.2", 3.0),
]
