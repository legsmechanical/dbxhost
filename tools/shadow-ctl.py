#!/usr/bin/env python3
"""Dump the ownership-relevant fields of shadow_control_t from a live session.

Run it ON the device (python3 is present):

    python3 shadow-ctl.py            # this build's SHM namespace, e.g. dbxhost-control
    python3 shadow-ctl.py schwung    # a stock install running alongside

It answers the question that is otherwise invisible without the OLED in front
of you: WHO owns each hardware surface right now. That matters because the
surfaces are separable, and a session that comes up wrong usually comes up
half-wired rather than dead:

    overtake_mode          2 = the module owns every event
    corun.target           0 = none, 1 = chain editor, 2 = Move firmware.
                           A live co-run with a keep-mask is what "the pads are
                           the module's but the OLED and knobs are Move's"
                           looks like from here.
    corun.keep_mask        which CORUN_GRP_* the module KEEPS; the rest cede
    shadow_display_owner   who draws the OLED (1 = shadow UI, 0 = Move)
    vol_block/edit_cc_block/pad_block   the runtime input claims

Offsets mirror src/host/shadow_constants.h. They are checked against the
segment size on read, so a struct change that moves fields is loud here rather
than silently reporting the wrong bytes.
"""
import struct
import sys

CONTROL_BUFFER_SIZE = 88  # keep in step with shadow_constants.h

prefix = sys.argv[1] if len(sys.argv) > 1 else "dbxhost"
path = "/dev/shm/%s-control" % prefix
try:
    with open(path, "rb") as f:
        b = f.read()
except OSError as e:
    print("no control segment at %s (%s) — no session of that flavour is live" % (path, e))
    sys.exit(1)

if len(b) != CONTROL_BUFFER_SIZE:
    print("WARNING: %s is %d bytes, expected %d — this build's struct differs from"
          " this script's offsets; treat every value below as suspect."
          % (path, len(b), CONTROL_BUFFER_SIZE))

u8 = lambda o: b[o] if o < len(b) else None
i8 = lambda o: struct.unpack_from("b", b, o)[0] if o < len(b) else None
u32 = lambda o: struct.unpack_from("<I", b, o)[0] if o + 4 <= len(b) else None

for name, val in [
    ("display_mode", u8(0)),
    ("shadow_ready", u8(1)),
    ("should_exit", u8(2)),
    ("vol_block", u8(10)),
    ("edit_cc_block", u8(11)),
    ("shim_counter", u32(16)),
    ("overtake_mode", u8(22)),
    ("skip_led_clear", u8(45)),
    ("pad_block", u8(54)),
    ("suspend_overtake", u8(55)),
    ("open_tool_cmd", u8(56)),
    ("corun.target", i8(68)),
    ("corun.id", i8(69)),
    ("corun.flags", u8(70)),
    ("corun.keep_mask", u32(72)),
    ("corun.led_keep_mask", u32(76)),
    ("shadow_display_owner", u8(80)),
    ("overtake_suppress_sysex", u8(81)),
    ("canvas_input", u8(82)),
    ("select_phase", u8(83)),
]:
    if val is None:
        continue
    shown = hex(val) if name.endswith("keep_mask") else val
    print("%-24s %s" % (name, shown))
