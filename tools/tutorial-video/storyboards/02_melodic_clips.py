"""2 — Melodic clips: playing the pads in key, the octave, placing notes (pad
then step, step then pad), chords on a step, clearing, editing a held step
(Note, Length, Velocity), stretching a note, the loop and pages, Undo.
Captions follow MANUAL-SA §6.1–6.3, §6.6, §6.7.

Starts (PRE, not in the video) on Track View, track 4 (a NuSaw lead, one saw,
short release), CLIP bank, stopped, its clip A cleared, and the piano (track 3)
muted so the lead is heard over the beat and the bass. The pads start one
octave up (C3, set in PRE) and go up one more on screen, so the melody sits at
C4–F5: audible on small speakers.
"""
from director import card, caption, tap, hold, press, release, turn, wait

TITLE = "Melodic clips"
NUMBER = 2
BPM = 110

SHIFT, PLAY, BACK, NOTE_SESSION, JOG, JOG_TURN = "c49", "c85", "c51", "c50", "c3", "c14"
PLUS, MINUS, LEFT, RIGHT, LOOP, UNDO, DELETE, MUTE = "c55", "c54", "c62", "c63", "c58", "c56", "c119", "c88"
CLIP_A = "c43"
STEP = lambda i: "n%d" % (15 + i)            # Step 1..16 -> notes 16..31
KNOB_TOUCH, KNOB_TURN = (lambda i: "n%d" % (i - 1)), (lambda i: "c%d" % (70 + i))

# Scale layout, C minor, two octaves up: bottom row C4 D4 Eb4 F4 G4 Ab4 Bb4 C5,
# the row above starts on F4 (three scale notes up) and ends on F5.
C4, D4, EB4, F4, G4, AB4, BB4, C5 = ("n%d" % n for n in range(68, 76))
D5, EB5 = "n81", "n82"


def PRE(bus):
    """Track View, track 4, CLIP bank, stopped, clip A empty, only track 3 muted."""
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
    tap_(cc(88, 127), cc(88, 0))                         # Mute it
    bus.inject_midi(cc(3, 127)); bus.wait_frame(60)      # bank map: Step 4, track 4, CLIP
    tap_(note(19, True), note(19, False))
    tap_(note(86, True), note(86, False))
    bus.inject_midi(cc(3, 0)); bus.wait_frame(100)
    bus.inject_midi(cc(119, 127)); bus.wait_frame(20)    # Delete + clip A's side button: clear it
    tap_(cc(43, 127), cc(43, 0))
    bus.inject_midi(cc(119, 0)); bus.wait_frame(60)
    tap_(cc(55, 127), cc(55, 0))                         # + once: the pads start at C3
    bus.wait_frame(240)


