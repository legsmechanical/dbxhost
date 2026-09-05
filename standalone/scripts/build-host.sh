#!/bin/sh
# Build THIS host (the davebox build) with its own install dir and SHM namespace.
#
# Replaces the hand-typed SCHWUNG_CFLAGS invocation that lived only in a comment
# at the top of scripts/build.sh — where it could drift from the launcher and the
# heal helper with nothing to notice. Both values come from config.sh.
#
# An ordinary ./scripts/build.sh is unaffected and still produces a stock-pathed
# build; the flags are additive and default-empty upstream.

set -e

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
. "$HERE/config.sh"
"$HERE/scripts/check-config.sh"

echo "=== davebox host build ==="
echo "    install dir : $DBX_DIR"
echo "    SHM prefix  : $DBX_SHM_PREFIX"
echo ""

# SCHWUNG_SHM_PREFIX feeds the Go schwung-manager build (-ldflags -X stamp);
# the C half gets the same value via -DSCHWUNG_SHM_PREFIX in SCHWUNG_CFLAGS.
SCHWUNG_CFLAGS="-DSCHWUNG_INSTALL_DIR=\"$DBX_DIR\" -DSCHWUNG_SHM_PREFIX=\"$DBX_SHM_PREFIX\""
export SCHWUNG_CFLAGS

# ---- the SHARED BUILD CACHE (Josh, 2026-09-05: "deploy speed is worth it") ----
# Every branch deploy from a fresh worktree rebuilt the whole host in Docker
# (~10 min) because build/ is per worktree and starts empty. The cache lives
# OUTSIDE the worktrees, keyed by the CONTENT of everything the host build
# consumes plus the flavour flags — git hash-object over the tracked files, so
# uncommitted edits change the key and a stale mtime cannot fool it. A hit
# copies the cached build/ in; build.sh's own header-aware needs_rebuild then
# finds nothing to do. A miss builds and publishes. Untracked files are not in
# the key (they never were in the build either). Set DBX_BUILD_CACHE=0 to skip.
. "$HERE/scripts/build-cache.sh"
CACHE_KEY="$(dbx_build_cache_key "$REPO_ROOT" "$SCHWUNG_CFLAGS")"
dbx_build_cache_restore "$REPO_ROOT" "$CACHE_KEY"

SCHWUNG_SHM_PREFIX="$DBX_SHM_PREFIX" \
    "$REPO_ROOT/scripts/build.sh" "$@"

dbx_build_cache_publish "$REPO_ROOT" "$CACHE_KEY"

echo ""
echo "Host built. The launcher and heal helper are built separately:"
echo "    ./standalone/scripts/build-heal.sh"
