#!/usr/bin/env bash
# Build and deploy dAVEBOx SA — the WHOLE thing, in one command.
#
# SA is one deliverable made of two payloads that used to live in two repos and
# needed two commands run in the right order with the right flags:
#
#   the host half     standalone/scripts/install-host.sh   -> $DBX_DIR
#   the davebox half  davebox/scripts/install_sound.sh     -> stock's modules/tools
#
# They are now one repo, so they are one command. This script is the entry
# point; the two below it stay usable on their own for a half-only iteration.
#
# ⚠ The two halves disagreed about restarting, and that disagreement was a live
# hazard. install-host.sh deliberately restarts nothing — launching SA from
# stock's Tools menu is what starts the new build — and it REFUSES to deploy
# over a running session. install_sound.sh knew nothing about sessions and, by
# default, killed and respawned the entire stock stack. Run back-to-back, the
# second command tore down the very session the first one protected. Here the
# host half's live-session guard is the single gate for both payloads, and the
# module half is deployed with --no-restart: same "takes effect at next launch"
# rule for the whole deliverable. --restart-stock opts back in, for testing the
# module under stock rather than under SA.
#
# Usage:
#   ./standalone/scripts/install-sa.sh                  build + deploy both halves
#   ./standalone/scripts/install-sa.sh --no-build       deploy what is already built
#   ./standalone/scripts/install-sa.sh --host-only      host + launcher only
#   ./standalone/scripts/install-sa.sh --davebox-only   the davebox module only
#   ./standalone/scripts/install-sa.sh --no-launcher    skip the SA launcher stub
#   ./standalone/scripts/install-sa.sh --force          deploy over a LIVE session
#   ./standalone/scripts/install-sa.sh --restart-stock  restart the stock stack after
#   MOVE_HOST=172.16.254.1 ./standalone/scripts/install-sa.sh    (tether)

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"          # standalone/
REPO_ROOT="$(cd "$HERE/.." && pwd)"               # dbxhost/
DAVEBOX="$REPO_ROOT/davebox"
. "$HERE/config.sh"

MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
DO_BUILD=1; DO_HOST=1; DO_DAVEBOX=1; DO_LAUNCHER=1; FORCE=0; RESTART_STOCK=0

while [ $# -gt 0 ]; do
    case "$1" in
        --no-build)      DO_BUILD=0; shift ;;
        --host-only)     DO_DAVEBOX=0; shift ;;
        --davebox-only)  DO_HOST=0; shift ;;
        --no-launcher)   DO_LAUNCHER=0; shift ;;
        --force)         FORCE=1; shift ;;
        --restart-stock) RESTART_STOCK=1; shift ;;
        -h|--help)       sed -n '2,40p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 1 ;;
    esac
done

[ "$DO_HOST" = "1" ] || [ "$DO_DAVEBOX" = "1" ] || {
    echo "--host-only and --davebox-only are mutually exclusive" >&2; exit 1; }

say() { printf '%s\n' "$*"; }

# One version for the whole deliverable: the git description of the tree that
# built BOTH halves. The two module.json versions describe manifests, not this
# build — and neither of them moves when the host changes, which is exactly the
# skew this merge exists to end.
SA_REV="$(cd "$REPO_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
SA_DIRTY=""
if ! (cd "$REPO_ROOT" && git diff --quiet HEAD 2>/dev/null); then SA_DIRTY="-dirty"; fi
SA_VERSION="${SA_REV}${SA_DIRTY}"

say "=== dAVEBOx SA ${SA_VERSION} -> ${MOVE_USER}@${MOVE_HOST} ==="
say "    host half   : $([ "$DO_HOST" = 1 ] && echo "yes -> $DBX_DIR" || echo "skipped")"
say "    davebox half: $([ "$DO_DAVEBOX" = 1 ] && echo "yes -> stock modules/tools/davebox-sound" || echo "skipped")"

# Fail on an unreachable device BEFORE spending minutes in Docker. install-host.sh
# preflights properly (install shape, heal setuid, live session); this is only the
# cheap "is it plugged in" probe so a build is not wasted.
ssh -o ConnectTimeout=10 "${MOVE_USER}@${MOVE_HOST}" true 2>/dev/null || {
    echo "cannot reach ${MOVE_HOST}" >&2; exit 1; }

# ⚠ Build the davebox half FIRST, deploy it LAST. Both halves are then proven to
# compile before anything is written to the device, and a davebox build failure
# cannot leave a half-deployed pair behind.
if [ "$DO_DAVEBOX" = "1" ] && [ "$DO_BUILD" = "1" ]; then
    say ""; say "--- building the davebox module (davebox-sound)"
    bash "$DAVEBOX/scripts/build_sound.sh"
fi

if [ "$DO_HOST" = "1" ]; then
    say ""; say "--- host half"
    host_args=()
    [ "$DO_BUILD" = "1" ]    || host_args+=(--no-build)
    [ "$DO_LAUNCHER" = "1" ] || host_args+=(--no-module)   # --no-module = the LAUNCHER stub
    [ "$FORCE" = "1" ]       && host_args+=(--force)
    MOVE_HOST="$MOVE_HOST" MOVE_USER="$MOVE_USER" \
        "$HERE/scripts/install-host.sh" ${host_args[@]+"${host_args[@]}"}
fi

if [ "$DO_DAVEBOX" = "1" ]; then
    say ""; say "--- davebox half"
    dbx_args=(--no-build)                                   # built above, or intentionally stale
    [ "$RESTART_STOCK" = "1" ] || dbx_args+=(--no-restart)
    MOVE_HOST="$MOVE_HOST" MOVE_USER="$MOVE_USER" \
        bash "$DAVEBOX/scripts/install_sound.sh" "${dbx_args[@]}"
fi

# STOCK's launch-standalone.sh is the script that actually launches SA, and it
# lives in the stock install tree — which neither half above touches. Ship this
# repo's copy over it so launch-arc fixes (the refuse-before-kill probe that
# closes the relaunch-during-teardown SPI wedge) actually reach the device;
# a stock reinstall may revert it, and this re-applies it on the next deploy.
if [ "$DO_HOST" = "1" ]; then
    say "--- stock launch script (launch-standalone.sh)"
    scp -q "$HERE/../src/launch-standalone.sh" \
        "${MOVE_USER}@${MOVE_HOST}:/data/UserData/schwung/launch-standalone.sh" \
        && ssh -o ConnectTimeout=10 "${MOVE_USER}@${MOVE_HOST}" \
            "chmod +x /data/UserData/schwung/launch-standalone.sh" \
        || say "WARNING: could not update stock launch-standalone.sh"
fi

# Record what this pair actually is, on the device. Until now "which build is on
# there" could only be answered by comparing timestamps of two independently
# deployed trees.
if [ "$DO_HOST" = "1" ]; then
    ssh -o ConnectTimeout=10 "${MOVE_USER}@${MOVE_HOST}" \
        "printf '{\"version\":\"%s\",\"host\":%s,\"davebox\":%s,\"installed\":\"%s\"}\n' \
            '$SA_VERSION' '$DO_HOST' '$DO_DAVEBOX' \"\$(date -Iseconds)\" \
            > '$DBX_DIR/sa-build.json'" 2>/dev/null || true
fi

say ""
say "=== done — dAVEBOx SA ${SA_VERSION} ==="
if [ "$RESTART_STOCK" = "1" ]; then
    say "The stock stack was restarted; give it ~15s."
else
    say "Both halves are on disk. They take effect the next time you launch"
    say "dAVEBOx SA from stock Schwung's Tools menu — launching the session is"
    say "what starts this build, so nothing needs restarting here."
fi
