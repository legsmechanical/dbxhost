#!/usr/bin/env python3
"""LED channel atlas — runs ON the Move inside a live dAVEBOx session.

Writes raw LED packets into the shadow-UI -> shim MIDI-out ring
(/dev/shm/dbxhost-midi-out: uint16 write_idx, uint16 read_idx, 512-byte buffer),
the same ring shadow_ui's move_midi_internal_send fills, so the packets take the
real path to the hardware with their status channel intact. shadow_ui is the
ring's only producer, so it is SIGSTOPped for the ~1 ms of the write.

  python3 led_atlas_device.py atlas      # pads 68..82: colour A on ch0, then colour B on ch 1..15
  python3 led_atlas_device.py off        # every atlas pad plain off (stops any animation)
  python3 led_atlas_device.py one <ch> <pad> <from> <to>

Pad n (68+k) shows channel k+1. Bottom row left->right = channels 1..8,
second row = 9..15. Pad 83 = control: same two colours, channel 0 (snap).
"""
import mmap, os, signal, struct, subprocess, sys, time

RING = "/dev/shm/dbxhost-midi-out"
BUF = 512

def shadow_ui_pids():
    out = subprocess.run(["pidof", "shadow_ui"], capture_output=True, text=True).stdout.split()
    return [int(p) for p in out]

def push(packets):
    data = b"".join(bytes(p) for p in packets)
    pids = shadow_ui_pids()
    for p in pids: os.kill(p, signal.SIGSTOP)
    try:
        with open(RING, "r+b") as f:
            mm = mmap.mmap(f.fileno(), 4 + BUF)
            w, r = struct.unpack_from("<HH", mm, 0)
            used = (w - r) & 0xFFFF
            if used + len(data) > BUF - 4:
                raise SystemExit("ring full (%d used)" % used)
            pos = w & (BUF - 1)
            first = min(BUF - pos, len(data))
            mm[4 + pos:4 + pos + first] = data[:first]
            if first < len(data):
                mm[4:4 + len(data) - first] = data[first:]
            struct.pack_into("<H", mm, 0, (w + len(data)) & 0xFFFF)
            mm.flush()
    finally:
        for p in pids: os.kill(p, signal.SIGCONT)

def note(ch, n, v): return [0x09, 0x90 | ch, n, v]

A, B = 120, 1          # White -> Bright Red
cmd = sys.argv[1] if len(sys.argv) > 1 else "atlas"
if cmd == "atlas":
    # start colour on channel 0 for every atlas pad, settle, then the target on its channel
    push([note(0, 68 + k, A) for k in range(16)])
    time.sleep(0.3)
    pk = [note(k + 1, 68 + k, B) for k in range(15)] + [note(0, 83, B)]
    push(pk)
    print("atlas sent: pads 68-82 = channels 1-15 (White -> Bright Red), pad 83 = channel 0 control")
elif cmd == "off":
    push([note(0, 68 + k, 0) for k in range(16)])
    print("atlas pads off")
elif cmd == "one":
    ch, pad, a, b = map(int, sys.argv[2:6])
    push([note(0, pad, a)]); time.sleep(0.3); push([note(ch, pad, b)])
    print("pad", pad, "ch", ch, a, "->", b)
