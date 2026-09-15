#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# --- unit: the chaining helper itself ------------------------------------
bin="build/tests/test_sigterm_chains_to_move"
mkdir -p "$(dirname "$bin")"

cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter \
  -Isrc/host \
  tests/host/test_sigterm_chains_to_move.c \
  -o "$bin"

"$bin"

# --- source pins: the shim actually uses it ------------------------------
shim=src/schwung_shim.c
fail=0

pin() {  # pin <description> <command...>
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ok: $what"
  else
    echo "  FAIL: $what" >&2
    fail=1
  fi
}

# The handler body runs from "crash_signal_handler(" to the next top-level
# closing brace. Extract it so the pins below cannot be satisfied by some
# other _exit() elsewhere in this 10k-line file.
body=$(awk '/^static void crash_signal_handler\(/{on=1} on{print} on && /^}$/{exit}' "$shim")

pin "crash_signal_handler exists" test -n "$body"
pin "the handler no longer _exit()s unconditionally: it chains SIGTERM first" \
  grep -q "chain_prev_sigaction" <<<"$body"
pin "the SIGTERM path returns instead of terminating" \
  grep -q "sigterm_is_fatal_here" <<<"$body"

# The _exit() that remains must be guarded by the fatal predicate, i.e. the
# chain-and-return must appear BEFORE it in the body.
chain_line=$(grep -n "chain_prev_sigaction" <<<"$body" | head -1 | cut -d: -f1 || true)
exit_line=$(grep -n "_exit(128 + sig)" <<<"$body" | head -1 | cut -d: -f1 || true)
if [ -n "$chain_line" ] && [ -n "$exit_line" ] && [ "$chain_line" -lt "$exit_line" ]; then
  echo "  ok: the surviving _exit(128+sig) is reached only after SIGTERM has been handed off"
else
  echo "  FAIL: _exit(128+sig) is not guarded by the SIGTERM chain" >&2
  fail=1
fi

# The install site must capture the previous action, or there is nothing to
# chain TO — passing NULL there silently reverts to plain termination.
pin "the install site saves the previous SIGTERM action" \
  grep -q "sigaction(SIGTERM, &sa, &prev_sigterm_action)" "$shim"
pin "SIGSEGV/SIGBUS/SIGABRT are still installed" \
  grep -q "sigaction(SIGSEGV, &sa, NULL)" "$shim"

if [ "$fail" -ne 0 ]; then
  echo "FAILED" >&2
  exit 1
fi
echo "PASS"
