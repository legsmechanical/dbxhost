#!/usr/bin/env bash
set -euo pipefail

# A build must never ship binaries compiled for another install's shared-memory
# namespace.
#
# SCHWUNG_CFLAGS bakes the install dir and SHM prefix into every binary, but
# nothing else in the build depends on the flag VALUE — so switching flavours
# (a plain ./scripts/build.sh to verify something, then install-host.sh to
# deploy) reuses the previous flavour's objects and emits a payload for the
# wrong namespace.
#
# The failure is silent and expensive: the binary is the right size, has the
# right symbols, deploys without complaint, then cannot open its shared memory
# and exits BEFORE its first log line. No error anywhere — just a dead UI. It
# cost a long session on 2026-08-05, during which the wrong cause was blamed
# twice.
#
# Two independent layers must hold, because the first one silently degrading
# would leave nothing between a stale object file and the device:
#   1. build.sh wipes build/ when SCHWUNG_CFLAGS changes.
#   2. install-host.sh refuses to deploy binaries lacking the expected prefix.

cd "$(dirname "$0")/../.."

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

build="scripts/build.sh"
inst="standalone/scripts/install-host.sh"

fail() { echo "FAIL: $1" >&2; exit 1; }

# --- Layer 1: the flavour stamp -------------------------------------------
rg -q '\.build-flags' "$build" \
  || fail "$build no longer records the flags that produced build/ — a flavour switch would reuse stale objects"

# It must WIPE on mismatch, not merely warn: a mixed tree has no correct
# interpretation, so carrying on would ship exactly the broken artifact.
rg -q 'rm -rf "\$REPO_ROOT/build"' "$build" \
  || fail "$build no longer wipes build/ on a flavour change; warning alone still ships the wrong binary"

# The stamp must be written on every build, or the next run compares against a
# stale value and skips the wipe it needed.
rg -q 'printf .* > "\$BUILD_STAMP"' "$build" \
  || fail "$build does not write the flavour stamp after building"

# --- Layer 2: the deploy-time guard ---------------------------------------
rg -q 'verifying the payload targets' "$inst" \
  || fail "$inst no longer verifies the payload's compiled SHM prefix before deploying"

# Substring, NOT whole-line: only shadow_ui keeps the bare prefix as its own
# string; the others embed it already joined to the segment name. A -qxF match
# here rejected two correctly-built binaries and blocked a legitimate deploy.
rg -q 'grep -cF -- "\$DBX_SHM_PREFIX"' "$inst" \
  || fail "$inst no longer counts DBX_SHM_PREFIX occurrences in the built binaries"

# Two shapes that each broke this guard in practice, both of which REJECT
# correctly-built binaries (fail-closed, so they block every deploy):
#   -x  whole-line match — only shadow_ui keeps the bare prefix as its own
#       string; the others embed it joined to the segment name.
#   -q  early-exit match — the script runs `set -euo pipefail`, and grep -q
#       closes the pipe on first match, so `strings` dies of SIGPIPE and
#       pipefail marks the whole pipeline failed.
rg -q 'grep -qxF -- "\$DBX_SHM_PREFIX"' "$inst" \
  && fail "$inst uses a whole-line match — that rejects correctly-built binaries"
rg -q 'grep -qF -- "\$DBX_SHM_PREFIX"' "$inst" \
  && fail "$inst uses grep -q in a pipeline under pipefail — SIGPIPE makes it reject valid binaries"

# The guard must cover all three shipped binaries. Checking only one would pass
# while a mixed tree shipped the other two.
guard_block=$(awk '/verifying the payload targets/,/ok — all three binaries/' "$inst")
for b in 'build/schwung' 'build/schwung-shim.so' 'build/shadow/shadow_ui'; do
  printf '%s\n' "$guard_block" | rg -qF -- "$b" \
    || fail "$inst prefix guard does not cover $b"
done

# And it must ABORT, not warn.
printf '%s\n' "$guard_block" | rg -q 'exit 1' \
  || fail "$inst prefix guard does not abort the deploy on mismatch"

echo "PASS: build flavour is stamped-and-wiped, and the deploy verifies the shipped prefix"
exit 0
