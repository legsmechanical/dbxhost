"""Off-camera probe (not a tutorial): the 5.1 SEQ ARP steps with track 4 soloed."""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403
TITLE, NUMBER, BPM = "arp probe", "x", 110


def PRE(bus):
    PRE_WITH_RIFF(bus)
    cc = lambda n, v: bus.inject_midi(bytes([0x0B, 0xB0, n, v]))
    cc(49, 127); bus.wait_frame(20); cc(88, 127); bus.wait_frame(20); cc(88, 0); bus.wait_frame(20)
    cc(49, 0); bus.wait_frame(100)                       # Shift + Mute: solo track 4


def twist(knob, n):
    return [press(KNOB_TOUCH(knob)), wait(0.6), turn(KNOB_TURN(knob), n, ms=14), wait(0.5),
            release(KNOB_TOUCH(knob)), wait(0.5)]


def bank(pad):
    return [press(JOG), wait(0.8), tap(pad, 150), wait(0.4), release(JOG), wait(1.0)]


STEPS = [
    wait(0.5), tap(PLAY), wait(4.4),                                   # the riff alone
    *bank("n95"), *twist(1, 16), wait(4.4),                            # NOTE FX octave +1
    *twist(1, -16), wait(4.4),                                         # and back
    *bank("n87"), *twist(2, 16), wait(4.4),                            # HARMONY +2
    *twist(2, -16), wait(4.4),                                         # and back
    tap(PLAY), wait(2.0),
]
