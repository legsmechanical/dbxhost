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

SCHWUNG_CFLAGS="-DSCHWUNG_INSTALL_DIR=\"$DBX_DIR\" -DSCHWUNG_SHM_PREFIX=\"$DBX_SHM_PREFIX\"" \
    "$REPO_ROOT/scripts/build.sh" "$@"

echo ""
echo "Host built. The launcher and heal helper are built separately:"
echo "    ./standalone/scripts/build-heal.sh"
