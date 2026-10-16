"""session_setup.py — the starting point the Session View tutorials (chapter 4)
share: two scenes to switch between, built off camera from the demo project.

Row 1 (scene 1) is the demo's own: the beat, the bass and the piano chords on
tracks 1-3, track 4 empty. Row 2 (scene 2) is row 1 copied down, with a busier
hat on track 1 and the lead's riff (from chapter 2) on track 4. The piano
(track 3) starts muted, so 4.2 can bring it in. Ends on Session View, every
track on row 1, stopped.

Session View's grid: row 1 is the top pad row (n92-n99), row 2 the next (n84-n91);
the side buttons c43 / c42 launch those rows.
"""
ROW1 = tuple("n%d" % n for n in range(92, 100))
ROW2 = tuple("n%d" % n for n in range(84, 92))
COL = lambda t: ("n%d" % (92 + t - 1), "n%d" % (84 + t - 1))   # a track's clips on rows 1 and 2
SIDE1, SIDE2 = "c43", "c42"

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
PLUS, MINUS, LOOP, UNDO, DELETE, MUTE, COPY = "c55", "c54", "c58", "c56", "c119", "c88", "c60"
STEP = lambda i: "n%d" % (15 + i)
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))
KNOBS = tuple("n%d" % i for i in range(8))

LEAD_RIFF = ((1, 75), (3, 72), (5, 74), (9, 82), (11, 81), (15, 72))   # (step, pad), pads from C3


def PRE(bus):
    def w(f): bus.wait_frame(f)
    cc = lambda n, v: bus.inject_midi(bytes([0x0B, 0xB0, n, v]))
    def note(n, on): bus.inject_midi(bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0]))
    def tap_c(n, f=20): cc(n, 127); w(f); cc(n, 0); w(60)
    def tap_n(n, f=20): note(n, True); w(f); note(n, False); w(60)
    def step_pad(step, pad):                             # hold a step, tap a pad
        note(15 + step, True); w(60); tap_n(pad, 30); note(15 + step, False); w(60)

    bus.set_param("transport", "stop"); w(30)
    tap_c(50)                                            # Session View -> Track View
    cc(119, 127); w(20); tap_c(88); cc(119, 0); w(60)    # Delete + Mute: clear every mute
    cc(3, 127); w(60); tap_n(18); cc(3, 0); w(100)       # track 3 ...
    tap_c(88)                                            # ... muted
    tap_c(50); w(120)                                    # Track View -> Session View

    cc(60, 127); w(30); tap_c(43); tap_c(42); cc(60, 0); w(120)   # Copy row 1 onto row 2

    cc(49, 127); w(20); tap_n(84); cc(49, 0); w(240)     # Shift + track 1's row-2 clip: open it
    tap_n(78); w(60)                                     # the hat lane
    for s in (2, 4, 6, 8, 10, 12, 14, 16):               # every eighth note the hat lacked
        tap_n(15 + s)
    tap_c(50); w(120)                                    # back to Session View

    cc(49, 127); w(20); tap_n(87); cc(49, 0); w(240)     # Shift + track 4's row-2 clip
    tap_c(55); w(60)                                     # + once: the lead's pads from C3
    for step, pad in LEAD_RIFF:
        step_pad(step, pad)
    tap_c(50); w(120)                                    # Session View

    # Scene 1 for every track. Launched while stopped it did not take for the
    # tracks whose row-2 clip had been opened; launched while playing it does.
    tap_c(85); w(300); tap_c(43); w(500); tap_c(85); w(300)
