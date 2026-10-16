"""1.2 — The two views: Session View (the clip grid), transport, Track View,
reading its screen, peeking, and Note/Session as the way home. Captions follow
MANUAL-SA §1 (The two views), §3.2–3.4 and §11.

Starts (PRE, not in the video) on Session View of the demo project, stopped,
track 2 (the NuSaw bass) active on the CLIP bank, so Track View opens on it.
"""
from director import card, caption, tap, hold, press, release, turn, wait

TITLE = "The two views"
NUMBER = "1.2"
BPM = 110

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
STEP = lambda i: "n%d" % (15 + i)


def PRE(bus):
    """Track 2 on the CLIP bank, then back to Session View, stopped."""
    def tap_(pkt_down, pkt_up, frames=20):
        bus.inject_midi(pkt_down); bus.wait_frame(frames); bus.inject_midi(pkt_up); bus.wait_frame(60)
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    note = lambda n, on: bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0])
    bus.set_param("transport", "stop"); bus.wait_frame(30)
    tap_(cc(50, 127), cc(50, 0))                         # Session View -> Track View
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 2 (track 2), CLIP
    tap_(note(17, True), note(17, False))
    tap_(note(86, True), note(86, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
    tap_(cc(50, 127), cc(50, 0))                         # back to Session View
    bus.wait_frame(200)


STEPS = [
    card("The two views", "Tutorial 1.2", 3.0),

    caption("You work in two views. This is Session View: the clip grid. Each column "
            "of pads is a track, each row a scene.", title="Session View"),
    wait(6.0),
    caption("The demo project has a beat, a bass line and two chords on tracks 1–3. "
            "Play starts and stops the sequencer.", title="Transport"),
    wait(1.5), tap(PLAY), wait(6.0),
    caption("Shift + Play restarts from the top.", title="Transport"),
    wait(1.0), press(SHIFT), wait(0.3), tap(PLAY), wait(0.3), release(SHIFT), wait(3.5),
    caption("Play again stops.", title="Transport"),
    wait(0.5), tap(PLAY), wait(2.0),

    caption("Note/Session switches to Track View, where you build one track's clip.",
            title="Track View"),
    wait(1.5), tap(NOTE_SESSION), wait(3.5),
    caption("The header names the bank the knobs are on, CLIP, and at the right what "
            "the track plays, as a short name.", title="Reading the screen"),
    wait(5.5),
    caption("Under it: the key and scale, and the track's input velocity.", title="Reading the screen"),
    wait(4.0),
    caption("The numbers are the eight tracks. A box marks the one you're on; the letter "
            "under each is the clip it's on.", title="Reading the screen"),
    wait(5.5),
    caption("The footer says what the controls do here.", title="Reading the screen"),
    wait(3.5),

    caption("Hold Note/Session to peek at the other view; let go to come back.", title="Switching"),
    wait(1.0), press(NOTE_SESSION), wait(2.5), release(NOTE_SESSION), wait(2.0),
    caption("However deep you are, in a menu or an editor, Note/Session takes you "
            "straight to Session View.", title="Switching"),
    wait(1.0), press(SHIFT), wait(0.4), tap(STEP(2), 150), wait(0.3), release(SHIFT), wait(2.0),
    tap(NOTE_SESSION), wait(3.0),

    card("Next: getting around", "Tutorial 1.3", 3.0),
]
