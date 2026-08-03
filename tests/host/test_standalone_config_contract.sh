#!/usr/bin/env bash
set -euo pipefail

# The standalone install-dir contract must not drift.
#
# standalone/config.sh is the one place DBX_DIR, the SHM prefix and the shim
# soname are declared — but three consumers cannot source it and must carry a
# literal instead:
#
#   scripts/launch.sh            installed as ONE self-contained file (the module
#                                dir receives only module.json + `standalone`)
#   scripts/install-privileged.sh deployed as $DBX_DIR/bless.sh at the ROOT of the
#                                install tree, so a relative source lands outside
#                                the payload
#   src/davebox-heal.c           setuid-root: the value must stay a compile-time
#                                constant, never taken from input
#
# Any of those silently disagreeing with config.sh breaks the boot path in a way
# that looks like a device fault, not a config error: the launcher primes a shim
# for one directory and execs a host installed in another. Without this test the
# "single source of truth" is a comment rather than a property.

check="standalone/scripts/check-config.sh"

if [ ! -x "$check" ]; then
  echo "FAIL: $check missing or not executable" >&2
  exit 1
fi

if ! out="$(sh "$check" 2>&1)"; then
  echo "FAIL: standalone config contract drifted" >&2
  echo "$out" >&2
  exit 1
fi

echo "PASS: standalone install-dir contract matches config.sh"
exit 0
