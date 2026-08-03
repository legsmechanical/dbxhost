#!/usr/bin/env bash
set -euo pipefail

# The standalone runtime scripts must be staged into the install payload.
#
# A standalone session resolves these by ABSOLUTE path inside the install tree,
# so if the build does not stage them the failure lands at the worst moment and
# looks like a device fault:
#
#   scripts/quiesce-stock.sh   standalone/scripts/launch.sh -- without it the
#                              launcher cannot stand the stock stack down, so the
#                              session never comes up at all
#   scripts/exit-to-stock.sh   src/shadow/shadow_ui.js Shift+Back AND the hosted
#                              module's Quit -- without it BOTH exits are dead
#                              ends and the only way back to stock is a reboot
#   bless.sh                   the one-time root step (standalone/README.md)
#
# This regressed once by omission: the scripts lived in a different repo from the
# host build and were placed on the device by hand, so every install worked until
# somebody did a clean one.

if [ ! -d standalone ]; then
  echo "SKIP: no standalone/ in this tree (ordinary upstream-shaped build)"
  exit 0
fi

fail=0
for want in \
  "cp ./standalone/scripts/quiesce-stock.sh ./build/scripts/" \
  "cp ./standalone/scripts/exit-to-stock.sh ./build/scripts/" \
  "cp ./standalone/scripts/install-privileged.sh ./build/bless.sh"
do
  if ! grep -qF -- "$want" scripts/build.sh; then
    echo "FAIL: scripts/build.sh does not stage: $want" >&2
    fail=1
  fi
done

# The callers, pinned so a rename on either side is caught rather than shipped.
if ! grep -q 'scripts/quiesce-stock.sh' standalone/scripts/launch.sh; then
  echo "FAIL: launch.sh no longer calls scripts/quiesce-stock.sh -- update this test" >&2
  fail=1
fi
if ! grep -q 'scripts/exit-to-stock.sh' src/shadow/shadow_ui.js; then
  echo "FAIL: shadow_ui.js no longer calls scripts/exit-to-stock.sh -- update this test" >&2
  fail=1
fi

if [ "$fail" != "0" ]; then
  exit 1
fi

echo "PASS: standalone runtime payload is staged by the build"
exit 0
