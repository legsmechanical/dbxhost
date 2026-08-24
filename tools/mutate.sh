#!/usr/bin/env bash
# tools/mutate.sh — run ONE mutation test without destroying anything.
#
#   tools/mutate.sh <file> <find> <replace> -- <test command...>
#
# Mutation testing is: break the fix on purpose, confirm the test catches it,
# put it back. The "put it back" half is where work gets destroyed — twice in
# one day on 2026-08-24, because `git checkout -- <file>`:
#   - cannot tell a deliberate mutation from edits that were never committed,
#     so it takes both; and
#   - silently ignores UNTRACKED files, so a mutated brand-new script survived a
#     "restore" and poisoned the following run, which then reported a pass that
#     meant nothing.
#
# So this owns the whole cycle and makes the precondition non-negotiable:
#   1. REFUSE unless the tree is completely clean — commit the fix first.
#   2. Apply the mutation (literal replace, first occurrence).
#   3. Run the test. It is SUPPOSED to fail: that is the whole point.
#   4. Restore unconditionally on any exit — tracked AND untracked.
#
# Exit 0 = the mutation was CAUGHT (test failed, as it should).
# Exit 1 = it SURVIVED — the test does not actually pin that behaviour.
# Exit 2 = could not run (dirty tree, bad arguments, target text absent).
set -uo pipefail

die() { printf 'mutate: %s\n' "$*" >&2; exit 2; }

[ $# -ge 5 ] || die "usage: mutate.sh <file> <find> <replace> -- <test command...>"
file="$1"; find_s="$2"; repl_s="$3"; shift 3
[ "$1" = "--" ] || die "expected -- before the test command"
shift

repo="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not in a git repo"
cd "$repo" || die "cannot enter $repo"
[ -f "$file" ] || die "no such file: $file"

if [ -n "$(git status --porcelain)" ]; then
    printf 'mutate: REFUSING — the working tree is dirty.\n\n' >&2
    git status --short >&2
    printf '\nA mutation test can only restore what is committed. Commit the fix\n' >&2
    printf 'first, then mutate. This is the rule that broke twice on 2026-08-24.\n' >&2
    exit 2
fi

restore() {
    git checkout -- . 2>/dev/null || true
    git clean -fdq 2>/dev/null || true
}
trap restore EXIT INT TERM

python3 - "$file" "$find_s" "$repl_s" <<'PY' || exit 2
import sys
path, find_s, repl_s = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
n = s.count(find_s)
if n == 0:
    sys.exit("mutate: target text not found in %s — nothing was mutated" % path)
open(path, "w").write(s.replace(find_s, repl_s, 1))
print("mutate: applied to %s (%d match%s, changed the first)"
      % (path, n, "" if n == 1 else "es"))
PY

printf 'mutate: running: %s\n' "$*"
if "$@" >/dev/null 2>&1; then
    printf 'mutate: SURVIVED — the test passes with the fix broken.\n' >&2
    printf 'mutate:   %s: %s -> %s\n' "$file" "$find_s" "$repl_s" >&2
    exit 1
fi
printf 'mutate: caught\n'
exit 0
