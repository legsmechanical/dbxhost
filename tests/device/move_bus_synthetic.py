#!/usr/bin/env python3
"""Move-bus regression harness — synthetic Link Audio input.

WHY THIS EXISTS
---------------
Every other audio path in this host has an automated check: the module matrix
loads a module into a slot, sends it MIDI, and asserts audio appears. The Move
FX buses had none, because their input is audio produced by MOVE'S OWN
FIRMWARE — a separate closed-source process we cannot make sound from a script.
So every Move-bus behaviour could break silently: the ME publish, the strip
fader, the sends, and worst of all an idle gate that fails to WAKE (a Move track
would simply never come back).

This harness IMPERSONATES THE SIDECAR. The Link Audio input is a plain ring of
interleaved int16 in shared memory with a write_pos and an `active` flag, so we
write a known signal into it ourselves and assert what comes out the other end.
Move is not involved at all, which is what makes it deterministic.

SCOPE, honestly stated: this covers the shim's bus path — the code Stage 1 of
the unified slot model rewrites. It does NOT cover link-subscriber or Move
itself. That is the right split: the sidecar is code we don't change, and a
real listen is still the final word on how it sounds.

STATUS 2026-08-10 — ALL PASS (5/5) on hardware. What it proves about Stage 1a:
  - Move-bus audio reaches the AUDIBLE mix (synthetic 8000 in -> 7999 out);
  - the strip volume fader applies EXACTLY (0.25 -> ratio 0.250) — this is the
    fader that was pinned to unity before Move>Slot was retired;
  - the idle gate sleeps on silence, and WAKES in 7-9 ms. That is the risky
    half of the new gate: a bus's input is audio with no wake event, so a
    periodic probe would have taken up to ~500 ms. Measured, not argued.

⭑ It asserts on the MASTER publish slot, not the per-slot one. The per-slot ring
is a side channel (the ME-N republish); the audible path is the mailbox, which
the master slot carries. Pointing at the per-slot ring measured the one thing
that ISN'T the sound, and read zero for it.

Known gaps this harness surfaced, both for Stage 1b:
  - the per-slot ME republish reads 0 for a Move bus. Suspected cause: the
    publish gate keys off `!slot_active`, but shadow_chain_slots[].instance is
    the CHAIN instance, which exists for every slot regardless of whether a
    sound generator is loaded. Does not affect audio.
  - ~~there is NO getter for move_fx:* keys~~ **WRONG — CORRECTED 2026-08-11.**
    fx_slot_param_rest() has served the GET side since 0d6402b6 (June): :module
    returns the DSP path, :name the module id, :bypassed / :chain_params and the
    strip levels all read. Probed on hardware with shadow_ui SIGSTOPped (the
    running UI races you for the param mailbox and every request times out,
    which itself looks like "unimplemented"). The empty readback below was an
    EMPTY BUS. ⚠ The asymmetry IS real: a bus insert loads by DSP PATH, a chain
    component by module ID — but passing an id fails LOUDLY (error 7).

⚠ `la_starve_fallback` still climbs on a minority of frames even at an exact
feed rate — Python's timing is coarse against a narrow starve/catch-up window.
It does not stop the audio and the assertions pass regardless; a C feeder would
give a cleaner signal if this ever needs to be precise.

RUN: on the device, inside a live dAVEBOx SA session:
    ssh ableton@move.local 'cd /data/UserData/dbx-host && python3 move_bus_synthetic.py'
"""
import mmap, os, math, shutil, signal, struct, subprocess, sys, threading, time

INSTALL_DIR = "/data/UserData/dbx-host"

# --- Link Audio INPUT ring (we are the producer) ----------------------------
# link_audio_in_shm_t: magic u32, version u32, then LINK_AUDIO_IN_SLOT_COUNT
# slots of { int16 ring[4096]; u32 write_pos; u32 read_pos; int active;
#            char name[32]; 7x u32 stats; u32 pad }
IN_RING_SAMPLES = 4096
IN_SLOT_STRIDE = IN_RING_SAMPLES * 2 + 4 + 4 + 4 + 32 + 28 + 4   # 8268
IN_HDR = 8
IN_MAGIC = 0x4C41494E

# --- pub-audio OUTPUT ring (the shim is the producer) -----------------------
PUB_HDR = 12
PUB_RING_BYTES = 8192
PUB_RING_SAMPLES = PUB_RING_BYTES // 2
PUB_SLOT_STRIDE = PUB_RING_BYTES + 4 + 4 + 4

