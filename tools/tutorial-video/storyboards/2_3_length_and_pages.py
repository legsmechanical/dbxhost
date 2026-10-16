"""2.3 — Length and pages: the loop view (hold Loop), a two-page clip, Right /
Left between pages, filling page 2. Captions follow MANUAL-SA §6.6. Starts as
lead_setup.PRE_WITH_RIFF leaves it.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Length and pages"
NUMBER = "2.3"
BPM = 110
PRE = PRE_WITH_RIFF

PAGE_BAR = "oled:0,48,128,8"

STEPS = [
    card("Length and pages", "Tutorial 2.3", 3.0),

    caption("This clip is one page: 16 steps, one bar. Hold Loop to see its length.",
            title="The loop"),
    wait(2.5), point(LOOP, secs=1.4), press(LOOP), wait(3.0),
    caption("While Loop is held, the step buttons stand for pages. Tap Step 2: the clip "
            "is now two pages long.", title="The loop"),
    wait(2.5), point(STEP(2), secs=1.4), tap(STEP(2), 150), wait(2.5), release(LOOP), wait(1.5),
    caption("The bar under the tracks shows the pages: two now, the one you're on solid.",
            title="Pages"),
    wait(1.5), point(PAGE_BAR, secs=2.5), wait(1.0),
    caption("Right moves to page 2. It's empty: give it an answer to page 1.", title="Pages"),
    wait(2.0), point(RIGHT, secs=1.4), tap(RIGHT), wait(1.5),
    tap(EB4, 300), wait(0.5), tap(STEP(1), 150), wait(0.4),
    tap(D4, 300), wait(0.5), tap(STEP(4), 150), wait(0.4),
    tap(BB3, 300), wait(0.5), tap(STEP(7), 150), wait(0.4),
    tap(C4, 300), wait(0.5), tap(STEP(9), 150), wait(1.5),
    caption("Play: the two pages play in turn.", title="Pages"),
    wait(1.0), point(PLAY, secs=1.2), tap(PLAY), wait(9.0),
    caption("Left goes back to page 1. While it plays, the display stays on the page you "
            "chose.", title="Pages"),
    wait(2.0), point(LEFT, secs=1.4), tap(LEFT), wait(4.5),
    tap(PLAY), wait(2.0),

    card("Next: recording", "Tutorial 2.4", 3.0),
]
