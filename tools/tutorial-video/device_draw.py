"""device_draw.py — the Move's control surface as the web mirror draws it, in Pillow.

A port of schwung-manager/static/mirror.html's drawDevice: the same logical
layout (920 x 389 units), the same 128-entry LED palette and white-LED balance
(after move_midi_emulator.html from Cycling '74's rnbo.move.templates, MIT —
see THIRD_PARTY_LICENSES.md), the same LED gamma lift. What it draws comes
from a `surface_live_shm_t` snapshot (LEDs) plus a set of HIGHLIGHTS the
caller supplies — the controls the director is pressing, which the snapshot
cannot show (it reads presses off the raw hardware input, before injection).

draw(surface_bytes, oled_image, highlights, now_ms, scale) -> RGB Image
"""
import math
import struct
from PIL import Image, ImageDraw, ImageFilter

# ---- palette (Cycling '74, MIT) ----
COLOR_TABLE = [
    (0x000000,0),(0xFF4032,2),(0x800400,4),(0xC93C00,6),(0xAC1F00,8),
    (0x8C5018,10),(0x491804,12),(0xFADC3B,14),(0xFFC516,16),(0xB6FF0E,18),
    (0x79FF18,20),(0x34C216,22),(0x4F8A04,24),(0x62FF55,26),(0x297D53,28),
    (0x269E72,30),(0x31ADFF,32),(0x3663FC,34),(0x1A34FF,36),(0x1C0CE6,38),
    (0x153999,40),(0x3937FF,42),(0x5722FF,44),(0x972BFF,46),(0x852178,48),
    (0xFF1032,50),(0xFF2BD4,52),(0xA63421,54),(0x995628,56),(0x876700,58),
    (0x90821F,60),(0x4A8700,62),(0x007F12,64),(0x1853B2,66),(0x624BAD,68),
    (0x733A67,70),(0xF8BCAF,72),(0xFF9B76,74),(0xFFBF5F,76),(0xD9AF71,78),
    (0xFFF480,80),(0xBFBA69,80),(0xBCCC88,81),(0xAEFF99,81),(0x7CDD9F,82),
    (0x89B47D,82),(0x80F3FF,83),(0x7ACEFC,83),(0x68A1D3,84),(0x858FC2,85),
    (0xBBAAF2,85),(0xCDBBE4,86),(0xEF8BB0,86),(0x859D8C,87),(0x6B756E,87),
    (0x84909B,88),(0x6A7075,88),(0x88859D,89),(0x6C6A75,90),(0x9D859C,90),
    (0x746A74,91),(0x9C9D85,91),(0x74756A,92),(0x9D8484,92),(0x756A6A,93),
    (0x661914,93),(0x210806,94),(0x460300,94),(0x280000,95),(0x5D1700,96),
    (0x200D00,96),(0x470C00,97),(0x1C0800,97),(0x3B2B14,98),(0x1C130A,98),
    (0x250E05,99),(0x0D0602,99),(0x645817,100),(0x201C07,101),(0x664E08,101),
    (0x211902,102),(0x486605,102),(0x172101,103),(0x306609,103),(0x0F2103,104),
    (0x144D08,104),(0x061902,105),(0x1F3701,106),(0x0A1100,106),(0x276622,107),
    (0x0C210B,107),(0x143E29,108),(0x081910,108),(0x004D36,109),(0x00180E,109),
    (0x134566,110),(0x061621,110),(0x152764,111),(0x070C20,112),(0x0A1466,112),
    (0x030621,113),(0x0B045C,113),(0x03011D,114),(0x0A1C4C,114),(0x040B1E,115),
    (0x161666,115),(0x070721,116),(0x220D66,117),(0x0B0421,117),(0x3C1166,118),
    (0x130521,118),(0x350D30,119),(0x11040F,119),(0x660614,120),(0x210206,120),
    (0x661154,121),(0x21051B,122),(0x000000,122),(0x595959,123),(0x1A1A1A,123),
    (0xFFFFFF,124),(0x595959,124),(0xCCCCCC,125),(0x404040,125),(0x141414,126),
    (0x0000FF,126),(0x00FF00,127),(0xFF0000,127),
]
LED_GAMMA = 3.5

