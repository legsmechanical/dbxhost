"""1.5 — Tempo, key and scale; saving and leaving. Project Settings (Shift +
Step 2): BPM, Key (with Transpose clips), Scale; saving as you go; Shift +
Back and its confirm. Captions follow MANUAL-SA §2 (Set tempo, key, and
scale), §3.9 and §17.2.

Starts (PRE, not in the video) on Track View, track 2 (the NuSaw bass), CLIP
bank, stopped. Rows from BPM: Key is 7 down, Scale 8.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point

TITLE = "Tempo, key and scale"
NUMBER = "1.5"
BPM = 110

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
STEP = lambda i: "n%d" % (15 + i)


def PRE(bus):
    """Track View, track 2, CLIP bank, stopped."""
    def tap_(pkt_down, pkt_up, frames=20):
        bus.inject_midi(pkt_down); bus.wait_frame(frames); bus.inject_midi(pkt_up); bus.wait_frame(60)
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    note = lambda n, on: bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0])
    bus.set_param("transport", "stop"); bus.wait_frame(30)
    tap_(cc(50, 127), cc(50, 0))                         # Session View -> Track View
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 2 (track 2), CLIP
    tap_(note(17, True), note(17, False))
    tap_(note(86, True), note(86, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(200)
    # Open and close Project Settings once. On a fresh session the first jog
    # click in it is lost (the press opens the bank map instead), and the jog
    # then scrolls rows the take never meant to touch; one visit beforehand
    # avoids it.
    bus.inject_midi(cc(49, 127)); bus.wait_frame(30)
    tap_(note(17, True), note(17, False))
    bus.inject_midi(cc(49, 0)); bus.wait_frame(300)
    tap_(cc(51, 127), cc(51, 0)); bus.wait_frame(200)


ROW1 = "oled:0,10,128,12"                          # the selected row, at the top
DIALOG_BTNS = "oled:0,44,128,20"


STEPS = [
    card("Tempo, key and scale", "Tutorial 1.5", 3.0),

    caption("Tempo, key and scale live in Project Settings. Start the music so you can "
            "hear each change.", title="Project Settings"),
    wait(2.0), point(PLAY, secs=1.2), tap(PLAY), wait(2.5),
    caption("Shift + Step 2 opens Project Settings. BPM is the top row.", title="Project Settings"),
    wait(1.5), point(SHIFT, STEP(2), secs=1.8),
    press(SHIFT), wait(0.3), tap(STEP(2), 150), wait(0.3), release(SHIFT), wait(1.0), point(ROW1, secs=2.0),
    caption("Click it, turn the jog to change it, and click again to set it.", title="Tempo"),
    wait(2.0), point(JOG, secs=1.4), tap(JOG, 100, check=True), wait(1.0), turn(JOG_TURN, 10, ms=150), wait(1.0),
    tap(JOG, 100, check=True), wait(3.5),

    caption("Key and Scale set the notes the pads play: melodic tracks snap to them.",
            title="Key and scale"),
    wait(2.0), turn(JOG_TURN, 7, ms=300), wait(1.0), point("oled:0,26,128,24", secs=2.0),
    caption("Click Key and pick one from the list.", title="Key and scale"),
    wait(1.0), tap(JOG, 100, check=True), wait(1.2), turn(JOG_TURN, 2, ms=400), wait(1.0), tap(JOG, 100, check=True), wait(1.5),
    caption("It offers to move the notes you've already written with it. Yes, and "
            "everything plays in D.", title="Key and scale"),
    wait(2.0), point(DIALOG_BTNS, secs=2.0), tap(JOG, 100, check=True), wait(5.0),
    caption("Scale, just below, works the same way: Major, Minor, Dorian and more.",
            title="Key and scale"),
    wait(1.0), turn(JOG_TURN, 1, ms=400), wait(0.5), point("oled:0,26,128,10", secs=3.0), wait(1.5),
    caption("A new project starts in a random key and scale, so set them before you "
            "write a melody.", title="Key and scale"),
    wait(4.5), tap(PLAY), wait(1.0), tap(BACK), wait(1.5),

    caption("There's no save button: dAVEBOx saves as you go, when you stop, a moment "
            "after an edit, and when you switch projects.", title="Saving"),
    wait(6.0),
    caption("Shift + Back saves and leaves, from anywhere. It asks first, on No; Back "
            "keeps you here.", title="Leaving"),
    wait(2.5), point(SHIFT, BACK, secs=1.8), press(SHIFT), wait(0.3), tap(BACK), wait(0.3), release(SHIFT),
    wait(1.0), point(DIALOG_BTNS, secs=2.0), point(BACK, secs=1.2), tap(BACK), wait(2.5),

    card("Next: your first clip", "Tutorial 2.1", 3.0),
]
