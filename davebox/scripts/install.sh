#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MODULE_ID="davebox"
MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
MOVE_ROOT_USER="${MOVE_ROOT_USER:-root}"   # privileged login for the service restart
DO_RESTART=1

while [ $# -gt 0 ]; do
    case "$1" in
        --host)
            [ -z "$2" ] && { echo "Error: --host requires a value"; exit 1; }
            MOVE_HOST="$2"
            shift 2
            ;;
        --no-restart)
            DO_RESTART=0
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--host <hostname>] [--no-restart]"
            echo "  --host <hostname>   Override target (default: move.local or \$MOVE_HOST)"
            echo "  --no-restart        Copy files only; don't restart move-launcher (JS/DSP won't reload)"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

INSTALL_DIR="/data/UserData/schwung/modules/tools/${MODULE_ID}"

if [ ! -f "dist/${MODULE_ID}/dsp.so" ]; then
    echo "Error: Build not found. Run ./scripts/build.sh first."
    exit 1
fi

echo "Checking connection to ${MOVE_HOST}..."
if ! ssh -o ConnectTimeout=5 "${MOVE_USER}@${MOVE_HOST}" true 2>/dev/null; then
    echo "Error: Cannot reach ${MOVE_HOST}"
    echo "Make sure your Move is on and on the same network."
    exit 1
fi
echo "Connected."

echo "Installing ${MODULE_ID} to ${INSTALL_DIR} on ${MOVE_HOST}..."
ssh "${MOVE_USER}@${MOVE_HOST}" "mkdir -p ${INSTALL_DIR}"
scp -r "dist/${MODULE_ID}"/* "${MOVE_USER}@${MOVE_HOST}:${INSTALL_DIR}/"

echo ""
echo "Installation complete: ${INSTALL_DIR}"

if [ "$DO_RESTART" = "1" ]; then
    # Reload the whole Move stack so shadow_ui picks up the new ui.js (and the DSP
    # .so) from disk. NOTE: a bare `systemctl restart move-launcher.service` is NOT
    # enough — that unit is KillMode=process, so it only bounces MoveLauncher/
    # MoveOriginal while the Schwung stack (shadow_ui, schwung-manager, display-
    # server) double-forks to PID 1 and survives STALE → Move-native and Schwung
    # desync (blank OLED). So we explicitly stop the unit, kill the detached
    # Schwung processes, then start it again (the launcher respawns the full
    # chain). This is a service restart, NOT an OS reboot (reboot has caused a
    # "move terminated" freeze). The scp above is complete, so nothing races the
    # copy. Needs root; the ableton user can't sudo.
    echo "Reloading Move + Schwung stack (shadow_ui reloads JS + DSP)..."
    RESTART_CMD='systemctl stop move-launcher.service 2>/dev/null;
        for name in MoveOriginal Move MoveMessageDisplay shadow_ui schwung link-subscriber display-server schwung-manager; do
            pkill -9 -x "$name" 2>/dev/null;
        done;
        sleep 1;
        systemctl start move-launcher.service'
    if ssh -o ConnectTimeout=5 "${MOVE_ROOT_USER}@${MOVE_HOST}" "$RESTART_CMD" 2>/dev/null; then
        echo "Reloaded. Give it ~15s to come back up."
    else
        echo "WARNING: reload failed (no root access to ${MOVE_ROOT_USER}@${MOVE_HOST}?)."
        echo "  Reload manually as root:"
        echo "    systemctl stop move-launcher.service"
        echo "    pkill -9 -x shadow_ui schwung-manager display-server   # + MoveOriginal etc."
        echo "    systemctl start move-launcher.service"
    fi
else
    echo "Skipped restart (--no-restart). JS/DSP will not reload until the stack restarts."
fi