def lift(rgb):
    if not rgb: return rgb
    m = max(rgb)
    if not m: return rgb
    k = 255 * (m / 255) ** (1 / LED_GAMMA) / m
    return tuple(min(255, round(c * k)) for c in rgb)

def palette(v):
    if v <= 0 or v > 127: return None
    h = COLOR_TABLE[v][0]
    return lift(((h >> 16) & 255, (h >> 8) & 255, h & 255))

def white(v):
    if v <= 0 or v > 127: return None
    b = round(COLOR_TABLE[v][1] / 127 * 255)
    return lift((b, b, b))

# ---- surface_live_shm_t (mirror.html OFF) ----
OFF = dict(frame=16, evCount=20, noteLed=24, noteAnim=152, ccLed=280, ccAnim=408,
           rgb=536, noteDown=1560, press=1688, ccVal=1816, enc=1944, events=1976, size=2232)
ANIM_NONE = 0xFF

class Surface:
    def __init__(self, raw):
        self.raw = raw if raw and len(raw) >= OFF['size'] else None
    def u8(self, o, i): return self.raw[o + i] if self.raw else 0
    def note_led(self, n): return self.u8(OFF['noteLed'], n)
    def note_anim(self, n): return self.raw[OFF['noteAnim'] + n] if self.raw else ANIM_NONE
    def cc_led(self, c): return self.u8(OFF['ccLed'], c)
    def cc_anim(self, c): return self.raw[OFF['ccAnim'] + c] if self.raw else ANIM_NONE
    def note_down(self, n): return self.u8(OFF['noteDown'], n)
    def cc_val(self, c): return self.u8(OFF['ccVal'], c)
    def enc(self, i):
        if not self.raw: return 0
        return struct.unpack_from('<h', self.raw, OFF['enc'] + i * 2)[0]
    def rgb(self, ch, idx):
        if not self.raw: return None
        o = OFF['rgb'] + (ch * 128 + idx) * 4
        return lift(tuple(self.raw[o:o + 3])) if self.raw[o + 3] else None

ANIM_MS = [500 / 6, 125, 250, 500, 1000]

def animate(rgb, anim, now, bpm):
    if not rgb or anim == ANIM_NONE or anim < 6 or anim > 14: return rgb
    ms = ANIM_MS[(anim - 6) % 5] * (120.0 / bpm)
    ph = (now % (ms * 2)) / (ms * 2)
    if anim >= 11: return rgb if ph < 0.5 else None
    k = 0.3 + 0.7 * (0.5 + 0.5 * math.cos(ph * 2 * math.pi))
    return tuple(round(c * k) for c in rgb)

def note_color(s, n, now, bpm):
    r = s.rgb(0, n)
    if r: return r
    a, v = s.note_anim(n), s.note_led(n)
    if a == ANIM_NONE or not v: return None
    return animate(palette(v), a, now, bpm)

def cc_color(s, c, is_white, now, bpm):
    r = s.rgb(1, c)
    if r: return r
    a, v = s.cc_anim(c), s.cc_led(c)
    if a == ANIM_NONE or not v: return None
    return animate(white(v) if is_white else palette(v), a, now, bpm)

