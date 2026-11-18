#!/usr/bin/env bash
# The speech-to-text launcher (src/stt/stt-run.sh) and the pinned fetch
# (scripts/fetch-stt.sh).
#   stt-run: runs the helper with the bundled libs on its path and THIS take's
#     files, removes other takes' leftovers but keeps its own answer, removes
#     its own audio when done, refuses /tmp and an id that is not a plain word.
#   fetch-stt: a hash mismatch, a malformed or empty lock FAIL — each asserted
#     by the script's own words, not just a non-zero exit.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

# ---- stt-run.sh against a stand-in helper ----------------------------------
S="$T/stt"; W="$T/work"
mkdir -p "$S/bin" "$S/lib" "$S/model" "$W"
cp src/stt/stt-run.sh "$S/stt-run.sh"
cat > "$S/bin/schwung-stt" <<'EOF'
#!/bin/sh
echo "LD=$LD_LIBRARY_PATH" > "$(dirname "$0")/../args.txt"
for a in "$@"; do echo "$a" >> "$(dirname "$0")/../args.txt"; done
echo '{"ok":true,"text":"x"}' > "$5"
EOF
chmod +x "$S/bin/schwung-stt"
for f in old1.wav old1.go old1.json old2.cancel old2.json.tmp; do : > "$W/$f"; done
: > "$W/dabc.wav"; : > "$W/dabc.go"
sh "$S/stt-run.sh" "$W" dabc
out="$(cat "$S/args.txt" 2>/dev/null)"
printf '%s\n' "$out" | grep -qx "LD=$S/lib" && ok "helper runs with the bundled lib dir on LD_LIBRARY_PATH" || bad "LD_LIBRARY_PATH: $out"
want="$S/model
$W/dabc.wav
$W/dabc.go
$W/dabc.cancel
$W/dabc.json
2"
[ "$(printf '%s\n' "$out" | sed 1d)" = "$want" ] && ok "helper args: model dir, this take's wav/go/cancel/result, 2 threads" || bad "args: $out"
left="$(cd "$W" && ls | sort | tr '\n' ' ')"
[ "$left" = "dabc.json helper.log " ] && ok "other takes' leftovers and this take's audio removed; its answer kept" || bad "left behind: $left"
STT_THREADS=1 sh "$S/stt-run.sh" "$W" dxyz
[ "$(tail -1 "$S/args.txt")" = "1" ] && ok "STT_THREADS reaches the helper" || bad "threads: $(tail -1 "$S/args.txt")"
[ ! -e "$W/dabc.json" ] && [ -e "$W/dxyz.json" ] && ok "the next take clears the previous answer" || bad "answers: $(ls "$W")"

msg="$(sh "$S/stt-run.sh" /tmp/dict dq 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "refusing /tmp" && ok "refuses /tmp (the Move's root fs is full)" || bad "/tmp: rc=$rc $msg"
msg="$(sh "$S/stt-run.sh" "$W" '../x' 2>&1)"; rc=$?
[ $rc -ne 0 ] && printf '%s' "$msg" | grep -q "bad id" && ok "refuses an id that is not a plain word" || bad "bad id: rc=$rc $msg"
[ -z "$(grep -v '^ *#' src/stt/stt-run.sh | grep '/tmp' | grep -v 'refusing /tmp')" ] \
    && ok "stt-run.sh names /tmp only to refuse it" || bad "stt-run.sh uses /tmp"

# ---- fetch-stt.sh fails closed ------------------------------------------------
echo "hello" > "$T/blob.tar.bz2"
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
for n in sherpa-onnx-lib sherpa-onnx-header moonshine-tiny-en; do
    grep -Eq "^$n [0-9a-f]{64} https://" scripts/stt-deps.lock && ok "lock pins $n" || bad "lock has no pinned $n"
done

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
