#!/bin/sh
# addon.sh — install or remove the DICTATION ADD-ON (the speech-to-text runtime
# and model, which the release does not carry). Run by dAVEBOx's menu through
# host_system_cmd, in the background:
#
#   sh <install-dir>/stt/addon.sh install <install-dir>
#   sh <install-dir>/stt/addon.sh remove  <install-dir>
#
# What to fetch is pinned BESIDE this script, in addon.json (version, url,
# sha256, bytes, unpacked_bytes), written by scripts/build-stt-addon.sh --pin.
# The download is refused unless its sha256 matches — whatever the server sent.
#
# <install-dir>/addons/
#   dictation/            the installed add-on (addon.json, lib/, model/, licenses/)
#   dictation.status      {"state": ..., "pct": N, "err": ...} for the menu row
#   .dictation-<sha>.part the download, named by the hash it must have, so only a
#                         download of THIS pin is ever resumed (removed when done)
#   .dictation.new/       the archive unpacking — renamed into place only when whole
#   .dictation.lock/      one run at a time (pid inside)
#
# States: downloading (pct) -> verifying -> installing -> done; or failed with
# err = no_space | network | bad_download | bad_archive | busy.
# The release's layout-install never touches addons/ (it MERGES), so an add-on
# survives every update; one whose version differs from the pin shows "Update".
#
# ADDON_URL overrides the pinned address (tests, and a developer serving a
# freshly built add-on before it is published); the hash still has to match.
CMD="${1:?install|remove}"; DBX="${2:?install dir}"
case "$DBX" in /tmp|/tmp/*) echo "addon: refusing /tmp" >&2; exit 2 ;; esac
HERE="$(cd "$(dirname "$0")" && pwd)"
SPEC="$HERE/addon.json"
A="$DBX/addons"; ADD="$A/dictation"; ST="$A/dictation.status"
NEW="$A/.dictation.new"; OLD="$A/.dictation.old"; LOCK="$A/.dictation.lock"
mkdir -p "$A" || exit 1

# "t" is the time of writing: a running step rewrites it every second, so the
# menu can tell a run that died (power, a killed session) from a slow one.
status() {   # state [pct] [err]
    printf '{"state":"%s","pct":%s,"err":"%s","t":%s}\n' "$1" "${2:-0}" "${3:-}" "$(date +%s)" > "$ST.tmp" \
        && mv -f "$ST.tmp" "$ST"
}
# Run a long step in the background, keeping the status fresh until it ends.
beat() {   # state cmd...
    b_state="$1"; shift
    "$@" & b_pid=$!
    while kill -0 $b_pid 2>/dev/null; do status "$b_state" 100; sleep 1; done
    wait $b_pid
}
num() { sed -n "s/.*\"$1\": *\([0-9][0-9]*\).*/\1/p" "$SPEC" | head -1; }
str() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$SPEC" | head -1; }

# ---- one run at a time ---------------------------------------------------------
stop_running() {
    p="$(cat "$LOCK/pid" 2>/dev/null)"
    case "$p" in ''|*[!0-9]*) ;; *) kill "$p" 2>/dev/null ;; esac
    c="$(cat "$LOCK/curl" 2>/dev/null)"
    case "$c" in ''|*[!0-9]*) ;; *) kill "$c" 2>/dev/null ;; esac
    rm -rf "$LOCK"
}
take_lock() {
    if ! mkdir "$LOCK" 2>/dev/null; then
        p="$(cat "$LOCK/pid" 2>/dev/null)"
        case "$p" in ''|*[!0-9]*) ;; *) kill -0 "$p" 2>/dev/null && return 1 ;; esac
        rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || return 1   # a stale lock: its run is gone
    fi
    echo $$ > "$LOCK/pid"
    trap 'rm -rf "$LOCK"' EXIT
    trap 'exit 1' TERM INT
    return 0
}

if [ "$CMD" = remove ]; then
    stop_running
    rm -rf "$ADD" "$NEW" "$OLD" "$A"/.dictation-*.part "$ST" "$ST.tmp"
    exit 0
