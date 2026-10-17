"""Off-camera probe: what the Session map's bus pads open, and what they hold."""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import *                    # noqa: F401,F403
TITLE, NUMBER, BPM = "buses probe", "x", 110

def bus(pad):
    return [press(JOG), wait(0.8), tap(pad, 150), wait(0.4), release(JOG), wait(2.0),
            turn(JOG_TURN, 1, ms=400), wait(1.0), turn(JOG_TURN, 1, ms=400), wait(1.0),
            turn(JOG_TURN, 1, ms=400), wait(1.0), tap(BACK), wait(1.0), hold(BACK, 800), wait(1.5)]

STEPS = [press(JOG), wait(1.5), release(JOG), wait(1.0), *bus("n94"), *bus("n78"), *bus("n70")]
