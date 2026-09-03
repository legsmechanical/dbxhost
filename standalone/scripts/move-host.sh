#!/bin/bash
# move-host.sh — resolve the Move's address WITHOUT trusting its mDNS name.
#
# Source this (`. "$(dirname "$0")/move-host.sh"; dbx_resolve_move_host`)
# before the first ssh. If MOVE_HOST is already set (an explicit IP, the
# tether, `--host`), it is left alone. Otherwise the candidates are tried in
# order with a short IPv4 ssh probe and the first that answers becomes
# MOVE_HOST — and is cached, so the next run tries the known-good address
# first:
#   1. the cached address from the last successful run
#   2. move.local
#   3. move-2.local   (avahi renames the device on a name conflict — seen
#                      2026-09-02, and the rename STICKS until the next boot)
#
# Why IPv4 (`ssh -4`): on 2026-09-02 `move.local` resolved IPv6-only from the
# Mac and ssh died with "UNKNOWN port 65535" while the device was up and fine
# on IPv4. The name was never the problem; the address family and the rename
# were. [[installer-symlink-check-cries-wolf-on-ssh-failure]]
#
# Never blocks on a name: each probe is one ssh with a 3 s ceiling.

DBX_MOVE_HOST_CACHE="${XDG_CONFIG_HOME:-$HOME/.config}/dbxhost/move-host"

dbx_probe_move_host() {   # $1 host — 0 when ssh answers over IPv4
    [ -n "$1" ] || return 1
    ssh -4 -o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=accept-new \
        "${MOVE_USER:-ableton}@$1" true >/dev/null 2>&1
}

dbx_resolve_move_host() {
    if [ -n "${MOVE_HOST:-}" ]; then return 0; fi
    local cached="" c
    [ -r "$DBX_MOVE_HOST_CACHE" ] && cached=$(head -n1 "$DBX_MOVE_HOST_CACHE" 2>/dev/null | tr -d '[:space:]')
    for c in "$cached" move.local move-2.local; do
        [ -n "$c" ] || continue
        if dbx_probe_move_host "$c"; then
            MOVE_HOST="$c"; export MOVE_HOST
            mkdir -p "$(dirname "$DBX_MOVE_HOST_CACHE")" 2>/dev/null
            printf '%s\n' "$c" > "$DBX_MOVE_HOST_CACHE" 2>/dev/null
            [ "$c" = "move.local" ] || echo "move-host: the Move answers as '$c'" >&2
            return 0
        fi
    done
    MOVE_HOST="move.local"; export MOVE_HOST      # the old default: let the caller's own check say so
    echo "move-host: no candidate answered over IPv4 (cache, move.local, move-2.local) — set MOVE_HOST=<ip>" >&2
    return 1
}
