"""lead_setup.py — the starting point the melodic tutorials (chapter 2) share.

Track View, track 4 (the NuSaw Lead, one saw, short release), CLIP bank,
stopped, clip A empty, only the piano (track 3) muted so the lead is heard over
the beat and the bass. The pads go up one octave from the default C2, so the
lead plays around middle C (Josh: melodic demos in a higher register than the
bass, but *"register is way too high"* at C4–F5).

Scale layout, C minor, from C3: the bottom row is C3 D3 Eb3 F3 G3 Ab3 Bb3 C4;
the row above starts three scale notes up, on F3, and ends on F4.
"""
C3, D3, EB3, F3, G3, AB3, BB3, C4 = ("n%d" % n for n in range(68, 76))
D4, EB4, F4 = "n81", "n82", "n83"
BOTTOM_ROW = tuple("n%d" % n for n in range(68, 76))

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
PLUS, MINUS, LEFT, RIGHT, LOOP, UNDO, DELETE, MUTE = "c55", "c54", "c62", "c63", "c58", "c56", "c119", "c88"
REC, CAPTURE = "c86", "c52"
STEP = lambda i: "n%d" % (15 + i)            # Step 1..16 -> notes 16..31
ALL_STEPS = tuple("n%d" % n for n in range(16, 32))
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))


def PRE(bus):
    def tap_(pkt_down, pkt_up, frames=20):
        bus.inject_midi(pkt_down); bus.wait_frame(frames); bus.inject_midi(pkt_up); bus.wait_frame(60)
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    note = lambda n, on: bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0])
    bus.set_param("transport", "stop"); bus.wait_frame(30)
    tap_(cc(50, 127), cc(50, 0))                         # Session View -> Track View
    bus.inject_midi(cc(119, 127)); bus.wait_frame(20)    # Delete + Mute: clear every mute
    tap_(cc(88, 127), cc(88, 0))
    bus.inject_midi(cc(119, 0)); bus.wait_frame(60)
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 3, track 3
    tap_(note(18, True), note(18, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
    tap_(cc(88, 127), cc(88, 0))                         # mute the piano
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 4 (track 4), CLIP
    tap_(note(19, True), note(19, False))
    tap_(note(86, True), note(86, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
    bus.inject_midi(cc(119, 127)); bus.wait_frame(20)    # Delete + clip A's side button: empty it
    tap_(cc(43, 127), cc(43, 0))
    bus.inject_midi(cc(119, 0)); bus.wait_frame(60)
    tap_(cc(55, 127), cc(55, 0))                         # + once: the pads start at C3
    bus.wait_frame(240)


def phrase(tap, wait):
    """A rising C minor phrase on the bottom row."""
    return [tap(C3, 220), wait(0.08), tap(EB3, 220), wait(0.08), tap(G3, 220), wait(0.08),
            tap(BB3, 220), wait(0.08), tap(C4, 500)]


RIFF = ((1, 75), (3, 72), (5, 74), (9, 82), (11, 81), (15, 72))   # (step, pad note): where 2.1 ends


def PRE_WITH_RIFF(bus):
    """lead_setup.PRE, then the riff from 2.1 placed off camera: hold each step
    and tap its pad (C4 G3 Bb3 Eb4 D4 G3)."""
    PRE(bus)
    for step, pad in RIFF:
        bus.inject_midi(bytes([0x09, 0x90, 15 + step, 100])); bus.wait_frame(60)
        bus.inject_midi(bytes([0x09, 0x90, pad, 100])); bus.wait_frame(30)
        bus.inject_midi(bytes([0x08, 0x80, pad, 0])); bus.wait_frame(30)
        bus.inject_midi(bytes([0x08, 0x80, 15 + step, 0])); bus.wait_frame(60)
    bus.wait_frame(240)
