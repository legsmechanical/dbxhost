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

# The HOST's own copy. shadow_ui.js owns the Shift+Back exit and reads the same
# marker, so a DBX_DIR change that misses this line breaks exit-to-stock from the
# host side with nothing failing. This one is in-repo and was simply overlooked.
check "shadow_ui.js STANDALONE_DIR"    "$HERE/../src/shadow/shadow_ui.js" "STANDALONE_DIR = \"$DBX_DIR\""

# The DAVEBOX half. These carry the literal for a real reason — the same ui.js
# also runs under stock Schwung, where $DBX_DIR does not exist, so the path must
# be a well-known constant rather than something discovered from the host. What
# was NOT justified is that they went unchecked: while davebox was a separate
# repo this script could not see them, so config.sh's own warning could only say
# "grep the module repo before you assume you are done". They are in this tree
# now, so they are pinned like everything else.
#
# The failure they guard is quiet in the worst way: exit-to-stock and project
# switch are `host_system_cmd` calls, so a wrong path is a command that does
# nothing, with no error anywhere.
DBX="$HERE/../davebox"
check "davebox ui_engine host dir"     "$DBX/ui/ui_engine.mjs"   "'$DBX_DIR'"
check "davebox ui_dialogs project cmd" "$DBX/ui/ui_dialogs.mjs"  "'$DBX_DIR/scripts/project-cmd.sh'"
check "davebox ui_dialogs projects"    "$DBX/ui/ui_dialogs.mjs"  "'$DBX_DIR/projects.json'"
check "davebox ui_tick exit-to-stock"  "$DBX/ui/ui_tick.mjs"     "sh $DBX_DIR/scripts/exit-to-stock.sh"
check "davebox seq8.c set_pages dir"   "$DBX/dsp/seq8.c"         "\"$DBX_DIR/set_pages\""
check "davebox seq8.c select marker"   "$DBX/dsp/seq8.c"         "\"$DBX_DIR/fresh_session\""

# The SHM namespace, not just the install dir. launch.sh clears the namespace on
# both edges; if DBX_SHM_PREFIX changes and these do not, the host builds with a
# new namespace that launch.sh then never cleans -- reproducing exactly the stale
# -ring hang the prefix exists to prevent.
check "launch.sh clears SHM namespace" "$HERE/scripts/launch.sh" "/dev/shm/${DBX_SHM_PREFIX#/}*"

if [ "$fail" != "0" ]; then
    echo "config drift — fix the file above, or config.sh if the new value is intended" >&2
    exit 1
fi
echo "config contract ok"
