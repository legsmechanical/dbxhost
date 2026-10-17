"""Off-camera probe: does a recalled sound snapshot change NuSaw's filter?
Save bright (1), close the cutoff, save dark (2); recall 1 (t~20), recall 2
(t~28), open INST to read the knob (t~33), nudge knob 1 by one detent (t~38)."""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403
TITLE, NUMBER, BPM = "snapshot recall probe", "x", 110
PAD_INST = "n70"

def save(slot):
    return [press(CAPTURE), wait(0.5), press(SHIFT), wait(0.3), tap(STEP(slot), 150), wait(0.3),
            release(SHIFT), wait(0.3), release(CAPTURE), wait(1.5)]


def recall(slot, secs=4.0):
    return [press(CAPTURE), wait(0.8), tap(STEP(slot), 150), wait(0.3), release(CAPTURE), wait(secs)]



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


STEPS = [
    tap(PLAY), wait(2.0), *save(1),
    press(JOG), wait(0.8), tap(PAD_INST, 150), wait(0.4), release(JOG), wait(1.5),
    press(KNOB_TOUCH(1)), wait(0.5), turn(KNOB_TURN(1), -140, ms=30), wait(1.0), release(KNOB_TOUCH(1)),
    wait(1.0), hold(BACK, 800), wait(1.0), *save(2),
    *recall(1, 6.0), *recall(2, 5.0),
    press(JOG), wait(0.8), tap(PAD_INST, 150), wait(0.4), release(JOG), wait(4.0),
    press(KNOB_TOUCH(1)), wait(0.5), turn(KNOB_TURN(1), 1, ms=30), wait(0.5), release(KNOB_TOUCH(1)), wait(5.0),
    tap(PLAY), wait(1.0),
]
