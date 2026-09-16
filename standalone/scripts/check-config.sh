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
check "bless.sh heal dir"              "$HERE/scripts/install-privileged.sh" "DBX_HEAL_DIR=$DBX_HEAL_DIR"
check "bless.sh soname"                "$HERE/scripts/install-privileged.sh" "DBX_SHIM_SONAME=$DBX_SHIM_SONAME"
# The helper's HOME (2026-09-05): the launcher module's bin/ in stock's tools tree,
# where schwung#419 blesses a staged heal.new. Every caller hardcodes it.
check "heal.c fallback HEAL_DIR"       "$HERE/src/davebox-heal.c"  "\"$DBX_HEAL_DIR\""
check "heal.c installs as heal"        "$HERE/src/davebox-heal.c"  'HEAL_DIR "/heal"'
check "launch.sh heal path"            "$HERE/scripts/launch.sh"   "HEAL=$DBX_HEAL"
check "launch.sh module dir"           "$HERE/scripts/launch.sh"   "MOD=$DBX_STOCK_DIR/modules/tools/$DBX_LAUNCHER_ID"
check "set-swap heal path"             "$HERE/scripts/set-swap.sh" "$DBX_HEAL"
check "heal restore-unit verb"         "$HERE/src/davebox-heal.c"  "--install-restore-unit"
check "bless.sh calls the verb"        "$HERE/scripts/install-privileged.sh" "--install-restore-unit"

# The bind-mount swap (Phase A, 2026-08-12). set-swap.sh asks davebox-heal to
# mount/unmount, and heal hardcodes BOTH paths — so a DBX_DIR change that misses
# heal's SA_LIBRARY leaves the helper binding the wrong directory over the user's
# set library, which is the one operation here that can hide their sets. The verb
# names are pinned too: heal rejects an unknown argument, so a rename would turn
# every swap into a silent refusal to launch.
# heal COMPOSES this from its DBX_DIR define (pinned above), so pin the suffix.
check "heal SA library path"           "$HERE/src/davebox-heal.c"   'DBX_DIR "/sets/library"'
check "heal mount verb"                "$HERE/src/davebox-heal.c"   "--mount-sets"
check "heal umount verb"               "$HERE/src/davebox-heal.c"   "--umount-sets"
check "set-swap calls the mount verb"  "$HERE/scripts/set-swap.sh"  "--mount-sets"
check "set-swap calls the umount verb" "$HERE/scripts/set-swap.sh"  "--umount-sets"

# ⭑ The reserved per-project state subdir (Phase B, state-co-location): the ONE
# name every consumer must agree on. The C side and JS side WRITE state under
# it; the shell sites SKIP it when hunting the inner set dir. A case slip in any
# one of them silently re-opens the one-child bug for that site (listdir order
# is arbitrary, so it passes most of the time — the worst kind).
REPO="$(cd "$HERE/.." && pwd)"
DBX_SUBDIR_NAME=dAVEBOx
# The shell side's naming RULE (set-folder order fix): project-cmd.sh imports it.
check "state_subdir.py base name"      "$HERE/scripts/state_subdir.py"       "STATE_BASE = \"$DBX_SUBDIR_NAME\""
check "state_subdir.py name pattern"   "$HERE/scripts/state_subdir.py"       "^$DBX_SUBDIR_NAME(~[0-9]+)?\$"
check "state_subdir.py retry bound"    "$HERE/scripts/state_subdir.py"       "STATE_MAX_TRIES = 256"
check "project-cmd imports the rule"   "$HERE/scripts/project-cmd.sh"        "import state_subdir as ss"
check "select-list imports the rule"   "$HERE/scripts/select-list.sh"        "import state_subdir as ss"
# set-swap.sh used to import this too, for newest_autosave_uuid()'s state-dir
# glob — deleted (project-identity-design §3A A10): it was a live second guess
# at session identity that could override active_set.txt, which the host now
# writes only on a Move-confirmed open. set-swap.sh no longer hunts state dirs
# by name at all, so there is nothing left here to pin.
# The C side's copy of the SAME rule (dbx_state_subdir.h): the shim, the JS
# binding host_state_subdir (host UI + dAVEBOx UI) and the DSP. The DSP builds
# in a container that cannot see src/, so it carries a copy — pinned
# BYTE-IDENTICAL, then the name, pattern and retry bound against the shell's.
check "C rule base name"               "$REPO/src/host/dbx_state_subdir.h"   "#define DBX_STATE_BASE       \"$DBX_SUBDIR_NAME\""
check "C rule pattern"                 "$REPO/src/host/dbx_state_subdir.h"   "\"^$DBX_SUBDIR_NAME(~[0-9]+)?\$\""
check "C rule retry bound"             "$REPO/src/host/dbx_state_subdir.h"   "#define DBX_STATE_MAX_TRIES  256"
if cmp -s "$REPO/src/host/dbx_state_subdir.h" "$REPO/davebox/dsp/dbx_state_subdir.h"; then
    echo "  ok   davebox/dsp/dbx_state_subdir.h is byte-identical to src/host/'s"
else
    echo "  FAIL davebox/dsp/dbx_state_subdir.h differs from src/host/dbx_state_subdir.h"
    fail=1
