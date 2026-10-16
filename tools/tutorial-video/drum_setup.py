"""drum_setup.py — the starting point the drum tutorials (chapter 3) share.

Track View, track 1 (DR32 with Move's stock 707 kit), DRUM LANE bank,
stopped, only the piano (track 3) muted. PRE empties clip A; PRE_WITH_BEAT
keeps the demo project's beat (kick 1 5 9 13, snare 5 13, hat on the
off-beats).

The left 4x4 pads are lanes 1-16 of bank A, from the bottom-left: n68 kick
(C1 36), n70 snare (D1 38), n71 clap (D#1 39), n78 closed hat (F#1 42).
The right 4x4 are velocity zones, 8 (bottom-left, n72) to 127 (top-right, n99).
"""
KICK, SNARE, CLAP, HAT = "n68", "n70", "n71", "n78"
LANE_PADS = tuple("n%d" % (68 + r * 8 + c) for r in range(4) for c in range(4))
ZONE_PADS = tuple("n%d" % (72 + r * 8 + c) for r in range(4) for c in range(4))
SOFT_ZONE, HARD_ZONE = "n73", "n99"

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
PLUS, MINUS, LEFT, RIGHT, LOOP, UNDO, DELETE, MUTE, COPY = "c55", "c54", "c62", "c63", "c58", "c56", "c119", "c88", "c60"
STEP = lambda i: "n%d" % (15 + i)
ALL_STEPS = tuple("n%d" % n for n in range(16, 32))


def _setup(bus, empty):
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
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 1 (track 1)
    tap_(note(16, True), note(16, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
    if empty:
        bus.inject_midi(cc(119, 127)); bus.wait_frame(20)    # Delete + clip A's side button
        tap_(cc(43, 127), cc(43, 0))
        bus.inject_midi(cc(119, 0)); bus.wait_frame(60)
    tap_(note(68, True), note(68, False))                # select the kick lane
    bus.wait_frame(240)


def PRE(bus):
    _setup(bus, True)


def PRE_WITH_BEAT(bus):
    _setup(bus, False)
