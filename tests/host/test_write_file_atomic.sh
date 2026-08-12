#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Every whole-file state write the JS side can make goes through
# host_write_file, and every one of them used to truncate its destination
# before writing a byte. A power cut in that window leaves a fragment, and the
# tolerant JSON readers in this tree load a fragment as a smaller document
# rather than reporting an error. Two halves are pinned here: the helper
# behaves (C unit below), and the binding actually uses it (source pins).

bin="build/tests/test_write_file_atomic"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Isrc/host \
  tests/host/test_write_file_atomic.c src/host/file_atomic.c -o "$bin"
"$bin"

atomic=$(awk '/^int schwung_write_file_atomic\(/,/^}/' src/host/file_atomic.c)
if ! grep -q 'rename(' <<<"$atomic"; then
  echo "FAIL: schwung_write_file_atomic does not publish via rename()" >&2
  exit 1
fi
if ! grep -q 'fsync(' <<<"$atomic"; then
  echo "FAIL: schwung_write_file_atomic renames without fsync — a crash can publish an empty file" >&2
  exit 1
fi

binding=$(awk '/^static JSValue js_host_write_file\(/,/^}/' src/host/js_host_common.c)
if [ -z "$binding" ]; then
  echo "FAIL: js_host_write_file not found" >&2
  exit 1
fi
if ! grep -q 'schwung_write_file_atomic(' <<<"$binding"; then
  echo "FAIL: host_write_file does not use the atomic writer" >&2
  exit 1
fi
if grep -Eq 'fopen\([^,]*, *"w"\)' <<<"$binding"; then
  echo "FAIL: host_write_file truncates its destination in place" >&2
  exit 1
fi

# Host settings are a whole-file rewrite too, and their loader treats a missing
# key as "use the default" — so a torn settings file reads as the device
# quietly forgetting a preference rather than as damage.
saver=$(awk '/^int settings_save\(/,/^}/' src/host/settings.c)
if ! grep -q 'schwung_write_file_atomic(' <<<"$saver"; then
  echo "FAIL: settings_save does not use the atomic writer" >&2
  exit 1
fi
if grep -Eq 'fopen\([^,]*, *"w"\)' <<<"$saver"; then
  echo "FAIL: settings_save truncates its destination in place" >&2
  exit 1
fi

# The build must actually link the new unit, or the host fails to link and the
# shadow UI silently keeps whatever it had.
for target in 'build/schwung' 'build/shadow/shadow_ui'; do
  if ! grep -q 'src/host/file_atomic.c' scripts/build.sh; then
    echo "FAIL: scripts/build.sh does not compile src/host/file_atomic.c (needed by $target)" >&2
    exit 1
  fi
done

echo "PASS: whole-file writes are crash-atomic"
