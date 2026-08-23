#!/usr/bin/env python3
"""pad-ticker.py — scroll "dAVEBOx" across the 8x4 pad grid while a launch is
in flight, by driving stock Schwung's pad LEDs.

Runs inside the launch gap where stock Move is still alive (quiesce-stock.sh,
after stock's shadow UI has exited and the OLED splash is up). Loops until
killed; the freeze that follows leaves whatever frame was last shown on the
pads, which is fine — the scroll has no beginning or end.

HOW IT REACHES THE PADS. Stock's shim drains the shadow-UI MIDI-out ring
(/dev/shm/schwung-midi-out, shadow_midi_out_t) on every SPI frame and queues
cable-0 note-ons as LED writes — exactly the path stock's own shadow UI uses
for its menu LEDs. shadow_ui has exited by the time we run, so we are the sole
producer. The consumer (shadow_midi.c shadow_inject_ui_midi_out) snapshots
write_idx, resets it to 0 and wipes the buffer, so we append at write_idx and
bump `ready`; write_idx is a uint8, so a frame must stay under 252 bytes —
32 pads x 4 bytes = 128. Layout (both headers, stock and dbxhost):
    uint8 write_idx; uint8 ready; uint8 reserved[2]; uint8 buffer[512]

PADS. Notes 68..99, bottom-left to top-right, 8 per row. Row 0 of a glyph is
the TOP of the grid.

Usage:
    pad-ticker.py [--shm PATH] [--fps N] [--color N] [--preview FRAMES]
  --preview prints frames as ASCII instead of touching any SHM (tests, and
  checking the font on a laptop).
"""
import argparse, mmap, os, sys, time

PAD_BASE = 68
COLS, ROWS = 8, 4
SHM_DEFAULT = "/dev/shm/schwung-midi-out"
BUF_SIZE = 512
HDR = 4
LED_WHITE = 120        # shared/constants.mjs White

# 4-row glyphs, variable width, '#' lit. Caps use the full height; the
# lowercase d keeps its ascender and x sits on a 3-row x-height so the case
# contrast survives at pad resolution. One blank column between glyphs.
FONT = {
    "d": ["....#",
          ".####",
          "#...#",
          ".####"],
    "A": [".###.",
          "#...#",
          "#####",
          "#...#"],
    "V": ["#...#",
          "#...#",
          ".#.#.",
          "..#.."],
    "E": ["#####",
          "#....",
          "####.",
          "#####"],
    "B": ["####.",
          "#...#",
          "####.",
          "#####"],
    "O": [".###.",
          "#...#",
          "#...#",
          ".###."],
    "x": [".....",
          "#...#",
          ".#.#.",
          "#...#"],
    " ": ["..", "..", "..", ".."],
}
TEXT = "dAVEBOx"


def columns(text):
    """The message as a list of columns; each column is a 4-bit row mask
    (bit 0 = top row). Glyphs are separated by one blank column."""
    out = []
    for ch in text:
        g = FONT[ch]
        w = len(g[0])
        for c in range(w):
            m = 0
            for r in range(ROWS):
                if g[r][c] == "#":
                    m |= 1 << r
            out.append(m)
        out.append(0)
    return out


def frame(cols, offset):
    """Window of COLS columns starting at `offset` into an endless strip:
    COLS blank columns (so the text enters from the right edge), the text,
    COLS blank columns (so it leaves off the left edge), then wrap."""
    strip = [0] * COLS + cols + [0] * COLS
    n = len(strip)
    return [strip[(offset + c) % n] for c in range(COLS)]


def period(cols):
    return len(cols) + 2 * COLS


def pad_note(row_top, col):
    """Grid row 0 = top. Hardware row 0 = bottom."""
    return PAD_BASE + (ROWS - 1 - row_top) * COLS + col


def packets(win, color):
    pk = bytearray()
    for r in range(ROWS):
        for c in range(COLS):
            lit = (win[c] >> r) & 1
            pk += bytes((0x09, 0x90, pad_note(r, c), color if lit else 0))
    return bytes(pk)


def ascii_frame(win):
    return "\n".join("".join("#" if (win[c] >> r) & 1 else "." for c in range(COLS))
                     for r in range(ROWS))


def run(shm_path, fps, color):
    cols = columns(TEXT)
    n = period(cols)
    with open(shm_path, "r+b") as f:
        mm = mmap.mmap(f.fileno(), HDR + BUF_SIZE)
        off = 0
        dt = 1.0 / fps
        nxt = time.monotonic()
        while True:
            pk = packets(frame(cols, off), color)
            # Append behind whatever the shim has not drained yet; if the ring
            # is full just skip this frame rather than tear the header.
            widx = mm[0]
            if widx + len(pk) <= 252:
                mm[HDR + widx:HDR + widx + len(pk)] = pk
                mm[0] = widx + len(pk)
                mm[1] = (mm[1] + 1) & 0xFF
            off = (off + 1) % n
            nxt += dt
            time.sleep(max(0.0, nxt - time.monotonic()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shm", default=SHM_DEFAULT)
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--color", type=int, default=LED_WHITE)
    ap.add_argument("--preview", type=int, default=0, metavar="FRAMES")
    a = ap.parse_args()
    if a.preview:
        cols = columns(TEXT)
        for i in range(a.preview):
            print("frame %d" % i); print(ascii_frame(frame(cols, i))); print()
        print("period %d columns" % period(cols))
        return 0
    if not os.path.exists(a.shm):
        sys.stderr.write("pad-ticker: no %s (stock shim not running?)\n" % a.shm)
        return 1
    try:
        run(a.shm, a.fps, a.color)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
