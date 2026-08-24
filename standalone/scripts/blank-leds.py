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
bump `ready`. write_idx is a uint8, so ONE frame must stay under 252 bytes —
hence the chunking below. Layout (both stock and dbxhost headers):
    uint8 write_idx; uint8 ready; uint8 reserved[2]; uint8 buffer[512]

Run TWICE per launch, against the two rings, for the same reason the ticker had
two legs: stock's ring covers "selected the tool → frozen", and ours covers the
new Move's boot, with a dead gap between where the panel simply holds.
"""
import argparse, mmap, os, sys, time

HDR, BUF_SIZE, MAX_FRAME = 4, 512, 252

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


def wait_for_room(mm, need, gap):
    """Block until the shim has drained enough of the ring for `need` bytes.

    ⚠⚠ This is not a nicety. The payload is two frames, and a plain
    sleep-between-chunks DROPPED THE SECOND ONE: measured on device, the first
    252-byte frame filled the ring, the second found no room and was skipped
    silently, so the pads went dark and every BUTTON stayed lit. The ring tells
    us when it is empty — ask it instead of guessing a delay.
    """
    deadline = time.monotonic() + 2.0
    while mm[0] + need > MAX_FRAME:
        if time.monotonic() >= deadline:
            return False          # shim is not draining; nothing more to do
        time.sleep(gap if gap > 0 else 0.002)
    return True


def blank(shm_path, rounds, gap):
    with open(shm_path, "r+b") as f:
        mm = mmap.mmap(f.fileno(), HDR + BUF_SIZE)
        # Repeated deliberately. At boot we are racing the shim's first frames,
        # and an attempt that finds no room is a surface that stays lit with
        # nothing to say so. Idempotent: writing dark twice is dark.
        for _ in range(rounds):
            for pk in chunks(messages()):
                if not wait_for_room(mm, len(pk), gap):
                    return
                widx = mm[0]
                mm[HDR + widx:HDR + widx + len(pk)] = pk
                mm[0] = widx + len(pk)
                mm[1] = (mm[1] + 1) & 0xFF
                if gap:
                    time.sleep(gap)


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
        blank(a.shm, a.rounds, a.gap)
    except OSError:
        return 0              # never block a launch over LEDs
    return 0


if __name__ == "__main__":
    sys.exit(main())
