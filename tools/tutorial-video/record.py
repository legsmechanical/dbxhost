"""record.py — record the web mirror's stream (screen, surface, sound) to a take dir.

The display-server stream (`/stream-auto?v=2&audio=1`, the one the mirror page
reads) carries everything a tutorial video needs from the Move:

  - unnamed events: the OLED, `{format, encoding, width, height, data}`, sent
    only when the screen changes (the renderer holds the last one);
  - `surface`: the control surface struct (`surface_live_shm_t`, see
    src/host/surface_live_shm.h and schwung-manager/static/mirror.html): every
    LED as the hardware was last told, and every control as physically held
    (a press injected by the test harness does NOT show there, so gesture
    highlights come from the director's own log);
  - `pcm`: the full mix at unity, `{pos, n, rate, d}` (int16, base64), every
    block, with `pos` the device's own frame index (stereo frames, int16 L R).

Everything is stamped with ONE clock, `time.monotonic()` at arrival, which is
also the clock the director logs its gestures and captions with. Sound is
placed by its `pos` (gap-free), anchored to the arrival time of its first
block.

Take dir:  screen.jsonl  [t, b64]          surface.jsonl  [t, b64]
           audio.raw     int16 stereo (L R) 44.1k   audio.json     {rate, t0, pos0, n, gaps}
           audio_blocks.jsonl  [t, pos, n] per block: the renderer fits the sound's
                               clock to arrival times from these
"""
import base64
import json
import os
import threading
import time
import urllib.request

STREAM = "http://{host}:7700/stream-auto?v=2&audio=1"


class Recorder:
    def __init__(self, take_dir, host="move.local"):
        self.dir = take_dir
        self.url = STREAM.format(host=host)
        self._stop = threading.Event()
        self._th = None
        self.error = None
        os.makedirs(take_dir, exist_ok=True)

    def start(self):
        self._th = threading.Thread(target=self._run, daemon=True)
        self._th.start()
        # wait for the first sound block: the take has a clock from then on
        t_end = time.monotonic() + 10
        while time.monotonic() < t_end and not os.path.exists(os.path.join(self.dir, ".audio_live")):
            if self.error:
                raise RuntimeError("recorder: " + str(self.error))
            time.sleep(0.05)
        if not os.path.exists(os.path.join(self.dir, ".audio_live")):
            raise RuntimeError("recorder: no sound from the stream within 10 s (Mirror Display off?)")
        return self

    def stop(self):
        self._stop.set()
        if self._th:
            self._th.join(timeout=5)
        if self.error:
            raise RuntimeError("recorder: " + str(self.error))

    def _run(self):
        try:
            self._record()
        except Exception as e:      # surfaced by start()/stop()
            self.error = e

    def _record(self):
        sf = open(os.path.join(self.dir, "screen.jsonl"), "w")
        uf = open(os.path.join(self.dir, "surface.jsonl"), "w")
        af = open(os.path.join(self.dir, "audio.raw"), "wb")
        bf = open(os.path.join(self.dir, "audio_blocks.jsonl"), "w")   # [t, pos, n]: the clock fit
        meta = {"rate": 44100, "channels": 2, "t0": None, "pos0": None, "n": 0, "gaps": 0, "gap_samples": 0}
        nxt = None
        r = urllib.request.urlopen(self.url, timeout=10)
        ev, data = None, []
        try:
            while not self._stop.is_set():
                line = r.readline()
                if not line:
                    raise RuntimeError("the stream closed")
                line = line.decode("utf-8", "replace").rstrip("\n").rstrip("\r")
                if line.startswith("event:"):
                    ev = line[6:].strip()
                    continue
                if line.startswith("data:"):
                    data.append(line[5:].lstrip())
                    continue
                if line != "" or not data:
                    continue
                t = time.monotonic()
                payload = "\n".join(data)
                ev_name, ev, data = ev, None, []
                if ev_name is None:
                    try:
                        p = json.loads(payload)
                    except ValueError:
                        continue
                    if p.get("format") == "mono1_packed":
                        sf.write(json.dumps([t, p["data"]]) + "\n")
                elif ev_name == "surface":
                    try:
                        p = json.loads(payload)
                    except ValueError:
                        continue
                    uf.write(json.dumps([t, p.get("data", "")]) + "\n")
                elif ev_name == "pcm":
                    p = json.loads(payload)
                    pos, n = int(p["pos"]), int(p["n"])
                    pcm = base64.b64decode(p["d"])
                    bf.write(json.dumps([t, pos, n]) + "\n")
                    if meta["t0"] is None:
                        meta["t0"], meta["pos0"], meta["rate"] = t, pos, int(p.get("rate", 44100))
                        nxt = pos
                        open(os.path.join(self.dir, ".audio_live"), "w").close()
                    if pos > nxt:                       # a gap: silence, so time stays true
                        meta["gaps"] += 1
                        meta["gap_samples"] += pos - nxt
                        af.write(b"\0\0\0\0" * (pos - nxt))
                        nxt = pos
                    if pos < nxt:                       # overlap: keep only what is new
                        skip = nxt - pos
                        if skip >= n:
                            continue
                        pcm = pcm[skip * 4:]
                        n -= skip
                    af.write(pcm)
                    nxt += n
                    meta["n"] = nxt - meta["pos0"]
        finally:
            sf.close(); uf.close(); af.close(); bf.close()
            with open(os.path.join(self.dir, "audio.json"), "w") as f:
                json.dump(meta, f)
            r.close()
