#!/usr/bin/env bash
# The launcher supervisor is one long `setsid bash -c '...'` body, and that
# shape has two silent failure modes this pins.
#
# 1. ⚠⚠ AN APOSTROPHE ENDS THE BODY. The whole supervisor is inside single
#    quotes, so one "doesn't" in a COMMENT closes the string and the rest of the
#    script becomes garbage — the launcher would break entirely, and nothing
#    else parses this file. Caught in the act while writing the wait below.
#
# 2. The exit path must WAIT for stock Move before returning. Our caller is
#    stock's launch-standalone.sh, which sleeps 0.5 s, checks `pidof
#    MoveOriginal`, and nohup-starts a SECOND Move when it sees none. That
#    duplicate claims com.ableton.move, so the real Move never registers it and
#    saveSongIfDirty answers NoReply — a stock edit made just before launching
#    dAVEBOx is silently lost (measured: 3 skipped saves in 90). The caller
#    lives in the STOCK tree, which we never touch, so the fix is to make its
#    guard true: hold until MoveOriginal is up. The ORDER is the property —
#    waiting before resuming the unit would wait for something that cannot
#    arrive.
set -u
cd "$(dirname "$0")/../.."
LAUNCH=standalone/scripts/launch.sh
[ -f "$LAUNCH" ] || { echo "FAIL: $LAUNCH missing" >&2; exit 1; }

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}

echo "test_launch_supervisor_body"

start=$(grep -n "^setsid bash -c '$" "$LAUNCH" | head -1 | cut -d: -f1)
end=$(grep -n "^' &$" "$LAUNCH" | head -1 | cut -d: -f1)
check "the supervisor body is delimited as expected" \
    bash -c "[ -n '$start' ] && [ -n '$end' ] && [ '$start' -lt '$end' ]"

body=$(mktemp)
sed -n "$((start + 1)),$((end - 1))p" "$LAUNCH" > "$body"

# ⭑ The real check: the body must be valid shell ON ITS OWN. An apostrophe
# anywhere in it (including in a comment) truncates it, and this is what notices.
check "the body parses standalone (no stray apostrophe)"  bash -n "$body"
check "...and under plain sh too (the device runs it as bash, but stay honest)" \
    sh -n "$body"
check "no apostrophe anywhere in the body" \
    bash -c "! grep -q \"'\" '$body'"

# The exit-path ordering.
resume_line=$(grep -n -- "--resume-launcher" "$body" | head -1 | cut -d: -f1)
wait_line=$(grep -n "pidof MoveOriginal" "$body" | tail -1 | cut -d: -f1)
check "the launcher unit is resumed on the way out" test -n "$resume_line"
check "and stock Move is waited for AFTER that, not before" \
    bash -c "[ -n '$wait_line' ] && [ '$wait_line' -gt '$resume_line' ]"
check "the wait is BOUNDED (a hung Move must not strand the exit)" \
    grep -qE '_wait"? -(lt|ge) [0-9]+' "$body"

rm -f "$body"
[ "$fails" = 0 ] && echo "PASS: launch supervisor body" || echo "FAIL: launch supervisor body"
exit $fails
