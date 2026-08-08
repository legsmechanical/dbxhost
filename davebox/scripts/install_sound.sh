#!/bin/bash
# Deploy the sound-mode TEST build alongside the stable davebox.
#
# Installs to modules/tools/davebox-sound/, so modules/tools/davebox/ — the
# daily driver — is never touched. Both appear in the Tools menu.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MODULE_ID="davebox-sound"
MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
MOVE_ROOT_USER="${MOVE_ROOT_USER:-root}"
DO_RESTART=1
DO_BUILD=1

while [ $# -gt 0 ]; do
    case "$1" in
        --host)
            [ -z "$2" ] && { echo "Error: --host requires a value"; exit 1; }
            MOVE_HOST="$2"; shift 2 ;;
        --no-restart)  DO_RESTART=0; shift ;;
        --no-build)    DO_BUILD=0;   shift ;;
        -h|--help)
            echo "Usage: $0 [--host <hostname>] [--no-restart] [--no-build]"
            exit 0 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

INSTALL_DIR="/data/UserData/schwung/modules/tools/${MODULE_ID}"

[ "$DO_BUILD" = "1" ] && bash scripts/build_sound.sh

if [ ! -f "dist/${MODULE_ID}/dsp.so" ]; then
    echo "Error: dist/${MODULE_ID}/dsp.so missing — run scripts/build_sound.sh"
    exit 1
fi

echo "Checking connection to ${MOVE_HOST}..."
if ! ssh -o ConnectTimeout=5 "${MOVE_USER}@${MOVE_HOST}" true 2>/dev/null; then
    echo "Error: Cannot reach ${MOVE_HOST}"
    exit 1
fi

echo "Installing ${MODULE_ID} to ${INSTALL_DIR}..."
ssh "${MOVE_USER}@${MOVE_HOST}" "mkdir -p ${INSTALL_DIR}"
scp -r "dist/${MODULE_ID}"/* "${MOVE_USER}@${MOVE_HOST}:${INSTALL_DIR}/"
echo "Installation complete: ${INSTALL_DIR}"

if [ "$DO_RESTART" = "1" ]; then
    # Same reload sequence as install.sh — shadow_ui only re-reads JS from disk
    # on a full stack restart, and a bare `systemctl restart move-launcher` is
    # not enough (KillMode=process leaves the Schwung stack running stale).
    echo "Reloading Move + Schwung stack..."
    RESTART_CMD='systemctl stop move-launcher.service 2>/dev/null;
        for name in MoveOriginal Move MoveMessageDisplay shadow_ui schwung link-subscriber display-server schwung-manager; do
            pkill -9 -x "$name" 2>/dev/null;
        done;
        sleep 1;
        systemctl start move-launcher.service'
    if ssh -o ConnectTimeout=5 "${MOVE_ROOT_USER}@${MOVE_HOST}" "$RESTART_CMD" 2>/dev/null; then
        echo "Reloaded. Give it ~15s to come back up."
    else
        echo "WARNING: reload failed (no root access?). Restart manually."
    fi
else
    echo "Skipped restart (--no-restart)."
fi
