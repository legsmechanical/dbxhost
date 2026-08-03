#!/bin/sh
# Cross-compile davebox-heal for Move's ARM, with DBX_DIR fed from config.sh.
#
# This was previously compiled by hand and lived in no build script, so the one
# setuid-root binary in the system was also the one with no reproducible recipe.
#
# Output: build/davebox-heal (install it via install-privileged.sh, once, ever).

set -e

HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/config.sh"
"$HERE/scripts/check-config.sh"

OUT="$HERE/build"
mkdir -p "$OUT"

# Same toolchain contract as the host build (see BUILDING.md): CROSS_PREFIX set
# means compile here, otherwise go through the Docker builder image.
if [ -z "${CROSS_PREFIX:-}" ] && [ ! -f /.dockerenv ]; then
    echo "=== davebox-heal (via Docker) ==="
    REPO_ROOT="$(cd "$HERE/.." && pwd)"
    docker image inspect schwung-builder >/dev/null 2>&1 || \
        docker build --pull -t schwung-builder "$REPO_ROOT"
    exec docker run --rm -v "$REPO_ROOT":/src -w /src schwung-builder \
        sh -c "CROSS_PREFIX=aarch64-linux-gnu- ./standalone/scripts/build-heal.sh"
fi

CC="${CROSS_PREFIX}gcc"
echo "=== davebox-heal ($CC, DBX_DIR=$DBX_DIR) ==="

# -static so a setuid binary carries no dependency on a library path we do not
# control. Warnings are errors: this thing runs as root.
#
# _POSIX_C_SOURCE is required with -std=c11: strict ISO C hides fchown/fchmod,
# and -Werror then turns the implicit declarations into build failures. Declaring
# the POSIX surface explicitly is better than relaxing to -std=gnu11 — the
# implicit declaration of a function taking uid_t/gid_t is exactly the kind of
# thing that must not be papered over in a setuid-root binary.
"$CC" -O2 -std=c11 -D_POSIX_C_SOURCE=200809L -Wall -Wextra -Werror -static \
      -DDBX_DIR="\"$DBX_DIR\"" \
      -o "$OUT/$DBX_HEAL_NAME" "$HERE/src/davebox-heal.c"

echo "built $OUT/$DBX_HEAL_NAME"
"${CROSS_PREFIX}size" "$OUT/$DBX_HEAL_NAME" 2>/dev/null || true
