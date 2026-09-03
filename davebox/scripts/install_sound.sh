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
MOVE_USER="${MOVE_USER:-ableton}"
# The address, not the name (the device renamed itself "Move-2" on 2026-09-02):
# cache → move.local → move-2.local, IPv4 only. `--host` / MOVE_HOST win.
. "$SCRIPT_DIR/../../standalone/scripts/move-host.sh"
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
            echo "Usage: $0 [--host <hostname>] [--no-restart] [--no-build]"   # host: default = cache → move.local → move-2.local
            exit 0 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# ⚠ THE OWNED TREE, not the stock one. dAVEBOx SA is loaded only by dbx-host, so
# living under /data/UserData/schwung means a stock update can overwrite or drop
# it — which is exactly how stock v1.0.0 replaced modules/chain/dsp.so underneath
# us on 2026-08-30 and left every slot reading "EMPTY". See DBX_OWNED_MODULE_DIRS
# in standalone/config.sh; install-host.sh creates the split category, and the
# host scans its OWN modules/tools (shadow_ui_tools.mjs), where stock's tools are
# still visible as symlinks.
INSTALL_DIR="/data/UserData/dbx-host/modules/tools/${MODULE_ID}"

[ "$DO_BUILD" = "1" ] && bash scripts/build_sound.sh

if [ ! -f "dist/${MODULE_ID}/dsp.so" ]; then
    echo "Error: dist/${MODULE_ID}/dsp.so missing — run scripts/build_sound.sh"
    exit 1
fi

dbx_resolve_move_host || true
echo "Checking connection to ${MOVE_HOST}..."
if ! ssh -o ConnectTimeout=5 "${MOVE_USER}@${MOVE_HOST}" true 2>/dev/null; then
    echo "Error: Cannot reach ${MOVE_HOST}"
    exit 1
fi

# ⚠⚠ REFUSE over a live standalone session. This installer ends in
# restart_move.sh, which tears the running stack down under whoever is using it
# — exactly what install-host.sh has always refused to do, while this half had
# no guard at all. It bit on 2026-08-15: a deploy restarted the stack mid-session
# and left the device in a state that took a reboot to clear.
#
# Liveness is the FLOCK, never a marker file (P4b). The launcher holds
# /dev/shm/.dbxhost-session.lock with the supervisor PID as payload; a session is
# live iff that PID is alive, and a reboot or crash releases it by construction.
# ⚠ `standalone_active` is RETIRED — testing it can only ever answer "clear",
# which is worse than no check because it reads like one.
# Unreadable/garbled payload counts as LIVE, matching install-host.sh and the
# host's own reader.
SESSION_LIVE=0
if ssh -o ConnectTimeout=5 "${MOVE_USER}@${MOVE_HOST}" \
        "p=\$(cat /dev/shm/.dbxhost-session.lock 2>/dev/null) || exit 1; \
         case \"\$p\" in (*[!0-9]*|'') exit 0;; esac; \
         [ -d \"/proc/\$p\" ]" 2>/dev/null; then
    SESSION_LIVE=1
fi
if [ "$SESSION_LIVE" = "1" ]; then
    if [ "${FORCE:-0}" != "1" ]; then
        echo "" >&2
        echo "REFUSING: a standalone session is running right now." >&2
        echo "  This installer restarts the stack, which would tear it down under you." >&2
        echo "  Leave the session first (Shift+Back, or Quit in the Settings menu)." >&2
        echo "  FORCE=1 deploys anyway; the running session keeps the old code and the" >&2
        echo "  new code takes effect at the next launch." >&2
        exit 1
    fi
    # FORCE over a live session must actually keep that promise: stage the files
    # and DO NOT restart. The SA launch restarts the stack itself, so the new
    # code applies at the next launch either way. (Before 2026-08-16 FORCE=1
    # only skipped the refusal and the restart below still pkill -9'd the live
    # session — the message lied.)
    echo "WARNING: FORCE=1 with a live session; skipping restart, new code applies at next launch."
    DO_RESTART=0
fi

echo "Installing ${MODULE_ID} to ${INSTALL_DIR}..."
ssh "${MOVE_USER}@${MOVE_HOST}" "mkdir -p ${INSTALL_DIR}"
scp -r "dist/${MODULE_ID}"/* "${MOVE_USER}@${MOVE_HOST}:${INSTALL_DIR}/"
echo "Installation complete: ${INSTALL_DIR}"

# Re-record the owned-file manifest: we just replaced an owned file, and the
# launch preflight compares against that snapshot. install-host.sh records it
# too, but whichever installer runs LAST owns the truth -- without this, a
# host deploy followed by a module deploy leaves the module hashed as its
# previous build and every launch reports a false "changed since install".
if ssh -o ConnectTimeout=5 "${MOVE_USER}@${MOVE_HOST}" \
     "test -x /data/UserData/dbx-host/scripts/record-manifest.sh" 2>/dev/null; then
    ssh -o ConnectTimeout=10 "${MOVE_USER}@${MOVE_HOST}" \
        "DBX_DIR=/data/UserData/dbx-host sh /data/UserData/dbx-host/scripts/record-manifest.sh" || \
        echo "WARNING: could not re-record the owned-file manifest"
else
    echo "note: no record-manifest.sh on the device yet (run install-host.sh once)"
fi

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
