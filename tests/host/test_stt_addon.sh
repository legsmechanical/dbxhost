#!/usr/bin/env bash
# The dictation add-on installer (src/stt/addon.sh) and its pin
# (src/stt/addon.json), against a stand-in add-on and a stand-in curl (the
# Linux test image has none; the real one is <install>/bin/curl):
#   install: downloads, verifies the hash, unpacks BESIDE and renames into
#     addons/dictation/, removes the download, reports done;
#   a wrong hash, a broken archive, no room, no network: each fails BY NAME,
#     installs nothing and leaves an add-on already there untouched;
#   a newer version replaces the old; remove deletes it; one run at a time.
# And, when the build stage is present, that the committed pin is the add-on
# scripts/build-stt-addon.sh actually builds (it is reproducible).
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
mkdir -p build/tests; T="$(mktemp -d "$PWD/build/tests/stt_addon.XXXXXX")"; trap 'rm -rf "$T"' EXIT
command -v sha256sum >/dev/null 2>&1 || { bad "no sha256sum (the installer needs it)"; echo "FAIL: $(basename "$0")"; exit 1; }

D="$T/dbx"; mkdir -p "$D/stt" "$D/bin"
cp src/stt/addon.sh "$D/stt/addon.sh"
# curl stand-in: copies a file:// URL to -o, or fails like curl when CURL_FAIL is set.
cat > "$D/bin/curl" <<'EOF'
#!/bin/sh
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift ;; -C|--connect-timeout|--speed-limit|--speed-time) shift ;; -*) ;; *) url="$1" ;; esac; shift; done
[ -n "${CURL_FAIL:-}" ] && exit 7
echo "$url" >> "$(dirname "$0")/curl.log"
cp "${url#file://}" "$out"
EOF
chmod +x "$D/bin/curl"

mkpack() {   # <version> <out.tar.gz> [skip-file]
    r="$T/pk"; rm -rf "$r"; mkdir -p "$r/lib" "$r/model" "$r/licenses"
    printf '{"name":"dictation","version":%s}\n' "$1" > "$r/addon.json"
    for f in lib/libsherpa-onnx-c-api.so lib/libonnxruntime.so model/encoder.int8.onnx model/decoder.int8.onnx \
             model/joiner.int8.onnx model/tokens.txt model/silero_vad.onnx licenses/NOTICE.txt; do
        [ "$f" = "${3:-}" ] || echo "v$1 $f" > "$r/$f"
    done
    tar -czf "$2" -C "$r" addon.json lib model licenses
}
pin() {   # <version> <tar> [sha] [unpacked]
    s="${3:-$(sha256sum "$2" | cut -d' ' -f1)}"
    printf '{\n  "version": %s,\n  "url": "file://%s",\n  "sha256": "%s",\n  "bytes": %s,\n  "unpacked_bytes": %s\n}\n' \
        "$1" "$2" "$s" "$(wc -c < "$2" | tr -d ' ')" "${4:-4096}" > "$D/stt/addon.json"
}
st() { cat "$D/addons/dictation.status" 2>/dev/null; }
run() { sh "$D/stt/addon.sh" "$@" "$D"; }

# ---- install ---------------------------------------------------------------------
mkpack 1 "$T/v1.tar.gz"; pin 1 "$T/v1.tar.gz"
run install; rc=$?
[ $rc = 0 ] && st | grep -q '"state":"done"' && ok "install reports done" || bad "install: rc=$rc $(st)"
[ "$(cat "$D/addons/dictation/model/encoder.int8.onnx" 2>/dev/null)" = "v1 model/encoder.int8.onnx" ] \
    && [ -s "$D/addons/dictation/lib/libonnxruntime.so" ] && ok "the add-on lands in addons/dictation/" || bad "not installed: $(ls -R "$D/addons")"
! ls "$D"/addons/.dictation-*.part >/dev/null 2>&1 && [ ! -e "$D/addons/.dictation.new" ] && [ ! -e "$D/addons/.dictation.lock" ] \
    && ok "no download, unpack folder or lock left behind" || bad "left: $(ls -a "$D/addons")"
st | grep -q '"t":[0-9][0-9]*}' && ok "the status carries its time (a dead run reads as stopped)" || bad "no time in the status: $(st)"

# ---- failures: by name, nothing installed, the installed one untouched ----------
mkpack 2 "$T/v2.tar.gz"; pin 2 "$T/v2.tar.gz" 0000000000000000000000000000000000000000000000000000000000000000
run install
st | grep -q '"state":"failed".*"err":"bad_download"' && ok "a wrong hash fails as bad_download" || bad "hash: $(st)"
grep -q '"version":1' "$D/addons/dictation/addon.json" && ok "...and the installed add-on is untouched" || bad "add-on changed by a bad download"
! ls "$D"/addons/.dictation-*.part >/dev/null 2>&1 && ok "...and the bad download is not kept" || bad "bad download kept"

