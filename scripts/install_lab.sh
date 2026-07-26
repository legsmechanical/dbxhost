#!/bin/bash
# Deploy the dAVEBOx Lab rig to the Move, alongside the real davebox.
#
# Lab is JS-only (no dsp.so), so this bundles and scp's — no Docker build. It
# installs to its own module directory under a different id, so the stable
# davebox install is untouched and both appear in the Tools menu.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MODULE_ID="davebox-lab"
MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
MOVE_ROOT_USER="${MOVE_ROOT_USER:-root}"
DO_RESTART=1

while [ $# -gt 0 ]; do
    case "$1" in
        --host)
            [ -z "$2" ] && { echo "Error: --host requires a value"; exit 1; }
            MOVE_HOST="$2"; shift 2 ;;
        --no-restart)
            DO_RESTART=0; shift ;;
        -h|--help)
            echo "Usage: $0 [--host <hostname>] [--no-restart]"
            exit 0 ;;
        *)
            echo "Unknown argument: $1"; exit 1 ;;
    esac
done

INSTALL_DIR="/data/UserData/schwung/modules/tools/${MODULE_ID}"

bash scripts/bundle_lab.sh

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
    # on a full stack restart. See that script's comment for why a bare
    # `systemctl restart move-launcher.service` is not enough.
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
