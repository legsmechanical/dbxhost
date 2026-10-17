"""8.2 — Swing: the project's groove in Project Settings — Groove (Swing 1/16 by
default) and Groove Amt, where 50% is straight and higher pushes every other
sixteenth later. Captions follow MANUAL-SA §17.1 (Groove, Groove Amt). Starts
as drum_setup.PRE_WITH_BEAT leaves it (the beat's hat on the off-beats).

Groove Amt is the 7th row (6 down from BPM). Every Project Settings click is
checked. Groove Amt reads 50 + raw/4 under a swing, so 62% is 48 detents;
the way back overturns and clamps at 50%.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from drum_setup import *                       # noqa: F401,F403

TITLE = "Swing"
NUMBER = "8.2"
BPM = 110
PRE = PRE_WITH_BEAT

STEPS = [
    card("Swing", "Tutorial 8.2", 3.0),

    caption("Swing pushes every other sixteenth a little late, for a looser feel. Start "
            "the beat: hear it straight first.", title="Swing"),
    wait(2.5), point(PLAY, secs=0.8), tap(PLAY), wait(4.0),
    caption("It's in Project Settings (Shift + Step 2): Groove, set to Swing 1/16, and "
            "Groove Amt.", title="Swing"),
    wait(2.0), point(SHIFT, STEP(2), secs=1.2), press(SHIFT), wait(0.3), tap(STEP(2), 150), wait(0.3),
    release(SHIFT), wait(1.5), turn(JOG_TURN, 6, ms=300), wait(1.0),
    point("oled:0,26,128,24", secs=1.6),
    caption("Groove Amt at 50% is straight. Click it and turn it up: around 62% the beat "
            "starts to swing.", title="Swing"),
    wait(2.5), tap(JOG, 100, check=True), wait(0.8), turn(JOG_TURN, 48, ms=70), wait(0.8),
    tap(JOG, 100, check=True), wait(6.0),
    caption("It applies to every track, the bass included. Set it back to 50% for straight.",
            title="Swing"),
    wait(3.0), tap(JOG, 100, check=True), wait(0.8), turn(JOG_TURN, -60, ms=40), wait(0.8),
    tap(JOG, 100, check=True), wait(3.0), tap(BACK), wait(1.0), tap(PLAY), wait(2.0),

    card("Next: copying clips and scenes", "Tutorial 8.3", 3.0),
]
