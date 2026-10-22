#!/usr/bin/env bash
# An insert FX reloads from a saved patch at the position it was saved from
# (test_chain_patch_fx_positions.c runs the real chain with a stand-in FX), and
# the slot editor writes that position for every insert it saves.
set -euo pipefail
cd "$(dirname "$0")/../.."
bin="build/tests/test_chain_patch_fx_positions"
mkdir -p "$(dirname "$bin")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# ---- the writer: every insert block buildSlotPatchJson saves carries its position
f="src/shadow/shadow_ui.js"
builder=$(awk '/^function buildSlotPatchJson\(/,/^}/' "$f")
[ -n "$builder" ] || { echo "FAIL: buildSlotPatchJson not found" >&2; exit 1; }
for n in 1 2 3 4; do
    block=$(awk -v n="$n" '$0 ~ "type: cfg.fx" n ".module," {p=1} p {print; c++} p && (/slot:/ || c == 3) {exit}' <<<"$builder")
    command grep -q "slot: $((n - 1))," <<<"$block" || { echo "FAIL: fx${n} is saved without \"slot: $((n - 1))\"" >&2; exit 1; }
done
# ...and the bypass restore reads it rather than the array index
restore=$(command grep -n 'fx${pos + 1}:bypassed' "$f" || true)
[ -n "$restore" ] || { echo "FAIL: the bypass restore does not address the saved position" >&2; exit 1; }

# ---- the stand-in FX: remembers "x", answers it back
mkdir -p "$work/modules/audio_fx/stubfx"
cat > "$work/modules/audio_fx/stubfx/module.json" <<'J'
{"id": "stubfx", "name": "Stub FX", "component_type": "audio_fx",
 "capabilities": {"chain_params": [{"key": "x", "name": "X", "type": "int", "min": 0, "max": 9}]}}
J
cat > "$work/stubfx.c" <<'C'
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "audio_fx_api_v2.h"
typedef struct { char x[16]; } st_t;
static void *create(const char *d, const char *c) { (void)d; (void)c; return calloc(1, sizeof(st_t)); }
static void destroy(void *i) { free(i); }
static void process(void *i, int16_t *a, int n) { (void)i; (void)a; (void)n; }
static void set(void *i, const char *k, const char *v) { if (!strcmp(k, "x")) snprintf(((st_t *)i)->x, 16, "%s", v); }
static int get(void *i, const char *k, char *b, int n) { if (!strcmp(k, "x")) return snprintf(b, n, "%s", ((st_t *)i)->x); return -1; }
static audio_fx_api_v2_t api = { AUDIO_FX_API_VERSION_2, create, destroy, process, set, get, 0 };
audio_fx_api_v2_t *move_audio_fx_init_v2(const host_api_v1_t *h) { (void)h; return &api; }
C
cc -std=gnu11 -w -shared -fPIC -Isrc -Isrc/host "$work/stubfx.c" -o "$work/modules/audio_fx/stubfx/stubfx.so"

# ---- the chain (Linux code; macOS stand-ins as in test_chain_patch_library.sh)
extra=()
if [ "$(uname)" = Darwin ]; then
  mkdir -p "$work/stub"
  cat > "$work/stub/malloc.h" <<'H'
#include <stdlib.h>
static inline int malloc_trim(size_t pad) { (void)pad; return 0; }
H
  cat > "$work/stub/linux_compat.h" <<'H'
#include <sched.h>
typedef struct { unsigned long b; } cpu_set_t;
#define CPU_ZERO(s) ((s)->b = 0)
#define CPU_SET(c, s) ((s)->b |= 1UL << (c))
static inline int sched_setaffinity(int p, unsigned long n, const cpu_set_t *s) { (void)p; (void)n; (void)s; return 0; }
static inline int sched_setscheduler(int p, int pol, const struct sched_param *sp) { (void)p; (void)pol; (void)sp; return 0; }
H
  extra=(-I"$work/stub" -include "$work/stub/linux_compat.h")
fi
cc -std=gnu11 -w "${extra[@]}" -Isrc -Isrc/host -Isrc/modules/chain/dsp \
  tests/host/test_chain_patch_fx_positions.c src/modules/chain/dsp/chain_*.c \
  -o "$bin" -lpthread -ldl -lm
"$bin" "$work"
echo "PASS: fx positions are written by the editor and honoured by the chain"
