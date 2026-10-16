"""1.4 — Choosing a sound: TRACK CONFIG, Shift + click Instmt/Dest, the
instrument list, loading Mini-JV on an empty track, playing it, its editor and
its presets, Back out, and INST on the bank map. Captions follow MANUAL-SA
§3.8, §14.1, §14.3 and §14.4.

Starts (PRE, not in the video) on Track View, track 5 (an empty Schwung
track: no instrument), CLIP bank, stopped, pads one octave up (C3).
"""
from director import card, caption, tap, hold, press, release, turn, wait, point

TITLE = "Choosing a sound"
NUMBER = "1.4"
BPM = 110

SHIFT, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c51", "c50", "c3", "c14"
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))
PAD_CONFIG, PAD_INST = "n68", "n70"
MINIJV_DETENTS = 27                      # from the list's first generator (6W6) to Mini-JV
# Scale layout, C minor, from C3: bottom row C3 D3 Eb3 F3 G3 Ab3 Bb3 C4.
C3, D3, EB3, F3, G3, AB3, BB3, C4 = ("n%d" % n for n in range(68, 76))


def phrase():
    return [tap(C3, 220), wait(0.08), tap(EB3, 220), wait(0.08), tap(G3, 220), wait(0.08),
            tap(BB3, 220), wait(0.08), tap(C4, 500)]


def PRE(bus):
    """Track View, track 5, CLIP bank, stopped, pads at C3."""
    def tap_(pkt_down, pkt_up, frames=20):
        bus.inject_midi(pkt_down); bus.wait_frame(frames); bus.inject_midi(pkt_up); bus.wait_frame(60)
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    note = lambda n, on: bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0])
    bus.set_param("transport", "stop"); bus.wait_frame(30)
    tap_(cc(50, 127), cc(50, 0))                         # Session View -> Track View
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 5 (track 5), CLIP
    tap_(note(20, True), note(20, False))
    tap_(note(86, True), note(86, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
    tap_(cc(55, 127), cc(55, 0))                         # + once: the pads start at C3
    bus.wait_frame(400)                                  # the "No instrument" card has gone


HDR_INST, ROW1 = "oled:98,0,30,9", "oled:0,15,128,9"
PADS_ROW = tuple("n%d" % n for n in range(68, 76))


STEPS = [
    card("Choosing a sound", "Tutorial 1.4", 3.0),

    caption("Track 5 is empty: its header reads [--], and the pads play nothing yet.",
            title="An empty track"),
    wait(1.5), point(HDR_INST, secs=2.0), point(*PADS_ROW, secs=1.4), *phrase(), wait(2.5),
    caption("A track's sound is set in its own menu, TRACK CONFIG. Hold the jog and tap "
            "CONFIG, bottom-left of the map.", title="TRACK CONFIG"),
    wait(2.5), point(JOG, secs=1.4), press(JOG), wait(1.0), point(PAD_CONFIG, secs=1.6),
    tap(PAD_CONFIG, 150), wait(0.6), release(JOG), wait(2.0),
    caption("It opens on Instmt/Dest: what the track plays. Shift + click it to choose.",
            title="Choosing an instrument"),
    wait(1.0), point(ROW1, secs=2.0), point(SHIFT, JOG, secs=1.8),
    press(SHIFT), wait(0.3), tap(JOG, 120), wait(0.3), release(SHIFT), wait(2.5),
    caption("One list: Move's four instruments, every Schwung instrument by name, then "
            "MIDI channels. Turn the jog to Mini-JV…", title="Choosing an instrument"),
    wait(3.0), point(JOG_TURN, secs=1.4), turn(JOG_TURN, MINIJV_DETENTS, ms=90), wait(2.0),
    caption("…and click to load it. Now the pads play it.", title="Choosing an instrument"),
    wait(1.0), point(JOG, secs=1.2), tap(JOG, 120), wait(2.0), point(*PADS_ROW, secs=1.4), *phrase(), wait(2.5),

    caption("Click Instmt/Dest to open the instrument's editor. The knobs edit what's on "
            "screen; the jog turns the pages.", title="Editing the sound"),
    wait(2.5), point(JOG, secs=1.4), tap(JOG, 120), wait(2.0),
    point(JOG_TURN, secs=1.2), turn(JOG_TURN, 1, ms=400), wait(2.0),
    turn(JOG_TURN, 1, ms=400), wait(2.0), turn(JOG_TURN, -2, ms=300), wait(1.5),
    caption("Click for its menu of sections. Presets lists its sounds: turn the jog to "
            "try them.", title="Presets"),
    wait(2.5), point(JOG, secs=1.4), tap(JOG, 120), wait(1.5), turn(JOG_TURN, -1, ms=400), wait(1.0),
    tap(JOG, 120), wait(1.5),
    turn(JOG_TURN, 1, ms=400), wait(0.6), *phrase(), wait(1.0),
    turn(JOG_TURN, 1, ms=400), wait(0.6), *phrase(), wait(1.0),
    turn(JOG_TURN, 1, ms=400), wait(0.6), *phrase(), wait(1.5),

    caption("Back steps out a level at a time: the editor, TRACK CONFIG, the overview.",
            title="Back out"),
    wait(2.0), point(BACK, secs=1.4), tap(BACK), wait(1.5), tap(BACK), wait(1.5), tap(BACK), wait(2.5),
    caption("Next time, INST on the bank map goes straight to the instrument.", title="Back out"),
    wait(1.5), point(JOG, secs=1.2), press(JOG), wait(1.0), point(PAD_INST, secs=1.6),
    tap(PAD_INST, 150), wait(0.6), release(JOG), wait(2.5),
    hold(BACK, 800), wait(2.0),
    caption("On tracks 1–4 of a new project, the instrument is Move's own: INST opens "
            "Move's editor, and Back brings you home.", title="Move's instruments"),
    wait(6.0),

    card("Next: tempo, key and scale", "Tutorial 1.5", 3.0),
]
