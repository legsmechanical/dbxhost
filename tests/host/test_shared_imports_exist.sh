#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Modules and the shadow UI import shared utilities by their DEVICE-ABSOLUTE
# canonical path (/data/UserData/schwung/shared/...), which the module loader
# rewrites to the running build's own shared/ dir — that rewrite is what lets
# two installs share one modules directory.
#
# The consequence: a shared module named in an import must EXIST in src/shared,
# or the file resolves to nothing and QuickJS fails the import. That failure is
# nasty out of proportion to its cause — shadow_ui.js dies at eval, so the
# session comes up with no UI at all, and `node --check` cannot see it because
# the file itself parses fine.
#
# The same rewrite is why a shared module must never be hand-copied to one tree:
# shared/ and modules/ ship from one build, and the invariant this test defends
# is that everything imported is in that build.

fail=0
missing=0

# Every device-absolute shared import across the host, the shared modules
# themselves, the built-in modules, and davebox.
imports=$(grep -rhoE "/data/UserData/schwung/shared/[A-Za-z0-9_.-]+\.mjs" \
    src/shadow src/shared src/modules src/host davebox/ui davebox/tests 2>/dev/null | sort -u)

if [ -z "$imports" ]; then
  echo "FAIL: found no shared imports at all — the grep is wrong, not the tree" >&2
  exit 1
fi

for imp in $imports; do
  base=$(basename "$imp")
  if [ -f "src/shared/$base" ]; then
    echo "  ok   — $base"
  else
    echo "  FAIL — $base is imported but absent from src/shared" >&2
    missing=$((missing+1))
    fail=1
  fi
done

# The build copies src/shared/*.mjs wholesale; if that ever became a hand-listed
# set, a new shared module would be imported everywhere and shipped nowhere.
if ! grep -q 'for f in ./src/shared/\*.mjs' scripts/build.sh; then
  echo "FAIL: scripts/build.sh no longer copies every src/shared/*.mjs — a new shared module may not ship" >&2
  fail=1
fi

[ $fail -eq 0 ] && echo "PASS: every shared import resolves to a file that ships"
exit $fail
