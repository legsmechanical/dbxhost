#!/usr/bin/env bash
set -euo pipefail

# launch.sh must bracket every standalone session with the Design-B library
# swap, and must support in-session Move relaunches.
#
# Pins three structural properties:
#   1. ENTRY: recover (backstop) then enter, both BEFORE MoveOriginal runs,
#      with a failed enter refusing the launch (a session over a half-swapped
#      library would mix the native and project worlds).
#   2. SUPERVISOR: MoveOriginal runs inside a loop honoring
#      $DBX_DIR/relaunch_requested — an in-session project switch restarts
#      Move in place instead of ending the session.
#   3. EXIT: the swap is reversed BEFORE the watchdog resumes, so stock boots
#      seeing exactly the sets it saw before the session.
#
# Also pins the single-quote ban: the whole body is a single-quoted
# `setsid bash -c` argument, so any apostrophe inside silently truncates it.

cd "$(dirname "$0")/../.."
ls=standalone/scripts/launch.sh

fail() { echo "FAIL: $*" >&2; exit 1; }
[ -f "$ls" ] || fail "$ls missing"

body_line() { grep -n "$1" "$ls" | head -1 | cut -d: -f1; }
body_line_last() { grep -n "$1" "$ls" | tail -1 | cut -d: -f1; }

recover=$(body_line 'set-swap.sh" recover')
enter=$(body_line 'set-swap.sh" enter')
run=$(body_line 'env LD_PRELOAD=.* /opt/move/MoveOriginal')
relaunch=$(body_line 'relaunch_requested')
# LAST occurrence: an early one exists on the heal-failure abort path.
swexit=$(body_line_last 'set-swap.sh" exit')
# LAST occurrence: the refuse() helper (added 2026-08-10 — a refusal after the
# watchdog pause must resume it or the device freezes) mentions resume-launcher
# early in the body; the invariant pins the NORMAL teardown path at the end.
resume=$(body_line_last 'resume-launcher')

[ -n "$recover" ] || fail "no set-swap recover in launch.sh"
[ -n "$enter" ]   || fail "no set-swap enter in launch.sh"
[ -n "$run" ]     || fail "MoveOriginal invocation not found"
[ -n "$relaunch" ] || fail "no relaunch_requested supervisor marker"
[ -n "$swexit" ]  || fail "no set-swap exit in launch.sh"
[ -n "$resume" ]  || fail "watchdog resume not found"

[ "$recover" -lt "$enter" ] || fail "recover must precede enter"
[ "$enter" -lt "$run" ]     || fail "enter must precede MoveOriginal"
[ "$run" -lt "$swexit" ]    || fail "swap exit must follow MoveOriginal"
[ "$swexit" -lt "$resume" ] || fail "swap exit must precede the watchdog resume"

grep -q 'while :; do' "$ls" || fail "supervisor loop missing"

# enter failure must refuse the launch — either a bare exit 1 or the refuse()
# helper (which exits 1 after resuming the watchdog) within a few lines
sed -n "${enter},$((enter+6))p" "$ls" | grep -qE 'exit 1|refuse ' ||
  fail "a failed set-swap enter no longer refuses the launch"

# refuse() must resume the watchdog before exiting — a refusal past the
# watchdog pause otherwise strands the device frozen (observed 2026-08-10) —
# and since the swap became a bind mount (2026-08-12) it must also UNDO the
# swap, or the refusal leaves the user's sets hidden under our library with
# stock Move revived on top of them.
# ⚠ Scanned over the whole function BODY, not a fixed line window: the previous
# +4 window failed the moment a comment was added inside refuse(), which says
# nothing about whether the resume is there.
refuse_def=$(body_line 'refuse() {')
[ -n "$refuse_def" ] || fail "refuse() helper missing from launch.sh"
refuse_body=$(sed -n "${refuse_def},\$p" "$ls" | awk 'NR==1{next} /^  \}/{exit} {print}')
printf '%s' "$refuse_body" | grep -q 'resume-launcher' ||
  fail "refuse() does not resume the watchdog"
printf '%s' "$refuse_body" | grep -q 'set-swap.sh" exit' ||
  fail "refuse() does not undo the library swap — a refusal would strand the user's sets hidden"

# Single-quote ban: only the setsid open/close (and pre-block comments) may
# carry one. Count quotes INSIDE the block body.
open=$(body_line "setsid bash -c '")
close=$(grep -n "^' &" "$ls" | head -1 | cut -d: -f1)
[ -n "$open" ] && [ -n "$close" ] || fail "setsid block delimiters not found"
inner=$(sed -n "$((open+1)),$((close-1))p" "$ls" | grep -c "'" || true)
[ "$inner" = "0" ] || fail "$inner single quote(s) inside the setsid block body"

echo "PASS: launch.sh project-workspace structure intact"
