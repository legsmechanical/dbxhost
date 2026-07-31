#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

bin="build/tests/test_edit_cc_route"
mkdir -p "$(dirname "$bin")"

cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Isrc/host \
  tests/host/test_edit_cc_route.c \
  -o "$bin"

"$bin"
