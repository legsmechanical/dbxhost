"""2.4 — Recording: Record with the count-in, the take playing back, then
Capture (play first, keep it after) and Undo. Captions follow MANUAL-SA §6.4,
§6.5 and §6.7. Starts as lead_setup.PRE leaves it: track 4, clip A empty.

The pads are played in time: 110 BPM is 0.545 s a beat.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Recording"
NUMBER = "2.4"
BPM = 110
BEAT = 60.0 / BPM


def bar(notes, gate=0.25):
    """Four quarter notes, one bar, starting now."""
    out = []
    for n in notes:
        out += [tap(n, int(gate * 1000)), wait(BEAT - gate)]
    return out


def answer():
    """Off-beat eighths over the second half of the bar — what Capture keeps."""
    return [wait(2 * BEAT + BEAT / 2), tap(EB4, 150), wait(BEAT - 0.15),
            tap(D4, 150), wait(BEAT / 2 - 0.15)]


STEPS = [
    card("Recording", "Tutorial 2.4", 3.0),

    caption("Record plays what you play into the clip. Stopped, it counts in one bar "
            "first, then records and plays together.", title="Record"),
    wait(3.0), point(REC, secs=1.6), tap(REC), wait(4 * BEAT - 0.1),
    *bar([C3, EB3, G3]), tap(BB3, 250), tap(REC),       # Record again in the last beat
    caption("Record again finishes the take at the end of the page (it blinks until "
            "then). An empty clip takes as many pages as you play.", title="Record"),
    wait(6.0),
    caption("Play stops.", title="Record"),
    wait(0.8), point(PLAY, secs=1.0), tap(PLAY), wait(2.0),

    caption("dAVEBOx is always listening. With the clip playing, play something over it…",
            title="Capture"),
    wait(2.0), point(PLAY, secs=1.0), tap(PLAY), wait(4 * BEAT),
    *answer(), *answer(),
    caption("…then tap Capture to keep it. It blinks while there's something to keep.",
            title="Capture"),
    wait(1.0), point(CAPTURE, secs=1.6), tap(CAPTURE), wait(6.0),
    caption("One Undo takes a capture back.", title="Capture"),
    wait(1.0), point(UNDO, secs=1.4), tap(UNDO), wait(4.0),
    tap(PLAY), wait(2.0),

    card("Next: drums", "Tutorial 3.1", 3.0),
]
