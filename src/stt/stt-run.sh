#!/bin/sh
# stt-run.sh — start one transcription in the background (from host_system_cmd).
#
#   sh <stt-dir>/stt-run.sh <work-dir> <id>
#
# <stt-dir> (this script's folder) holds bin/schwung-stt, lib/*.so, model/.
# <work-dir> is the dictation scratch folder on /data/UserData (never /tmp on a
# Move: the root fs is full). Files are named by the dictation's <id>:
#   <id>.wav (the sampler's take) <id>.go <id>.cancel <id>.json (the result)
# Anything in <work-dir> belonging to another id is a leftover from an earlier
# dictation and is removed first; this take's audio is removed when it ends.
STT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="${1:?work dir}"; ID="${2:?id}"
case "$ID" in *[!A-Za-z0-9_-]*) echo "stt-run: bad id" >&2; exit 2 ;; esac
case "$WORK" in /tmp|/tmp/*) echo "stt-run: refusing /tmp" >&2; exit 2 ;; esac
mkdir -p "$WORK" || exit 1
for f in "$WORK"/*.wav "$WORK"/*.go "$WORK"/*.cancel "$WORK"/*.json "$WORK"/*.tmp; do
    [ -e "$f" ] || continue
    case "${f##*/}" in "$ID".*) ;; *) rm -f "$f" ;; esac
done
LD_LIBRARY_PATH="$STT_DIR/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$STT_DIR/bin/schwung-stt" "$STT_DIR/model" "$WORK/$ID.wav" "$WORK/$ID.go" \
    "$WORK/$ID.cancel" "$WORK/$ID.json" ${STT_THREADS:-2} \
    </dev/null >>"$WORK/helper.log" 2>&1
rm -f "$WORK/$ID.wav" "$WORK/$ID.go" "$WORK/$ID.cancel"
# Keep the log from growing without bound.
if [ -f "$WORK/helper.log" ] && [ "$(wc -c < "$WORK/helper.log")" -gt 65536 ]; then
    tail -c 16384 "$WORK/helper.log" > "$WORK/helper.log.new" && mv -f "$WORK/helper.log.new" "$WORK/helper.log"
fi
