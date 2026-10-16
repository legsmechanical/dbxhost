"""render.py — turn a take (record.py + director.py) into a 1080p30 mp4.

Layout (1920 x 1080): the OLED at 7x top-left, the caption panel top-right,
the Move's control surface (device_draw.py) across the bottom. Title cards
take the whole frame. Gesture highlights come from the director's log: a
fingertip and a ring on every control while it is held, fading for half a
second after; a curved arrow on the jog or a knob as it turns.

Timing: one host clock (time.monotonic) for everything. The screen and the
surface are placed by their arrival; the sound by its own sample clock,
anchored with the earliest block arrival (the least-delayed one), so it sits
with the picture the way the stream delivered both.

  python3 render.py <take_dir> <out.mp4>
"""
import base64
import bisect
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import device_draw as dd      # noqa: E402

W, H, FPS = 1920, 1080, 30
BG = (11, 11, 13)
OLED_SCALE = 7
OLED_XY = (40, 34)
DEV_SCALE = 1.45
FADE_S = 0.5
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT, size, index=1 if bold else 0)
    except Exception:
        return ImageFont.load_default()


F_TITLE, F_BODY, F_CARD, F_CARD_SUB, F_MARK = font(46, True), font(38), font(84, True), font(44), font(40, True)


def wrap(draw, text, fnt, width):
    lines = []
    for para in text.split("\n"):
        words, cur = para.split(), ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=fnt) <= width:
                cur = t
            else:
                if cur:
                    lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def load_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


class Take:
    def __init__(self, d):
        self.d = d
        self.screens = load_jsonl(os.path.join(d, "screen.jsonl"))        # [t, b64]
        self.surfaces = load_jsonl(os.path.join(d, "surface.jsonl"))      # [t, b64]
        self.events = load_jsonl(os.path.join(d, "events.jsonl"))
        self.audio = json.load(open(os.path.join(d, "audio.json")))
        blocks = load_jsonl(os.path.join(d, "audio_blocks.jsonl"))
        rate, pos0 = self.audio["rate"], self.audio["pos0"]
        # the sound's start on the host clock: the least-delayed block's arrival
        self.audio_t0 = min(t - (pos - pos0) / rate for t, pos, n in blocks) if blocks else self.audio["t0"]
        meta_p = os.path.join(d, "take.json")
        self.meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
        self.screen_t = [s[0] for s in self.screens]
        self.surface_t = [s[0] for s in self.surfaces]
        self._oled_cache = {}
        self._surf_cache = {}
        begin = [e["t"] for e in self.events if e["kind"] == "begin"]
        end = [e["t"] for e in self.events if e["kind"] == "end"]
        self.t_begin = begin[0] if begin else self.audio_t0
        self.t_end = (end[-1] if end else self.t_begin) + 0.6
        cards = [e for e in self.events if e["kind"] == "card"]
        if cards:                       # a closing card is the last thing seen: end on it
            self.t_end = max(self.t_end, cards[-1]["t"] + cards[-1]["secs"])
            if not [e for e in self.events if e["t"] > cards[-1]["t"] and e["kind"] in ("caption", "down", "turn")]:
                self.t_end = cards[-1]["t"] + cards[-1]["secs"]

    def oled_at(self, t):
        i = bisect.bisect_right(self.screen_t, t) - 1
        if i < 0:
            i = 0 if self.screens else -1
        if i < 0:
            return None, -1
        if i not in self._oled_cache:
            self._oled_cache = {i: dd.oled_image(self.screens[i][1])}
        return self._oled_cache[i], i

    def surface_at(self, t):
        i = bisect.bisect_right(self.surface_t, t) - 1
        if i < 0:
            i = 0 if self.surfaces else -1
        if i < 0:
            return None, -1
        if i not in self._surf_cache:
            self._surf_cache = {i: base64.b64decode(self.surfaces[i][1])}
        return self._surf_cache[i], i


def highlights_at(events, t):
    """[(key, alpha)] for every control held at t, or let go < FADE_S ago."""
    down, last_up = {}, {}
    for e in events:
        if e["t"] > t:
            break
        if e["kind"] == "down":
            down[e["key"]] = e["t"]
        elif e["kind"] == "up":
            down.pop(e["key"], None)
            last_up[e["key"]] = e["t"]
    out = [(k, 1.0) for k in down]
    for k, tu in last_up.items():
        if k not in down and t - tu < FADE_S:
            out.append((k, 1.0 - (t - tu) / FADE_S))
    return out


def turns_at(events, t):
    """{key: (dir, alpha)} for a jog / knob that turned < FADE_S ago."""
    out = {}
    for e in events:
        if e["t"] > t:
            break
        if e["kind"] == "turn":
            out[e["key"]] = (e["dir"], e["t"])
    return {k: (d, 1.0 - (t - tt) / FADE_S) for k, (d, tt) in out.items() if t - tt < FADE_S}


