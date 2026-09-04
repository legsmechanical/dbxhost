#!/usr/bin/env bash
set -euo pipefail

# Exit-to-stock must NEVER consult the primary-surface / service-stack state.
#
# The teardown path (shim Shift+Back handler, exit-to-stock.sh, davebox-heal,
# the launcher's exit half) is the recovery path — it must work when the JS
# stack is wedged, mid-service, or crashed, so it stays SHIM-LEVEL and reads
# nothing derived from the primary model. "Hard reboot → clean stock, no
# residue" is non-negotiable; a teardown that asks the JS stack for anything
# turns a JS fault into an unrecoverable session. (Plan §P4b / Risks.)

cd "$(dirname "$0")/../.."

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. No C-side teardown participant references the primary/service model —
#    it lives entirely in shadow_ui.js.
for f in src/schwung_shim.c src/shadow/shadow_ui.c standalone/src/davebox-heal.c; do
  [ -f "$f" ] || fail "$f is missing — this grep read nothing (a stale path here once made the test pass vacuously)"
  rg -q 'primarySurface|primaryStack|PRIMARY_SERVICES|host_open_service|host_register_primary' "$f" \
    && fail "$f (teardown-adjacent C) references primary-surface state"
done

# 2. No teardown/exit script consults JS-side or primary state.
for f in standalone/scripts/exit-to-stock.sh standalone/scripts/quiesce-stock.sh \
         standalone/scripts/launch.sh; do
  rg -q 'primary|host_open_service|service_stack' "$f" \
    && fail "$f consults primary/service state on the teardown path"
done

# 3. The primary model's own teardown is unconditional state-clearing, not a
#    consultation: exitOvertakeMode must reset all three pieces.
js="src/shadow/shadow_ui.js"
for sym in 'primarySurface = null' 'primaryStack = \[\]' \
           'primaryPrevClaims = \{ \.\.\.PRIMARY_NEUTRAL_CLAIMS \}'; do
  rg -q "$sym" "$js" \
    || fail "$js exitOvertakeMode no longer clears primary state ($sym)"
done

echo "PASS: teardown path reads no primary/service state; JS exit clears it unconditionally"
exit 0
