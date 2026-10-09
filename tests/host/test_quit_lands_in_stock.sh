#!/usr/bin/env bash
# Quitting dAVEBOx lands in stock whichever door the session came in by.
#
# A Tools-door quit resumes move-launcher, and its selector boots the DEFAULT
# target. With dAVEBOx as the default (picking it in the boot picker makes it
# so) that quit came straight back up in dAVEBOx, while a boot-door quit went
# to Move. launch.sh now dates a marker as a Tools-door session ends, and a
# boot-door start that finds a fresh one hands the pid to stock instead.
#
# The decision block is lifted out of launch.sh (between QTS-BEGIN / QTS-END)
# and RUN here against a sandbox, so it cannot rot into a comment; the rest is
# source pins on where the two halves sit.
set -u
cd "$(dirname "$0")/../.."
LAUNCH=standalone/scripts/launch.sh
[ -f "$LAUNCH" ] || { echo "FAIL: $LAUNCH missing" >&2; exit 1; }
T=$(mktemp -d "${TMPDIR:-/tmp}/qts.XXXXXX")
trap 'rm -rf "$T"' EXIT

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }
check() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }

BLOCK=$(awk '/^# QTS-BEGIN/ { on = 1; next } /^# QTS-END/ { on = 0 } on' "$LAUNCH")
check "the decision block was found" test -n "$BLOCK"
# Point its three paths at the sandbox; everything else runs as shipped.
BLOCK=$(printf '%s\n' "$BLOCK" | sed \
    -e "s#^_qts=.*#_qts=$T/quit-to-stock#" \
    -e "s#^_qts_stock=.*#_qts_stock=$T/schwung-entry.sh#" \
    -e "s#^_qts_log=.*#_qts_log=$T/launch.log#")
for v in _qts= _qts_stock= _qts_log=; do
    check "the sandbox owns $v" sh -c "printf '%s\n' \"\$1\" | grep -q \"^$v$T/\"" _ "$BLOCK"
done

stock_present() { printf '#!/bin/sh\necho STOCK-STARTED\n' > "$T/schwung-entry.sh"; chmod +x "$T/schwung-entry.sh"; }
# Run the block as door $1; prints what stock said (if it was handed the pid)
# or SESSION if the launcher would have carried on.
run() {
    : > "$T/launch.log"
    ( _dbx_entry="$1"; eval "$BLOCK"; echo SESSION ) > "$T/out" 2>&1
    cat "$T/out" "$T/launch.log"
}
now=$(date +%s)

echo "quit lands in stock:"
stock_present
echo "$now" > "$T/quit-to-stock"
out=$(run boot)
case "$out" in *STOCK-STARTED*) ok "boot door, fresh Tools quit: the pid goes to stock" ;; *) bad "boot door, fresh Tools quit: got [$out]" ;; esac
case "$out" in *SESSION*) bad "...and a session started as well" ;; *) ok "...and no session starts" ;; esac
case "$out" in *"handing the pid to stock"*) ok "...and the launch log says why" ;; *) bad "...the launch log is silent: [$out]" ;; esac
check "...and the marker is consumed" test ! -e "$T/quit-to-stock"

out=$(run boot)
case "$out" in SESSION) ok "boot door, no marker: a session starts (a real boot is untouched)" ;; *) bad "boot door, no marker: got [$out]" ;; esac

echo $((now - 600)) > "$T/quit-to-stock"
out=$(run boot)
case "$out" in SESSION) ok "boot door, a ten-minute-old marker: a session starts" ;; *) bad "old marker: got [$out]" ;; esac
check "...and the stale marker is removed" test ! -e "$T/quit-to-stock"

echo $((now + 600)) > "$T/quit-to-stock"
out=$(run boot)
case "$out" in SESSION) ok "boot door, a marker from the future (clock moved): a session starts" ;; *) bad "future marker: got [$out]" ;; esac

echo "not a number" > "$T/quit-to-stock"
out=$(run boot)
case "$out" in SESSION) ok "boot door, a garbled marker: a session starts" ;; *) bad "garbled marker: got [$out]" ;; esac

: > "$T/quit-to-stock"
out=$(run boot)
case "$out" in SESSION) ok "boot door, an empty marker: a session starts" ;; *) bad "empty marker: got [$out]" ;; esac

echo "$now" > "$T/quit-to-stock"; rm -f "$T/schwung-entry.sh"
out=$(run boot)
case "$out" in SESSION) ok "boot door, fresh marker but stock's entry is missing: a session starts rather than nothing" ;; *) bad "stock missing: got [$out]" ;; esac
stock_present

echo "$now" > "$T/quit-to-stock"
out=$(run tools)
case "$out" in SESSION) ok "Tools door: always a session, whatever the marker says" ;; *) bad "tools door: got [$out]" ;; esac
check "...and it clears a leftover marker" test ! -e "$T/quit-to-stock"

echo "placement:"
code() { grep -vE '^\s*#' "$LAUNCH"; }
line_of() { code | grep -nF "$1" | sed -n 1p | cut -d: -f1; }
QTS=$(line_of 'exec "$_qts_stock"')
MASK=$(line_of 'DBX_SIGMASK_CLEARED=1 exec python3')
BODY=$(line_of "setsid --wait bash -c '")
RESUME=$(line_of 'echo "caller guards its Move restart')   # the exit branch that resumes the unit
before() { [ -n "$1" ] && [ -n "$2" ] && [ "$1" -lt "$2" ]; }
check "the hand-over runs before the signal-mask pass (stock gets an untouched process)" before "$QTS" "$MASK"
check "...and before the session body" before "$QTS" "$BODY"
MARKS=$(code | grep -cF 'at_boot || date +%s > "$DBX_DIR/quit-to-stock"')
check "a Tools-door session dates its end on both ways out (quit, refused launch)" test "$MARKS" -eq 2
REFUSE_MARK=$(code | awk '/^  refuse\(\) \{/ { on = 1 } on { print } on && /^  \}/ { exit }' | grep -nF 'quit-to-stock' | cut -d: -f1)
REFUSE_RESUME=$(code | awk '/^  refuse\(\) \{/ { on = 1 } on { print } on && /^  \}/ { exit }' | grep -nF 'unit --resume-launcher' | cut -d: -f1)
check "...in refuse(), before it resumes the launcher" before "$REFUSE_MARK" "$REFUSE_RESUME"
MARK=$(code | grep -nF 'at_boot || date +%s > "$DBX_DIR/quit-to-stock"' | sed -n 2p | cut -d: -f1)
check "...inside the body, before the launcher is resumed (the selector runs after that)" before "$BODY" "$MARK"
check "...before the exit branch that resumes it" before "$MARK" "$RESUME"
no_default_write() { ! code | grep -qE '>\s*"?[^ ]*boot-targets/default'; }
check "the launcher never writes boot-targets/default" no_default_write
quotefree() { ! awk '/^setsid --wait bash -c/ { on = 1; next } on && /^.  *dbx-launch/ { on = 0 } on' "$LAUNCH" | grep -n 'quit-to-stock' | grep -q "'"; }
check "the marker line adds no apostrophe to the quoted body" quotefree

[ "$fails" -eq 0 ] && echo "PASSED" || { echo "FAILED" >&2; exit 1; }