mkpack 2 "$T/v2bad.tar.gz" model/joiner.int8.onnx; pin 2 "$T/v2bad.tar.gz"
run install
st | grep -q '"err":"bad_archive"' && ok "an archive missing a file fails as bad_archive" || bad "archive: $(st)"
grep -q '"version":1' "$D/addons/dictation/addon.json" && [ ! -e "$D/addons/.dictation.new" ] \
    && ok "...the old add-on stays, nothing half-unpacked" || bad "after a bad archive: $(ls -a "$D/addons")"

mkpack 3 "$T/v3.tar.gz"; pin 2 "$T/v3.tar.gz"   # a whole archive of the WRONG version
run install
st | grep -q '"err":"bad_archive"' && ok "an archive of another version than the pin fails" || bad "version mismatch: $(st)"

pin 2 "$T/v2.tar.gz" "" 999999999999999
run install
st | grep -q '"err":"no_space"' && ok "no room fails as no_space, before any download" || bad "space: $(st)"
! ls "$D"/addons/.dictation-*.part >/dev/null 2>&1 && ok "...and nothing was fetched" || bad "fetched anyway"

pin 2 "$T/v2.tar.gz"
start=$(date +%s); CURL_FAIL=1 run install; took=$(( $(date +%s) - start ))
st | grep -q '"err":"network"' && ok "no network fails as network (after retrying, ${took} s)" || bad "network: $(st)"

# ---- resume: only a download of THIS pin -------------------------------------------
echo stale > "$D/addons/.dictation-$(printf 'a%.0s' $(seq 64)).part"
head -c 100 "$T/v2.tar.gz" > "$D/addons/.dictation-$(sha256sum "$T/v2.tar.gz" | cut -d' ' -f1).part"
: > "$D/bin/curl.log"

run install
grep -q '"version":2' "$D/addons/dictation/addon.json" && [ ! -e "$D/addons/.dictation.old" ] \
    && ok "version 2 replaces version 1" || bad "upgrade: $(cat "$D/addons/dictation/addon.json")"
! ls "$D"/addons/.dictation-*.part >/dev/null 2>&1 && ok "...resuming its own partial download; another pin's partial is dropped" || bad "parts left: $(ls -a "$D/addons")"

# ---- one at a time ---------------------------------------------------------------
mkdir "$D/addons/.dictation.lock"; sleep 30 & SL=$!; echo $SL > "$D/addons/.dictation.lock/pid"
: > "$D/bin/curl.log"; run install
[ ! -s "$D/bin/curl.log" ] && ok "a second run while one is live does nothing" || bad "ran alongside a live one"
kill $SL 2>/dev/null; wait $SL 2>/dev/null
run install
[ -s "$D/bin/curl.log" ] && st | grep -q done && ok "a lock whose run is gone is taken over" || bad "stale lock: $(st)"

# ---- remove ------------------------------------------------------------------------
run remove
[ ! -e "$D/addons/dictation" ] && [ ! -e "$D/addons/dictation.status" ] && ok "remove deletes the add-on and its status" || bad "remove: $(ls -a "$D/addons")"

msg="$(sh "$D/stt/addon.sh" install /tmp/x 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "refusing /tmp" && ok "refuses /tmp" || bad "/tmp: rc=$rc $msg"

# ---- the committed pin --------------------------------------------------------------
P=src/stt/addon.json
python3 - "$P" <<'EOF' && ok "src/stt/addon.json: version, https url naming that version, 64-hex sha256, sizes" || bad "src/stt/addon.json is not a usable pin"
import json, re, sys
d = json.load(open(sys.argv[1]))
v = int(d["version"])
assert v > 0 and d["url"].startswith("https://") and ("dictation-addon-%d." % v) in d["url"]
assert re.fullmatch(r"[0-9a-f]{64}", d["sha256"]) and int(d["bytes"]) > 0 and int(d["unpacked_bytes"]) > int(d["bytes"])
EOF
grep -q 'addon.sh\|addon.json' scripts/build.sh && grep -q 'cp -u src/stt/stt-run.sh src/stt/addon.sh src/stt/addon.json build/stt/' scripts/build.sh \
    && ok "the build lays the installer and the pin into build/stt/" || bad "build.sh does not ship addon.sh + addon.json"
if [ -f .cache/stt/stage/.stamp ] && command -v docker >/dev/null 2>&1 && [ -z "${SKIP_STT_ADDON_REBUILD:-}" ]; then
    want="$(python3 -c 'import json; print(json.load(open("src/stt/addon.json"))["sha256"])')"
    got="$(scripts/build-stt-addon.sh 2>/dev/null | sed -n 's/.*sha256 *//p')"
    [ "$got" = "$want" ] && ok "rebuilding the add-on gives the pinned hash (reproducible)" || bad "rebuilt add-on $got != pinned $want"
else
    echo "  skip — reproducibility rebuild (no stage or no docker here, or SKIP_STT_ADDON_REBUILD)"
fi

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