fi
[ "$CMD" = install ] || { echo "addon: unknown command $CMD" >&2; exit 2; }
take_lock || { echo "addon: already running" >&2; exit 0; }   # the running one reports

# Never compete with the audio engine: lowest priority, off core 3.
command -v renice >/dev/null 2>&1 && renice -n 19 -p $$ >/dev/null 2>&1
command -v taskset >/dev/null 2>&1 && taskset -p 0x7 $$ >/dev/null 2>&1

VER="$(num version)"; SUM="$(str sha256)"; BYTES="$(num bytes)"; UNPACKED="$(num unpacked_bytes)"
URL="${ADDON_URL:-$(str url)}"
case "$SUM" in *[!0-9a-f]*|'') SUM="" ;; esac
[ -n "$VER" ] && [ -n "$SUM" ] && [ -n "$URL" ] && [ "${BYTES:-0}" -gt 0 ] \
    || { echo "addon: no usable pin in $SPEC" >&2; status failed 0 bad_archive; exit 1; }
PART="$A/.dictation-$SUM.part"
for f in "$A"/.dictation-*.part; do [ "$f" = "$PART" ] || rm -f "$f"; done   # another pin's

# ---- room: the download and the unpacked add-on side by side, plus 32 MB -------
have=0; [ -f "$PART" ] && have="$(wc -c < "$PART" | tr -d ' ')"
need_kb=$(( (BYTES - have + ${UNPACKED:-0}) / 1024 + 32768 ))
free_kb="$(df -Pk "$A" 2>/dev/null | awk 'NR==2 {print $4}')"
case "$free_kb" in ''|*[!0-9]*) free_kb=0 ;; esac
[ "$free_kb" -ge "$need_kb" ] || { status failed 0 no_space; exit 1; }

# ---- download (resumable), progress from the file's size ------------------------
CURL="$DBX/bin/curl"; [ -x "$CURL" ] || CURL=curl
pct() { s=0; [ -f "$PART" ] && s="$(wc -c < "$PART" | tr -d ' ')"; echo $(( s * 100 / BYTES )); }
if [ "$have" -lt "$BYTES" ]; then
    status downloading "$(pct)"
    tries=0
    while :; do
        if [ -f "$PART" ]; then RESUME="-C -"; else RESUME=""; fi
        # shellcheck disable=SC2086
        "$CURL" -fsSL --connect-timeout 15 --speed-limit 1024 --speed-time 30 $RESUME -o "$PART" "$URL" &
        cp=$!; echo $cp > "$LOCK/curl"
        while kill -0 $cp 2>/dev/null; do status downloading "$(pct)"; sleep 1; done
        wait $cp; rc=$?
        [ $rc = 0 ] && break
        tries=$((tries + 1))
        [ $tries -ge 4 ] && { status failed "$(pct)" network; exit 1; }
        sleep 2
    done
fi

# ---- verify ---------------------------------------------------------------------
status verifying 100
beat verifying sh -c 'sha256sum "$1" > "$2"' sh "$PART" "$A/.dictation.sum"
got="$(cut -d' ' -f1 "$A/.dictation.sum" 2>/dev/null)"; rm -f "$A/.dictation.sum"
if [ "$got" != "$SUM" ]; then
    rm -f "$PART"; status failed 0 bad_download; exit 1
fi

# ---- unpack beside, check, then rename into place --------------------------------
status installing 100
rm -rf "$NEW" "$OLD"; mkdir -p "$NEW"
bad_archive() { rm -rf "$NEW" "$PART"; status failed 0 bad_archive; exit 1; }
beat installing tar -xzf "$PART" -C "$NEW" 2>/dev/null || bad_archive
for f in addon.json lib/libsherpa-onnx-c-api.so lib/libonnxruntime.so model/encoder.int8.onnx \
         model/decoder.int8.onnx model/joiner.int8.onnx model/tokens.txt model/silero_vad.onnx; do
    [ -s "$NEW/$f" ] || bad_archive
done
grep -q "\"version\": *$VER[^0-9]" "$NEW/addon.json" || bad_archive
[ -d "$ADD" ] && mv "$ADD" "$OLD"
mv "$NEW" "$ADD"
rm -rf "$OLD" "$PART"
status done 100
exit 0
