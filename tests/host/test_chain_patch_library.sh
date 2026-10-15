#!/usr/bin/env bash
# The chain's patch library past 32 patches, and patches added while it lives
# (test_chain_patch_library.c runs the real chain against a temp library).
set -euo pipefail
cd "$(dirname "$0")/../.."
bin="build/tests/test_chain_patch_library"
mkdir -p "$(dirname "$bin")"
# The chain is Linux code. On macOS (the local gate) its few Linux-only calls
# get stand-ins — the bus worker's affinity / scheduling and malloc_trim, none
# of which this test reaches. On Linux nothing is stubbed.
stub="$(mktemp -d)"
trap 'rm -rf "$stub"' EXIT
extra=()
if [ "$(uname)" = Darwin ]; then
  cat > "$stub/malloc.h" <<'H'
#include <stdlib.h>
static inline int malloc_trim(size_t pad) { (void)pad; return 0; }
H
  cat > "$stub/linux_compat.h" <<'H'
#include <sched.h>
typedef struct { unsigned long b; } cpu_set_t;
#define CPU_ZERO(s) ((s)->b = 0)
#define CPU_SET(c, s) ((s)->b |= 1UL << (c))
static inline int sched_setaffinity(int p, unsigned long n, const cpu_set_t *s) { (void)p; (void)n; (void)s; return 0; }
static inline int sched_setscheduler(int p, int pol, const struct sched_param *sp) { (void)p; (void)pol; (void)sp; return 0; }
H
  extra=(-include "$stub/linux_compat.h")
fi
cc -std=gnu11 -w -I"$stub" "${extra[@]}" -Isrc -Isrc/host -Isrc/modules/chain/dsp \
  tests/host/test_chain_patch_library.c src/modules/chain/dsp/chain_*.c \
  -o "$bin" -lpthread -ldl -lm
"$bin"
