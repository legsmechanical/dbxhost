#!/usr/bin/env bash
# standaloneSessionActive() must not probe through the validate_path()-gated
# file bindings: host_file_exists/host_read_file reject everything outside
# /data/UserData, so a /dev/shm or /proc probe through them silently returns
# false — which broke Shift+Back session teardown (module-exit fallback,
# stranded session, all relaunches refused) from the P4b marker retirement
# until 2026-08-09.
set -euo pipefail

file="src/shadow/shadow_ui.js"

body=$(awk '/^function standaloneSessionActive\(\)/,/^}/' "$file" \
       | grep -Ev '^\s*(/\*|\*|//)')   # code only — the fn's comment cites the trap by name
if [ -z "$body" ]; then
  echo "FAIL: standaloneSessionActive missing" >&2
  exit 1
fi

if grep -Eq 'host_file_exists|host_read_file' <<<"$body"; then
  echo "FAIL: standaloneSessionActive uses validate_path()-gated bindings (blind to /dev/shm and /proc)" >&2
  exit 1
fi

if ! grep -q 'std.loadFile' <<<"$body"; then
  echo "FAIL: standaloneSessionActive does not read the lock via std.loadFile" >&2
  exit 1
fi

echo "PASS: standalone session probe reads /dev/shm and /proc via std, not the path-gated bindings"