STEPS = [
    card("Melodic clips", "Tutorial 2", 3.0),

    caption("Track 4 has a synth lead and an empty clip. The pads play notes in the "
            "project's key and scale, here C minor.", title="Playing the pads"),
    wait(1.5), tap(C4, 250), wait(0.15), tap(EB4, 250), wait(0.15), tap(G4, 250), wait(0.15),
    tap(BB4, 250), wait(0.15), tap(C5, 500), wait(2.0),
    caption("+ and − shift the pads by an octave.", title="Playing the pads"),
    wait(1.0), tap(PLUS), wait(0.8),
    tap(C4, 250), wait(0.15), tap(EB4, 250), wait(0.15), tap(G4, 250), wait(0.15),
    tap(BB4, 250), wait(0.15), tap(C5, 500), wait(1.5),
    caption("Hold a pad and the screen names the note.", title="Playing the pads"),
    wait(0.8), hold(G4, 2200), wait(1.5),

    caption("Tap an empty step and it gets the last note you played.", title="Placing notes"),
    wait(1.0), tap(C5, 300), wait(0.8), tap(STEP(1), 150), wait(0.8), tap(STEP(7), 150), wait(2.0),
    caption("Or hold a step and tap a pad: that note goes on that step.", title="Placing notes"),
    wait(1.0),
    press(STEP(3)), wait(0.5), tap(G4, 200), wait(0.3), release(STEP(3)), wait(0.6),
    press(STEP(5)), wait(0.5), tap(BB4, 200), wait(0.3), release(STEP(5)), wait(0.6),
    press(STEP(9)), wait(0.5), tap(EB5, 200), wait(0.3), release(STEP(9)), wait(0.6),
    press(STEP(11)), wait(0.5), tap(D5, 200), wait(0.3), release(STEP(11)), wait(0.6),
    press(STEP(15)), wait(0.5), tap(G4, 200), wait(0.3), release(STEP(15)), wait(1.0),
    caption("Press Play to hear it. The lit steps are the ones with notes.", title="Placing notes"),
    wait(0.8), tap(PLAY), wait(5.0),

    caption("Tap a step with a note to clear it.", title="Placing notes"),
    wait(1.0), tap(STEP(7), 150), wait(3.5),
    caption("A step holds up to eight notes. Hold several pads, then press a step: "
            "a chord.", title="Chords"),
    wait(1.0), press(EB4), press(G4), press(BB4), wait(0.6), tap(STEP(13), 150), wait(0.4),
    release(BB4), release(G4), release(EB4), wait(4.5),

    caption("Hold a step with notes and turn the jog right: the knobs now edit that "
            "step.", title="Editing a step"),
    wait(1.0), press(STEP(9)), wait(1.2), turn(JOG_TURN, 1, ms=300), wait(2.5),
    caption("Knob 1 moves the note up the scale…", title="Editing a step"),
    press(KNOB_TOUCH(1)), wait(0.6), turn(KNOB_TURN(1), 16, ms=14), wait(1.6),
    turn(KNOB_TURN(1), 16, ms=14), wait(2.0), release(KNOB_TOUCH(1)), wait(0.6),
    caption("…knob 3 sets its length, knob 4 its velocity.", title="Editing a step"),
    press(KNOB_TOUCH(3)), wait(0.5), turn(KNOB_TURN(3), 8, ms=14), wait(2.0), release(KNOB_TOUCH(3)),
    wait(0.5), press(KNOB_TOUCH(4)), wait(0.5), turn(KNOB_TURN(4), -24, ms=14), wait(2.0),
    release(KNOB_TOUCH(4)), wait(0.5),
    caption("Let go of the step and you're back.", title="Editing a step"),
    release(STEP(9)), wait(3.5),

    caption("Stretch a note: hold its step, wait for the card, then tap a later step.",
            title="Editing a step"),
    wait(1.0), press(STEP(1)), wait(1.4), tap(STEP(2), 150), wait(1.5), release(STEP(1)), wait(3.0),

    caption("The clip is one page of 16 steps. Hold Loop to see its length.", title="Length and pages"),
    wait(1.0), press(LOOP), wait(2.0),
    caption("While Loop is held, the steps are pages. Tap Step 2: two pages.", title="Length and pages"),
    wait(1.0), tap(STEP(2), 150), wait(2.0), release(LOOP), wait(1.0),
    caption("Right and Left move between pages. Page 2 is empty: give it an answer.",
            title="Length and pages"),
    wait(1.0), tap(RIGHT), wait(1.2),
    tap(EB5, 300), wait(0.5), tap(STEP(1), 150), wait(0.4),
    tap(D5, 300), wait(0.5), tap(STEP(4), 150), wait(0.4),
    tap(BB4, 300), wait(0.5), tap(STEP(7), 150), wait(0.4),
    tap(C5, 300), wait(0.5), tap(STEP(9), 150), wait(5.0),
    tap(LEFT), wait(2.0),

    caption("Undo takes back the last edit; Shift + Undo brings it back.", title="Undo"),
    wait(1.0), tap(STEP(5), 150), wait(2.5), tap(UNDO), wait(2.5),
    press(SHIFT), wait(0.3), tap(UNDO), wait(0.3), release(SHIFT), wait(2.5), tap(UNDO), wait(3.0),
    caption("Play again stops it.", title="Undo"),
    wait(1.0), tap(PLAY), wait(2.0),

    card("Next: drum clips", "Tutorial 3", 3.0),
]
