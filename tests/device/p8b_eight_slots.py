"""P8b: prove EIGHT sounding slots, and measure what they cost.

Same shape as p8_budget2.py (inventory -> clear -> prove clean -> scale the
load), widened to 8 and with the steps that matter for the doubling: 0, 4
(today's baseline) and 8. Notes are slot-ADDRESSED via the MIDI tag byte, so no
receive-channel setup is needed and a slot cannot be missed because its channel
defaulted differently at the wider count.

⚠ The idle gate makes a casual 8-slot test meaningless — a silent slot is nearly
free — so every slot in a step is struck and its publish ring is checked for a
non-zero peak. A step whose peaks are not all sounding is reported INVALID
rather than quietly averaged in.

RESULTS, 2026-08-11, CM5, zero FX, four notes per slot (read the Compute lines
from debug.log against the MARK timestamps this prints):

    idle            avg   37 us     96% headroom
    4 x obxd        avg  ~800 us     over_budget ~70-120/1000
    8 x obxd        avg  1545 us     over_budget 1000/1000   <- every frame
    8 x dexed       avg  ~232 us     75% headroom, 0 over    (see caveat)

⇒ Eight slots is real CAPACITY; whether it fits is a MODULE-CHOICE question,
which is exactly the "capacity, budget shared" ruling. obxd is the worst case
measured and its voice_count=8 default is the dominant lever.

⚠ Caveat on the dexed rows: this harness FLAGGED them INVALID, because dexed's
notes decay before the sequential peak check reaches the later slots (peak()
costs ~0.4 s per slot, so slot 7 is read ~3 s after slot 0). The compute figure
is therefore indicative, not proven — a sustaining patch would cost more. The
obxd rows ARE proven: all eight peaks were well above the threshold.

⚠ Two spikes of ~250 ms appear in the log at each step boundary. That is module
LOAD blocking the SPI callback — a known pre-existing item, not a render cost.
"""
import mmap, os, signal, struct, subprocess, sys, time

def m(name, ro=False):
    fd = os.open("/dev/shm/" + name, os.O_RDONLY if ro else os.O_RDWR)
    mm = mmap.mmap(fd, 0, prot=mmap.PROT_READ if ro else (mmap.PROT_READ | mmap.PROT_WRITE))
    os.close(fd)
    return mm

pbox = m("dbxhost-param")
mdsp = m("dbxhost-midi-dsp")
pub  = m("dbxhost-pub-audio", ro=True)

PUB_HDR, SLOT_RING = 12, 8192
SLOT_STRIDE = SLOT_RING + 12
NSLOTS = 8

def mreq(rtype, slot, key, value="", timeout=8.0):
    end = time.time() + timeout
    while pbox[0] != 0 and time.time() < end:
        time.sleep(0.005)
    if pbox[0] != 0:
        return (99, "")
    rid = (struct.unpack_from("<I", pbox, 4)[0] + 1) & 0xFFFFFFFF
    pbox[1] = slot
    kb = key.encode()[:63]
    pbox[32:96] = kb + b"\0" * (64 - len(kb))
    vb = value.encode()[:255]
    pbox[96:96 + 256] = vb + b"\0" * (256 - len(vb))
    struct.pack_into("<I", pbox, 4, rid)
    pbox[0] = rtype
    end = time.time() + timeout
    while time.time() < end:
        if struct.unpack_from("<I", pbox, 8)[0] == rid:
            n = struct.unpack_from("<i", pbox, 12)[0]
            return (pbox[3], pbox[96:96+n].split(b"\0")[0].decode(errors="replace") if n > 0 else "")
        time.sleep(0.005)
    return (98, "")