# ---- layout (mirror.html) ----
W, P, GAP = 920, 18, 12
COL_L, COL_T, COL_F = 150, 30, 112
PAD_X = P + COL_L + GAP + COL_T + GAP
PAD_W = W - PAD_X - GAP - COL_F - P
PAD_GAP = 7
PAD_CW = (PAD_W - 7 * PAD_GAP) / 8
PAD_CH = round(PAD_CW * 2 / 3)
TOP_H, TOP_Y = 84, P
PADS_Y = TOP_Y + TOP_H + GAP
PADS_H = 4 * PAD_CH + 3 * PAD_GAP
STEP_Y = PADS_Y + PADS_H + GAP + 22
ICON_Y = STEP_Y + 24
H = ICON_Y + 10 + P
FUNC_X = W - P - COL_F
def pad_cx(c): return PAD_X + c * (PAD_CW + PAD_GAP) + PAD_CW / 2
def row_cy(r): return PADS_Y + r * (PAD_CH + PAD_GAP) + PAD_CH / 2

FUNCS = [('capture', 52, True), ('sample', 118, False), ('loop', 58, True), ('mute', 88, True),
         ('delete', 119, True), ('copy', 60, True), ('undo', 56, True), ('shift', 49, True)]
NAV = [('up', 55, 0, -1), ('down', 54, 0, 1), ('left', 62, -1, 0), ('right', 63, 1, 0)]
WX, WY = P + COL_L / 2, (row_cy(0) + row_cy(1)) / 2

# where each control is: 'n<note>' / 'c<cc>' -> (cx, cy, radius-ish)
SPOT = {}
for i in range(8): SPOT['n%d' % i] = (pad_cx(i), TOP_Y + TOP_H / 2, 15)          # knob touch
SPOT['n8'] = (FUNC_X + COL_F * 0.75, TOP_Y + TOP_H / 2, 19)
SPOT['n9'] = (WX, WY, 32); SPOT['c3'] = (WX, WY, 32); SPOT['c14'] = (WX, WY, 32)
for i in range(8): SPOT['c%d' % (71 + i)] = SPOT['n%d' % i]
for r in range(4):
    for c in range(8): SPOT['n%d' % (68 + (3 - r) * 8 + c)] = (pad_cx(c), row_cy(r), PAD_CH / 2)
