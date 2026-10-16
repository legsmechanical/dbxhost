#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Runs the REAL offline MIDI FX job (src/host/midi_fx_offline.c) against a
# throwaway module built here, whose host pointer and counter are GLOBALS.
# See test_midi_fx_offline.c.

work="$(mktemp -d "${TMPDIR:-/tmp}/schwung-mfo.XXXXXX")"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/midi_fx/fix"
cat > "$work/fixture_fx.c" <<'EOF'
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "host/midi_fx_api_v1.h"
#include "host/plugin_api_v1.h"

/* GLOBALS, as real modules keep them. */
static const host_api_v1_t *g_host;
static int g_count;            /* notes this LOAD of the code has processed */
typedef struct { int transpose; int held; } fx_t;

static void *fx_create(const char *d, const char *c) { (void)d; (void)c; return calloc(1, sizeof(fx_t)); }
static void fx_destroy(void *i) { free(i); }
static int put(uint8_t o[][3], int l[], int n, uint8_t a, uint8_t b, uint8_t c) {
    o[n][0] = a; o[n][1] = b; o[n][2] = c; l[n] = 3; return n + 1;
}
static int fx_process(void *ip, const uint8_t *m, int len, uint8_t o[][3], int l[], int max) {
    fx_t *f = ip; int n = 0; (void)max;
    if (len == 1 && m[0] == 0xFA) {
        int bpm = g_host && g_host->get_bpm ? (int)(g_host->get_bpm() + 0.5f) : 0;
        return put(o, l, n, 0xB0, 7, (uint8_t)bpm);         /* what my host says the tempo is */
    }
    if (len == 1 && m[0] == 0xF8) {
        n = put(o, l, n, 0x90, (uint8_t)(100 + f->held), 90);
        return put(o, l, n, 0x80, (uint8_t)(100 + f->held), 0);
    }
    if (len == 3 && (m[0] & 0xF0) == 0x90 && m[2]) { g_count++; f->held++; return put(o, l, n, m[0], (uint8_t)(m[1] + f->transpose), m[2]); }
    if (len == 3 && ((m[0] & 0xF0) == 0x80 || (m[0] & 0xF0) == 0x90)) { if (f->held) f->held--; return put(o, l, n, m[0], (uint8_t)(m[1] + f->transpose), 0); }
    return 0;
}
static int fx_tick(void *i, int fr, int sr, uint8_t o[][3], int l[], int max) { (void)i; (void)fr; (void)sr; (void)o; (void)l; (void)max; return 0; }
static void fx_set(void *ip, const char *k, const char *v) {
    fx_t *f = ip;
    if (!strcmp(k, "transpose")) f->transpose = atoi(v);
    else if (!strcmp(k, "state") && !strncmp(v, "T=", 2)) f->transpose = atoi(v + 2);
}
static int fx_get(void *ip, const char *k, char *b, int n) {
    fx_t *f = ip;
    if (!strcmp(k, "transpose")) return snprintf(b, n, "%d", f->transpose);
    if (!strcmp(k, "state")) return snprintf(b, n, "T=%d", f->transpose);
    if (!strcmp(k, "count")) return snprintf(b, n, "%d", g_count);
    if (!strcmp(k, "host_bpm")) return snprintf(b, n, "%d", g_host && g_host->get_bpm ? (int)(g_host->get_bpm() + 0.5f) : 0);
    return -1;
}
static midi_fx_api_v1_t api = { MIDI_FX_API_VERSION, fx_create, fx_destroy, fx_process, fx_tick, fx_set, fx_get };
midi_fx_api_v1_t *move_midi_fx_init(const struct host_api_v1 *host) { g_host = host; return &api; }
EOF
cc -std=gnu11 -shared -fPIC -Isrc "$work/fixture_fx.c" -o "$work/midi_fx/fix/dsp.so"

dl_flag=""
if ! cc -std=gnu11 -x c -o /dev/null - <<'EOF' >/dev/null 2>&1
#include <dlfcn.h>
int main(void) { return dlopen("", 0) != 0; }
EOF
then
  dl_flag="-ldl"
fi

bin="build/tests/test_midi_fx_offline"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function \
  -Isrc -Isrc/host \
  -DSCHWUNG_INSTALL_DIR="\"$work\"" -DFIXTURE_DIR="\"$work\"" \
  tests/host/test_midi_fx_offline.c src/host/midi_fx_offline.c \
  -o "$bin" $dl_flag -lpthread

"$bin"