def send_midi(status, d1, d2, tag=0):
    """⚠ `write_idx` (mdsp[0]) is a BYTE LENGTH in a uint8_t — the consumer
    drains and resets it to 0 — so a batch caps at 252 bytes = 63 events, not
    the buffer's 512. Wait for room instead of overflowing it: at 8 slots a
    single strike is 32 events and fits, but the pointer accumulates across
    strikes if the drain has not run yet, and Python throws where C would
    silently wrap the header and corrupt the batch."""
    for _ in range(500):
        w = mdsp[0]
        if w + 4 <= 252:
            break
        time.sleep(0.002)
    else:
        return False
    mdsp[4 + w:8 + w] = bytes([status, d1, d2, tag])
    mdsp[0] = w + 4
    mdsp[1] = (mdsp[1] + 1) & 0xFF
    return True

def peak(slot, seconds=0.4):
    p, base, end = 0, PUB_HDR + slot * SLOT_STRIDE, time.time() + seconds
    while time.time() < end:
        vals = struct.unpack_from("<%dh" % (SLOT_RING // 2), pub, base)
        p = max(p, max(abs(v) for v in vals))
        time.sleep(0.05)
    return p

COMPS = ["synth", "fx1", "fx2", "fx3", "fx4", "midi_fx1"]
SYNTH = sys.argv[2] if len(sys.argv) > 2 else "obxd"
step  = int(sys.argv[1]) if len(sys.argv) > 1 else 22

sui = subprocess.check_output(["pgrep", "-x", "shadow_ui"]).split()[0].decode()
os.kill(int(sui), signal.SIGSTOP)
try:
    print("=== INVENTORY BEFORE ===", flush=True)
    for s in range(NSLOTS):
        row = [ "%s=%s" % (c, v) for c in COMPS
                for v in [mreq(2, s, "%s:module" % c)[1]] if v ]
        print("  slot %d: %s" % (s, ", ".join(row) if row else "(empty)"), flush=True)

    print("\n=== CLEARING ===", flush=True)
    for s in range(NSLOTS):
        for c in COMPS:
            mreq(1, s, "%s:module" % c, "")
    for k in ["master_fx:fx%d:module" % i for i in (1,2,3,4)] + \
             ["send_fx:a:fx1:module", "send_fx:b:fx1:module"]:
        mreq(1, 0, k, "")
    time.sleep(3.0)
    dirty = [ "slot%d.%s=%s" % (s, c, v) for s in range(NSLOTS) for c in COMPS
              for v in [mreq(2, s, "%s:module" % c)[1]] if v ]
    print("  residue: %s" % (dirty if dirty else "NONE — clean baseline"), flush=True)

    notes = [48, 55, 60, 64]
    def strike(n):
        for s in range(n):
            for x in notes:
                send_midi(0x90, x + s, 110, s + 1)
    def release(n):
        for s in range(n):
            for x in notes:
                send_midi(0x80, x + s, 0, s + 1)

    for n_slots in [0, 4, 8]:
        print("\n=== STEP: %d x %s, zero FX ===" % (n_slots, SYNTH), flush=True)
        for s in range(n_slots):
            mreq(1, s, "synth:module", SYNTH)
        time.sleep(5.0)
        loaded = [mreq(2, s, "synth:module")[1] for s in range(NSLOTS)]
        print("  synths: %r" % loaded, flush=True)
        print("  MARK %d %.3f" % (n_slots, time.time()), flush=True)
        strike(n_slots)
        t_end, last = time.time() + step, time.time()
        while time.time() < t_end:
            if time.time() - last > 2.0:
                release(n_slots); strike(n_slots); last = time.time()
            time.sleep(0.2)
        pk = [peak(s) for s in range(n_slots)]
        ok = (n_slots == 0) or all(p > 200 for p in pk)
        print("  peaks: %r  %s" % (pk, "OK — all sounding" if ok
                                   else "!! SOME SILENT — step INVALID"), flush=True)
        release(n_slots)
        for s in range(NSLOTS):
            mreq(1, s, "synth:module", "")
        time.sleep(2.5)
finally:
    os.kill(int(sui), signal.SIGCONT)
print("\ndone", flush=True)
