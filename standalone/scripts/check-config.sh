#!/bin/sh
# Pin the copies of the install-dir contract that cannot source config.sh.
#
# config.sh is authoritative, but three consumers must carry a literal:
#   - launch.sh, because it is installed as one self-contained file
#   - install-privileged.sh, which is deployed as $DBX_DIR/bless.sh at the ROOT of
#     the install tree, so a relative source would land outside the payload
#   - davebox-heal.c, whose fallback #define must match (it is setuid-root, so
#     the value must stay a compile-time constant and never come from input)
#
# Without this check "one source of truth" is a comment, not a property. Run it
# from CI and from the build scripts.

set -e

HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/config.sh"

fail=0

check() {
    # check <description> <file> <expected-literal-line>
    if grep -qF -- "$3" "$2"; then
        echo "  ok   $1"
    else
        echo "  FAIL $1"
        echo "       $2 does not contain: $3"
        echo "       config.sh says DBX_DIR=$DBX_DIR"
        fail=1
    fi
}

echo "checking the install-dir contract against config.sh (DBX_DIR=$DBX_DIR)"
check "launch.sh carries DBX_DIR"      "$HERE/scripts/launch.sh"   "DBX_DIR=$DBX_DIR"
check "davebox-heal.c fallback define" "$HERE/src/davebox-heal.c"  "\"$DBX_DIR\""
check "launch.sh LD_PRELOAD soname"    "$HERE/scripts/launch.sh"   "LD_PRELOAD=$DBX_SHIM_SONAME"
check "heal.c installs that soname"    "$HERE/src/davebox-heal.c"  "/usr/lib/$DBX_SHIM_SONAME"
check "bless.sh carries DBX_DIR"       "$HERE/scripts/install-privileged.sh" "DBX_DIR=$DBX_DIR"
check "bless.sh heal name"             "$HERE/scripts/install-privileged.sh" "DBX_HEAL_NAME=$DBX_HEAL_NAME"
check "bless.sh soname"                "$HERE/scripts/install-privileged.sh" "DBX_SHIM_SONAME=$DBX_SHIM_SONAME"

if [ "$fail" != "0" ]; then
    echo "config drift — fix the file above, or config.sh if the new value is intended" >&2
    exit 1
fi
echo "config contract ok"
