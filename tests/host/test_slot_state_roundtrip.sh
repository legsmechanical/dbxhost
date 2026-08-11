#!/usr/bin/env bash
# Compile + run the slot-state round-trip unit (test_slot_state_roundtrip.c).
#
# Built here rather than in the Makefile because it needs two compile-time
# overrides the rest of the suite doesn't: the paths header's include guard is
# pre-defined so its /data/UserData install dir can be replaced with a temp dir,
# which is the only reason this can run off-device at all.
set -u
cd "$(dirname "$0")/../.." || exit 2

CC="${CC:-cc}"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/schwung-slotstate.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

if ! $CC -O0 -g -std=c11 -Wall -Wno-unused-parameter \
        -I src/host -I src \
        -DSCHWUNG_PATHS_H \
        -DSCHWUNG_INSTALL_DIR="\"$OUT\"" \
        -DSCHWUNG_SHM_PREFIX='"/schwung-"' \
        tests/host/test_slot_state_roundtrip.c src/host/shadow_state.c \
        -o "$OUT/t" 2> "$OUT/build.log"; then
    echo "BUILD FAIL: test_slot_state_roundtrip"
    cat "$OUT/build.log"
    exit 1
fi

# Run twice: once with no config file (the fresh-session path, where the saver
# has nothing to preserve) and once with one already present.
"$OUT/t" || exit 1
"$OUT/t" || exit 1
