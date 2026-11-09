#!/usr/bin/env bash
# A MODULE'S UI DESCRIPTION REACHES THE BROWSER (ui_publish_shm.h). display-server
# is built with its SHM paths pointed at plain files; this script plays the
# writer (shadow_ui's host_ui_publish) and reads /stream-auto?v=2 raw:
#
#   1. a document becomes `event: ui`, byte for byte; `uistate` says alive
#   2. a v=2 viewer stamps viewer_ms (how the module learns someone watches);
#      bare /stream-auto (an old page) gets neither ui nor uistate
#   3. a new document (new even seq) is sent; an unchanged seq is not re-sent
#   4. a document holding a raw newline is skipped, never split across events
#   5. an odd seq (mid-write) is never read
#   6. the writer going quiet (last_update_ms ages) flips uistate to alive:0
#   7. the segment re-made under the same name (new inode) is re-opened
#   8. LATENCY: a document reaches the page within the UI fast path (8 ms poll),
#      not at the next 33 ms frame -- median of 20 publishes under 20 ms
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v python3 >/dev/null || { echo "FAIL: python3 is required"; exit 1; }
CC=${CC:-cc}
T=$(mktemp -d "${TMPDIR:-/tmp}/ui_publish.XXXXXX")
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T"' EXIT
"$CC" -O1 -Isrc -Isrc/host \
    -DSHM_PATH="\"$T/live\"" -DNORNS_SHM_PATH="\"$T/norns\"" \
    -DSURFACE_LIVE_SHM_PATH="\"$T/surface\"" -DE16_MIRROR_SHM_PATH="\"$T/e16\"" \
    -DAUDIO_LIVE_SHM_PATH="\"$T/audio\"" -DUI_PUBLISH_SHM_PATH="\"$T/ui\"" -DSHM_RETRY_MS=150 \
    -o "$T/ds" src/host/display_server.c src/host/unified_log.c -lpthread

T="$T" python3 - <<'EOF'
import mmap, os, socket, struct, subprocess, sys, threading, time
T = os.environ["T"]; PORT = 19000 + os.getpid() % 2000
SIZE = 16384 + 8
def mono_ms(): return int(time.clock_gettime(time.CLOCK_MONOTONIC) * 1000)
with open(T + "/live", "wb") as f: f.write(b"\0" * 1024)
def make_seg():
    with open(T + "/ui.new", "wb") as f: f.write(b"\0" * SIZE)
    os.replace(T + "/ui.new", T + "/ui")           # new inode under the same name
    fh = open(T + "/ui", "r+b"); m = mmap.mmap(fh.fileno(), SIZE)
    m[0:8] = b"UIPUB1\0\0"; m[8:12] = struct.pack("<I", 1)
    return fh, m
fh, seg = make_seg()
seq = [0]; alive = [True]
def publish(doc, odd=False):
    b = doc.encode()
    seg[12:16] = struct.pack("<I", seq[0] | 1)
    seg[40:40 + len(b)] = b; seg[32:36] = struct.pack("<I", len(b))
    seg[16:24] = struct.pack("<Q", mono_ms())
    if not odd:
        seq[0] = (seq[0] | 1) + 1; seg[12:16] = struct.pack("<I", seq[0])
def keepalive():
    while True:
        if alive[0]: seg[16:24] = struct.pack("<Q", mono_ms())
        time.sleep(0.2)