def state_at(events, t):
    """The caption and card showing at t."""
    cap, card = None, None
    for e in events:
        if e["t"] > t:
            break
        if e["kind"] == "caption":
            cap = e
        elif e["kind"] == "card":
            card = e if t < e["t"] + e["secs"] else None
            if card:
                cap = None
    return cap, card


def draw_card(card, t):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    a = min(1.0, (t - card["t"]) / 0.3, (card["t"] + card["secs"] - t) / 0.3)
    a = max(0.0, a)
    col = lambda c: tuple(int(v * a + BG[i] * (1 - a)) for i, v in enumerate(c))
    d.text((W // 2, 360), "dAVEBOx", font=F_MARK, fill=col((150, 150, 160)), anchor="mm")
    d.text((W // 2, 500), card["title"], font=F_CARD, fill=col((240, 240, 240)), anchor="mm")
    if card.get("sub"):
        d.text((W // 2, 610), card["sub"], font=F_CARD_SUB, fill=col((170, 170, 180)), anchor="mm")
    return img


def compose(take, t, cache):
    cap, card = state_at(take.events, t)
    if card:
        return draw_card(card, t), None
    oled, oi = take.oled_at(t)
    surf, si = take.surface_at(t)
    hl = highlights_at(take.events, t)
    tn = turns_at(take.events, t)
    anim_bucket = int(t * 8)     # LED pulse / blink phase
    key = (oi, si, tuple((k, round(a, 1)) for k, a in sorted(hl)),
           tuple((k, d, round(a, 1)) for k, (d, a) in sorted(tn.items())),
           cap["t"] if cap else None, anim_bucket)
    if cache.get("key") == key:
        return cache["img"], key
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # the OLED, large
    ox, oy = OLED_XY
    ow, oh = 128 * OLED_SCALE, 64 * OLED_SCALE
    d.rectangle([ox - 8, oy - 8, ox + ow + 7, oy + oh + 7], fill=(0, 0, 0), outline=(50, 50, 55), width=2)
    if oled is not None:
        big = oled.resize((ow, oh), Image.NEAREST).convert("RGB")
        img.paste(big, (ox, oy))
    # the caption panel
    px, py, pw = ox + ow + 50, oy, W - (ox + ow + 50) - 40
    if cap:
        y = py + 10
        if cap.get("title"):
            d.text((px, y), cap["title"], font=F_TITLE, fill=(255, 205, 70))
            y += 70
        for line in wrap(d, cap["text"], F_BODY, pw):
            d.text((px, y), line, font=F_BODY, fill=(235, 235, 235))
            y += 50
    # the device
    dev = dd.draw(surf, oled, t * 1000.0, scale=DEV_SCALE, bpm=take.meta.get("bpm", 120))
    for k, a in hl:
        if k in dd.SPOT and k != "c14":
            cx, cy = dd.SPOT[k][0], dd.SPOT[k][1]
            dd.fingertip(dev, cx, cy, a, DEV_SCALE)
    for k, (dr, a) in tn.items():
        if k in dd.SPOT:
            cx, cy, r = dd.SPOT[k]
            dd.turn_arrow(dev, cx, cy, r, dr, a, DEV_SCALE)
    dx = (W - dev.width) // 2
    dy = H - dev.height - 14
    img.paste(dev, (dx, dy))
    cache["key"], cache["img"] = key, img
    return img, key


def render(take_dir, out_path):
    take = Take(take_dir)
    t0, t1 = take.t_begin - 0.3, take.t_end
    nframes = int((t1 - t0) * FPS)
    # the sound for exactly [t0, t1): from the raw stream, padded with silence
    rate = take.audio["rate"]
    raw = open(os.path.join(take_dir, "audio.raw"), "rb").read()
    start = int(round((t0 - take.audio_t0) * rate))
    need = int(round((t1 - t0) * rate))
    pcm = bytearray()
    if start < 0:
        pcm += b"\0\0\0\0" * min(-start, need)
        start = 0
    pcm += raw[start * 4:(start + need - len(pcm) // 4) * 4]
    pcm += b"\0\0\0\0" * (need - len(pcm) // 4)
    wav = os.path.join(take_dir, "audio_render.wav")
    import wave
    with wave.open(wav, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(pcm))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-af", "volume=-3dB", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out_path]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    cache = {}
    for i in range(nframes):
        img, _ = compose(take, t0 + i / FPS, cache)
        ff.stdin.write(img.tobytes())
        if i % 300 == 0:
            print("frame %d / %d" % (i, nframes), flush=True)
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError("ffmpeg failed")
    return out_path


if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
