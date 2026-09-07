#!/usr/bin/env bash
# The gate memo is EMPTIED, and by the two things that can invalidate it.
#
# ⚠⚠ WHY IN SOURCE AND NOT IN THE JS TEST. tests/js/test_visible_if_read_memo.mjs
# proves the memo behaves — it drives the drop itself. What it cannot see is
# whether anything ever CALLS the drop: removing the tick's call left every one
# of its assertions green while turning a one-tick memo into a permanent one,
# where a gate would answer from a value read minutes ago and the wrong controls
# would stay on screen. Mutation found that; this closes it.
set -euo pipefail
cd "$(dirname "$0")/.."

f=ui/ui_sound.mjs
fail=0
need() {
  if ! grep -Fq -- "$1" "$f"; then echo "FAIL: $2"; echo "      missing: $1"; fail=1
  else echo "  ok   — $2"; fi
}

need "function ppCondReadsDrop() { if (ppCondReads.size) ppCondReads.clear(); }" \
     "the memo has ONE emptier, not a clear scattered across call sites"

# ---- 1. the tick empties it, BEFORE any early return ----------------------
#
# ⚠⚠ POSITION, NOT PRESENCE — and the first version of this pin got that wrong.
# It grepped soundTick's body for the call and stayed green for ANY placement,
# including after `if (!S.active) return;` and the text-entry guard. There the
# memo is not a per-tick memo at all: it survives an entire Save-As keyboard
# session and every period sound mode is inactive, and because gate evaluation
# runs in MIDI-callback context (not only in the tick), an event arriving between
# `closeTextEntry` and the next tick re-plans against values minutes old. The
# check asserted "re-read at most once per tick" while being blind to the only
# way that claim goes false.
body=$(awk '/^export function soundTick\(\) \{/{f=1} f{print} f && /^\}$/{exit}' "$f")
if [ -z "$body" ]; then
  echo "FAIL: soundTick not found — this pin is reading the wrong shape"; fail=1
else
  drop_at=$(printf '%s\n' "$body" | grep -n "ppCondReadsDrop();" | head -1 | cut -d: -f1)
  ret_at=$(printf '%s\n' "$body" | grep -n "return;" | head -1 | cut -d: -f1)
  if [ -z "$drop_at" ]; then
    echo "FAIL: soundTick does not empty the gate memo — it would live for the whole"
    echo "      session, and a gate would answer from a value read minutes ago"
    fail=1
  elif [ -n "$ret_at" ] && [ "$drop_at" -gt "$ret_at" ]; then
    echo "FAIL: soundTick empties the gate memo at line $drop_at of its body, AFTER the"
    echo "      early return at line $ret_at. A tick that returns early then keeps the"
    echo "      memo — across a text-entry session, or all the time sound mode is idle."
    fail=1
  else
    echo "  ok   — the TICK empties it, and does so BEFORE every early return"
  fi
fi

# ---- 1b. and the real owner: the WRITE BINDING ---------------------------
# ⭑ Not the write call sites. `queueWrite` only queues; `reload_level`, the
# baked-preset scan and the hosted canvas all write straight past it. Wrapping
# shadow_set_param makes "which call site wrote?" a question nobody has to ask.
need "        ppCondReadsDrop();" \
     "something invalidates on the way to the engine"
if ! awk '/^export function installGateMemoInvalidation\(\) \{/{f=1} f{print} f && /^\}$/{exit}' "$f" \
     | grep -Fq "globalThis.shadow_set_param = function"; then
  echo "FAIL: the invalidation no longer wraps shadow_set_param — a write that"
  echo "      bypasses queueWrite (reload_level, the preset scan) leaves gates stale"
  fail=1
else
  echo "  ok   — the invalidation wraps the WRITE BINDING, so no call site can be missed"
fi
if ! grep -Fq "installGateMemoInvalidation();" "$(dirname "$f")/ui.js"; then
  echo "FAIL: ui.js never installs the gate-memo invalidation — the wrapper exists"
  echo "      and nothing arms it, so every write leaves the memo standing"
  fail=1
else
  echo "  ok   — ui.js arms it at init"
fi

# ---- 2. a write empties it, inside queueWrite's own body -----------------
qw=$(awk '/^function queueWrite\(key, val, comp\) \{/{f=1} f{print} f && /^\}$/{exit}' "$f")
if [ -z "$qw" ]; then
  echo "FAIL: queueWrite not found"; fail=1
elif ! printf '%s\n' "$qw" | grep -Fq "ppCondReadsDrop();"; then
  echo "FAIL: a write does not empty the gate memo — a gate driven by the param"
  echo "      just written would answer from the value before the write"
  fail=1
else
  echo "  ok   — a WRITE empties it"
fi

# ---- 3. the addressing is IN the key, not merely assumed stable ----------
# ⭑ This is what makes a mid-tick retarget safe without anyone remembering to
# clear: soundRetarget moves S.slot inside a tick.
# ⭑ The addressing is IN the key, so a mid-tick retarget cannot be answered from
# the old track without anyone remembering to clear. The bus rides along because
# every bus sets S.slot = 0, which is also a real track slot.
for part in "S.slot" "S.comp" "S.bus ? S.bus.id"; do
  if ! grep -F "const ppCondReadKey" -A 2 "$f" | grep -Fq "$part"; then
    echo "FAIL: the memo key does not carry $part — a gate could be answered from"
    echo "      a different track, component or bus"
    fail=1
  fi
done
echo "  ok   — slot, bus and component are all IN the memo key"

[ "$fail" -eq 0 ] && echo "PASS: the gate memo is emptied by the tick and by every write" || exit 1
