#!/bin/sh
# stt-run.sh — start one transcription in the background (from host_system_cmd).
#
#   sh <stt-dir>/stt-run.sh <work-dir> <id> [take-seconds]
#
# <stt-dir> (this script's folder) holds bin/schwung-stt. The runtime libraries
# and the model are the dictation ADD-ON (addon.sh), in <install-dir>/addons/
# dictation/{lib,model} — <install-dir> being this folder's parent. STT_ADDON
# overrides that (tests).
# <work-dir> is the dictation scratch folder on /data/UserData (never /tmp on a
# Move: the root fs is full). Files are named by the dictation's <id>:
#   <id>.wav (the sampler's take) <id>.go <id>.cancel <id>.json (the result)
#   <id>.pid (the helper, while it runs)
#
# ONE HELPER AT A TIME. A newer take ends any earlier helper first (a tap
# followed by a press, or talking again over a transcription): each holds the
# whole model, so quick presses must not stack them up. The pid is checked
# against the process name before the kill, so a reused pid is never hit.
# Only then is everything belonging to another id removed — with no earlier
# helper alive, nothing is waiting on its .cancel.
STT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDON="${STT_ADDON:-$(dirname "$STT_DIR")/addons/dictation}"
WORK="${1:?work dir}"; ID="${2:?id}"; TAKE_S="${3:-30}"
case "$TAKE_S" in ''|*[!0-9]*) echo "stt-run: bad take length" >&2; exit 2 ;; esac
PROC="${STT_PROC:-/proc}"
case "$ID" in *[!A-Za-z0-9_-]*) echo "stt-run: bad id" >&2; exit 2 ;; esac
case "$WORK" in /tmp|/tmp/*) echo "stt-run: refusing /tmp" >&2; exit 2 ;; esac
mkdir -p "$WORK" || exit 1
for f in "$WORK"/*.pid; do
    [ -e "$f" ] || continue
    case "${f##*/}" in "$ID".pid) continue ;; esac
    pid="$(cat "$f" 2>/dev/null)"
    case "$pid" in
        ''|*[!0-9]*) ;;
        *) [ "$(cat "$PROC/$pid/comm" 2>/dev/null)" = schwung-stt ] && kill "$pid" 2>/dev/null ;;
    esac
done
for f in "$WORK"/*.wav "$WORK"/*.go "$WORK"/*.cancel "$WORK"/*.json "$WORK"/*.tmp "$WORK"/*.pid; do
    [ -e "$f" ] || continue
    case "${f##*/}" in "$ID".*) ;; *) rm -f "$f" ;; esac
done
# ONE recognizer thread: on the CM5 1, 2 and 3 threads timed the same
# (2026-11-18, the same hashed samples: a name ~55 ms, 10 s of speech ~0.7 s
# after a ~0.9 s load that overlaps the talking), and one thread leaves the
# most room for the audio engine's render lanes on cores 0-2.
# Cores 0-2 and the lowest priority from the first instruction, before the
# 22 MB of libraries are even mapped (core 3 is the audio callback's). The
# helper asserts both again itself.
POLITE=""
command -v taskset >/dev/null 2>&1 && POLITE="taskset 0x7"
command -v nice >/dev/null 2>&1 && POLITE="$POLITE nice -n 19"
LD_LIBRARY_PATH="$ADDON/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    $POLITE "$STT_DIR/bin/schwung-stt" "$ADDON/model" "$WORK/$ID.wav" "$WORK/$ID.go" \
    "$WORK/$ID.cancel" "$WORK/$ID.json" ${STT_THREADS:-1} "$TAKE_S" \
    </dev/null >>"$WORK/helper.log" 2>&1 &
echo $! > "$WORK/$ID.pid"
wait $!
# A TEST SET, opt-in: with a folder named keep/ in the work dir, each take (and
# the answer it got) is copied there before the take is removed, for comparing
# recognizers on real takes (tools/stt-ab). Nothing is kept unless that folder
# exists; delete it to stop.
if [ -d "$WORK/keep" ]; then
    cp -p "$WORK/$ID.wav" "$WORK/keep/$ID.wav" 2>/dev/null
    cp -p "$WORK/$ID.json" "$WORK/keep/$ID.json" 2>/dev/null
fi
rm -f "$WORK/$ID.wav" "$WORK/$ID.go" "$WORK/$ID.cancel" "$WORK/$ID.pid"
# Keep the log from growing without bound.
if [ -f "$WORK/helper.log" ] && [ "$(wc -c < "$WORK/helper.log")" -gt 65536 ]; then
    tail -c 16384 "$WORK/helper.log" > "$WORK/helper.log.new" && mv -f "$WORK/helper.log.new" "$WORK/helper.log"
fi
