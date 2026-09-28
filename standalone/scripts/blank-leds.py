#!/usr/bin/env python3
"""blank-leds.py — write every Move LED dark, immediately, at launch.

Josh, 2026-08-24: "Turn off all leds as early as possible when davebox is
selected from stock tool menu and leave them off until davebox is loaded to
project management ui."

⚠⚠ STRIPPING IS NOT BLANKING. The shim already drops Move's LED writes during
the boot window, but an LED holds its last physically-written value — and the
launch SIGSTOPs Move mid-Tools-menu, so the surface holds a LIT stock menu all
the way through the teardown and splash. Nothing ever writes zero. Suppressing
future paints cannot darken a pad that is already on; only a write can.

HOW THIS REACHES THE PADS. The same path the old pad-ticker used, which is why
it is known to work this early: the shim drains the shadow-UI MIDI-out ring on
every SPI frame and turns cable-0 messages into LED writes.

THE RING (stock 1.5.0 and dbxhost alike, since upstream 988ed244 — only the
buffer size differs: stock 4096, ours 512):
    uint16 write_idx (LE); uint16 read_idx (LE); uint8 buffer[N], N a power of 2
Both indices are free-running byte counts. The PRODUCER owns write_idx and the
bytes; the CONSUMER (the shim) owns read_idx and never writes the buffer.
Capacity is N - 4, so full != empty. We are a producer: append at
write_idx & (N-1), wrapping, then publish write_idx + len with ONE 16-bit store
— never two byte stores, which the shim could read half-done across a carry.
We never write read_idx. N is taken from the file size, so one writer serves
both rings.

⚠⚠ THE LAYOUT IS LOAD-BEARING AND IT HAS BITTEN TWICE. First the uint16 widening
moved `ready` to byte 2 and our "ready bump" corrupted write_idx's high byte:
no drain, ever, and a 2 s stall per call (2026-08-31). Then stock 1.5.0 turned
the segment into this ring: byte 2 became read_idx, the file grew to 4100
bytes, and the size check below refused it — so from 09-26 nothing was blanked
at all. The layout is pinned against shadow_constants.h by
tests/host/test_blank_leds_layout.sh.

⚠ WE ARE NOT ALWAYS THE ONLY PRODUCER. On the default launch path stock's
shadow_ui is still alive when this runs, and it is the ring's real producer.
An interleave that lands between its read of write_idx and its store can lose
one side's packets, or leave an index the shim reads as more than it can take —
which it answers by DEFERRING, so stock's own LED output stalls. Both land on a
stock session that is frozen and killed seconds later, and the window is one
small store: a whole payload is one push. Best-effort, like the blank itself.

Run against STOCK's ring only (quiesce-stock.sh, before the freeze). There is no
second leg on ours: the shim strips cable-0 LED writes while its boot blank is
armed, so a write there would be eaten (tests/host/test_blank_leds.sh).
"""
import argparse, ctypes, mmap, os, sys, time

HDR = 4
WIDX_OFF, RIDX_OFF = 0, 2                # uint16 LE write_idx, uint16 LE read_idx
MIN_BUF, MAX_BUF = 64, 32768             # a power of 2 that divides 65536

# Every LED the surface owns. Notes: pads 68-99 and the 16 step buttons.
# CCs: the button set the module's own drainLedInit clears, so the two agree on
# what "all LEDs" means and neither leaves a stray light behind.
NOTES = list(range(68, 100)) + list(range(16, 32))
CCS = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
       40, 41, 42, 43, 49, 50, 51, 52, 54, 55, 56, 58, 60, 62, 63,
       71, 72, 73, 74, 75, 76, 77, 78, 85, 86, 88, 118, 119]


def messages():
    out = bytearray()
    for n in NOTES:
        out += bytes((0x09, 0x90, n, 0))      # note-on, velocity 0 == dark
    for c in CCS:
        out += bytes((0x0B, 0xB0, c, 0))
    return bytes(out)


