#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# --- unit: the wrapper itself --------------------------------------------
bin="build/tests/test_shim_threads_block_sigterm"
mkdir -p "$(dirname "$bin")"

cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter \
  -Isrc/host \
  tests/host/test_shim_threads_block_sigterm.c \
  -o "$bin" -lpthread

"$bin"

# --- source pins ---------------------------------------------------------
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
pin_not() {  # the command must FAIL
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  FAIL: $what" >&2
    fail=1
  else
    echo "  ok: $what"
  fi
}

shim=src/schwung_shim.c

# 1. The shim must install NO SIGTERM disposition. A disposition we do not
#    install cannot pre-empt the host's sigwait() shutdown thread.
pin_not "schwung_shim.c installs no sigaction(SIGTERM" \
  grep -q "sigaction(SIGTERM" "$shim"
pin_not "schwung_shim.c installs no sigaction(SIGINT" \
  grep -q "sigaction(SIGINT" "$shim"
pin_not "schwung_shim.c installs no sigaction(SIGHUP" \
  grep -q "sigaction(SIGHUP" "$shim"

# 2. The crash diagnostics we DO want are still installed.
pin "SIGSEGV is still installed" grep -q "sigaction(SIGSEGV, &sa, NULL)" "$shim"
pin "SIGBUS is still installed"  grep -q "sigaction(SIGBUS,  &sa, NULL)" "$shim"
pin "SIGABRT is still installed" grep -q "sigaction(SIGABRT, &sa, NULL)" "$shim"

# 3. Every thread creator in the shim process goes through the wrapper.
#    Excluded on purpose (separate PROCESSES, each with its own signal
#    disposition — they are not inside the host and cannot steal its SIGTERM):
#    src/host/shadow_ui*.c, src/host/link_subscriber*, src/host/display_server*,
#    src/host/test_daemon*.
shim_units=(
  src/schwung_shim.c
  src/host/schwung_trace.c
  src/host/shadow_process.c
  src/host/shim_worker.c
  src/host/shadow_dbus.c
  src/host/shadow_sampler.c
  src/host/tts_engine_flite.c
  src/host/tts_engine_espeak.c
  src/modules/chain/dsp/chain_bus.c   # dlopened INTO the shim process
)
for f in "${shim_units[@]}"; do
  [ -f "$f" ] || { echo "  FAIL: missing $f" >&2; fail=1; continue; }
  # A raw pthread_create( call — i.e. one not preceded by "shim_".
  if grep -nE '(^|[^_[:alnum:]])pthread_create\(' "$f" >/dev/null 2>&1; then
    echo "  FAIL: raw pthread_create( in $f — use shim_pthread_create()" >&2
    grep -nE '(^|[^_[:alnum:]])pthread_create\(' "$f" >&2
    fail=1
  else
    echo "  ok: no raw pthread_create( in $f"
  fi
  pin "$f includes host/shim_thread.h" \
    grep -q '#include "host/shim_thread.h"' "$f"
done

# 4. The wrapper's own body is the ONE place pthread_create is called.
pin "shim_thread.h is the one place the real pthread_create is called" \
  grep -q "rc = pthread_create(thread, attr, start_routine, arg);" src/host/shim_thread.h

# 5. The retired chaining helper is gone, and nothing references it.
pin_not "src/host/shim_signal_chain.h is gone" test -f src/host/shim_signal_chain.h
# (spelled in two halves so this pin does not match itself)
pin_not "nothing references the chaining helper" \
  grep -rq "chain_prev""_sigaction" src tests standalone docs

if [ "$fail" -ne 0 ]; then
  echo "FAILED" >&2
  exit 1
fi
echo "PASS"
