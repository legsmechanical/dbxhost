"""A short pipeline check: a card, captions, play, a jog turn, a pad."""
from director import card, caption, tap, turn, wait
TITLE = "Spike"
BPM = 110
STEPS = [
    card("Pipeline check", "recorder · director · renderer", 2.5),
    caption("Play starts the sequencer.", title="Transport"),
    tap("c85"), wait(4.0),
    caption("Turn the jog."),
    turn("c14", 3), wait(1.0),
    caption("Tap a pad."),
    tap("n84", 300), wait(1.0), tap("n86", 300), wait(1.0),
    tap("c85"), wait(1.0),
]
