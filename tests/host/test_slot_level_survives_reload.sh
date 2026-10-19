#!/usr/bin/env bash
set -euo pipefail

# A slot level above unity must come back after the project is saved and
# loaded again. See the .c for the bug.

cd "$(dirname "$0")/../.."

bin="build/tests/test_slot_level_survives_reload"
mkdir -p "$(dirname "$bin")"

cc -std=gnu11 -Wall -Wno-unused-function -Isrc -Isrc/host \
  tests/host/test_slot_level_survives_reload.c \
  -lm -o "$bin"

"$bin"
