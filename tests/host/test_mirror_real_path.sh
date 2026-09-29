#!/usr/bin/env bash
# THE MIRROR'S WHOLE PATH, END TO END: what the shim decodes is what the page
# reads. The other mirror tests each pin one seam (the scanners, the stream
# framing, the offset table); this one sends a real gesture through all of
# them at once:
#
#   USB-MIDI packets -> surface_live_scan_out/scan_in (the shim's decoders,
#   the same inline functions it calls) -> surface_live_shm_t in a file ->
#   the real display_server.c, read by seq-lock -> /stream-auto?v=2
#   `surface` event -> base64 -> decoded with the OFF table parsed from
#   schwung-manager/static/mirror.html, as the browser does.
#
# The gesture: a pad LED lit by note-on, a button's RGB LED sent as SysEx
# split across two SPI frames (as Move sends them), Shift held, pad 1 pressed.
set -euo pipefail
cd "$(dirname "$0")/../.."
# A missing tool is a FAILURE here, never a skip: a skip prints like a pass.
command -v python3 >/dev/null || { echo "FAIL: python3 is required"; exit 1; }
CC=${CC:-cc}
T=$(mktemp -d "${TMPDIR:-/tmp}/mirror_path.XXXXXX")
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T"' EXIT

cat > "$T/w.c" <<'C'
#include <fcntl.h>
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>
#include "surface_live_shm.h"
static surface_live_writer_t W;
static void out(surface_live_shm_t *s, const uint8_t (*pk)[4], int n) {
    uint8_t buf[80] = {0};                       /* HW_MIDI_OUT_SIZE */
    for (int i = 0; i < n; i++) for (int j = 0; j < 4; j++) buf[i * 4 + j] = pk[i][j];
    surface_live_scan_out(s, &W, buf, sizeof buf);
}
static void in(surface_live_shm_t *s, const uint8_t (*pk)[4], int n) {
    uint8_t buf[248] = {0};                      /* 8-byte stride + timestamp */
    for (int i = 0; i < n; i++) for (int j = 0; j < 4; j++) buf[i * 8 + j] = pk[i][j];
    surface_live_scan_in(s, &W, buf, sizeof buf);
}
int main(void) {
    int fd = open(SURFACE_LIVE_SHM_PATH, O_RDWR | O_CREAT | O_TRUNC, 0600);
    if (fd < 0 || ftruncate(fd, sizeof(surface_live_shm_t)) != 0) return 2;
    surface_live_shm_t *s = mmap(NULL, sizeof *s, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (s == MAP_FAILED) return 2;
    surface_live_init(s, &W);
    const uint8_t f1[][4] = {
        { 0x09, 0x90, 68, 5 },                                   /* pad 1 LED, colour 5 */
        { 0x04, 0xf0, 0x00, 0x21 }, { 0x04, 0x1d, 0x01, 0x01 },  /* RGB SysEx, CC ch,  */
        { 0x04, 0x3b, 0x10, 0x28 },                              /* idx 0x28 ...       */
    };
    const uint8_t f2[][4] = {                                    /* ... next frame */
        { 0x04, 0x62, 0x00, 0x7f }, { 0x04, 0x01, 0x54, 0x00 }, { 0x05, 0xf7, 0x00, 0x00 },
    };
    const uint8_t press[][4] = { { 0x0B, 0xB0, 49, 127 }, { 0x09, 0x90, 68, 100 } };
    out(s, f1, 4); in(s, press, 0);
    out(s, f2, 3); in(s, press, 2);
    msync(s, sizeof *s, MS_SYNC);
    return 0;
}
C
"$CC" -Isrc -Isrc/host -DSURFACE_LIVE_SHM_PATH="\"$T/surface\"" -o "$T/w" "$T/w.c"
"$CC" -O1 -Isrc -Isrc/host \
    -DSHM_PATH="\"$T/live\"" -DNORNS_SHM_PATH="\"$T/norns\"" \
    -DSURFACE_LIVE_SHM_PATH="\"$T/surface\"" -DE16_MIRROR_SHM_PATH="\"$T/e16\"" \
    -o "$T/ds" src/host/display_server.c src/host/unified_log.c -lpthread
"$T/w" || { echo "FAIL: the writer could not build the surface page"; exit 1; }

T="$T" python3 - <<'EOF'
import base64, json, os, re, socket, subprocess, sys, time
T = os.environ["T"]; PORT = 19000 + os.getpid() % 2000
page = open("schwung-manager/static/mirror.html").read()
m = re.search(r"const OFF = \{([^}]*)\}", page)
if not m: print("FAIL: no OFF table in mirror.html"); sys.exit(1)
OFF = {k: int(v) for k, v in re.findall(r"(\w+): (\d+)", m.group(1))}
srv = subprocess.Popen([T + "/ds", str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try: socket.create_connection(("127.0.0.1", PORT)).close(); break
        except OSError: time.sleep(0.1)
    s = socket.create_connection(("127.0.0.1", PORT))
    s.sendall(b"GET /stream-auto?v=2 HTTP/1.1\r\nHost: x\r\n\r\n")
    s.settimeout(0.3); buf = b""; t0 = time.time(); surf = None
    while time.time() - t0 < 8 and surf is None:
        try: d = s.recv(1 << 16)
        except socket.timeout: continue
        if not d: break
        buf += d
        for raw in buf.split(b"\n\n")[:-1]:
            if b"event: surface\n" in raw:
                p = json.loads(raw.split(b"data: ", 1)[1])
                surf = base64.b64decode(p["data"])
    s.close()
finally:
    srv.terminate(); srv.wait()
if surf is None: print("FAIL: no surface event reached the stream"); sys.exit(1)

fails = 0
def check(cond, what):
    global fails
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: fails += 1
check(len(surf) >= OFF["size"], f"the event carries the whole struct ({len(surf)} >= {OFF['size']})")
check(surf[OFF["noteLed"] + 68] == 5 and surf[OFF["noteAnim"] + 68] == 0, "pad 1 LED reads colour 5, solid")
o = OFF["rgb"] + (1 * 128 + 0x28) * 4
check(tuple(surf[o:o + 4]) == (98, 255, 84, 1), f"split RGB SysEx reads (98,255,84) valid, got {tuple(surf[o:o+4])}")
check(surf[OFF["ccVal"] + 49] == 127, "Shift reads held")
check(surf[OFF["noteDown"] + 68] == 100, "pad 1 reads pressed at velocity 100")
sys.exit(1 if fails else 0)
EOF
