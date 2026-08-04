#!/usr/bin/env bash
# Build and deploy the dAVEBOx host — the other half of the dev loop.
#
# `install_sound.sh` in the module repo does the davebox half in one command; this
# does the host half. Before it existed, a host change meant hand-assembling the
# deploy: scp the binaries, work around ETXTBSY on the mapped ones, remember to
# prime the shim, remember the launcher. That is a tax on every iteration and it
# fails quietly — a partial copy leaves a truncated .so that only breaks at the
# next launch.
#
# ⚠ This is a DEVELOPER UPDATE script, not a first-time installer. It refuses if
# $DBX_DIR does not already look like an install, because a fresh install needs the
# one-time privileged step (bless.sh, as root) which cannot be done from here. The
# eventual user-facing install is a separate problem.
#
# Usage:
#   ./standalone/scripts/install-host.sh                 build + deploy everything
#   ./standalone/scripts/install-host.sh --no-build      deploy what is in build/
#   ./standalone/scripts/install-host.sh --no-module     skip the launcher module
#   ./standalone/scripts/install-host.sh --force         deploy over a LIVE session
#   MOVE_HOST=172.16.254.1 ./standalone/scripts/install-host.sh    (tether)

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
. "$HERE/config.sh"

MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
DO_BUILD=1; DO_MODULE=1; FORCE=0

while [ $# -gt 0 ]; do
    case "$1" in
        --no-build)  DO_BUILD=0; shift ;;
        --no-module) DO_MODULE=0; shift ;;
        --force)     FORCE=1; shift ;;
        -h|--help)   sed -n '2,25p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 1 ;;
    esac
done

SSH="ssh -o ConnectTimeout=10 ${MOVE_USER}@${MOVE_HOST}"
say() { printf '%s\n' "$*"; }

"$HERE/scripts/check-config.sh"
say ""
say "=== dAVEBOx host deploy -> ${MOVE_USER}@${MOVE_HOST}:${DBX_DIR} ==="

# --- preflight -------------------------------------------------------------
$SSH true 2>/dev/null || { echo "cannot reach ${MOVE_HOST}" >&2; exit 1; }

$SSH "test -x '$DBX_DIR/schwung' && test -d '$DBX_DIR/shadow'" 2>/dev/null || {
    echo "ERROR: $DBX_DIR does not look like an existing install." >&2
    echo "       This script updates an install; it cannot create one — a first" >&2
    echo "       install needs the one-time root step ($DBX_DIR/bless.sh)." >&2
    exit 1
}

# ⚠ Never swap a running host's binaries by default. The live process keeps its old
# inode (so it survives), but the on-disk tree ends up half-new while the session
# continues on the old code — and the next launch runs a combination nobody built.
if $SSH "test -e '$DBX_DIR/standalone_active'" 2>/dev/null; then
    if [ "$FORCE" != "1" ]; then
        echo "" >&2
        echo "REFUSING: a standalone session is running right now." >&2
        echo "  Leave it first (Shift+Back, or Quit in the Settings menu), then re-run." >&2
        echo "  --force deploys anyway; the running session keeps the old code and the" >&2
        echo "  new code takes effect at the next launch." >&2
        exit 1
    fi
    say "WARNING: --force with a live session; new code applies at next launch."
fi

# ⚠ heal must already be setuid-root, or the shim cannot be mirrored into /usr/lib
# and the launcher will correctly refuse to start.
if ! $SSH "test -u '$DBX_DIR/bin/$DBX_HEAL_NAME'" 2>/dev/null; then
    echo "ERROR: $DBX_DIR/bin/$DBX_HEAL_NAME is not setuid-root." >&2
    echo "       Run the one-time root step:  ssh root@${MOVE_HOST} 'sh $DBX_DIR/bless.sh'" >&2
    exit 1
fi

# --- build -----------------------------------------------------------------
if [ "$DO_BUILD" = "1" ]; then
    say ""; say "--- building host"
    "$HERE/scripts/build-host.sh"
    say ""; say "--- building $DBX_HEAL_NAME"
    "$HERE/scripts/build-heal.sh"
fi

# ⚠ build.sh exits 0 even when a sub-build fails (observed: the Go step died on a
# full Docker disk and the script still reported success with no artifacts). Check
# for the artifacts themselves, never the exit status.
for a in build/schwung build/schwung-shim.so build/shadow/shadow_ui; do
    [ -f "$REPO_ROOT/$a" ] || { echo "ERROR: missing $a — build did not produce it" >&2; exit 1; }
done
[ -f "$HERE/build/$DBX_HEAL_NAME" ] || {
    echo "ERROR: missing standalone/build/$DBX_HEAL_NAME — run without --no-build" >&2; exit 1; }

