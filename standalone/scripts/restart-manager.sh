#!/bin/sh
# Rebuild + redeploy + restart the schwung-manager sidecar on a LIVE session.
# The manager is a self-contained Go binary (go:embed templates/static), so this
# is the whole dev loop — no install-host.sh, no session restart, the browser
# just reconnects. ~10s round trip.
#
#   ./standalone/scripts/restart-manager.sh                  (WiFi)
#   MOVE_HOST=172.16.254.1 ./standalone/scripts/restart-manager.sh   (tether)
#   ./standalone/scripts/restart-manager.sh --no-build       (deploy as-built)
#
# ⚠ kill discipline: pidof by exact name, NEVER `pkill -f` — a -f pattern
#   matches the invoking ssh shell and kills the session out from under you.
# ⚠ scp lands beside the target then mv -f: a plain scp over the running
#   binary hits ETXTBSY.

set -eu

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
. "$HERE/config.sh"

MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
SSH="ssh -o ConnectTimeout=10 ${MOVE_USER}@${MOVE_HOST}"

if [ "${1:-}" != "--no-build" ]; then
    echo "--- building schwung-manager (prefix $DBX_SHM_PREFIX)"
    GO_LDFLAGS="-s -w -X main.shmPrefix=$DBX_SHM_PREFIX"
    mkdir -p "$REPO_ROOT/build"
    if command -v go >/dev/null 2>&1; then
        (cd "$REPO_ROOT/schwung-manager" && \
         GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
         go build -o "$REPO_ROOT/build/schwung-manager" -ldflags="$GO_LDFLAGS" .)
    else
        mkdir -p "$REPO_ROOT/.cache/go-cache" "$REPO_ROOT/.cache/go-mod-cache"
        docker run --rm \
            -v "$REPO_ROOT/schwung-manager:/src" \
            -v "$REPO_ROOT/build:/out" \
            -v "$REPO_ROOT/.cache/go-cache:/gocache" \
            -v "$REPO_ROOT/.cache/go-mod-cache:/go-mod-cache" \
            -u "$(id -u):$(id -g)" -w /src \
            -e GOOS=linux -e GOARCH=arm64 -e CGO_ENABLED=0 \
            -e GOCACHE=/gocache -e GOMODCACHE=/go-mod-cache \
            golang:1.26-bookworm \
            go build -buildvcs=false -o /out/schwung-manager -ldflags="$GO_LDFLAGS" .
    fi
fi

BIN="$REPO_ROOT/build/schwung-manager"
[ -f "$BIN" ] || { echo "ERROR: $BIN missing — build it first" >&2; exit 1; }

# Verify the artifact, not the recipe: the stamp must be in the binary.
hits="$(strings "$BIN" 2>/dev/null | grep -cF -- "$DBX_SHM_PREFIX" || true)"
[ "${hits:-0}" -gt 0 ] || {
    echo "ERROR: build/schwung-manager does not carry $DBX_SHM_PREFIX" >&2; exit 1; }

echo "--- deploying to ${MOVE_USER}@${MOVE_HOST}:$DBX_DIR"
scp -q "$BIN" "${MOVE_USER}@${MOVE_HOST}:$DBX_DIR/schwung-manager.new"

$SSH "set -eu
    mv -f '$DBX_DIR/schwung-manager.new' '$DBX_DIR/schwung-manager'
    chmod +x '$DBX_DIR/schwung-manager'
    pids=\$(pidof schwung-manager 2>/dev/null || true)
    [ -n \"\$pids\" ] && kill \$pids 2>/dev/null || true
    sleep 0.5
    pids=\$(pidof schwung-manager 2>/dev/null || true)
    [ -n \"\$pids\" ] && kill -9 \$pids 2>/dev/null || true
    '$DBX_DIR/schwung-manager' -port 7700 -roots /data/UserData/ \
        -base '$DBX_DIR' >>'$DBX_DIR/manager.log' 2>&1 &
    sleep 0.5
    echo '--- manager.log tail:'
    tail -5 '$DBX_DIR/manager.log'
"

# md5 the deployed artifact — never trust exit codes.
loc="$(md5 -q "$BIN" 2>/dev/null || md5sum "$BIN" | cut -d' ' -f1)"
rem="$($SSH "md5sum '$DBX_DIR/schwung-manager' | cut -d' ' -f1")"
if [ "$loc" = "$rem" ]; then
    echo "ok — deployed binary verified (md5 $loc), http://${MOVE_HOST}:7700"
else
    echo "ERROR: md5 mismatch local=$loc remote=$rem" >&2; exit 1
fi
