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
import math
import bisect
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import device_draw as dd
import daves      # noqa: E402

W, H, FPS = 1920, 1080, 30
# The manual's dark theme (davebox/tools/manual_template.html): ground, surface,
# ink, muted, rule, the pink and cyan accents, the bezel.
GROUND, SURFACE, INK, INK_SOFT, MUTED, RULE = (0x11, 0x0e, 0x1b), (0x18, 0x14, 0x26), (0xeb, 0xe7, 0xf5), (0xcd, 0xc6, 0xe0), (0x9a, 0x92, 0xb3), (0x2a, 0x24, 0x40)
ACCENT, ACCENT_2 = (0xff, 0x5f, 0xa8), (0x4f, 0xd3, 0xe3)
BEZEL, BEZEL_EDGE = (0x07, 0x05, 0x0d), (0x33, 0x2b, 0x4a)
BG = GROUND
OLED_SCALE = 7
OLED_XY = (40, 34)
DEV_SCALE = 1.35
FADE_S = 0.5
# The manual sets Chivo (display), Source Sans 3 (body) and JetBrains Mono
# (labels). Source Sans Pro is Source Sans 3's predecessor; Chivo and JetBrains
# Mono are used when installed, otherwise Source Sans Pro Bold and Menlo.
FONT_DIRS = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"),   # the manual's, fetched (gitignored)
             "/Library/Fonts", os.path.expanduser("~/Library/Fonts"), "/System/Library/Fonts"]


def _find(*names):
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return None


F_DISPLAY = _find("Chivo[wght].ttf", "Chivo-ExtraBold.ttf", "SourceSansPro-Bold.ttf", "SourceSansPro-Bold.otf")
F_BODY_P = _find("SourceSans3[wght].ttf", "SourceSans3-Regular.ttf", "SourceSansPro-Regular.ttf", "SourceSansPro-Regular.otf")
F_SEMI_P = _find("SourceSans3-Semibold.ttf", "SourceSansPro-Semibold.otf", "SourceSansPro-Bold.ttf")
F_MONO_P = _find("JetBrainsMono[wght].ttf", "JetBrainsMono-Bold.ttf", "Menlo.ttc")


def font(path, size, weight=None):
    try:
        f = ImageFont.truetype(path, size)
        if weight and "[wght]" in (path or ""):
            f.set_variation_by_axes([weight])        # a variable font: the manual's weight
        return f
    except Exception:
        return ImageFont.load_default()


F_TITLE = font(F_DISPLAY, 50, 800)
F_BODY = font(F_BODY_P, 40, 400)
F_EYEBROW = font(F_MONO_P, 22, 600)
F_CARD = font(F_DISPLAY, 104, 800)
F_CARD_SUB = font(F_MONO_P, 30, 600)
F_MARK = font(F_DISPLAY, 44, 800)


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
        self.eyebrow = ("TUTORIAL %s · %s" % (self.meta.get("number", ""), self.meta.get("title", ""))).upper().strip(" ·")
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
            self._oled_cache = {i: daves.swap(dd.oled_image(self.screens[i][1]))}
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


POINT_IN, POINT_OUT = 0.2, 0.5


def points_at(events, t):
    """[(target, alpha)] for every target a point step is boxing at t: in over
    POINT_IN, held for its secs, out over POINT_OUT once the action starts."""
    out = {}
    for e in events:
        if e["t"] > t:
            break
        if e["kind"] == "point":
            for k in grouped(e["targets"]):
                out[k] = (e["t"], e["secs"])
    res = []
    for k, (t0, secs) in out.items():
        dt = t - t0
        if dt < POINT_IN:
            a = dt / POINT_IN
        elif dt < secs:
            a = 1.0
        elif dt < secs + POINT_OUT:
            a = 1.0 - (dt - secs) / POINT_OUT
        else:
            continue
        res.append((k, a))
    return res


def grouped(targets):
    """Pads, or step buttons, named together are boxed as one group ('g:' +
    the keys) — a column of four is one box, not four."""
    out, pads, steps = [], [], []
    for k in targets:
        if k.startswith("n") and 68 <= int(k[1:]) <= 99:
            pads.append(k)
        elif k.startswith("n") and 16 <= int(k[1:]) <= 31:
            steps.append(k)
        else:
            out.append(k)
    for g in (pads, steps):
        if len(g) > 1:
            out.append("g:" + "+".join(g))
        else:
            out += g
    return out


def target_box(k, dx, dy):
    """The device-pixel box around one control, or a 'g:' group of them."""
    keys = k[2:].split("+") if k.startswith("g:") else [k]
    xs0, ys0, xs1, ys1 = [], [], [], []
    for key in keys:
        if key not in dd.SPOT:
            continue
        cx, cy, r = dd.SPOT[key]
        r, pad = max(r, 16), 6                 # a small button still gets a box you can find
        xs0.append(cx - r - pad); ys0.append(cy - r - pad); xs1.append(cx + r + pad); ys1.append(cy + r + pad)
    if not xs0:
        return None
    return [dx + min(xs0) * DEV_SCALE, dy + min(ys0) * DEV_SCALE, dx + max(xs1) * DEV_SCALE, dy + max(ys1) * DEV_SCALE]


