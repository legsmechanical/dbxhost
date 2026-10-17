"""9.1 — Sound snapshots: hold Capture and the steps hold the track's sound.
The lead's sound saved to slot 1, darkened in its instrument editor (INST,
knob 1 = cutoff), saved to slot 2, then each recalled while the riff plays.
Captions follow MANUAL-SA §14.7. Starts as lead_setup.PRE_WITH_RIFF leaves it.

The layer opens only after Capture is held 450 ms (DEVSNAP_HOLD_MS): a step
pressed sooner is not a recall, and the release shows NO NOTE.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "Sound snapshots"
NUMBER = "9.1"
BPM = 110


def PRE(bus):
    """PRE_WITH_RIFF, then the drums and bass muted too, so the lead is heard
    alone and its filter is unmistakable; track 4 selected again."""
    PRE_WITH_RIFF(bus)
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    for step in (1, 2, 4):                       # bank map: Step N selects track N
        bus.inject_midi(cc(3, 127)); bus.wait_frame(60)
        bus.inject_midi(bytes([0x09, 0x90, 15 + step, 100])); bus.wait_frame(20)
        bus.inject_midi(bytes([0x08, 0x80, 15 + step, 0])); bus.wait_frame(30)
        bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
        if step != 4:
            bus.inject_midi(cc(88, 127)); bus.wait_frame(20); bus.inject_midi(cc(88, 0)); bus.wait_frame(60)

PAD_INST = "n70"


def save(slot):
    return [press(CAPTURE), wait(0.5), press(SHIFT), wait(0.3), tap(STEP(slot), 150), wait(0.3),
            release(SHIFT), wait(0.3), release(CAPTURE), wait(1.5)]


def recall(slot, secs=4.0):
    return [press(CAPTURE), wait(0.8), tap(STEP(slot), 150), wait(0.3), release(CAPTURE), wait(secs)]


STEPS = [
    card("Sound snapshots", "Tutorial 9.1", 3.0),

    caption("A sound snapshot keeps a track's whole sound: every module's settings, its "
            "levels, its macros. Start the riff: the lead alone.", title="Sound snapshots"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(2.5),
    caption("Hold Capture and the steps become 16 snapshot slots. Capture + Shift + Step 1 "
            "saves the sound as it is.", title="Saving"),
    wait(2.0), point(CAPTURE, secs=0.8), press(CAPTURE), wait(0.6), point(*ALL_STEPS, secs=1.4),
    release(CAPTURE), wait(0.5), point(CAPTURE, SHIFT, STEP(1), secs=1.2), *save(1),

    caption("Now change it: INST opens the lead's instrument, and knob 1 closes its filter.",
            title="Saving"),
    wait(2.0), press(JOG), wait(0.8), point(PAD_INST, secs=1.0), tap(PAD_INST, 150), wait(0.4),
    release(JOG), wait(1.5), point(KNOB_TOUCH(1), secs=1.0),
    press(KNOB_TOUCH(1)), wait(0.5), turn(KNOB_TURN(1), -140, ms=30), wait(1.0), release(KNOB_TOUCH(1)),
    wait(2.0), hold(BACK, 800), wait(1.0),
    caption("Save that one to Step 2.", title="Saving"),
    wait(1.0), point(CAPTURE, SHIFT, STEP(2), secs=1.2), *save(2),

    caption("Capture + a step recalls a snapshot, while it plays: Step 1, bright…",
            title="Recalling"),
    wait(2.0), point(CAPTURE, STEP(1), secs=1.0), *recall(1),
    caption("…Step 2, dark. Undo takes a recall back; Capture + Delete + a step clears a slot.",
            title="Recalling"),
    wait(1.0), point(CAPTURE, STEP(2), secs=1.0), *recall(2), *recall(1, 3.0),
    tap(PLAY), wait(2.0),

    card("Next: SnapMorph", "Tutorial 9.2", 3.0),
]