# --- work out what NOT to touch --------------------------------------------
# ⚠ $DBX_DIR shares user content with the stock install through symlinks —
# modules, presets, patches, slot_state, plus two back-compat links. Copying
# build/ over them replaces each symlink with a real directory, which silently
# un-shares the user's work: edits made under one host stop appearing under the
# other, and nothing errors. So skip anything that is CURRENTLY a symlink on the
# device (read live, so this adapts if the shared set changes) and never assume.
say ""; say "--- reading the device's symlinks (shared with stock — never overwritten)"
# Newline-delimited string rather than `mapfile`: that is a bash-4 builtin and
# macOS still ships bash 3.2 at /bin/bash, so a sibling script invoked as
# `/bin/bash install-host.sh` (or with a minimal PATH) would silently get an EMPTY
# list — which here means "no symlinks to protect" and would flatten every shared
# directory. Too dangerous to depend on the interpreter being modern.
LINKS="$($SSH "find '$DBX_DIR' -maxdepth 1 -type l -printf '%f\n'" 2>/dev/null || true)"
if [ -z "$LINKS" ]; then
    echo "ERROR: found no symlinks in $DBX_DIR — expected at least modules/presets/patches." >&2
    echo "       Refusing rather than risk flattening shared directories." >&2
    exit 1
fi
printf '      keep symlink: %s\n' $LINKS

# Exact whole-line match, so a name that merely contains another is not confused
# (e.g. `move-anything-shim.so` vs `move-anything`).
is_link() {
    printf '%s\n' "$LINKS" | grep -qxF -- "$1"
}

# --- deploy ----------------------------------------------------------------
# Atomic per entry: land beside the target then mv -f. A plain scp over a mapped
# binary fails with ETXTBSY (or worse, truncates it), and shadow_ui/schwung are
# exactly the files that may be mapped.
say ""; say "--- deploying payload"
STAGE="$DBX_DIR/.deploy-stage"
$SSH "rm -rf '$STAGE' && mkdir -p '$STAGE'"

for entry in "$REPO_ROOT"/build/*; do
    name="$(basename "$entry")"
    if is_link "$name"; then say "      skip (symlink): $name"; continue; fi
    scp -qr "$entry" "${MOVE_USER}@${MOVE_HOST}:$STAGE/$name" || {
        echo "ERROR: failed to stage $name" >&2; exit 1; }
done

# heal is root-owned and setuid, so ableton cannot overwrite it. Stage it as
# <name>.new and let the CURRENT heal install its own replacement — that is heal's
# self-update path, and it needs no root.
scp -q "$HERE/build/$DBX_HEAL_NAME" \
    "${MOVE_USER}@${MOVE_HOST}:$DBX_DIR/bin/${DBX_HEAL_NAME}.new"

$SSH "set -eu
  cd '$STAGE'
  for n in *; do
    [ -e \"\$n\" ] || continue
    rm -rf '$DBX_DIR/'\"\$n\"'.old'
    if [ -e '$DBX_DIR/'\"\$n\" ]; then mv -f '$DBX_DIR/'\"\$n\" '$DBX_DIR/'\"\$n\"'.old'; fi
    mv -f \"\$n\" '$DBX_DIR/'\"\$n\"
    rm -rf '$DBX_DIR/'\"\$n\"'.old'
  done
  cd '$DBX_DIR' && rm -rf '$STAGE'
  chmod +x '$DBX_DIR/schwung' '$DBX_DIR/shadow/shadow_ui' 2>/dev/null || true
  chmod +x '$DBX_DIR'/scripts/*.sh '$DBX_DIR/bless.sh' 2>/dev/null || true
"
say "      payload in place"

# --- heal: self-update, then mirror the shim into /usr/lib -----------------
say ""; say "--- heal self-update + shim mirror (no root needed)"
$SSH "'$DBX_DIR/bin/$DBX_HEAL_NAME'" || {
    echo "ERROR: $DBX_HEAL_NAME failed — the launcher will refuse to start." >&2
    echo "       Restore from a backup or re-run the root step." >&2
    exit 1; }
$SSH "ls -l '/usr/lib/$DBX_SHIM_SONAME' | awk '{print \"      /usr/lib shim: \" \$5 \" bytes\"}'"

# --- launcher module ------------------------------------------------------
if [ "$DO_MODULE" = "1" ]; then
    say ""; say "--- installing the launcher into stock's tools dir"
    MOVE_HOST="${MOVE_USER}@${MOVE_HOST}" "$HERE/scripts/install-module.sh"
fi

say ""
say "=== done ==="
say "The host is on disk. It takes effect the next time you launch dAVEBOx SA"
say "from stock Schwung's Tools menu — no restart needed here, because launching"
say "the session is what starts this build."
