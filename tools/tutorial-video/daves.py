"""daves.py — every Dave on the OLED becomes Diamond Dave (Josh, 2026-10-16:
"use dlr/diamond dave for all the load screens ... or every screen with a dave").

A project load deals a random Dave and draws its whole frame, nothing else
(drawDaveLoading in davebox/ui/ui_daves.mjs). So a captured frame that IS one
of the Daves is swapped for Diamond's. The frames are read from the module's
own source (ui_splash.mjs: HEX_FRAMES, 1024 bytes, rows of 16 bytes, MSB =
leftmost pixel), so a new Dave in the pool is covered without touching this.
"""
import os
import re
from PIL import Image

SPLASH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "davebox", "ui", "ui_splash.mjs")
DIAMOND = "DIAMOND"


def _frame(hexs):
    raw = bytes.fromhex(hexs)
    img = Image.new("L", (128, 64), 0)
    px = img.load()
    for y in range(64):
        for x in range(128):
            if raw[y * 16 + x // 8] >> (7 - x % 8) & 1:
                px[x, y] = 255
    return img


def _load():
    src = open(SPLASH).read()
    body = src[src.index("HEX_FRAMES"):src.index("];", src.index("HEX_FRAMES"))]
    pairs = re.findall(r"/\*\s*Dave\s+\d+:\s*(.*?)\s*\*/\s*'([0-9a-fA-F]{2048})'", body)
    if not pairs:
        raise RuntimeError("no Dave frames found in " + SPLASH)
    return {name: _frame(h).tobytes() for name, h in pairs}


_FRAMES = None


def swap(oled):
    """The OLED image, with Diamond Dave in place of any other Dave."""
    global _FRAMES
    if _FRAMES is None:
        _FRAMES = _load()
    b = oled.tobytes()
    for name, f in _FRAMES.items():
        if b == f:
            return oled if name == DIAMOND else Image.frombytes("L", (128, 64), _FRAMES[DIAMOND])
    return oled


if __name__ == "__main__":                      # the frames read, and a positive control
    fr = _load()
    print(len(fr), "Daves;", DIAMOND, "present:", DIAMOND in fr)
