#!/bin/bash
# test_build_header_deps.sh — the incremental build's staleness check counts
# HEADERS, not only the .c files a call site lists.
#
# ⚠ THE TRAP THIS PINS (2026-09-05): a change in src/host/shadow_param_queue.h
# (included by shadow_ui.c) did not make needs_rebuild rebuild shadow_ui — the
# call site lists only .c files — and a host-only deploy shipped the OLD binary
# with a new stamp. Same family as build-revert-stale-mtime.
set -e
cd "$(dirname "$0")/../.."
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }
# lift the function out of build.sh without running the build
fn=$(awk '/^needs_rebuild\(\) \{/{f=1} f{print} f&&/^\}/{exit}' scripts/build.sh)
[ -n "$fn" ] || { bad "needs_rebuild not found"; echo FAIL; exit 1; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/src/host" "$T/build"
printf 'x' > "$T/src/host/a.c"; printf 'h' > "$T/src/host/a.h"; sleep 1
printf 'bin' > "$T/build/t"
( cd "$T" && eval "$fn" && ! needs_rebuild build/t src/host/a.c ) && say "ok   — target newer than its .c and its headers: no rebuild" || bad "rebuilt with nothing newer"
sleep 1; touch "$T/src/host/a.h"
( cd "$T" && eval "$fn" && needs_rebuild build/t src/host/a.c ) && say "ok   — a HEADER newer than the target forces the rebuild, though the call site lists only the .c" || bad "a newer header did not force a rebuild"
touch "$T/build/t"; sleep 1; touch "$T/src/host/a.c"
( cd "$T" && eval "$fn" && needs_rebuild build/t src/host/a.c ) && say "ok   — a newer listed source still forces it" || bad "listed source ignored"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