threading.Thread(target=keepalive, daemon=True).start()
publish('{"v":1,"seq":1,"where":{"screen":"track.bank"}}')
srv = subprocess.Popen([T + "/ds", str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(50):
    try: socket.create_connection(("127.0.0.1", PORT)).close(); break
    except OSError: time.sleep(0.1)
def stream(path):
    s = socket.create_connection(("127.0.0.1", PORT))
    s.sendall(f"GET {path} HTTP/1.1\r\nHost: x\r\n\r\n".encode()); s.settimeout(0.2); return s
def events(s, secs):
    buf = b""; t0 = time.time()
    while time.time() - t0 < secs:
        try: d = s.recv(1 << 16)
        except socket.timeout: continue
        if not d: break
        buf += d
    out = []
    for blk in buf.split(b"\n\n"):
        name = None; data = b""
        for ln in blk.split(b"\n"):
            if ln.startswith(b"event: "): name = ln[7:].decode()
            elif ln.startswith(b"data: "): data = ln[6:]
        if name: out.append((name, data.decode(errors="replace")))
    return out
fails = []
def check(name, cond, why=""):
    print(("  ok   — " if cond else "  FAIL — ") + name + ("" if cond else "  " + why)); cond or fails.append(name)

time.sleep(0.4)                                    # the reader opens the segment
v2 = stream("/stream-auto?v=2"); old = stream("/stream-auto")
ev = events(v2, 1.0); evo = events(old, 1.0)
uis = [d for n, d in ev if n == "ui"]
check("1 document arrives as event: ui", uis and uis[0] == '{"v":1,"seq":1,"where":{"screen":"track.bank"}}', repr(uis[:1]))
check("1 uistate alive", ('uistate', '{"alive":1}') in ev, repr([e for e in ev if e[0] == "uistate"]))
vm = struct.unpack("<Q", seg[24:32])[0]
check("2 a v=2 viewer stamps viewer_ms", vm and mono_ms() - vm < 1000, str(vm))
check("2 an old page gets no ui/uistate", not any(n in ("ui", "uistate") for n, _ in evo), repr(evo[:3]))
check("3 an unchanged document is not re-sent", len(uis) == 1, str(len(uis)))
publish('{"v":1,"seq":2}')
ev = events(v2, 0.6)
check("3 a new document is sent", [d for n, d in ev if n == "ui"] == ['{"v":1,"seq":2}'], repr(ev))
publish('{"v":1,\n"seq":3}')
ev = events(v2, 0.6)
check("4 a raw newline is skipped", not [d for n, d in ev if n == "ui"], repr(ev))
publish('{"v":1,"seq":4}', odd=True)
ev = events(v2, 0.6)
check("5 an odd seq is never read", not [d for n, d in ev if n == "ui"], repr(ev))
seq[0] = (seq[0] | 1) + 1; seg[12:16] = struct.pack("<I", seq[0])
ev = events(v2, 0.6)
check("5 ...and is read once even", [d for n, d in ev if n == "ui"] == ['{"v":1,"seq":4}'], repr(ev))
lat = []
for k in range(20):
    time.sleep(0.037 + (k % 5) * 0.006)            # land at different phases of the 33 ms frame
    doc = '{"v":1,"lat":%d}' % k
    t0 = time.perf_counter(); publish(doc); buf = b""
    while doc.encode() not in buf and time.perf_counter() - t0 < 0.5:
        try: buf += v2.recv(1 << 16)
        except socket.timeout: pass
    lat.append((time.perf_counter() - t0) * 1000)
lat.sort(); med = lat[len(lat) // 2]
check("8 median latency %.1f ms (max %.1f) < 20 ms" % (med, lat[-1]), med < 20, str([round(x, 1) for x in lat]))
alive[0] = False
ev = events(v2, 3.8)
check("6 a quiet writer flips uistate to alive:0", ('uistate', '{"alive":0}') in ev, repr([e for e in ev if e[0] == "uistate"]))
alive[0] = True
seg.close(); fh.close(); fh, seg = make_seg(); seq[0] = 0
publish('{"v":1,"seq":5,"remade":true}')
ev = events(v2, 1.2)
check("7 a re-made segment is re-opened", '{"v":1,"seq":5,"remade":true}' in [d for n, d in ev if n == "ui"], repr(ev))
check("7 ...and is alive again", ('uistate', '{"alive":1}') in ev, repr([e for e in ev if e[0] == "uistate"]))
srv.terminate()
print("PASS: test_ui_publish_stream.sh" if not fails else "FAIL: test_ui_publish_stream.sh (" + ", ".join(fails) + ")")
sys.exit(1 if fails else 0)
EOF
