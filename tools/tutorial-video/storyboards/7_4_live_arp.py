"""7.4 — LIVE ARP: the arpeggiator for what you play (not the clip), on the bank
map's IN column; a style, then held pads arpeggiated over the beat; Latch with
Loop; Loop with no pads to clear. Captions follow MANUAL-SA §9.5. Starts as
lead_setup.PRE leaves it: track 4 (clip empty), pads from C3.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from lead_setup import *                       # noqa: F401,F403

TITLE = "LIVE ARP"
NUMBER = "7.4"
BPM = 110

PAD_LIVE_ARP = "n84"
CHORD = (C3, EB3, G3)


def hold_chord(secs):
    return [press(C3), press(EB3), press(G3), wait(secs), release(G3), release(EB3), release(C3), wait(0.6)]


STEPS = [
    card("LIVE ARP", "Tutorial 7.4", 3.0),

    caption("LIVE ARP arpeggiates what you play on the pads, not the clip. It's on the "
            "bank map's IN column. Start the beat.", title="LIVE ARP"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(1.5),
    press(JOG), wait(0.8), point(PAD_LIVE_ARP, secs=1.2), tap(PAD_LIVE_ARP, 150), wait(0.4),
    release(JOG), wait(1.2),
    caption("Knob 1 picks a style. Then hold a chord: it plays one note at a time, in "
            "time.", title="LIVE ARP"),
    wait(2.0), point(KNOB_TOUCH(1), secs=1.0), press(KNOB_TOUCH(1)), wait(0.5),
    turn(KNOB_TURN(1), 16, ms=14), wait(1.0), release(KNOB_TOUCH(1)), wait(0.8),
    point(*CHORD, secs=1.0), *hold_chord(4.0), wait(1.0),
    caption("Knob 2 sets the rate; knob 3 adds octaves.", title="LIVE ARP"),
    wait(1.0), press(KNOB_TOUCH(3)), wait(0.5), turn(KNOB_TURN(3), 16, ms=14), wait(0.5),
    release(KNOB_TOUCH(3)), wait(0.5), *hold_chord(4.0), wait(0.5),
    caption("To keep it going hands-free, hold the chord and tap Loop: it's latched.",
            title="Latch"),
    wait(2.0), point(LOOP, secs=1.0), press(C3), press(EB3), press(G3), wait(0.8), tap(LOOP), wait(0.5),
    release(G3), release(EB3), release(C3), wait(5.0),
    caption("Loop with no pads held clears it.", title="Latch"),
    wait(1.0), tap(LOOP), wait(3.0), tap(PLAY), wait(2.0),

    card("Next: sound and arrangement extras", "Tutorial 8.1", 3.0),
]
