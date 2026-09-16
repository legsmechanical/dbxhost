#!/usr/bin/env bash
# Run the host test suite on Linux/glibc, the way CI does.
#
# The local gate compiles and runs tests/host/ natively — on macOS. CI runs the
# same files on Linux. Where a test touches a type the standard leaves opaque,
# the two disagree and a green local run means nothing. This closes that gap
# without making every commit pay for a container: run it before a push.
#
#   scripts/test-linux.sh              # the whole host suite, as CI runs it
#   scripts/test-linux.sh tests/host/test_foo.sh …   # just these
#
# Exit 0 = green, 1 = a test failed, 2 = could not run.
set -uo pipefail
cd "$(dirname "$0")/.."

IMAGE="${SCHWUNG_LINUX_TEST_IMAGE:-schwung-linux-tests}"
TMPVOL="${SCHWUNG_LINUX_TEST_TMPVOL:-schwung-linux-tests-tmp}"
LOG="$(mktemp -t schwung-linux-tests)"
trap 'rm -f "$LOG"' EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "test-linux: docker is not installed — cannot run the Linux parity suite." >&2
  exit 2
fi
if ! docker version >/dev/null 2>&1; then
  echo "test-linux: the docker daemon is not running — start Docker Desktop first." >&2
  exit 2
fi

# ⚠ RUN the image to test for it, never 'docker image inspect' — inspect has
# reported a present, runnable image as missing (see scripts/build.sh).
if ! docker run --rm "$IMAGE" true >/dev/null 2>&1; then
  echo "test-linux: building $IMAGE …"
  docker build -q -t "$IMAGE" -f tests/Dockerfile.linux . >/dev/null || {
    echo "test-linux: image build failed." >&2; exit 2; }
fi

if [ "$#" -gt 0 ]; then
  list=$(printf '%s\n' "$@")
else
  list=$(ls tests/host/*.sh)
fi

# ⚠ The repo is mounted read-write and the suite compiles into build/. An
# ANONYMOUS VOLUME is mounted over /repo/build so the container gets its own
# empty build dir: otherwise make re-runs the macOS binaries left there by a
# native run and dies with "Exec format error" — and, worse, a Linux object
# could overwrite one the local workflow is about to use. --rm discards it.
# ⚠ TMPDIR must be a REAL ext4 mount, not the container's overlayfs. Several
# tests probe `stat -f` and quietly SKIP their strongest cases off ext4 — and a
# skip counts as a pass, so the total is identical either way. A named docker
# volume is ext4 inside the VM; the overlay root is not. Without this the suite
# reported 223/223 while silently skipping the very case CI was failing on.
docker volume create "$TMPVOL" >/dev/null 2>&1 || true

docker run --rm \
  -v "$PWD:/repo" \
  -v /repo/build \
  -v "$TMPVOL:/ext4tmp" \
  -e SCHWUNG_TEST_LIST="$list" \
  -w /repo \
  "$IMAGE" bash -c '
    set -uo pipefail
    rm -rf /ext4tmp/* 2>/dev/null || true
    export TMPDIR=/ext4tmp
    if [ "$(stat -f -c %T /ext4tmp)" != "ext2/ext3" ]; then
      echo "test-linux: WARNING — /ext4tmp is $(stat -f -c %T /ext4tmp), not ext4;" >&2
      echo "            filesystem-dependent cases will SKIP and still count as passes." >&2
    fi
    fail=0
    echo "== make -C tests/host test"
    make -C tests/host test || fail=1
    while IFS= read -r t; do
      [ -n "$t" ] || continue
      echo "== $t"
      bash "$t" || { echo "  FAIL: $t" >&2; fail=1; }
    done <<< "$SCHWUNG_TEST_LIST"
    exit $fail
  ' 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}

# ⭑ A count is not a claim about coverage. Surface skips explicitly: a test that
# skips its real work still prints PASS and still increments the total.
skips=$(grep -ciE "^[[:space:]]*(skip|note:)" "$LOG" || true)
if [ "$skips" -gt 0 ]; then
  echo
  echo "test-linux: ⚠ $skips skip/note line(s) — these counted as passes:"
  grep -inE "^[[:space:]]*(skip|note:)" "$LOG" | sed 's/^/    /' | head -40
fi

if [ "$rc" -eq 0 ]; then echo "test-linux: OK (Linux/glibc, $skips skipped)"; else echo "test-linux: FAILED ($rc)" >&2; fi
exit "$rc"
