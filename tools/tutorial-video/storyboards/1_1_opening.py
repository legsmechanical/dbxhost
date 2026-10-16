"""1.1 — Opening dAVEBOx: the project picker, selecting a project, making a new
one (Empty), what a new project holds, the picker from anywhere (Shift +
Step 1), Shift + tap to load at once. Captions follow MANUAL-SA §2 and §17.5.

Starts (no PRE) on the picker of a fresh session, nothing loaded, with the demo
project selected. Makes a project on the empty pad 5 (pad note 73) and ends
back in the demo project; POST deletes the new project.
"""
from director import card, caption, tap, hold, press, release, turn, wait, point

TITLE = "Opening dAVEBOx"
NUMBER = "1.1"
BPM = 110
LOAD_DEMO = False                               # the take starts on the picker

SHIFT, BACK, NOTE_SESSION, JOG, JOG_TURN, DELETE = "c49", "c51", "c50", "c3", "c14", "c119"
STEP = lambda i: "n%d" % (15 + i)
DEMO_PAD, NEW_PAD = "n71", "n73"               # projects.json index 3, and the free index 5
OTHER_PAD = "n72"                               # index 4, a neighbour: only selected, never opened


def POST(bus):
    """Delete the project the take made: picker, Delete + its pad twice."""
    cc = lambda n, v: bytes([0x0B, 0xB0, n, v])
    note = lambda n, on: bytes([0x09, 0x90, n, 100]) if on else bytes([0x08, 0x80, n, 0])
    bus.inject_midi(cc(49, 127)); bus.wait_frame(20)
    bus.inject_midi(note(16, True)); bus.wait_frame(20); bus.inject_midi(note(16, False)); bus.wait_frame(20)
    bus.inject_midi(cc(49, 0)); bus.wait_frame(300)
    bus.inject_midi(cc(119, 127)); bus.wait_frame(20)
    for _ in range(2):
        bus.inject_midi(note(73, True)); bus.wait_frame(20); bus.inject_midi(note(73, False)); bus.wait_frame(150)
    bus.inject_midi(cc(119, 0)); bus.wait_frame(300)
    bus.inject_midi(cc(51, 127)); bus.wait_frame(20); bus.inject_midi(cc(51, 0)); bus.wait_frame(100)


OLED_NAME, OLED_ROWS = "oled:0,8,128,12", "oled:0,20,128,30"
LIT_PADS = ("n68", "n69", "n70", "n71", "n72")          # the bottom row's first five: all projects (68 + index)


STEPS = [
    card("Opening dAVEBOx", "Tutorial 1.1", 3.0),

    caption("Open Schwung's Tools menu (Shift + Step 13) and choose dAVEBOx SA. "
            "A few seconds later you're on the project picker.", title="The project picker"),
    wait(2.5), point("c49", STEP(13), secs=2.5), wait(3.0),
    caption("Each lit pad is a project. dAVEBOx keeps its own projects, separate from "
            "your Move sets.", title="The project picker"),
    wait(2.0), point(*LIT_PADS, secs=2.5), wait(2.0),
    caption("Tap a project to select it. The screen shows its name, and Load opens it.",
            title="The project picker"),
    wait(2.0), point(OTHER_PAD, secs=1.6), tap(OTHER_PAD, 150), wait(2.0),
    point(DEMO_PAD, secs=1.2), tap(DEMO_PAD, 150), wait(1.0), point(OLED_NAME, OLED_ROWS, secs=2.5), wait(1.0),

    caption("Tap an empty pad for a new project.", title="A new project"),
    wait(1.5), point(NEW_PAD, secs=1.6), tap(NEW_PAD, 150), wait(2.5),
    caption("Once you've saved a template it asks which to start from. Turn the jog to "
            "Empty and click.", title="A new project"),
    wait(2.5), point("c14", "oled:0,40,64,24", secs=2.0), turn(JOG_TURN, -1, ms=300), wait(1.2),
    tap(JOG, 120), wait(2.5),
    caption("It gets a name of its own (you can rename it). Click Load.", title="A new project"),
    wait(1.5), point(OLED_NAME, secs=2.0), point("oled:0,20,128,10", "c3", secs=1.8), tap(JOG, 120), wait(9.0),

    caption("A new project has eight tracks. Tracks 1–4 play Move's instruments, with "
            "a random drum kit, bass and two synths.", title="A new project"),
    wait(1.5), point("oled:0,24,64,24", secs=3.5), wait(1.0),
    caption("Tracks 5–8 are empty, ready for Schwung instruments. Its key, scale and "
            "sounds start out random.", title="A new project"),
    wait(1.5), point("oled:64,24,64,24", secs=3.5), wait(1.0),

    caption("Shift + Step 1 brings the picker back from anywhere. The open project "
            "reads CURRENT.", title="Switching projects"),
    wait(2.0), point(SHIFT, STEP(1), secs=1.8),
    press(SHIFT), wait(0.3), tap(STEP(1), 150), wait(0.3), release(SHIFT), wait(1.0),
    point("oled:86,8,42,12", secs=2.2), wait(0.5),
    caption("Shift + tap a project to open it at once.", title="Switching projects"),
    wait(1.5), point(SHIFT, DEMO_PAD, secs=1.8),
    press(SHIFT), wait(0.3), tap(DEMO_PAD, 150), wait(0.3), release(SHIFT), wait(9.0),
    caption("dAVEBOx saves as you go. Shift + Back saves and leaves, from anywhere.",
            title="Saving and leaving"),
    wait(2.0), point(SHIFT, BACK, secs=2.5), wait(1.5),

    card("Next: the two views", "Tutorial 1.2", 3.0),
]