def point_box(d, box, alpha, t, width):
    """The pointer: a cyan box with a soft halo, gently pulsing — nothing like
    a fingertip, so 'look here' never reads as 'pressed'."""
    pulse = 0.8 + 0.2 * math.sin(t * 2 * math.pi * 1.4)
    a = int(255 * alpha * pulse)
    x0, y0, x1, y1 = box
    for grow, aa in ((14, 0.12), (9, 0.25)):
        d.rounded_rectangle([x0 - grow, y0 - grow, x1 + grow, y1 + grow], radius=10 + grow,
                            outline=ACCENT_2 + (int(a * aa),), width=width + 3)
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=ACCENT_2 + (int(a * 0.16),),
                        outline=ACCENT_2 + (a,), width=width)


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


def draw_card(card, t, video_title=""):
    img = Image.new("RGB", (W, H), GROUND)
    d = ImageDraw.Draw(img)
    a = max(0.0, min(1.0, (t - card["t"]) / 0.3, (card["t"] + card["secs"] - t) / 0.3))
    col = lambda c: tuple(int(v * a + GROUND[i] * (1 - a)) for i, v in enumerate(c))
    # the wordmark, as the manual's: dAVEBOx SA, SA in the accent
    mark, sa = "dAVEBOx ", "SA"
    mw = d.textlength(mark, font=F_MARK) + d.textlength(sa, font=F_MARK)
    x0 = (W - mw) / 2
    d.text((x0, 330), mark, font=F_MARK, fill=col(INK), anchor="ls")
    d.text((x0 + d.textlength(mark, font=F_MARK), 330), sa, font=F_MARK, fill=col(ACCENT), anchor="ls")
    # an accent rule, pink into cyan
    for i in range(240):
        k = i / 239
        c = tuple(int(ACCENT[j] * (1 - k) + ACCENT_2[j] * k) for j in range(3))
        d.line([(W / 2 - 120 + i, 372), (W / 2 - 120 + i, 377)], fill=col(c))
    d.text((W // 2, 500), card["title"], font=F_CARD, fill=col(INK), anchor="mm")
    if card.get("sub"):
        d.text((W // 2, 620), card["sub"].upper(), font=F_CARD_SUB, fill=col(MUTED), anchor="mm")
    return img


def compose(take, t, cache):
    cap, card = state_at(take.events, t)
    if card:
        return draw_card(card, t), None
    oled, oi = take.oled_at(t)
    surf, si = take.surface_at(t)
    hl = highlights_at(take.events, t)
    tn = turns_at(take.events, t)
    pts = points_at(take.events, t)
    anim_bucket = int(t * 8)     # LED pulse / blink phase
    key = (oi, si, tuple((k, round(a, 1)) for k, a in sorted(hl)),
           tuple((k, d, round(a, 1)) for k, (d, a) in sorted(tn.items())),
           cap["t"] if cap else None, anim_bucket, tuple((k, round(a, 2)) for k, a in sorted(pts)))
    if cache.get("key") == key:
        return cache["img"], key
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # the OLED, large
    ox, oy = OLED_XY
    ow, oh = 128 * OLED_SCALE, 64 * OLED_SCALE
    d.rounded_rectangle([ox - 10, oy - 10, ox + ow + 9, oy + oh + 9], radius=10, fill=BEZEL, outline=BEZEL_EDGE, width=2)
    if oled is not None:
        big = oled.resize((ow, oh), Image.NEAREST).convert("RGB")
        img.paste(big, (ox, oy))
    # the caption panel
    px, py = ox + ow + 40, oy - 10
    pw, ph = W - px - 40, oh + 20
    tx, tw = px + 44, pw - 80
    d.text((tx, py + 36), take.eyebrow, font=F_EYEBROW, fill=MUTED)
    if cap:
        y = py + 86
        if cap.get("title"):
            d.text((tx, y), cap["title"], font=F_TITLE, fill=ACCENT)
            y += 74
        for line in wrap(d, cap["text"], F_BODY, tw):
            d.text((tx, y), line, font=F_BODY, fill=INK)
            y += 52
    # the device. Every gesture in a take is injected, which the surface never
    # shows (highlights come from the director's log), so a knob touch in it can
    # only be a stray hardware reading — capacitive noise was seen while a project
    # loaded. Clear the knob-touch bytes rather than draw a touch nobody made.
    if surf:
        o = dd.OFF['noteDown']
        surf = surf[:o] + bytes(10) + surf[o + 10:]
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
    dy = H - dev.height - 70        # clear of a player's control bar
    img.paste(dev, (dx, dy))
    if pts:
        lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        for k, a in pts:
            if k.startswith("oled:"):
                x, y, w, h = (int(v) for v in k[5:].split(","))
                point_box(ld, [ox + x * OLED_SCALE - 8, oy + y * OLED_SCALE - 8,
                               ox + (x + w) * OLED_SCALE + 8, oy + (y + h) * OLED_SCALE + 8], a, t, 5)
            else:
                box = target_box(k, dx, dy)
                if box:
                    point_box(ld, box, a, t, 6)
        img.paste(lay, (0, 0), lay)
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
    # Each take's sound peaks at -1 dBFS: the instruments differ by 20 dB (a
    # Mini-JV piano peaked at -20), and a series should play at one level.
    import array, math
    smp = array.array("h"); smp.frombytes(bytes(pcm[:len(pcm) // 2 * 2]))
    peak = max((abs(v) for v in smp), default=0)
    peak_db = 20 * math.log10(peak / 32768.0) if peak else -120.0
    gain_db = min(24.0, -1.0 - peak_db) if peak_db > -40.0 else 0.0   # a silent take is not raised
    print("audio peak %.1f dBFS, gain %+.1f dB" % (20 * math.log10(max(peak, 1) / 32768.0), gain_db))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-af", "volume=%.2fdB" % gain_db, "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out_path]
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
