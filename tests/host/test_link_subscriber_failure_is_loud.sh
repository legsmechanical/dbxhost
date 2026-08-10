#!/usr/bin/env bash
set -euo pipefail

# Link Audio is load-bearing (the Move FX buses and all Move-track processing
# run only under the Link Audio rebuild), and it failed SILENTLY at three
# stacked layers at once:
#
#   1. libs/link is a submodule. Uninitialised, build.sh printed one quiet
#      "Warning: Link SDK not found" and carried on.
#   2. No build/link-subscriber therefore existed, so the installer — which
#      deploys build/* wholesale — simply had nothing to copy. No error.
#   3. At runtime launch_link_subscriber() did `if (access(...) != 0) return;`
#      with no log, while its monitor loop retried ~10x/second logging
#      "launching subscriber (started=0 pid=-1)" — which reads like a crashing
#      subscriber, not a missing one.
#
# Net effect: the feature could not run on the device and nothing anywhere said
# why. This pins the diagnosis at each layer. It deliberately does NOT require
# the submodule to be present (a host-only iteration is still valid) — it
# requires that its absence is impossible to miss.

shim_proc="src/host/shadow_process.c"
build_sh="scripts/build.sh"
install_sh="standalone/scripts/install-host.sh"

# --- layer 3: the runtime must name the cause -------------------------------
# The access() guard must not be a bare `return`.
if grep -qE 'access\(sub_path, X_OK\) *!= *0\) *return;' "$shim_proc"; then
  echo "FAIL: launch_link_subscriber() returns silently on a missing binary." >&2
  echo "      The monitor loop then retries forever without ever naming the" >&2
  echo "      cause — Link Audio is dead and undiagnosable. Log it." >&2
  exit 1
fi
if ! grep -q 'Link Audio DISABLED' "$shim_proc"; then
  echo "FAIL: the missing-subscriber path no longer logs 'Link Audio DISABLED'." >&2
  exit 1
fi

# --- layer 1: the build skip must be loud -----------------------------------
if ! grep -q 'WARNING: Link SDK not found' "$build_sh"; then
  echo "FAIL: build.sh's Link SDK skip is no longer a prominent warning." >&2
  echo "      A one-line notice is what let this reach a device." >&2
  exit 1
fi
if ! grep -q 'git submodule update --init --recursive libs/link' "$build_sh"; then
  echo "FAIL: build.sh no longer tells the reader how to fix the missing SDK." >&2
  exit 1
fi

# --- layer 2: the installer must notice an incomplete payload ---------------
if ! grep -q 'build/link-subscriber' "$install_sh"; then
  echo "FAIL: install-host.sh no longer checks that link-subscriber is in the" >&2
  echo "      payload. Without it the deploy looks complete and Link Audio is" >&2
  echo "      absent on the device." >&2
  exit 1
fi

# The path the shim resolves must stay the top level of the install dir, which
# is where the installer's build/* merge lands it. A move into bin/ would
# reintroduce the same "installed but not found" failure.
if ! grep -q 'SCHWUNG_INSTALL_DIR "/link-subscriber"' "$shim_proc"; then
  echo "FAIL: the subscriber path changed. It must stay at the install dir root," >&2
  echo "      which is where the installer's build/* merge puts it." >&2
  exit 1
fi

echo "PASS: missing link-subscriber is loud at all three layers (build, install, runtime)"
exit 0
