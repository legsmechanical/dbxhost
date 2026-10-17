"""9.4 — Master FX and the sends: the three effect buses on the Session map's
FX column (MASTER n94, SEND A n78, SEND B n70), a hall reverb loaded on SEND A,
then the drums fed into it from the MIXER column's SEND A mode (n76, knob 1).
Captions follow MANUAL-SA §14.8. Starts as session_setup.PRE leaves it
(Session View, the piano muted, stopped). Every bus starts empty.

The effect browser opens on 4K EQ; Dragonfly Hall is 9 below it. Loading opens
the effect's editor; Back returns to the bus's list, hold Back to the overview.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point
from session_setup import *                    # noqa: F401,F403

TITLE = "Master FX and the sends"
NUMBER = "9.4"
BPM = 110

PAD_MASTER, PAD_SEND_A, PAD_SEND_B, MIX_SEND_A, MIX_VOLUME = "n94", "n78", "n70", "n76", "n92"
FX1_ROW = "oled:0,12,128,12"


def bank(pad, secs=1.0):
    return [press(JOG), wait(0.8), point(pad, secs=secs), tap(pad, 150), wait(0.4), release(JOG), wait(1.5)]


STEPS = [
    card("Master FX and the sends", "Tutorial 9.4", 3.0),

    caption("Three effect buses sit across every track: MASTER FX, and two sends, A and B. "
            "Start the music.", title="The buses"),
    wait(3.0), point(PLAY, secs=0.8), tap(PLAY), wait(2.0),
    caption("They're on the Session map's FX column. Master FX processes everything on its "
            "way out.", title="The buses"),
    wait(1.5), press(JOG), wait(0.8), point(PAD_MASTER, PAD_SEND_A, PAD_SEND_B, secs=2.0),
    point(PAD_MASTER, secs=1.2), wait(1.0), release(JOG), wait(1.0),

    caption("A send is shared: several tracks feed one reverb. Open SEND A and load a hall "
            "on FX 1.", title="A shared reverb"),
    wait(2.0), *bank(PAD_SEND_A), point(FX1_ROW, secs=1.0), tap(JOG, 100, check=True), wait(1.5),
    turn(JOG_TURN, 9, ms=150), wait(1.2), tap(JOG, 100, check=True), wait(2.5),
    tap(BACK), wait(1.5), hold(BACK, 800), wait(1.0),

    caption("Nothing reaches it yet. SEND A on the MIXER column turns the knobs into each "
            "track's send: knob 1 feeds the drums in.", title="Feeding it"),
    wait(2.5), *bank(MIX_SEND_A), point(KNOB_TOUCH(1), secs=1.0),
    press(KNOB_TOUCH(1)), wait(0.5), turn(KNOB_TURN(1), 120, ms=12), wait(1.0), release(KNOB_TOUCH(1)),
    wait(6.0),
    caption("The send's last row, Return, sets how much of the reverb comes back. VOLUME puts "
            "the knobs back on the faders.", title="Feeding it"),
    wait(3.0), *bank(MIX_VOLUME), wait(2.0), tap(PLAY), wait(2.0),

    card("Next: Save state", "Tutorial 9.5", 3.0),
]
