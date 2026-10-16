"""Off-camera probe: SEQ ARP switched on in the middle of a held chord."""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403
TITLE, NUMBER, BPM = "arp fix check", "x", 110


def PRE(bus):
    PRE_WITH_CHORDS(bus)
    cc = lambda n, v: bus.inject_midi(bytes([0x0B, 0xB0, n, v]))
    def note(n, on): bus.inject_midi(bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0]))
    cc(49, 127); bus.wait_frame(20); cc(88, 127); bus.wait_frame(20); cc(88, 0); bus.wait_frame(20)
    cc(49, 0); bus.wait_frame(100)                       # Shift + Mute: solo track 4
    cc(42, 127); bus.wait_frame(20); cc(42, 0); bus.wait_frame(150)   # clip B: the long chords
    cc(3, 127); bus.wait_frame(60); note(71, True); bus.wait_frame(30); note(71, False)
    bus.wait_frame(30); cc(3, 0); bus.wait_frame(150)   # the SEQ ARP bank


STEPS = [
    press(KNOB_TOUCH(1)), wait(0.6),
    tap(PLAY), wait(0.35),                               # the C minor chord is sounding ...
    turn(KNOB_TURN(1), 16, ms=14),                       # ... when the arp comes on
    release(KNOB_TOUCH(1)), wait(9.0),
    tap(PLAY), wait(1.5),
]
