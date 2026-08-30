#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# The launch preflight must (a) run, (b) never refuse a launch, and (c) actually
# check each seam it claims to.
#
# It exists because a stock v1.0.0 update broke dAVEBOx twice with no error
# anywhere (see standalone/scripts/preflight.sh). Its whole value is being LOUD,
# so a preflight that silently stops checking something is worse than none.

fail() { echo "FAIL: $*" >&2; exit 1; }
pf=standalone/scripts/preflight.sh
launch=standalone/scripts/launch.sh

[ -x "$pf" ] || fail "$pf missing or not executable"

# (a) the launcher calls it
command grep -q 'scripts/preflight.sh' "$launch" ||
  fail "launch.sh never runs the preflight — it checks nothing at all"

# (b) it can never refuse a launch. A degraded session the user can work in
#     beats a correct one that will not start.
command grep -qE '^exit 0$' "$pf" ||
  fail "preflight.sh does not end in an unconditional exit 0"
command grep -qE '^\s*exit [1-9]' "$pf" &&
  fail "preflight.sh has a non-zero exit path — it must report, never refuse"
command grep -q '|| true' "$launch" ||
  fail "launch.sh does not tolerate a preflight failure"

# (c) each seam is still checked. Derived from the failure modes we have
#     actually hit or can name, so dropping one is a test failure.
for probe in \
    'modules/ is a symlink into the stock tree' \
    'is a SYMLINK — we are running stock' \
    'changed since install' \
    'davebox-sa/standalone' \
    'launch-standalone.sh' \
    'modules import shared files this install does not have'; do
  command grep -qF "$probe" "$pf" ||
    fail "preflight no longer checks: $probe"
done

# The manifest is what makes "changed since install" possible at all, and it is
# byte-identical module.json that made a hash the ONLY way to see the v1.0.0
# chain swap. It must be written AFTER the launcher stub is installed, or it
# records the outgoing stub and every launch reports a false positive (observed
# while building this, 2026-08-30).
inst=standalone/scripts/install-host.sh
man=$(command grep -n 'recording the owned-file manifest' "$inst" | head -1 | cut -d: -f1)
stub=$(command grep -n 'installing the launcher into stock' "$inst" | head -1 | cut -d: -f1)
[ -n "$man" ] || fail "install-host.sh no longer records the owned-file manifest"
[ -n "$stub" ] || fail "install-host.sh no longer installs the launcher stub"
[ "$man" -gt "$stub" ] ||
  fail "the manifest is recorded BEFORE the launcher stub is installed (line $man vs $stub) — it would hash the outgoing stub and every launch would report a false positive"

echo "PASS: launch preflight contract intact"
