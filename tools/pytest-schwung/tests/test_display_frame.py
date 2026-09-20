"""The OLED frame decode — the packing, and the refusal to fake a frame.

These run off-device: they pin the decode and the contract, not the daemon.

⚠ Why the packing gets its own test. The device stores the screen in PAGES,
not rows: one byte is 8 VERTICALLY stacked pixels. Decode it row-wise and
nothing errors — you get a picture that looks like plausible noise, and a
screen assertion built on it fails for a reason that has nothing to do with
the screen. That is the expensive kind of wrong, so it is pinned here with
cases whose answer is obvious by hand.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from schwung_bus.client import DisplayFrame, DISPLAY_WIDTH, DISPLAY_HEIGHT  # noqa: E402


def frame_with(**pixels) -> DisplayFrame:
    """Build a frame by setting (x, y) -> 1, using the device's own packing."""
    data = bytearray(DISPLAY_WIDTH * DISPLAY_HEIGHT // 8)
    for (x, y) in pixels["on"]:
        data[(y // 8) * DISPLAY_WIDTH + x] |= 1 << (y % 8)
    return DisplayFrame(counter=0, data=bytes(data))


def test_top_left_pixel():
    f = frame_with(on=[(0, 0)])
    assert f.pixel(0, 0) == 1
    assert f.pixel(1, 0) == 0
    assert f.pixel(0, 1) == 0
    assert f.lit() == 1


def test_bit_order_is_downward_within_a_page():
    """Bit j of a byte is the row j DOWN from the top of that page — LSB is
    the topmost row. Getting this inverted mirrors every glyph vertically in
    8-pixel bands, which reads as a font bug rather than a decode bug."""
    f = frame_with(on=[(0, 7)])
    assert f.pixel(0, 7) == 1
    assert f.pixel(0, 0) == 0


def test_page_stride_is_128_bytes():
    """y=8 is the first row of page 1, i.e. byte 128 — not byte 1."""
    f = frame_with(on=[(0, 8)])
    assert f.pixel(0, 8) == 1
    assert f.data[128] == 0x01
    assert f.data[1] == 0x00


def test_bottom_right_corner():
    f = frame_with(on=[(127, 63)])
    assert f.pixel(127, 63) == 1
    assert f.lit() == 1


def test_blank_is_blank_and_says_so():
    """A zero frame must be reported as blank, never mistaken for content —
    this is the value that distinguishes 'the screen is empty' from 'we did
    not read the screen'."""
    f = DisplayFrame(counter=0, data=bytes(1024))
    assert f.is_blank()
    assert f.lit() == 0


def test_ascii_render_shape_and_content():
    f = frame_with(on=[(0, 0), (127, 0)])
    art = f.to_ascii()
    lines = art.split("\n")
    assert len(lines) == DISPLAY_HEIGHT
    assert all(len(ln) == DISPLAY_WIDTH for ln in lines)
    assert lines[0][0] == "#"
    assert lines[0][127] == "#"
    assert lines[0][1] == "."
    assert lines[1][0] == "."


def test_pbm_is_well_formed():
    f = frame_with(on=[(0, 0)])
    pbm = f.to_pbm()
    assert pbm.startswith(b"P1\n128 64\n")
    assert len(pbm.split(b"\n")) == 2 + DISPLAY_HEIGHT + 1


def test_out_of_range_raises_rather_than_wrapping():
    """An off-screen coordinate is a test bug; silently wrapping to another
    row would answer a question nobody asked."""
    f = DisplayFrame(counter=0, data=bytes(1024))
    for bad in ((128, 0), (0, 64), (-1, 0), (0, -1)):
        try:
            f.pixel(*bad)
        except IndexError:
            continue
        raise AssertionError(f"{bad} should have raised")
