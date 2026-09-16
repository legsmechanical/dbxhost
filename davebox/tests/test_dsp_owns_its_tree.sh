#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# The DSP writes STATE and LOGS into THIS build's install dir, never into the
# stock Schwung install.
#
# ⚠⚠ WHY THIS IS A TEST AND NOT A CODE REVIEW NOTE. Two sessions on 2026-09-16
# ran their entire lives against /data/UserData/schwung/seq8sa-state.json — an
# install-wide fallback file, inside a tree we do not own — while the project
# the user had chosen was never written to once. Nothing errored and nothing
# logged: a path literal in a tree that happens to exist is indistinguishable
# at runtime from the right one. The only moment the mistake is visible is when
# somebody types the literal, which is exactly what this checks.
#
# The stock install is SHARED. Writing there is not merely untidy: a stock
# update may replace or drop what we put in it, and a stock user's tree is not
# ours to grow files in.

STOCK='/data/UserData/schwung'
fails=0
ok()   { echo "  ok   $1"; }
bad()  { echo "FAIL: $1" >&2; fails=$((fails+1)); }

# --- 1. No state/log destination in the DSP names the stock tree -----------
#
# ALLOW-LIST, and each entry is a deliberate, argued exception rather than a
# leftover. Keep it as short as it is; an allow-list that grows is a pin that
# has stopped meaning anything.
#
#   seq8_bake.c EXPORT_*  — the MIDI-export staging dir, which is the stock
#                           tree by agreement with ui_export.mjs (the export
#                           lands where the user's other exports live). It is
#                           NOT state and NOT a log. Listed, not blessed: if
#                           the export ever moves, delete the exemption too.
allowed_re='EXPORT_RENDER_PATH|EXPORT_PA_PATH'

hits=$(grep -rn -- "$STOCK" dsp/ | grep -Ev "$allowed_re" || true)
if [ -z "$hits" ]; then
    ok "no DSP state or log path names the stock install"
else
    bad "the DSP names the stock install:"
    echo "$hits" >&2
fi

# Positive control on the search itself: the grep MUST see the allow-listed
# lines, or "no hits" above would only mean the pattern never matches anything.
if grep -rn -- "$STOCK" dsp/ | grep -Eq "$allowed_re"; then
    ok "⚠ control: the search does find the allow-listed export paths"
else
    bad "control: the search found NOTHING at all — this pin proves nothing"
fi

# --- 2. There is no fallback state file, by name or by shape --------------
if grep -rn 'STATE_PATH_FALLBACK' dsp/ >/dev/null 2>&1; then
    bad "SEQ8_STATE_PATH_FALLBACK is back — 'no project' is a save destination again"
else
    ok "no fallback state path exists"
fi

# --- 3. create_instance resolves no identity of its own -------------------
# It must open exactly ONE file: its log. Anything else there is the DSP
# answering a question the host now answers once, for everybody.
ci=$(awk '/^static void \*create_instance\(/,/^}$/' dsp/seq8.c)
[ -n "$ci" ] || { echo "FAIL: create_instance not found in dsp/seq8.c" >&2; exit 1; }

opens=$(grep -c 'fopen(' <<<"$ci" || true)
if [ "$opens" = "1" ]; then
    ok "create_instance opens exactly one file (its log)"
else
    bad "create_instance opens $opens files — it must open only its log"
fi
if grep -q 'fopen(SEQ8_LOG_PATH' <<<"$ci"; then
    ok "⚠ control: the one open it does make is the log"
else
    bad "control: create_instance does not open the log — the count above is meaningless"
fi
if grep -qE 'active_set|fresh_session|SELECT_MARKER' <<<"$ci"; then
    bad "create_instance reads an identity file again — JS drives every load"
else
    ok "create_instance reads no identity file"
fi

[ "$fails" -eq 0 ] || exit 1
echo "PASS: the DSP writes only into its own tree, and resolves no identity"
