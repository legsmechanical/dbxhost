"""director.py — perform a storyboard on the Move while recording the mirror stream.

A storyboard is a list of steps (storyboards/NN_*.py exports STEPS and TITLE).
The director performs each one through the test bus and logs it to
events.jsonl on time.monotonic() — the recorder's clock — so the renderer can
put captions, cards and gesture highlights exactly where they happened:

  {"t": ..., "kind": "card", "title": ..., "sub": ..., "secs": ...}
  {"t": ..., "kind": "caption", "title": ..., "text": ...}
  {"t": ..., "kind": "down"|"up", "key": "n84"|"c50"|...}      # a control held
  {"t": ..., "kind": "turn", "key": "c14"|"c71".., "dir": 1|-1}
  {"t": ..., "kind": "begin"|"end"}

Steps (plain dicts; helpers below):
  card(title, sub=None, secs=3)      the device is left alone while it shows
  caption(text, title=None)          shown until the next caption / card
  tap(key, ms=80)                    press + release ('n<note>' or 'c<cc>')
  hold(key, ms)                      the same, held longer
  press(key) / release(key)          for chords (Shift + ...)
  turn(key, detents, ms=120)         jog 'c14' or a knob 'c71'..'c78'; sign = way
  wait(secs)
Every press is a real inject (`inject_midi`), which the mirror's own press layer
cannot see (it reads the raw hardware input) — hence the log.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "pytest-schwung", "src"))
sys.path.insert(0, HERE)
from schwung_bus.client import SchwungBus      # noqa: E402
from record import Recorder                    # noqa: E402

FRAME_S = 128 / 44100


def card(title, sub=None, secs=3.0): return {"op": "card", "title": title, "sub": sub, "secs": secs}
def caption(text, title=None):        return {"op": "caption", "text": text, "title": title}
def tap(key, ms=80):                  return {"op": "tap", "key": key, "ms": ms}
def hold(key, ms):                    return {"op": "tap", "key": key, "ms": ms}
def press(key):                       return {"op": "press", "key": key}
def release(key):                     return {"op": "release", "key": key}
def turn(key, detents, ms=120):       return {"op": "turn", "key": key, "n": detents, "ms": ms}
def wait(secs):                       return {"op": "wait", "secs": secs}


def _packet(key, down):
    kind, num = key[0], int(key[1:])
    if kind == "c":
        return bytes([0x0B, 0xB0, num, 127 if down else 0])
    return bytes([0x09, 0x90, num, 100]) if down else bytes([0x08, 0x80, num, 0])


class Director:
    def __init__(self, bus, log_path):
        self.bus = bus
        self.log = open(log_path, "w")
        self.held = []

    def emit(self, kind, **kw):
        rec = {"t": time.monotonic(), "kind": kind}
        rec.update(kw)
        self.log.write(json.dumps(rec) + "\n")
        self.log.flush()

    def sleep(self, secs):
        frames = max(1, int(secs / FRAME_S))
        while frames > 0:
            n = min(frames, 2000)
            self.bus.wait_frame(n)
            frames -= n

    def down(self, key):
        where = self.bus.inject_midi(_packet(key, True))
        if where not in (None, "surface"):
            raise RuntimeError("inject went to %r, not the surface (is dAVEBOx in front?)" % where)
        self.emit("down", key=key)
        self.held.append(key)

    def up(self, key):
        self.bus.inject_midi(_packet(key, False))
        self.emit("up", key=key)
        if key in self.held:
            self.held.remove(key)

    def run(self, steps):
        self.emit("begin")
        try:
            for st in steps:
                op = st["op"]
                if op == "card":
                    self.emit("card", title=st["title"], sub=st.get("sub"), secs=st["secs"])
                    self.sleep(st["secs"])
                elif op == "caption":
                    self.emit("caption", text=st["text"], title=st.get("title"))
                elif op == "tap":
                    self.down(st["key"]); self.sleep(st["ms"] / 1000.0); self.up(st["key"])
                elif op == "press":
                    self.down(st["key"])
                elif op == "release":
                    self.up(st["key"])
                elif op == "turn":
                    n, way = abs(st["n"]), (1 if st["n"] > 0 else -1)
                    num = int(st["key"][1:])
                    for _ in range(n):
                        self.bus.inject_midi(bytes([0x0B, 0xB0, num, 1 if way > 0 else 127]))
                        self.emit("turn", key=st["key"], dir=way)
                        self.sleep(st["ms"] / 1000.0)
                elif op == "wait":
                    self.sleep(st["secs"])
                else:
                    raise ValueError("unknown step " + op)
        finally:
            for key in list(reversed(self.held)):   # never leave a control held
                try:
                    self.up(key)
                except Exception:
                    pass
            self.emit("end")
            self.log.close()


def load_storyboard(path):
    spec = importlib.util.spec_from_file_location("storyboard", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def record_take(storyboard_path, take_dir, host="move.local", pre=None):
    """Record one take: the stream, while the storyboard is performed.
    `pre(bus)` runs before recording starts (put the device where the video
    begins) and the storyboard's POST(bus) after it stops (undo what the take
    made); neither is in the video."""
    sb = load_storyboard(storyboard_path)
    os.makedirs(take_dir, exist_ok=True)
    with SchwungBus() as bus:
        bus.set_display_mirror(True)
        bus.wait_frame(10)
        if getattr(sb, "PRE", None):
            sb.PRE(bus)
        if pre:
            pre(bus)
        rec = Recorder(take_dir, host=host).start()
        try:
            time.sleep(0.5)                         # a little lead-in on the stream
            Director(bus, os.path.join(take_dir, "events.jsonl")).run(sb.STEPS)
            time.sleep(0.5)
        finally:
            rec.stop()
        if getattr(sb, "POST", None):                 # tidy up after the take; not in the video
            sb.POST(bus)
    with open(os.path.join(take_dir, "take.json"), "w") as f:
        json.dump({"storyboard": os.path.basename(storyboard_path), "title": getattr(sb, "TITLE", ""),
                   "number": getattr(sb, "NUMBER", ""), "bpm": getattr(sb, "BPM", 120)}, f)
    return take_dir


if __name__ == "__main__":
    record_take(sys.argv[1], sys.argv[2])