_STEP_PITCH = PAD_W / 16
for i in range(16): SPOT['n%d' % (16 + i)] = (PAD_X + _STEP_PITCH * (i + 0.5), STEP_Y, 11)
for i, (name, cc, _w) in enumerate(FUNCS): SPOT['c%d' % cc] = (FUNC_X + COL_F * (0.75 if i % 2 else 0.25), row_cy(i // 2), 18)
for name, cc, dx, dy in NAV: SPOT['c%d' % cc] = (FUNC_X + COL_F / 2 + dx * 26, STEP_Y + 4 + dy * 14, 11)
SPOT['c51'] = (WX - 22, row_cy(2), 16); SPOT['c50'] = (WX + 22, row_cy(2), 16)
SPOT['c85'] = (WX - 22, STEP_Y, 16); SPOT['c86'] = (WX + 22, STEP_Y, 16)
for r in range(4): SPOT['c%d' % (43 - r)] = (P + COL_L + GAP + COL_T / 2, row_cy(r), 12)

# ---- glyphs (polylines in a 16x16 box) ----
GLYPH = {
    'back': [[(10, 4), (6, 8), (10, 12)]],
    'menu': [[(2, 3.5), (14, 3.5)], [(2, 8), (14, 8)], [(2, 12.5), (14, 12.5)]],
    'loop': [[(4, 3), (12, 3)], [(4, 13), (12, 13)], [(9, 15.5), (6, 13), (9, 10.5)]],
    'mute': [[(3, 13), (3, 3), (8, 10), (13, 3), (13, 13)]],
    'delete': [[(2.3, 2.3), (13.7, 13.7)], [(13.7, 2.3), (2.3, 13.7)]],
    'copy': [[(2, 5), (9, 5), (9, 12), (2, 12), (2, 5)], [(6, 1.5), (13, 1.5), (13, 8.5), (6, 8.5), (6, 1.5)]],
    'undo': [[(5, 4.5), (3, 7), (5, 9.5)], [(3, 7), (11, 7)], [(11, 13), (9, 13)]],
    'capture': [[(1, 4), (1, 1), (4, 1)], [(12, 1), (15, 1), (15, 4)], [(15, 12), (15, 15), (12, 15)], [(4, 15), (1, 15), (1, 12)]],
    'up': [[(8, 3), (8, 13)], [(3, 8), (13, 8)]],
    'down': [[(3, 8), (13, 8)]],
    'left': [[(10, 4), (6, 8), (10, 12)]],
    'right': [[(6, 4), (10, 8), (6, 12)]],
}
BODY, CAP, EDGE = (27, 27, 27), (43, 43, 43), (58, 58, 58)


class Painter:
    def __init__(self, scale):
        self.s = scale
        self.img = Image.new('RGB', (round(W * scale), round(H * scale)), (14, 14, 14))
        self.d = ImageDraw.Draw(self.img)
        self.glow = Image.new('RGB', self.img.size, (0, 0, 0))
        self.g = ImageDraw.Draw(self.glow)
    def S(self, v): return v * self.s
    def circle(self, cx, cy, r, fill=None, outline=None, width=1, glow=None):
        s = self.s
        box = [cx * s - r * s, cy * s - r * s, cx * s + r * s, cy * s + r * s]
        if glow: self.g.ellipse([box[0] - 4 * s, box[1] - 4 * s, box[2] + 4 * s, box[3] + 4 * s], fill=glow)
        self.d.ellipse(box, fill=fill, outline=outline, width=max(1, round(width * s)))
    def rect(self, x, y, w, h, fill=None, outline=None, width=1, radius=0, glow=None):
        s = self.s
        box = [x * s, y * s, (x + w) * s, (y + h) * s]
        if glow: self.g.rounded_rectangle([box[0] - 3 * s, box[1] - 3 * s, box[2] + 3 * s, box[3] + 3 * s], radius=radius * s + 3 * s, fill=glow)
        self.d.rounded_rectangle(box, radius=radius * s, fill=fill, outline=outline, width=max(1, round(width * s)))
    def glyph(self, name, cx, cy, size, color):
        s = self.s
        if name == 'sample':
            self.circle(cx, cy, size * 5 / 16, fill=color); return
        if name == 'shift':
            for x in (3, 8, 13): self.circle(cx - size / 2 + x * size / 16, cy, size * 1.4 / 16, fill=color)
            return
        if name == 'play':
            pts = [(3, 1), (14, 8), (3, 15)]
            self.d.polygon([((cx - size / 2 + x * size / 16) * s, (cy - size / 2 + y * size / 16) * s) for x, y in pts], fill=color); return
        if name == 'rec':
            self.circle(cx, cy, size * 7 / 16, outline=color, width=1.4 * size / 16); return
        for line in GLYPH.get(name, []):
            pts = [((cx - size / 2 + x * size / 16) * s, (cy - size / 2 + y * size / 16) * s) for x, y in line]
            self.d.line(pts, fill=color, width=max(1, round(1.4 * size / 16 * s)), joint='curve')
    def done(self):
        blur = self.glow.filter(ImageFilter.GaussianBlur(6 * self.s))
        from PIL import ImageChops
        return ImageChops.add(self.img, blur)


def round_button(p, cx, cy, r, led, held, name):
    p.circle(cx, cy, r, fill=(85, 85, 85) if held else CAP,
             outline=led if led else EDGE, width=2.5 if led else 1, glow=tuple(c // 2 for c in led) if led else None)
    if name: p.glyph(name, cx, cy, r * 0.95, led if led else (136, 136, 136))


def encoder(p, cx, cy, r, led, touched, pos):
    s = p.s
    box = [(cx - r - 5) * s, (cy - r - 5) * s, (cx + r + 5) * s, (cy + r + 5) * s]
    p.d.arc(box, 135, 405, fill=led if led else (38, 38, 38), width=max(1, round(3 * s)))
    p.circle(cx, cy, r, fill=(58, 74, 85) if touched else (46, 46, 46), outline=(85, 136, 187) if touched else EDGE, width=2 if touched else 1)
    a = pos * (math.pi / 12) - math.pi / 2
    p.d.line([((cx + math.cos(a) * r * 0.35) * s, (cy + math.sin(a) * r * 0.35) * s),
              ((cx + math.cos(a) * r * 0.85) * s, (cy + math.sin(a) * r * 0.85) * s)], fill=(170, 170, 170), width=max(1, round(2 * s)))


def draw(surface_raw, oled, now_ms, scale=1.5, bpm=120.0, enc_override=None):
    """The device, from a surface snapshot (LEDs, encoder positions) and the OLED image."""
    s = Surface(surface_raw)
    p = Painter(scale)
    p.rect(2, 2, W - 4, H - 4, fill=BODY, outline=(44, 44, 44), width=2, radius=10)
    # the screen
    sw, sh = 128 * 1.05, 64 * 1.05
    sx, sy = P + (COL_L - sw) / 2, TOP_Y + (TOP_H - sh) / 2
    p.rect(sx - 4, sy - 4, sw + 8, sh + 8, fill=(0, 0, 0))
    if oled is not None:
        o = oled.convert('RGB').resize((round(sw * scale), round(sh * scale)), Image.NEAREST)
        p.img.paste(o, (round(sx * scale), round(sy * scale)))
    enc = lambda i: (enc_override.get(i, s.enc(i)) if enc_override else s.enc(i))
    for i in range(8):
        encoder(p, pad_cx(i), TOP_Y + TOP_H / 2, 15, cc_color(s, 71 + i, False, now_ms, bpm), bool(s.note_down(i)), enc(i))
    encoder(p, FUNC_X + COL_F * 0.75, TOP_Y + TOP_H / 2, 19, cc_color(s, 79, False, now_ms, bpm), bool(s.note_down(8)), enc(8))
    encoder(p, WX, WY, 32, None, bool(s.note_down(9)), enc(9))
    round_button(p, WX - 22, row_cy(2), 16, cc_color(s, 51, True, now_ms, bpm), bool(s.cc_val(51)), 'back')
    round_button(p, WX + 22, row_cy(2), 16, cc_color(s, 50, True, now_ms, bpm), bool(s.cc_val(50)), 'menu')
    for r in range(4):
        cc, x, y = 43 - r, P + COL_L + GAP + (COL_T - 16) / 2, row_cy(r) - PAD_CH / 2
        p.rect(x, y, 16, PAD_CH, fill=(85, 85, 85) if s.cc_val(cc) else CAP, outline=EDGE, radius=8)
        led = cc_color(s, cc, False, now_ms, bpm)
        p.rect(x + 6, y + PAD_CH * 0.18, 4, PAD_CH * 0.64, fill=led if led else (68, 68, 68), radius=2)
    for r in range(4):
        for c in range(8):
            n = 68 + (3 - r) * 8 + c
            x, y = PAD_X + c * (PAD_CW + PAD_GAP), PADS_Y + r * (PAD_CH + PAD_GAP)
            led = note_color(s, n, now_ms, bpm)
            p.rect(x, y, PAD_CW, PAD_CH, fill=led if led else (38, 38, 38), radius=2,
                   glow=tuple(v // 2 for v in led) if led else None)
    for i, (name, cc, is_white) in enumerate(FUNCS):
        round_button(p, FUNC_X + COL_F * (0.75 if i % 2 else 0.25), row_cy(i // 2), 18,
                     cc_color(s, cc, is_white, now_ms, bpm), bool(s.cc_val(cc)), name)
    round_button(p, WX - 22, STEP_Y, 16, cc_color(s, 85, False, now_ms, bpm), bool(s.cc_val(85)), 'play')
    round_button(p, WX + 22, STEP_Y, 16, cc_color(s, 86, False, now_ms, bpm), bool(s.cc_val(86)), 'rec')
    for i in range(16):
        cx = PAD_X + _STEP_PITCH * (i + 0.5)
        round_button(p, cx, STEP_Y, min(11, _STEP_PITCH * 0.36), note_color(s, 16 + i, now_ms, bpm), bool(s.note_down(16 + i)), None)
        if i % 4 == 0: p.rect(cx - 5, STEP_Y + 15, 10, 2, fill=(68, 68, 68))
        icon = cc_color(s, 16 + i, True, now_ms, bpm)
        p.rect(cx - 5, ICON_Y, 10, 3, fill=icon if icon else (42, 42, 42))
    nx, ny = FUNC_X + COL_F / 2, STEP_Y + 4
    for name, cc, dx, dy in NAV:
        round_button(p, nx + dx * 26, ny + dy * 14, 11, cc_color(s, cc, True, now_ms, bpm), bool(s.cc_val(cc)), name)
    return p.done()


def fingertip(img, cx, cy, alpha, scale, ring=True):
    """The mirror's fingertip: a translucent oval reaching up from below, with a
    dark edge, over a control (cx, cy in device units)."""
    from PIL import ImageDraw as D
    s = scale
    w, tip, hgt = 17, 20, 78
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = D.Draw(lay)
    top = cy - tip
    box = [(cx - w) * s, top * s, (cx + w) * s, (top + 2 * tip) * s]
    body = [(cx - w) * s, (top + tip) * s, (cx + w) * s, (top + hgt) * s]
    a = int(170 * alpha)
    d.rounded_rectangle(body, radius=12 * s, fill=(255, 255, 255, int(a * 0.55)))
    d.ellipse(box, fill=(255, 255, 255, a), outline=(0, 0, 0, int(255 * alpha)), width=max(1, round(2 * s)))
    if ring:
        r = 26
        d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], outline=(255, 210, 60, int(255 * alpha)), width=max(2, round(3 * s)))
    img.paste(Image.alpha_composite(img.convert('RGBA'), lay).convert('RGB'))


def turn_arrow(img, cx, cy, r, direction, alpha, scale):
    from PIL import ImageDraw as D
    s = scale
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = D.Draw(lay)
    R = r + 13
    a0, a1 = -90 - direction * 54, -90 + direction * 43
    lo, hi = (a0, a1) if a0 < a1 else (a1, a0)
    box = [(cx - R) * s, (cy - R) * s, (cx + R) * s, (cy + R) * s]
    col = (255, 210, 60, int(255 * alpha))
    d.arc(box, lo, hi, fill=(0, 0, 0, int(255 * alpha)), width=max(2, round(6 * s)))
    d.arc(box, lo, hi, fill=col, width=max(2, round(3 * s)))
    ang = math.radians(a1)
    hx, hy = cx + math.cos(ang) * R, cy + math.sin(ang) * R
    ta = ang + direction * math.pi / 2
    pts = [(hx + math.cos(ta) * 9, hy + math.sin(ta) * 9), (hx + math.cos(ta + 2.4) * 7, hy + math.sin(ta + 2.4) * 7),
           (hx + math.cos(ta - 2.4) * 7, hy + math.sin(ta - 2.4) * 7)]
    d.polygon([(x * s, y * s) for x, y in pts], fill=col, outline=(0, 0, 0, int(255 * alpha)))
    img.paste(Image.alpha_composite(img.convert('RGBA'), lay).convert('RGB'))


def oled_image(b64data):
    """mono1_packed (page-ordered, LSB = top pixel of each 8-row page) -> 128x64 L image."""
    import base64
    raw = base64.b64decode(b64data)
    img = Image.new('L', (128, 64), 0)
    px = img.load()
    for page in range(8):
        for x in range(128):
            b = raw[page * 128 + x] if page * 128 + x < len(raw) else 0
            for bit in range(8):
                if b >> bit & 1: px[x, page * 8 + bit] = 255
    return img