SLOT = 0          # chain slot 0 == Move track 1 == Move bus 1
BUS = 1           # move_fx: keys are 1-based
# ⭑ Assertions read the MASTER publish slot, not the per-slot one.
# The per-slot ring is a SIDE CHANNEL (the ME-N republish); the audible path is
# the mailbox, and the master slot carries it: the shim publishes
# native_bridge_me_component there, which is me_full — and the Move bus loop
# adds its post-insert, post-strip-volume signal straight into me_full. Its
# write is gated only on Link Audio being enabled, with no `active` check, so
# it is observable whatever the per-slot publish gate decides.
MASTER = 4        # LINK_AUDIO_PUB_MASTER_IDX
AMPL = 8000       # synthetic signal amplitude, comfortably above DSP_SILENCE_LEVEL


def m(name, ro=False):
    fd = os.open("/dev/shm/" + name, os.O_RDONLY if ro else os.O_RDWR)
    mm = mmap.mmap(fd, 0, prot=mmap.PROT_READ if ro else (mmap.PROT_READ | mmap.PROT_WRITE))
    os.close(fd)
    return mm


pbox = m("dbxhost-param")
pub = m("dbxhost-pub-audio", ro=True)
# ⚠ The link-in segment does not exist until Link Audio routing is enabled —
# the shim creates it as the consumer. So it is mapped in main(), after the
# routing param is set, not at import.
lain = None


def mreq(rtype, slot, key, value="", timeout=10.0):
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
            return (pbox[3], pbox[96:96 + n].split(b"\0")[0].decode(errors="replace") if n > 0 else "")
        time.sleep(0.005)
    return (98, "")


def in_base(s):
    return IN_HDR + s * IN_SLOT_STRIDE


def in_set_active(s, on):
    struct.pack_into("<i", lain, in_base(s) + PUB_RING_BYTES + 8, 1 if on else 0)


def in_positions(s):
    b = in_base(s) + PUB_RING_BYTES
    return struct.unpack_from("<II", lain, b)


def pub_write_pos(s):
    return struct.unpack_from("<I", pub, PUB_HDR + s * PUB_SLOT_STRIDE + PUB_RING_BYTES)[0]


def pub_samples(s, start, end):
    """Samples written to slot s's pub ring in [start, end), oldest-safe."""
    base = PUB_HDR + s * PUB_SLOT_STRIDE
    out = []
    n = end - start
    if n <= 0:
        return out
    n = min(n, PUB_RING_SAMPLES)
    for i in range(end - n, end):
        off = base + (i % PUB_RING_SAMPLES) * 2
        out.append(struct.unpack_from("<h", pub, off)[0])
    return out


def pub_peak(s, seconds):
    """Peak of only the samples produced during this window."""
    w0 = pub_write_pos(s)
    time.sleep(seconds)
    w1 = pub_write_pos(s)
    vals = pub_samples(s, w0, w1)
    return (max(abs(v) for v in vals) if vals else 0), (w1 - w0)


# --- the feeder: we are the sidecar ----------------------------------------
class Feeder(threading.Thread):
    """Writes a sine into slot SLOT's input ring, self-clocked off the shim's
    read_pos so we keep a small lead instead of racing or starving it."""

    # ⚠ Must sit between the reader's starve floor and its catch-up ceiling.
    # It reads 256 samples (128 stereo frames) per block and fires a catch-up
    # JUMP — discarding samples — once avail > need*4 == 1024. A 1024 lead sits
    # exactly on that ceiling and got our data dropped every frame, which
    # presented as a permanent starve fallback with rebuild never producing.
    LEAD_SAMPLES = 640         # > 256 need, < 1024 catch-up ceiling

    def __init__(self):
        super().__init__(daemon=True)
        self.amplitude = 0
        self.stop_flag = False
        self.phase = 0.0

    def run(self):
        base = in_base(SLOT)
        wp, _ = in_positions(SLOT)
        while not self.stop_flag:
            _, rp = in_positions(SLOT)
            target = rp + self.LEAD_SAMPLES
            wrote = False
            while (wp - target) & 0x80000000 or wp < target:
                a = self.amplitude
                # stereo frame
                v = int(a * math.sin(self.phase)) if a else 0
                self.phase += 2 * math.pi * 220.0 / 44100.0
                if self.phase > 2 * math.pi:
                    self.phase -= 2 * math.pi
                for _ in range(2):
                    struct.pack_into("<h", lain, base + (wp % IN_RING_SAMPLES) * 2, v)
                    wp += 1
                wrote = True
                if wp >= target:
                    break
            if wrote:
                struct.pack_into("<I", lain, base + PUB_RING_BYTES, wp & 0xFFFFFFFF)
            time.sleep(0.001)