def chunks(payload, capacity):
    """Split into pushes the ring can hold, on message boundaries."""
    per = (capacity // 4) * 4
    return [payload[i:i + per] for i in range(0, len(payload), per)]


class UnknownLayout(Exception):
    """The segment is not the ring above — a stock update changed it."""


def ring_size(shm_path):
    """The buffer size N, or UnknownLayout."""
    n = os.path.getsize(shm_path) - HDR
    if n < MIN_BUF or n > MAX_BUF or n & (n - 1):
        raise UnknownLayout()
    return n


class Ring:
    def __init__(self, mm, n):
        self.mm, self.n, self.cap = mm, n, n - 4
        # Native 16-bit loads and stores: a slice assignment is a memcpy, which
        # may move the two bytes one at a time.
        self.widx = ctypes.c_uint16.from_buffer(mm, WIDX_OFF)
        self.ridx = ctypes.c_uint16.from_buffer(mm, RIDX_OFF)

    def used(self):
        return (self.widx.value - self.ridx.value) & 0xFFFF

    def sane(self):
        u = self.used()
        return u <= self.cap and u % 4 == 0

    def free(self):
        return self.cap - self.used()

    def push(self, pk):
        """Whole or nothing. The caller has waited for room."""
        if len(pk) > self.free():
            return False
        w = self.widx.value
        pos = w & (self.n - 1)
        first = min(len(pk), self.n - pos)
        self.mm[HDR + pos:HDR + pos + first] = pk[:first]
        if first < len(pk):
            self.mm[HDR:HDR + len(pk) - first] = pk[first:]
        self.widx.value = (w + len(pk)) & 0xFFFF   # publish, after the bytes
        return True

    def release(self):
        # from_buffer pins the mmap; it cannot close while these live.
        del self.widx, self.ridx


def wait_for_room(ring, need, gap):
    """Block until the shim has drained enough of the ring for `need` bytes.

    ⚠⚠ This is not a nicety. A plain sleep-between-chunks DROPPED a frame:
    measured on device, the first frame filled the ring, the second found no
    room and was skipped silently, so the pads went dark and every BUTTON
    stayed lit. The ring tells us when there is room — ask it, not a delay.
    """
    deadline = time.monotonic() + 2.0
    while ring.free() < need:
        if time.monotonic() >= deadline:
            return False          # shim is not draining; nothing more to do
        time.sleep(gap if gap > 0 else 0.002)
    return True


def blank(shm_path, rounds, gap):
    """Returns True when every write landed; False when the shim stopped
    draining and part of the payload was abandoned — the caller's log line
    must not say "blanked" for a surface that is still lit.

    ⚠⚠ REFUSES A RING IT DOES NOT KNOW, AT ONCE (2026-09-27). A segment read
    with the wrong layout can never show room, and each of the three calls a
    Tools launch makes then burned its full 2 s deadline — with stock's Tools
    menu still live and scrollable the whole time (Josh: "the tool menu on
    stock lingers for a good while"). Blanking nothing quickly beats blanking
    nothing slowly."""
    n = ring_size(shm_path)
    with open(shm_path, "r+b") as f:
        mm = mmap.mmap(f.fileno(), HDR + n)
        ring = Ring(mm, n)
        try:
            if not ring.sane():
                raise UnknownLayout()
            # Repeated deliberately. We are racing the shim's frames, and an
            # attempt that finds no room is a surface that stays lit with
            # nothing to say so. Idempotent: writing dark twice is dark.
            for _ in range(rounds):
                for pk in chunks(messages(), ring.cap):
                    if not wait_for_room(ring, len(pk), gap):
                        return False
                    if not ring.push(pk):
                        return False
                    if gap:
                        time.sleep(gap)
            return True
        finally:
            ring.release()
            mm.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shm", default="/dev/shm/schwung-midi-out")
    ap.add_argument("--rounds", type=int, default=4)
    ap.add_argument("--gap", type=float, default=0.03)
    ap.add_argument("--wait", type=float, default=0.0,
                    help="seconds to wait for the SHM to appear (our ring is "
                         "created during Move's boot)")
    a = ap.parse_args()

    deadline = time.monotonic() + a.wait
    while not os.path.exists(a.shm):
        if time.monotonic() >= deadline:
            return 0          # nothing to blank is not an error
        time.sleep(0.1)
    try:
        # Exit code is the caller's log line, nothing more — a nonzero here
        # never blocks a launch, it makes quiesce say WARNING instead of
        # claiming a blank that did not land (a check that cries wolf, 08-31).
        return 0 if blank(a.shm, a.rounds, a.gap) else 3
    except UnknownLayout:
        return 5              # a ring we do not know: skip it, at once
    except OSError:
        return 4              # never block a launch over LEDs


if __name__ == "__main__":
    sys.exit(main())
