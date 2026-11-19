#!/usr/bin/env bash
# The speech-to-text launcher (src/stt/stt-run.sh) and the pinned fetch
# (scripts/fetch-stt.sh).
#   stt-run: runs the helper with the ADD-ON's libs on its path (<install>/addons/
#     dictation, beside stt/), its model dir, and THIS take's
#     files, removes other takes' leftovers but keeps its own answer, removes
#     its own audio when done, refuses /tmp and an id that is not a plain word.
#   fetch-stt: a hash mismatch, a malformed or empty lock FAIL — each asserted
#     by the script's own words, not just a non-zero exit.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
# Not mktemp's default: on Linux that is /tmp, which the launcher refuses by design.
mkdir -p build/tests; T="$(mktemp -d "$PWD/build/tests/stt_scripts.XXXXXX")"; trap 'rm -rf "$T"' EXIT

# ---- stt-run.sh against a stand-in helper ----------------------------------
S="$T/stt"; W="$T/work"
AD="$T/addons/dictation"
mkdir -p "$S/bin" "$AD/lib" "$AD/model" "$W"
cp src/stt/stt-run.sh "$S/stt-run.sh"
cat > "$S/bin/schwung-stt" <<'EOF'
#!/bin/sh
# BLOCK: wait for go/cancel like the real helper (a take in progress).
if [ -e "$(dirname "$0")/../BLOCK" ]; then
    while [ ! -e "$3" ] && [ ! -e "$4" ]; do sleep 0.1; done
    echo '{"ok":true,"text":"late"}' > "$5"; exit 0
fi
echo "LD=$LD_LIBRARY_PATH" > "$(dirname "$0")/../args.txt"
for a in "$@"; do echo "$a" >> "$(dirname "$0")/../args.txt"; done
echo '{"ok":true,"text":"x"}' > "$5"
EOF
chmod +x "$S/bin/schwung-stt"
for f in old1.wav old1.go old1.json old2.cancel old2.json.tmp; do : > "$W/$f"; done
: > "$W/dabc.wav"; : > "$W/dabc.go"
sh "$S/stt-run.sh" "$W" dabc
out="$(cat "$S/args.txt" 2>/dev/null)"
printf '%s\n' "$out" | grep -qx "LD=$AD/lib" && ok "helper runs with the add-on's lib dir on LD_LIBRARY_PATH" || bad "LD_LIBRARY_PATH: $out"
want="$AD/model
$W/dabc.wav
$W/dabc.go
$W/dabc.cancel
$W/dabc.json
1
30"
[ "$(printf '%s\n' "$out" | sed 1d)" = "$want" ] && ok "helper args: the add-on's model dir, this take's wav/go/cancel/result, 1 thread, a 30 s take by default" || bad "args: $out"
left="$(cd "$W" && ls | sort | tr '\n' ' ')"
[ "$left" = "dabc.json helper.log " ] && ok "other takes' leftovers and this take's audio removed; its answer kept" || bad "left behind: $left"
STT_THREADS=3 sh "$S/stt-run.sh" "$W" dxyz 12
[ "$(tail -2 "$S/args.txt" | tr '\n' ' ')" = "3 12 " ] && ok "STT_THREADS and the take length the UI gives reach the helper" || bad "threads/take: $(tail -2 "$S/args.txt")"
msg="$(sh "$S/stt-run.sh" "$W" dq '3;rm' 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "bad take length" && ok "refuses a take length that is not a number" || bad "take length: rc=$rc $msg"
[ ! -e "$W/dabc.json" ] && [ -e "$W/dxyz.json" ] && ok "the next take clears the previous answer" || bad "answers: $(ls "$W")"
# keep/: a take and its answer are copied aside only while that folder exists
mkdir "$W/keep"; echo take > "$W/dkk.wav"; : > "$W/dkk.go"
sh "$S/stt-run.sh" "$W" dkk
[ "$(cat "$W/keep/dkk.wav" 2>/dev/null)" = take ] && [ -s "$W/keep/dkk.json" ] && [ ! -e "$W/dkk.wav" ] \
    && ok "with keep/, the take and its answer are copied there; the take itself still goes" || bad "keep: $(ls "$W" "$W/keep")"
rm -rf "$W/keep"; echo take > "$W/dkn.wav"; : > "$W/dkn.go"
sh "$S/stt-run.sh" "$W" dkn
[ ! -e "$W/keep" ] && ok "without keep/, nothing is kept" || bad "kept without a keep/ folder"

