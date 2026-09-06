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
# ⚠ The character class MUST include "/" — without it this matched only
# top-level shared modules and was BLIND to every subpackage import. Thirteen
# `shared/param_pages/*.mjs` imports were invisible to the one test whose whole
# job is to catch a shared import with nothing behind it (found by review,
# 2026-09-06, when a fourteenth was added). The failure it exists to prevent —
# shadow_ui.js dying at eval, so the session comes up with no UI at all and
# `node --check` cannot see it — is exactly the failure it could not see.
imports=$(grep -rhoE "/data/UserData/schwung/shared/[A-Za-z0-9_./-]+\.mjs" \
    src/shadow src/shared src/modules src/host davebox/ui davebox/tests 2>/dev/null | sort -u)

if [ -z "$imports" ]; then
  echo "FAIL: found no shared imports at all — the grep is wrong, not the tree" >&2
  exit 1
fi

subpkg=0
for imp in $imports; do
  # Keep the path BELOW shared/, not just the basename: a subpackage module
  # must exist at its own path, and two packages may hold the same file name.
  rel=${imp#/data/UserData/schwung/shared/}
  if [ -f "src/shared/$rel" ]; then
    echo "  ok   — $rel"
    case "$rel" in */*) subpkg=$((subpkg+1));; esac
  else
    echo "  FAIL — $rel is imported but absent from src/shared" >&2
    missing=$((missing+1))
    fail=1
  fi
done

# Positive control for the regex fix above: subpackage imports DO exist in this
# tree, so seeing none means the grep silently narrowed again rather than the
# tree genuinely having none. A guard that reports clean because it stopped
# looking is the failure mode this whole file is about.
if [ "$subpkg" -eq 0 ]; then
  echo "FAIL: matched no shared SUBPACKAGE imports (e.g. shared/param_pages/*.mjs) — the grep narrowed" >&2
  fail=1
else
  echo "  ok   — $subpkg subpackage import(s) matched (the grep still sees below shared/)"
fi

# The build copies src/shared/*.mjs wholesale; if that ever became a hand-listed
# set, a new shared module would be imported everywhere and shipped nowhere.
if ! grep -q 'for f in ./src/shared/\*.mjs' scripts/build.sh; then
  echo "FAIL: scripts/build.sh no longer copies every src/shared/*.mjs — a new shared module may not ship" >&2
  fail=1
fi
# ...and the SUBDIRECTORY loop, which is what actually ships param_pages/. The
# top-level check above says nothing about it, so a subpackage could be
# imported everywhere and shipped nowhere.
if ! grep -q 'for d in ./src/shared/\*/' scripts/build.sh; then
  echo "FAIL: scripts/build.sh no longer copies src/shared subpackages — a subpackage import may not ship" >&2
  fail=1
fi

[ $fail -eq 0 ] && echo "PASS: every shared import resolves to a file that ships"
exit $fail