results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print("  %-52s %s %s" % (label, "PASS" if cond else "FAIL", detail), flush=True)


def main():
    global lain
    sub_path = os.path.join(INSTALL_DIR, "link-subscriber")
    parked = sub_path + ".harness-parked"
    sui = subprocess.check_output(["pgrep", "-x", "shadow_ui"]).split()[0].decode()
    os.kill(int(sui), signal.SIGSTOP)
    feeder = Feeder()
    moved = False
    try:
        # ⚠ ORDER MATTERS. The SIDECAR creates the link-in segment, not the
        # shim — so it has to run first, or there is no ring to write into.
        # Then we take it over: park the binary (so the monitor's ~10 Hz retry
        # cannot relaunch it) and SIGKILL it (so it does not unlink the segment
        # on the way out). From then on we are the only producer, and the shim
        # cannot tell the difference.
        mreq(1, 0, "master_fx:link_audio_routing", "1")
        for _ in range(50):
            if os.path.exists("/dev/shm/dbxhost-link-in"):
                break
            time.sleep(0.2)
        if not os.path.exists("/dev/shm/dbxhost-link-in"):
            print("FATAL: link-in never appeared — the sidecar did not start, so "
                  "there is no ring to impersonate", file=sys.stderr)
            return 2
        if os.path.exists(sub_path):
            shutil.move(sub_path, parked)
            moved = True
        subprocess.run(["pkill", "-9", "-x", "link-subscriber"], capture_output=True)
        time.sleep(1.0)
        lain = m("dbxhost-link-in")
        magic = struct.unpack_from("<I", lain, 0)[0]
        if magic != IN_MAGIC:
            print("FATAL: link-in magic %08X != %08X — layout drifted"
                  % (magic, IN_MAGIC), file=sys.stderr)
            return 2

        for c in ["synth", "fx1", "fx2", "fx3", "fx4", "midi_fx1"]:
            mreq(1, SLOT, "%s:module" % c, "")
        mreq(1, 0, "move_fx:%d:fx1:module" % BUS, "")
        mreq(1, 0, "move_fx:%d:volume" % BUS, "1.0")
        mreq(1, 0, "move_fx:%d:send_a" % BUS, "0")
        mreq(1, 0, "move_fx:%d:send_b" % BUS, "0")
        for s in range(4):
            in_set_active(s, True)
        time.sleep(2.0)

        feeder.start()
        feeder.amplitude = AMPL
        time.sleep(2.0)

        print("\n=== 0. preconditions (why a zero result would be zero) ===", flush=True)
        act = [struct.unpack_from("<i", lain, in_base(i) + PUB_RING_BYTES + 8)[0] for i in range(4)]
        w0, r0 = in_positions(SLOT)
        time.sleep(1.0)
        w1, r1 = in_positions(SLOT)
        print("  in-ring slot0: write +%d/s  read +%d/s   active=%r" % (w1 - w0, r1 - r0, act), flush=True)
        print("  (read advancing => the shim is consuming our synthetic input)", flush=True)
        pw0 = pub_write_pos(SLOT)
        time.sleep(1.0)
        print("  pub-ring slot0: write +%d/s (side channel)" % (pub_write_pos(SLOT) - pw0), flush=True)
        pm0 = pub_write_pos(MASTER)
        time.sleep(1.0)
        print("  pub-ring MASTER: write +%d/s (the audible mix)" % (pub_write_pos(MASTER) - pm0), flush=True)
        try:
            log = open("/data/UserData/dbx-host/debug.log", errors="replace").read()[-40000:]
            for key in ("Link Audio routing:", "rebuild_flips", "Link Audio DISABLED"):
                hits = [l for l in log.splitlines() if key in l]
                if hits:
                    print("  log: %s" % hits[-1].strip()[:120], flush=True)
        except Exception:
            pass

        print("\n=== 1. synthetic Move audio reaches the AUDIBLE mix ===", flush=True)
        unity, produced = pub_peak(MASTER, 1.5)
        check("bus audio present in the master mix", unity > 1000,
              "peak=%d over %d samples" % (unity, produced))
        slotpk, _ = pub_peak(SLOT, 0.8)
        print("     (informational) per-slot ME republish peak=%d — a separate"
              % slotpk, flush=True)
        print("     side channel from the audible path; see the publish-gate note.", flush=True)
        if unity <= 1000:
            print("     (nothing downstream can be judged without this — stopping)", flush=True)
            return 1

        print("\n=== 2. the strip volume fader applies ===", flush=True)
        mreq(1, 0, "move_fx:%d:volume" % BUS, "0.25")
        time.sleep(1.0)
        quarter, _ = pub_peak(MASTER, 1.5)
        ratio = quarter / float(unity)
        check("volume 0.25 scales output to ~1/4", 0.15 < ratio < 0.40,
              "ratio=%.3f (%d vs %d)" % (ratio, quarter, unity))
        mreq(1, 0, "move_fx:%d:volume" % BUS, "1.0")
        time.sleep(1.0)

        print("\n=== 3. idle gate SLEEPS on silence ===", flush=True)
        feeder.amplitude = 0
        time.sleep(2.5)                      # > DSP_IDLE_THRESHOLD (~1 s)
        slept, _ = pub_peak(MASTER, 1.0)
        check("output silent after input goes quiet", slept < 200, "peak=%d" % slept)

        print("\n=== 4. idle gate WAKES within a block, not a probe window ===", flush=True)
        # The risky half: a bus's input is audio with no wake event. A periodic
        # probe would take up to ~0.5 s to notice; scanning the input every
        # block must notice within a few milliseconds.
        w0 = pub_write_pos(MASTER)
        t0 = time.time()
        feeder.amplitude = AMPL
        woke_at = None
        while time.time() - t0 < 1.0:
            w1 = pub_write_pos(MASTER)
            vals = pub_samples(MASTER, w0, w1)
            if vals and max(abs(v) for v in vals) > 1000:
                woke_at = time.time() - t0
                break
            time.sleep(0.002)
        check("wakes promptly on new audio", woke_at is not None and woke_at < 0.15,
              "latency=%s" % ("%.0f ms" % (woke_at * 1000) if woke_at else "NEVER"))

        print("\n=== 5. an insert FX on the bus processes the signal ===", flush=True)
        # ⚠ ASYMMETRY worth knowing for the davebox Move-flavour UI: a Move bus
        # insert is loaded by DSP PATH (shadow_move_fx_slot_load dlopens it),
        # whereas a chain component takes a module ID. Passing an id here loads
        # nothing and reports no error — which is exactly what this test did on
        # its first run.
        FX_PATH = "/data/UserData/schwung/modules/audio_fx/pushnpull/dsp.so"
        before, _ = pub_peak(MASTER, 1.0)
        mreq(1, 0, "move_fx:%d:fx1:module" % BUS, FX_PATH)
        time.sleep(3.0)
        loaded = mreq(2, 0, "move_fx:%d:fx1:module" % BUS)[1]
        after, _ = pub_peak(MASTER, 1.5)
        # ⚠ NOT an assertion: there is NO getter for move_fx:* keys in the host
        # (grep shadow_chain_mgmt.c — the SET side is parsed in two places, the
        # GET side nowhere), so this readback is always "". That is the
        # empty-param-readback trap, and it is a real gap Stage 1b must close:
        # the davebox Move-flavour sound mode has to SHOW which module is on
        # each bus block, and today it cannot ask.
        print("     (informational) module readback=%r — the host has no move_fx"
              " getter yet; Stage 1b needs one." % loaded, flush=True)
        check("stream survives loading an insert", after > 200, "peak=%d" % after)
        mreq(1, 0, "move_fx:%d:fx1:module" % BUS, "")
        time.sleep(1.5)

    finally:
        feeder.stop_flag = True
        time.sleep(0.2)
        try:
            mreq(1, 0, "move_fx:%d:volume" % BUS, "1.0")
            mreq(1, 0, "move_fx:%d:fx1:module" % BUS, "")
            mreq(1, 0, "master_fx:link_audio_routing", "0")
        except Exception:
            pass
        if moved and os.path.exists(parked):
            shutil.move(parked, sub_path)
        os.kill(int(sui), signal.SIGCONT)

    print("\nMOVE BUS: %s (%d/%d)"
          % ("ALL PASS" if all(results) else "HAS FAILURES", sum(results), len(results)),
          flush=True)
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
