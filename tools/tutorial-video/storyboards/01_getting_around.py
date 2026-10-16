"""1 — Getting around: the two views, reading the screen, transport, changing
track, the bank map, knobs, menus, Back. Captions follow MANUAL-SA §1, §3.2–3.7.

Starts (PRE, not in the video) on Track View, track 2 (NuSaw bass), CLIP bank,
stopped — from a fresh session on the dAVEBOx Tutorial project, which lands in
Session View.
"""
from director import card, caption, tap, hold, press, release, turn, wait

TITLE = "Getting around"
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
    card("Getting around", "dAVEBOx · 1", 3.0),

    caption("dAVEBOx takes over Move's pads, knobs and screen. This is Track View, "
            "where you build one clip.", title="Track View"),
    wait(5.5),
    caption("The header names the bank the knobs are on, CLIP, and on the right what "
            "the track plays: here a NuSaw synth.", title="Reading the screen"),
    wait(5.5),
    caption("Under it: the key and scale, and the track's input velocity.", title="Reading the screen"),
    wait(4.0),
    caption("The numbers are the eight tracks. A box marks the one you're on; the "
            "letter under each is the clip it's on.", title="Reading the screen"),
    wait(5.5),
    caption("The footer says what the controls do here.", title="Reading the screen"),
    wait(3.5),

    caption("Play starts and stops the sequencer.", title="Transport"),
    wait(1.0), tap(PLAY), wait(5.0),
    caption("Shift + Play restarts from the top.", title="Transport"),
    wait(1.0), press(SHIFT), wait(0.3), tap(PLAY), wait(0.3), release(SHIFT), wait(3.0),
    caption("Play again to stop.", title="Transport"),
    tap(PLAY), wait(2.0),

    caption("Note/Session switches between Track View and Session View.", title="Two views"),
    wait(1.5), tap(NOTE_SESSION), wait(2.0),
    caption("Session View is the clip grid: each column is a track, each row a scene.", title="Two views"),
    wait(4.0), tap(NOTE_SESSION), wait(2.0),
    caption("Hold Note/Session to peek at the other view; let go to come back.", title="Two views"),
    wait(1.0), press(NOTE_SESSION), wait(2.0), release(NOTE_SESSION), wait(2.0),

    caption("There are no track buttons. Hold Shift and turn the jog to change track.", title="Changing track"),
    wait(1.0), press(SHIFT), wait(1.2),
    turn(JOG_TURN, 1), wait(1.2), turn(JOG_TURN, 1), wait(1.2), turn(JOG_TURN, -2, ms=250), wait(1.0),
    release(SHIFT), wait(1.5),

    caption("Hold the jog: the left pads become a map of this track's banks, "
            "and the screen shows the same map.", title="The bank map"),
    wait(1.0), press(JOG), wait(4.0),
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
    caption("Every list works the same way: turn the jog to move.", title="Menus"),
    wait(0.8), turn(JOG_TURN, 3, ms=450), wait(1.0), turn(JOG_TURN, -3, ms=300), wait(1.0),
    caption("Back steps out.", title="Menus"),
    wait(0.8), tap(BACK), wait(2.0),
    caption("CONFIG, bottom-left of the map, opens the track's TRACK CONFIG.", title="Menus"),
    wait(1.0), press(JOG), wait(1.0), tap(PAD_CONFIG, 150), wait(0.8), release(JOG), wait(2.5),
    turn(JOG_TURN, 2, ms=450), wait(1.0),
    caption("Hold Back to go straight to the overview.", title="Menus"),
    wait(1.0), hold(BACK, 800), wait(2.5),

    caption("From anywhere, Note/Session closes everything and takes you to Session "
            "View in one press.", title="The way out"),
    wait(1.0), press(SHIFT), wait(0.4), tap(STEP(2), 150), wait(0.3), release(SHIFT), wait(1.8),
    tap(NOTE_SESSION), wait(2.5), tap(NOTE_SESSION), wait(2.0),

    card("Next: melodic clips", "dAVEBOx · 2", 3.0),
]