# ---- one helper at a time ----------------------------------------------------
# A take in progress (helper waiting for its go), then a newer take: the earlier
# helper is ENDED — not left waiting 15 s with the model loaded because the
# newer launcher swept its .cancel away. /proc is faked (STT_PROC) so the name
# check runs on any OS.
P="$T/proc"; mkdir -p "$P"
rm -f "$W"/*; touch "$S/BLOCK"
STT_PROC="$P" sh "$S/stt-run.sh" "$W" dold & L1=$!
for i in $(seq 50); do [ -s "$W/dold.pid" ] && break; sleep 0.1; done
pid="$(cat "$W/dold.pid" 2>/dev/null)"
[ -n "$pid" ] && ok "a running helper is recorded by pid" || bad "no dold.pid: $(ls "$W")"
mkdir -p "$P/$pid"; echo schwung-stt > "$P/$pid/comm"
rm -f "$S/BLOCK"
STT_PROC="$P" sh "$S/stt-run.sh" "$W" dnew
for i in $(seq 50); do kill -0 "$L1" 2>/dev/null || break; sleep 0.1; done
if kill -0 "$pid" 2>/dev/null; then bad "the earlier helper is still running (pid $pid)"; kill "$pid" 2>/dev/null
else ok "a newer take ends the earlier helper"; fi
[ ! -e "$W/dold.json" ] && ok "…and the ended helper answers nothing" || bad "ended helper answered: $(cat "$W/dold.json")"
[ ! -e "$W/dold.pid" ] && [ ! -e "$W/dnew.pid" ] && ok "no pid file outlives its helper" || bad "pid files left: $(ls "$W")"
wait "$L1" 2>/dev/null
# A pid file whose process is NOT a helper (the pid was reused): never killed.
sleep 30 & SL=$!
echo "$SL" > "$W/dstale.pid"; mkdir -p "$P/$SL"; echo sleep > "$P/$SL/comm"
STT_PROC="$P" sh "$S/stt-run.sh" "$W" dthird
kill -0 "$SL" 2>/dev/null && ok "a reused pid (not schwung-stt) is left alone" || bad "killed an unrelated process"
[ ! -e "$W/dstale.pid" ] && ok "…and its stale pid file is cleared" || bad "stale pid file kept"
kill "$SL" 2>/dev/null; wait "$SL" 2>/dev/null
grep -q 'taskset 0x7' src/stt/stt-run.sh && grep -q 'nice -n 19' src/stt/stt-run.sh \
    && ok "the helper starts on cores 0-2 at nice 19 (before its libraries load)" || bad "launcher does not pin the helper"

msg="$(sh "$S/stt-run.sh" /tmp/dict dq 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "refusing /tmp" && ok "refuses /tmp (the Move's root fs is full)" || bad "/tmp: rc=$rc $msg"
msg="$(sh "$S/stt-run.sh" "$W" '../x' 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "bad id" && ok "refuses an id that is not a plain word" || bad "bad id: rc=$rc $msg"
[ -z "$(grep -v '^ *#' src/stt/stt-run.sh | grep '/tmp' | grep -v 'refusing /tmp')" ] \
    && ok "stt-run.sh names /tmp only to refuse it" || bad "stt-run.sh uses /tmp"

# ---- fetch-stt.sh fails closed ------------------------------------------------
# The file is placed in the cache already: the hash check runs on what is there
# (no download, so no curl needed — the Linux test image has none).
mkdir -p "$T/cache/dl"; echo "hello" > "$T/cache/dl/blob.tar.bz2"
L="$T/lock"
echo "sherpa-onnx-lib 0000000000000000000000000000000000000000000000000000000000000000 file://$T/blob.tar.bz2" > "$L"
msg="$(STT_LOCK="$L" STT_CACHE="$T/cache" bash scripts/fetch-stt.sh 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "hash mismatch" && ok "a hash mismatch fails, by name" || bad "mismatch: rc=$rc $msg"
[ ! -e "$T/cache/dl/blob.tar.bz2" ] && ok "…and the bad download is not kept" || bad "bad download kept"
echo "sherpa-onnx-lib onlyahash" > "$L"
msg="$(STT_LOCK="$L" STT_CACHE="$T/cache" bash scripts/fetch-stt.sh 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "malformed" && ok "a malformed lock line fails" || bad "malformed: rc=$rc $msg"
printf '# nothing\n' > "$L"
msg="$(STT_LOCK="$L" STT_CACHE="$T/cache" bash scripts/fetch-stt.sh 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "lists nothing" && ok "an empty lock fails (zero entries is not green)" || bad "empty: rc=$rc $msg"
# The real lock pins every entry the build needs, each with a 64-hex hash.
for n in sherpa-onnx-lib sherpa-onnx-header parakeet-tdt-110m-en parakeet-license silero-vad silero-vad-license; do
    grep -Eq "^$n [0-9a-f]{64} https://" scripts/stt-deps.lock && ok "lock pins $n" || bad "lock has no pinned $n"
done

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
