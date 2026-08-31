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
every SPI frame and turns cable-0 messages into LED writes. shadow_ui has
exited by the time we run, so we are the sole producer. The consumer snapshots
write_idx, resets it to 0 and wipes the buffer, so we append at write_idx and
bump `ready`. Layout (upstream v1.0.0 and dbxhost, since the uint16 widening):
    uint16 write_idx (LE); uint8 ready; uint8 reserved[1]; uint8 buffer[512]

⚠⚠ THE LAYOUT IS LOAD-BEARING AND IT ALREADY BIT. This script was written
against the OLD header (uint8 write_idx at 0, ready at 1). Upstream v1.0.0
widened write_idx to uint16 — taking the byte `ready` lived in — and both the
08-30 stock update and our own backport shipped it. Against the new layout the
old "ready bump" at byte 1 actually corrupted write_idx's HIGH byte, the real
ready at byte 2 never changed, and the shim's `ready == last_ready` gate never
opened: NO DRAIN, EVER — every wait burned its full 2 s ceiling, the launch
gained ~4 s, and the pads held the lit stock menu through the splash
(regression Josh reported 2026-08-31). The offsets below are pinned against
shadow_constants.h by tests/host/test_blank_leds_layout.sh.

Run TWICE per launch, against the two rings, for the same reason the ticker had
two legs: stock's ring covers "selected the tool → frozen", and ours covers the
new Move's boot, with a dead gap between where the panel simply holds.
"""
import argparse, mmap, os, sys, time

HDR, BUF_SIZE = 4, 512
WIDX_LO, WIDX_HI, READY_OFF = 0, 1, 2   # uint16 LE write_idx; ready at byte 2
MAX_FRAME = 508                          # multiple of 4, <= BUF_SIZE

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


def chunks(payload):
    """Split into frames the uint8 write_idx can actually address."""
    per = (MAX_FRAME // 4) * 4
    return [payload[i:i + per] for i in range(0, len(payload), per)]


def read_widx(mm):
    return mm[WIDX_LO] | (mm[WIDX_HI] << 8)


def write_widx(mm, v):
    mm[WIDX_LO] = v & 0xFF
    mm[WIDX_HI] = (v >> 8) & 0xFF


def wait_for_room(mm, need, gap):
    """Block until the shim has drained enough of the ring for `need` bytes.

    ⚠⚠ This is not a nicety. A plain sleep-between-chunks DROPPED a frame:
    measured on device, the first frame filled the ring, the second found no
    room and was skipped silently, so the pads went dark and every BUTTON
    stayed lit. The ring tells us when it is empty — ask it, not a delay.
    """
    deadline = time.monotonic() + 2.0
    while read_widx(mm) + need > MAX_FRAME:
        if time.monotonic() >= deadline:
            return False          # shim is not draining; nothing more to do
        time.sleep(gap if gap > 0 else 0.002)
    return True


def blank(shm_path, rounds, gap):
    """Returns True when every write landed; False when the shim stopped
    draining and part of the payload was abandoned — the caller's log line
    must not say "blanked" for a surface that is still lit."""
    with open(shm_path, "r+b") as f:
        mm = mmap.mmap(f.fileno(), HDR + BUF_SIZE)
        # Repeated deliberately. At boot we are racing the shim's first frames,
        # and an attempt that finds no room is a surface that stays lit with
        # nothing to say so. Idempotent: writing dark twice is dark.
        for _ in range(rounds):
            for pk in chunks(messages()):
                if not wait_for_room(mm, len(pk), gap):
                    return False
                widx = read_widx(mm)
                mm[HDR + widx:HDR + widx + len(pk)] = pk
                write_widx(mm, widx + len(pk))
                mm[READY_OFF] = (mm[READY_OFF] + 1) & 0xFF
                if gap:
                    time.sleep(gap)
    return True


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
    except OSError:
        return 4              # never block a launch over LEDs


if __name__ == "__main__":
    sys.exit(main())
