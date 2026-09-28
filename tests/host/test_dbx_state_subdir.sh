#!/usr/bin/env bash
set -euo pipefail
# The C state-dir naming rule under an injected listing order — see the .c.
cd "$(dirname "$0")/../.."
bin="build/tests/test_dbx_state_subdir"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Werror \
  -Isrc/host \
  tests/host/test_dbx_state_subdir.c \
  -o "$bin"
"$bin"
