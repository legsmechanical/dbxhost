"""3.1 — Drum lanes: the left pads are lanes, selecting one, placing hits,
velocity zones, lane banks A and B. Captions follow MANUAL-SA §7 and §7.1.
Starts as drum_setup.PRE leaves it: track 1, the 707 kit, clip A empty.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from drum_setup import *                       # noqa: F401,F403

TITLE = "Drum lanes"
NUMBER = "3.1"
BPM = 110

STEPS = [
    card("Drum lanes", "Tutorial 3.1", 3.0),

    caption("Track 1 is a drum track. The left 16 pads are its lanes: one sound each.",
            title="Lanes"),
    wait(2.0), point(*LANE_PADS, secs=2.0),
    tap(KICK, 150), wait(0.5), tap(SNARE, 150), wait(0.5), tap(HAT, 150), wait(0.5), tap(CLAP, 150), wait(1.5),
    caption("Tap a lane to select it. The steps then show that lane's hits.", title="Lanes"),
    wait(1.5), point(KICK, secs=1.2), tap(KICK, 150), wait(0.5), point(*ALL_STEPS, secs=1.8), wait(0.5),

    caption("Start it playing and tap steps to place hits: the kick on every beat.",
            title="Placing hits"),
    wait(2.0), point(PLAY, secs=1.0), tap(PLAY), wait(1.0),
    tap(STEP(1), 150), wait(0.4), tap(STEP(5), 150), wait(0.4), tap(STEP(9), 150), wait(0.4),
    tap(STEP(13), 150), wait(3.0),
    caption("Select the snare and the steps show its lane instead: hits on 5 and 13.",
            title="Placing hits"),
    wait(1.5), point(SNARE, secs=1.2), tap(SNARE, 150), wait(0.6),
    tap(STEP(5), 150), wait(0.4), tap(STEP(13), 150), wait(3.0),
    caption("The hat on the off-beats.", title="Placing hits"),
    wait(1.0), point(HAT, secs=1.0), tap(HAT, 150), wait(0.6),
    tap(STEP(3), 150), wait(0.3), tap(STEP(7), 150), wait(0.3), tap(STEP(11), 150), wait(0.3),
    tap(STEP(15), 150), wait(3.5),

    caption("The right pads are velocity zones, soft at the bottom-left to full at the "
            "top-right. Tap one: the hits you place next play that hard.", title="Velocity"),
    wait(3.0), point(*ZONE_PADS, secs=2.0), point(SOFT_ZONE, secs=1.2), tap(SOFT_ZONE, 150), wait(0.6),
    tap(STEP(4), 150), wait(0.3), tap(STEP(8), 150), wait(0.3), tap(STEP(12), 150), wait(0.3),
    tap(STEP(16), 150), wait(4.0),

    caption("+ and − switch between lane banks A and B: 32 lanes in all.", title="Lane banks"),
    wait(1.5), point(PLUS, MINUS, secs=1.4), tap(PLUS), wait(2.5), tap(MINUS), wait(2.0),
    caption("Play stops.", title="Lane banks"),
    wait(0.8), tap(PLAY), wait(2.0),

    card("Next: lane loops and Note Repeat", "Tutorial 3.2", 3.0),
]
