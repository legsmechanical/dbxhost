"""1.3 — Getting around: changing track, the bank map, knobs, menus and Back.
Captions follow MANUAL-SA §3.3, §3.5–3.7.

Starts (PRE, not in the video) on Track View, track 2 (the NuSaw bass), CLIP
bank, stopped.
"""
from director import card, caption, tap, hold, press, release, turn, wait

TITLE = "Getting around"
NUMBER = "1.3"
BPM = 110

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
STEP = lambda i: "n%d" % (15 + i)            # Step 1..16 -> notes 16..31
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))
PAD_NOTE_FX, PAD_CLIP, PAD_CONFIG = "n95", "n86", "n68"


def PRE(bus):
    """Track View, track 2, CLIP bank, stopped."""
    def tap_(pkt_down, pkt_up, frames=20):
        bus.inject_midi(pkt_down); bus.wait_frame(frames); bus.inject_midi(pkt_up); bus.wait_frame(60)
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    note = lambda n, on: bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0])
    bus.set_param("transport", "stop"); bus.wait_frame(30)
    tap_(cc(50, 127), cc(50, 0))                         # Session View -> Track View
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map
    tap_(note(17, True), note(17, False))                # Step 2: track 2
    tap_(note(86, True), note(86, False))                # CLIP
    bus.inject_midi(cc(3, 0)); bus.wait_frame(200)


STEPS = [
    card("Getting around", "Tutorial 1.3", 3.0),

    caption("There are no track buttons. Hold Shift and turn the jog to change track.",
            title="Changing track"),
    wait(1.0), press(SHIFT), wait(1.2),
    turn(JOG_TURN, 1), wait(1.2), turn(JOG_TURN, 1), wait(1.2), turn(JOG_TURN, -2, ms=250), wait(1.0),
    release(SHIFT), wait(1.5),

    caption("Each track has banks of settings for the knobs. Hold the jog: the left pads "
            "become a map of them, and the screen shows the same map.", title="The bank map"),
    wait(1.0), press(JOG), wait(4.5),
    caption("While it's up, Steps 1–8 are the tracks. Press one to switch.", title="The bank map"),
    wait(1.0), tap(STEP(1), 150), wait(2.2), tap(STEP(2), 150), wait(2.0),
    caption("Tap a pad to land on a bank (here NOTE FX), then let go.", title="The bank map"),
    wait(1.0), tap(PAD_NOTE_FX, 150), wait(1.5), release(JOG), wait(2.5),

    caption("Touch a knob to see the bank's page; turn it to change a value.", title="Knobs"),
    wait(1.0), press(KNOB_TOUCH(1)), wait(1.8),
    turn(KNOB_TURN(1), 16, ms=14), wait(2.0), turn(KNOB_TURN(1), -16, ms=14), wait(1.2),
    release(KNOB_TOUCH(1)), wait(1.5),
    caption("Let go and the overview is back. Each track remembers its bank.", title="Knobs"),
    wait(3.5),
    caption("Back to CLIP: hold the jog and tap its pad.", title="Knobs"),
    wait(1.0), press(JOG), wait(1.0), tap(PAD_CLIP, 150), wait(1.0), release(JOG), wait(2.0),

    caption("Shift + Step 2 opens Project Settings.", title="Menus"),
    wait(1.0), press(SHIFT), wait(0.4), tap(STEP(2), 150), wait(0.3), release(SHIFT), wait(2.5),
    caption("Every list works the same way: turn the jog to move, click to choose.", title="Menus"),
    wait(0.8), turn(JOG_TURN, 3, ms=450), wait(1.0), turn(JOG_TURN, -3, ms=300), wait(1.0),
    caption("Back steps out.", title="Menus"),
    wait(0.8), tap(BACK), wait(2.0),
    caption("CONFIG, bottom-left of the map, opens the track's own menu, TRACK CONFIG.",
            title="Menus"),
    wait(1.0), press(JOG), wait(1.0), tap(PAD_CONFIG, 150), wait(0.8), release(JOG), wait(2.5),
    turn(JOG_TURN, 2, ms=450), wait(1.0),
    caption("Hold Back to go straight to the overview.", title="Menus"),
    wait(1.0), hold(BACK, 800), wait(2.5),

    card("Next: choosing a sound", "Tutorial 1.4", 3.0),
]
