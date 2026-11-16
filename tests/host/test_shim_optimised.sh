#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# THE SHIM IS BUILT OPTIMISED — and stays portable across Move hardware.
#
# The shim (the per-block mixer, LD_PRELOADed into MoveOriginal) was built with
# no -O at all from the day it arrived as a small SPI-intercept prototype. At
# -O2 it measured Compute 143.5 -> ~110 us and mix_buf 37.6 -> ~18 us on a CM5
# Move playing the same project. This pins:
#
#   1. the level: -O2 (SHIM_OPT overrides it for an A/B) plus
#      -fno-strict-aliasing (typed views of byte buffers are everywhere);
#   2. NO -mcpu / -march / -mtune on the shim: one binary runs on CM4
#      (Cortex-A72, ARMv8.0) and CM5 (Cortex-A76, ARMv8.2) — an A76 target
#      emits instructions the A72 faults on;
#   3. the level reaches every place that decides what gets reused: the Docker
#      environment, a shim-only stamp (needs_rebuild reads mtimes, not flags),
#      and the build-cache key (a build at another level must never be restored
#      in place of the default);
#   4. the cross-thread hand-offs an optimising compiler is free to reorder,
#      which -O0's statement-by-statement code happened to keep in order.

fail() { echo "FAIL: $*"; exit 1; }
b=scripts/build.sh

line=$(grep -B1 -F -- '-o build/schwung-shim.so' "$b" | grep -F 'gcc' || true)
[ -n "$line" ] || fail "cannot find the shim's gcc line in $b"
echo "$line" | grep -qF -- '${SHIM_OPT:--O2}' || fail "the shim is not built at \${SHIM_OPT:--O2}: $line"
echo "$line" | grep -qF -- '-fno-strict-aliasing' || fail "the shim lost -fno-strict-aliasing: $line"
echo "$line" | grep -qE -- '-m(cpu|arch|tune)=' && fail "the shim is tuned for one CPU — it must run on CM4 and CM5: $line"
grep -qF -- '-e SHIM_OPT="${SHIM_OPT:-}"' "$b" || fail "SHIM_OPT is not passed into the Docker build"
grep -qF -- 'SHIM_STAMP="$REPO_ROOT/build/.shim-opt"' "$b" || fail "no shim-level stamp: a level change would keep the old shim"
grep -qF -- 'shim:${SHIM_OPT:--O2}' standalone/scripts/build-host.sh || fail "the shim level is not in the build-cache key"

s=src/schwung_shim.c
grep -qF -- '__atomic_store_n(&preview_playing, 1, __ATOMIC_RELEASE);' "$s" \
    || fail "preview_play publishes 'playing' without a release store"
grep -qF -- '__atomic_load_n(&preview_playing, __ATOMIC_ACQUIRE)' "$s" \
    || fail "preview_render reads 'playing' without an acquire load"
grep -qF -- 'uint32_t wp = __atomic_load_n(&slot->write_pos, __ATOMIC_ACQUIRE);' src/host/shadow_link_audio.c \
    || fail "the link-audio-in reader loads write_pos without acquire"
smp=src/host/shadow_sampler.c
n=$(grep -cF -- '__atomic_store_n(&sampler_io_busy, 0, __ATOMIC_RELEASE);' "$smp" || true)
[ "$n" -eq 3 ] || fail "$n worker paths release sampler_io_busy, want 3 (cancel, finalize-early, finalize)"
grep -qE -- '^[[:space:]]*sampler_io_busy = 0;' "$smp" && fail "a plain sampler_io_busy = 0 store is back"
grep -qF -- '__atomic_load_n(&sampler_io_busy, __ATOMIC_ACQUIRE)' "$smp" \
    || fail "sampler_arm_common reads io_busy without acquire"

echo "PASS: the shim is built -O2, portable across CM4/CM5, and its hand-offs are ordered"
