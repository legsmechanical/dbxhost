#!/bin/sh
# tests/test_builtin_modules_external.sh — QuickJS's built-in modules stay
# EXTERNAL in every UI bundle.
#
# `os` and `std` exist only inside QuickJS on the device. A bundler that does
# not mark one external either fails to resolve it or pulls in Node's module of
# the same name, and neither shows up until the device reports "failed to load
# tool". So: every built-in a ui/*.mjs imports must be named --external in each
# bundler that builds ui/ui.js.
set -u
cd "$(dirname "$0")/.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

used=$(grep -hoE "from '(os|std)'" ui/*.mjs ui/ui.js 2>/dev/null | sed -E "s/from '(.*)'/\1/" | sort -u)
[ -n "$used" ] || bad "no ui module imports os or std — this check found nothing to check"
for b in scripts/build_sound.sh scripts/bundle_ui.sh; do
    body=$(cat "$b")
    for m in $used; do
        case "$body" in
            *"--external:$m "*|*"--external:$m"*) ok "$b keeps '$m' external" ;;
            *) bad "$b bundles ui/ui.js but does not mark '$m' external" ;;
        esac
    done
done
exit $fail
