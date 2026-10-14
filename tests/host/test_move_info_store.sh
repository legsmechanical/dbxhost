#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bin="build/tests/test_move_info_store"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -O2 -Wall -Wextra -Isrc/host tests/host/test_move_info_store.c -o "$bin" -lpthread
"$bin"
