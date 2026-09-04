#!/usr/bin/env bash
# Source-invariant pins for the SELECT-BEFORE-LOAD watchdog vs the select
# HANDOFF (found on hardware 2026-08-11).
#
# The failure this guards against is not visible in any unit: davebox declares
# `suspend_keeps_js`, so its tick keeps running while it is parked for a project
# handoff, and mid-handoff every condition the watchdog tests is transiently
# true — the picker was closed on the way out, and the DSP still reports
# "awaiting" because the chosen project has not loaded yet. The watchdog armed a
# picker reopen that landed after the resume, so the session came back to the
# picker on top of the project it had just loaded, with input gated by
# awaitingProjectSelect. Every control dead, nothing logged as an error.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()   { echo "  ok   — $1"; }
bad()  { echo "  FAIL — $1"; fail=1; }

echo "select handoff vs SELECT-BEFORE-LOAD watchdog:"

# 1. The watchdog must be suppressed while a handoff is in flight. Without this
#    the repair fires DURING the thing that would end the condition it repairs.
awk '/SELECT-BEFORE-LOAD watchdog/,/ledInitComplete\) \{/' ui/ui_tick.mjs \
    | grep -q "S.selectHandoffUntil === 0" \
    && ok "the watchdog is gated on no handoff being in flight" \
    || bad "the watchdog can fire mid-handoff again — this is the wedge"

# 2. The window must open BEFORE the actuator is armed. Our own tick can run as
#    soon as the next frame, so arming first leaves exactly the gap that bit.
armline=$(grep -n "shadow_select_arm(_psw);" ui/ui_tick.mjs | cut -d: -f1)
winline=$(grep -n "S.selectHandoffUntil = nowMs() + SELECT_HANDOFF_MS;" ui/ui_tick.mjs | cut -d: -f1)
if [ -n "$armline" ] && [ -n "$winline" ] && [ "$winline" -lt "$armline" ]; then
    ok "the handoff window opens before the actuator is armed"
else
    bad "the handoff window is opened after (or not at) the arm site"
fi

# 3. It must EXPIRE, not latch. It suppresses the only mechanism that recovers
#    a stranded session, so a handoff that never lands must not disable that
#    recovery forever. A millisecond DEADLINE on the one clock (2026-09-05): as
#    a tick countdown it had shrunk to ~4 s when the tick sped up — shorter than
#    the measured 6.5 s handoff, i.e. the wedge this file exists for, back again.
grep -q "if (S.selectHandoffUntil > 0 && S.clockMs >= S.selectHandoffUntil) S.selectHandoffUntil = 0;" ui/ui_tick.mjs \
    && ok "the window expires on its own, against the clock" \
    || bad "nothing ages the handoff window — a dead handoff disables the watchdog forever"
grep -qE "^const SELECT_HANDOFF_MS = [0-9]+;" ui/ui_tick.mjs \
    && ok "the timeout is a named constant, in milliseconds" \
    || bad "SELECT_HANDOFF_MS is missing"
ms=$(grep -E "^const SELECT_HANDOFF_MS = [0-9]+;" ui/ui_tick.mjs | grep -oE "[0-9]+")
[ "${ms:-0}" -ge 10000 ] \
    && ok "...and it is longer than the 6.5 s measured handoff ($ms ms)" \
    || bad "SELECT_HANDOFF_MS=$ms is not comfortably above the 6.5 s measured handoff"

# 4. It must close where the load is PROVEN, i.e. beside the awaiting_select
#    readback — not on resume, since a resume can also arrive with nothing
#    loaded (backing out of the gate), which is the watchdog's job again.
awk '/S.awaitingProjectSelect = _awUnknown/,/^$/' ui/ui_tick.mjs \
    | grep -q "S.selectHandoffUntil = 0;" \
    && ok "the window closes at the awaiting_select readback" \
    || bad "the handoff window is not closed where the load is proven"

exit $fail