fi
check "seq8.c uses the rule"           "$REPO/davebox/dsp/seq8.c"            "dbx_state_subdir_resolve(uuid_dir, create"
check "shim boot read uses the rule"   "$REPO/src/host/shadow_chain_mgmt.c"  "dbx_state_subdir_resolve(set_root, 0"
check "JS binding uses the rule"       "$REPO/src/host/js_host_common.c"     "dbx_state_subdir_resolve(dir, create"
check "shadow_ui.js resolves"          "$REPO/src/shadow/shadow_ui.js"       "host_state_subdir(setDir, !!create)"
check "ui_persistence resolves"        "$REPO/davebox/ui/ui_persistence.mjs" "host_state_subdir(dir, !setUuidIsProvisional(uuid))"

# The HOST's own copy. shadow_ui.js owns the Shift+Back exit, so a DBX_DIR
# change that misses this line breaks exit-to-stock from the host side with
# nothing failing. This one is in-repo and was simply overlooked.
check "shadow_ui.js STANDALONE_DIR"    "$HERE/../src/shadow/shadow_ui.js" "STANDALONE_DIR = \"$DBX_DIR\""

# The session-liveness lock (P4b). Three consumers carry the literal: the
# launcher takes the flock, the host's shadow_ui.js probes the PID payload,
# and install-host.sh's deploy guard does the same over ssh. A path drift
# here silently splits "is a session live" into two different answers.
check "launch.sh session lock"         "$HERE/scripts/launch.sh"   "9>>$DBX_SESSION_LOCK"
# The JS-side probe moved to a shared module when the file browsers started
# asking the same question — one definition of "a session is live".
check "session_state.mjs lock path"    "$HERE/../src/shared/session_state.mjs" "\"$DBX_SESSION_LOCK\""
check "install-host.sh session lock"   "$HERE/scripts/install-host.sh" "cat $DBX_SESSION_LOCK"

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
# (A "seq8.c set_pages dir" pin lived here until 2026-08-12. The 8-page set
# stash died in P3 and nothing writes one, so seq8.c no longer carries that
# literal — the pin outlived the path it was pinning.)
# The select marker is now read only by the JS half — the DSP stopped resolving
# its own identity, so its copy of this literal went with the read. The marker
# itself is unchanged: the launcher still writes it and ui.js still consumes it.
check "davebox ui.js select marker"    "$DBX/ui/ui.js"           "DAVEBOX_HOST_DIR + '/fresh_session'"
# The DSP's own files — its log and the quarantine a no-identity save parks in —
# must hang off THIS install dir. The log lived in the STOCK tree until
# 2026-09-16 and was the last dAVEBOx file there; nothing pinned it, which is
# why it survived every other pass over this list.
check "davebox seq8.c install dir"     "$DBX/dsp/seq8.c"         "\"$DBX_DIR\""
check "davebox seq8.c log path"        "$DBX/dsp/seq8.c"         'SEQ8_DBX_DIR "/" SEQ8_STATE_PREFIX ".log"'
check "davebox seq8.c quarantine"      "$DBX/dsp/seq8.c"         'SEQ8_DBX_DIR "/quarantine"'

# The SHM namespace, not just the install dir. launch.sh clears the namespace on
# both edges; if DBX_SHM_PREFIX changes and these do not, the host builds with a
# new namespace that launch.sh then never cleans -- reproducing exactly the stale
# -ring hang the prefix exists to prevent.
check "launch.sh clears SHM namespace" "$HERE/scripts/launch.sh" "/dev/shm/${DBX_SHM_PREFIX#/}*"

# The Go schwung-manager gets the prefix as a link-time stamp, not a -D flag.
# Three pins hold that seam together:
#   1. build-host.sh must export the env var that feeds the stamp;
#   2. scripts/build.sh must actually apply it in the ldflags;
#   3. shmconfig.go's compiled-in default must stay the STOCK prefix, so an
#      unstamped/stale binary under SA fails loudly (ENOENT on every segment)
#      instead of silently attaching to the wrong host's segments. Do NOT
#      "fix" that default to $DBX_SHM_PREFIX — that re-opens the silent-skew
#      hole the stamp exists to close.
check "build-host.sh exports Go shm prefix" "$HERE/scripts/build-host.sh" "SCHWUNG_SHM_PREFIX=\"\$DBX_SHM_PREFIX\""
check "build.sh stamps manager shm prefix"  "$HERE/../scripts/build.sh" "-X main.shmPrefix=\${SCHWUNG_SHM_PREFIX"
check "manager default prefix is STOCK"     "$HERE/../schwung-manager/shmconfig.go" "var shmPrefix = \"/schwung-\""

# preflight.sh runs on the DEVICE from $DBX_DIR/scripts and cannot source
# config.sh, so it carries its own copy of the owned-module list as a fallback
# default. Pin the two together: a category added to config.sh but not here
# would simply never be checked, and the check going quiet is exactly the
# failure mode the preflight exists to prevent.
check "preflight owned-module list" "$HERE/scripts/preflight.sh" "${DBX_OWNED_MODULE_DIRS:-chain tools/davebox-sound}"

if [ "$fail" != "0" ]; then
    echo "config drift — fix the file above, or config.sh if the new value is intended" >&2
    exit 1
fi
echo "config contract ok"
