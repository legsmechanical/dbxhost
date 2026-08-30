#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Every script the standalone session invokes at RUNTIME must be copied into
# build/ by scripts/build.sh.
#
# WHY. These are resolved by absolute path inside the install tree
# ($DBX_DIR/scripts/...), so a missing one is not a build error, not a link
# error, and not a startup error -- it is a silent no-op at the moment it is
# needed. The launcher shipped once with exactly this shape: a session that
# could not quiesce stock and two exit paths calling a script that was not
# there. The same class cost a whole hardware round on 2026-08-29, when
# shared/param_pages/ was state-imported without its build hunk and the device
# came up with a blank screen.
#
# This derives the list from the CALLERS rather than restating it, so adding a
# new runtime script and forgetting the cp is caught by the test that already
# exists instead of needing a new one.

fail() { echo "FAIL: $*" >&2; exit 1; }

build=scripts/build.sh
[ -f "$build" ] || fail "$build missing"

callers="standalone/scripts/launch.sh src/shadow/shadow_ui.js standalone/scripts/quiesce-stock.sh"
for f in $callers; do [ -f "$f" ] || fail "$f missing"; done

# Names referenced as <install dir>/scripts/<name>, however the dir is spelled.
refs=$(command grep -hoE '(\$DBX_DIR|\$\{DBX_DIR\}|/data/UserData/dbx-host|" \+ STANDALONE_DIR \+ ")/scripts/[A-Za-z0-9_.-]+' $callers 2>/dev/null |
       command sed -E 's:.*/scripts/::' | sort -u)

[ -n "$refs" ] || fail "found no runtime script references — this test would pass vacuously"

missing=""
for name in $refs; do
    # Only .sh/.py are shipped from standalone/scripts; anything else is a
    # different mechanism and not this test's business.
    case "$name" in *.sh|*.py) ;; *) continue ;; esac
    [ -f "standalone/scripts/$name" ] || continue   # not one of ours
    command grep -q "standalone/scripts/$name" "$build" ||
        missing="$missing $name"
done

[ -z "$missing" ] && echo "PASS: every runtime script the session calls is packaged by build.sh" && exit 0

fail "scripts/build.sh does not copy:$missing
      They are invoked by absolute path at runtime, so the failure is SILENT —
      the call simply does nothing at the moment it is needed."
