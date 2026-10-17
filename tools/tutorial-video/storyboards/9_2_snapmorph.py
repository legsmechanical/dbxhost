"""9.2 — SnapMorph: one macro knob turned into a path between the lead's two
snapshots from 9.1 (bright = slot 1, dark = slot 2). Captions follow
MANUAL-SA §14.7 (SnapMorph). PRE is 9.1's (the lead alone), plus the two
snapshots saved off camera.

The layer needs Capture held 450 ms before a step (DEVSNAP_HOLD_MS); SPI
frames are ~2.9 ms, so the waits below are in frames accordingly.
SnapMorph is the last entry of an unassigned macro's picker.
"""
import importlib.util, os, time
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

_spec = importlib.util.spec_from_file_location(
    "s91", os.path.join(os.path.dirname(__file__), "9_1_sound_snapshots.py"))
_s91 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_s91)

TITLE = "SnapMorph"
NUMBER = "9.2"
BPM = 110

PAD_MACROS, PAD_INST = "n93", "n70"


def PRE(bus):
    _s91.PRE(bus)
    cc = lambda n, v: bus.inject_midi(bytes([0x0B, 0xB0, n, v]))
    def note(n, on): bus.inject_midi(bytes([0x09, 0x90, n, 127 if n <= 9 else 100]) if on else bytes([0x08, 0x80, n, 0]))
    def save(step):
        cc(52, 127); bus.wait_frame(250); cc(49, 127); bus.wait_frame(40)
        note(15 + step, True); bus.wait_frame(30); note(15 + step, False); bus.wait_frame(40)
        cc(49, 0); bus.wait_frame(40); cc(52, 0); bus.wait_frame(400)
    save(1)
    cc(3, 127); bus.wait_frame(200); note(70, True); bus.wait_frame(30); note(70, False)   # INST
    bus.wait_frame(60); cc(3, 0); bus.wait_frame(400)
    note(0, True); bus.wait_frame(100)
    for _ in range(140):
        cc(71, 127); time.sleep(0.03)
    bus.wait_frame(200); note(0, False); bus.wait_frame(100)
    cc(51, 127); bus.wait_frame(300); cc(51, 0); bus.wait_frame(300)      # hold Back: out
    save(2)
    cc(52, 127); bus.wait_frame(250); note(16, True); bus.wait_frame(30); note(16, False)   # recall 1:
    bus.wait_frame(40); cc(52, 0); bus.wait_frame(600)                                       # bright again


def touch_click(knob):
    return [press(KNOB_TOUCH(knob)), wait(0.5), tap(JOG, 100), wait(0.3), release(KNOB_TOUCH(knob)), wait(1.2)]


STEPS = [
    card("SnapMorph", "Tutorial 9.2", 3.0),

    caption("SnapMorph turns one knob into a path between a track's snapshots. Here, the "
            "lead's two from 9.1: bright and dark.", title="SnapMorph"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(2.0),
    caption("Open MACROS, touch a free knob and click: SnapMorph is the last entry.",
            title="Assigning"),
    wait(2.0), press(JOG), wait(0.8), point(PAD_MACROS, secs=1.0), tap(PAD_MACROS, 150), wait(0.4),
    release(JOG), wait(1.2), point(KNOB_TOUCH(1), JOG, secs=1.2), *touch_click(1),
    turn(JOG_TURN, 30, ms=60), wait(1.5), tap(JOG, 100, check=True), wait(2.0),
    caption("Click the snapshots in the order the knob should travel: 1 at the bottom of "
            "the turn, then 2.", title="Assigning"),
    wait(2.5), tap(JOG, 100), wait(1.2), turn(JOG_TURN, 1, ms=400), wait(0.8), tap(JOG, 100), wait(2.0),
    point(BACK, secs=0.8), tap(BACK), wait(1.0), tap(BACK), wait(1.5),

    caption("Now knob 1 glides the whole sound from one snapshot to the other.", title="Morphing"),
    wait(1.5), point(KNOB_TOUCH(1), secs=1.0), press(KNOB_TOUCH(1)), wait(0.5),
    turn(KNOB_TURN(1), 220, ms=14), wait(2.5), turn(KNOB_TURN(1), -220, ms=14), wait(1.0),
    release(KNOB_TOUCH(1)), wait(1.5),
    caption("Numbers glide; a choice, like a waveform, flips halfway. It records as one "
            "automation lane.", title="Morphing"),
    wait(4.0), tap(PLAY), wait(2.0),

    card("Next: mute snapshots", "Tutorial 9.3", 3.0),
]
