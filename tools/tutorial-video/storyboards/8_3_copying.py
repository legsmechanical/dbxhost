"""8.3 — Copying in Session View: Copy + a clip, then an empty slot; Copy + a
side button, then another row (a whole scene); Delete + a clip clears it.
Captions follow MANUAL-SA §11.1 and §11.2. Starts on the plain demo project in
Session View (no PRE): row 1 holds the beat, the bass and the chords.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import ROW1, ROW2, COL, SIDE1, SIDE2, SHIFT, PLAY, COPY, DELETE, UNDO

TITLE = "Copying clips and scenes"
NUMBER = "8.3"
BPM = 110

SIDE3 = "c41"
ROW3 = tuple("n%d" % n for n in range(76, 84))
T1_ROW1, T1_ROW2 = COL(1)


def PRE(bus):
    bus.set_param("transport", "stop"); bus.wait_frame(30)


STEPS = [
    card("Copying clips and scenes", "Tutorial 8.3", 3.0),

    caption("Session View copies clips and whole scenes. Row 1 has the beat, the bass "
            "and the chords; the rest is empty.", title="Copying"),
    wait(3.0), point(*ROW1[:3], secs=2.0), wait(0.5),
    caption("Hold Copy, tap a clip, then tap an empty slot: the drum clip now has a twin "
            "on row 2.", title="A clip"),
    wait(2.5), point(COPY, T1_ROW1, secs=1.4), press(COPY), wait(0.3), tap(T1_ROW1, 150), wait(0.6),
    point(T1_ROW2, secs=1.0), tap(T1_ROW2, 150), wait(0.3), release(COPY), wait(2.0),
    caption("Copy + a side button copies a whole row: here, scene 1 onto row 3.", title="A scene"),
    wait(2.0), point(COPY, SIDE1, secs=1.4), press(COPY), wait(0.3), tap(SIDE1), wait(0.6),
    point(SIDE3, secs=1.0), tap(SIDE3), wait(0.3), release(COPY), wait(2.0),
    caption("Play scene 3 to hear the copy.", title="A scene"),
    wait(1.0), point(SIDE3, secs=0.8), tap(PLAY), wait(0.5), tap(SIDE3), wait(5.0),
    caption("Delete + a clip clears its notes; Undo brings them back.", title="Clearing"),
    wait(2.0), point(DELETE, "n76", secs=1.4), press(DELETE), wait(0.3), tap("n76", 150), wait(0.3),
    release(DELETE), wait(3.0), point(UNDO, secs=0.8), tap(UNDO), wait(3.0),
    tap(PLAY), wait(2.0),

    card("Next: Live Merge", "Tutorial 8.4", 3.0),
]
