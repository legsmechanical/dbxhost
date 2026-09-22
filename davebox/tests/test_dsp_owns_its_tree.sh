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

# --- 1. No path in the DSP names the stock tree ----------------------------
#
# No allow-list. The one exemption there was — the Ableton-export staging dir —
# left the stock tree on 2026-09-22 with the finished bundles, and the rule
# above said to delete the exemption when it did.
stock_hits() { grep -rn -- "$STOCK" "$1" || true; }

hits=$(stock_hits dsp/)
if [ -z "$hits" ]; then
    ok "no DSP path names the stock install"
else
    bad "the DSP names the stock install:"
    echo "$hits" >&2
fi

# Positive control on the search itself: plant the literal in a copy of dsp/
# and require the SAME search to find it, or "no hits" above would only mean
# the pattern never matches anything.
ctl=$(mktemp -d)
trap 'rm -rf "$ctl"' EXIT
cp -R dsp "$ctl/dsp"
echo "#define PLANTED \"$STOCK/planted.txt\"" >> "$ctl/dsp/seq8_bake.c"
if [ -n "$(stock_hits "$ctl/dsp")" ]; then
    ok "⚠ control: the search finds a stock path planted in a copy of dsp/"
else
    bad "control: the search cannot see a planted stock path — this pin proves nothing"
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
