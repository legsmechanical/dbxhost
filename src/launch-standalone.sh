#!/bin/bash
# Launch a standalone module, then restart Move when it exits.
# Usage: launch-standalone.sh /path/to/standalone/binary
#
# Called via host_launch_standalone() from the host process.
# This process inherits Move's file descriptors including /dev/ablspi0.0.
# We MUST close them before killing Move.
#
# bash (not /bin/sh): some custom Move images symlink /bin/sh to dash, which
# uses FDs 10-19 internally for builtin redirections. The "close all FDs 3+"
# loop below silently breaks the shell mid-script on dash. Force bash to
# avoid the issue while keeping the script behavior identical on stock Move.

BINARY="$1"
if [ -z "$BINARY" ] || [ ! -x "$BINARY" ]; then
    echo "launch-standalone: invalid binary: $BINARY" >&2
    exit 1
fi

setsid bash -c '
    BINARY="$1"
    LOG_HELPER=/data/UserData/schwung/unified-log

    log() {
        if [ -x "$LOG_HELPER" ]; then
            "$LOG_HELPER" standalone "$*"
        elif [ -f /data/UserData/schwung/debug_log_on ]; then
            printf "%s\n" "$*" >> /data/UserData/schwung/debug.log
        fi
    }

    # Close ALL inherited file descriptors (3+)
    i=3; while [ $i -lt 1024 ]; do eval "exec ${i}>&-" 2>/dev/null; i=$((i+1)); done

    exec >/dev/null 2>&1
    log "=== launch-standalone.sh started at $(date) ==="
    log "Binary: $BINARY"

    # REFUSE BEFORE TOUCHING THE STACK. If a standalone session lock names a
    # live process, a session is live -- or still mid-teardown, which is how
    # this bit for real: a relaunch a few seconds after a session exit killed
    # the stock stack, THEN the binary refused (lock still held by the
    # tearing-down supervisor), and the recovery restart below raced the
    # launcher-service respawn -> two MoveOriginals wedging SPI. The binary
    # refusal is side-effect-free; this script must be too.
    # Convention: /dev/shm/.<name>-session.lock, first bytes = holder PID.
    for lk in /dev/shm/.*-session.lock; do
        [ -f "$lk" ] || continue
        pid=$(head -c 16 "$lk" | tr -cd "0-9")
        if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
            log "refusing: session lock $lk held by live pid $pid -- stack untouched"
            exit 0
        fi
    done
    sleep 1

    # Two-phase kill
    for name in MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui; do
        pids=$(pidof $name 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log "SIGTERM $name: $pids"
            kill $pids 2>/dev/null || true
        fi
    done
    sleep 0.5

    for name in MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui; do
        pids=$(pidof $name 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log "SIGKILL $name: $pids"
            kill -9 $pids 2>/dev/null || true
        fi
    done
    sleep 0.2

    # Free SPI device
    pids=$(fuser /dev/ablspi0.0 2>/dev/null || true)
    if [ -n "$pids" ]; then
        log "Killing SPI holders: $pids"
        kill -9 $pids 2>/dev/null || true
        sleep 0.5
    fi

    # Run standalone binary (blocks until exit)
    log "Launching: $BINARY"
    "$BINARY"
    EXIT_CODE=$?
    log "Standalone exited with code $EXIT_CODE"

    # Restart Move -- unless something (the launcher-service respawn, or the
    # session supervisor restore path) already brought it back. Starting a
    # second instance wedges SPI.
    log "Restarting Move..."
    sleep 0.5
    if pidof MoveOriginal >/dev/null 2>&1; then
        log "Move already running -- skipping restart"
    elif [ -x "$LOG_HELPER" ]; then
        nohup sh -c "/opt/move/Move 2>&1 | /data/UserData/schwung/unified-log move-shim" >/dev/null 2>&1 &
        log "Move restarted with PID $!"
    else
        nohup /opt/move/Move >/dev/null 2>&1 &
        log "Move restarted with PID $!"
    fi
' _ "$BINARY" &
