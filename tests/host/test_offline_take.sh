#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Runs the REAL offline take (src/host/offline_take.c) against throwaway
# modules built here: an "engine" (the overtake DSP the take copies), an
# instrument and an audio effect, each with GLOBALS, as real modules keep
# them. See test_offline_take.c.

work="$(mktemp -d "${TMPDIR:-/tmp}/schwung-ot.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/eng" "$work/synth" "$work/fx" "$work/takes"

# The engine: plays a scripted take. val = "<mode> <frames> <kind> <slot> |<path>".
# Modes: 0 notes, 1 + a knob-mapped CC, 2 a DIRECT note, 3 notes + audio fed to the slot.
cat > "$work/fixture_eng.c" <<'EOF'
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "host/plugin_api_v1.h"

static const host_api_v1_t *g_host;
static const move_host_ext_v1_t *g_ext;
static int g_made;                       /* instances this LOAD of the code made */
typedef struct { int offline, armed, block, mode, kind, slot, setups; uint32_t frames;
                 char path[256], loaded[256]; int rs; } eng_t;

void move_plugin_host_ext_v1(const move_host_ext_v1_t *e) { g_ext = e; }
static void *e_create(const char *d, const char *c) {
    eng_t *e = calloc(1, sizeof *e); (void)d;
    e->offline = c && strstr(c, "\"offline\"") != NULL;
    g_made++;
    return e;
}
static void e_destroy(void *i) { free(i); }
static void e_set(void *ip, const char *k, const char *v) {
    eng_t *e = ip;
    if (!strcmp(k, "offline_load")) {
        FILE *f = fopen(v, "rb");
        if (f) { size_t n = fread(e->loaded, 1, sizeof e->loaded - 1, f); e->loaded[n] = '\0'; fclose(f); }
    } else if (!strcmp(k, "pa_resolve")) {
        if (!strcmp(v, "1:synth:cut 1 synth:cut 0 0 1 0")) e->setups++;
    } else if (!strcmp(k, "resample_clip")) {
        const char *p = strchr(v, '|');
        sscanf(v, "%d %u %d %d", &e->mode, &e->frames, &e->kind, &e->slot);
        if (p) snprintf(e->path, sizeof e->path, "%s", p + 1);
        /* it plays only the project it was given, as it was told */
        e->armed = e->offline && !strcmp(e->loaded, "PROJECT v=1") && e->setups == 1;
        e->rs = e->armed ? 1 : 6;
    }
}
static int e_get(void *ip, const char *k, char *b, int n) {
    eng_t *e = ip;
    if (!strcmp(k, "resample_state")) return snprintf(b, n, "%d", e ? e->rs : 0);
    if (!strcmp(k, "made")) return snprintf(b, n, "%d", g_made);
    if (!strcmp(k, "has_ext")) return snprintf(b, n, "%d", g_ext != NULL);
    return -1;
}
static void slot_send(int slot, uint8_t a, uint8_t b, uint8_t c) {
    const uint8_t m[4] = { (uint8_t)(a >> 4), a, b, c };
    g_host->midi_send_internal_slot(slot, m, 4);
}
static void e_render(void *ip, int16_t *out, int frames) {
    eng_t *e = ip;
    memset(out, 0, (size_t)frames * 4);
    if (!e->armed) return;
    if (e->block == 0) {
        const uint8_t fa[4] = { 0x0F, 0xFA, 0, 0 };
        g_host->midi_send_internal(fa, 4);                 /* the clock: a broadcast */
        g_ext->set_tempo(133.0f);
        g_ext->set_slot_param(e->slot, "synth:gain", "2");
        g_ext->set_slot_param(e->slot + 1, "synth:gain", "9");   /* another slot's */
        slot_send(e->slot, 0x90, 60, 100);
        slot_send(e->slot + 1, 0x90, 50, 127);             /* another slot's, after: it would win */
        if (e->mode == 1) slot_send(e->slot, 0xB0, 72, 64);   /* a knob-mapped CC */
    } else if (e->block == 1) {
        if (g_ext->capture_start_src(e->path, e->frames, e->kind, e->slot)) e->rs = 3;
        if (e->mode == 2) {
            const uint8_t m[4] = { 0x09, 0x90, 70, 100 };
            g_ext->midi_send_slot_direct(e->slot, m, 4);     /* past transpose */
        } else {
            slot_send(e->slot, 0x90, 62, 100);
        }
    }
    if (e->mode == 3) {                                    /* audio for the slot: L 1000 + block, R -500 */
        int16_t a[128 * 2], o[128 * 2];
        int i;
        for (i = 0; i < 128; i++) { a[2 * i] = (int16_t)(1000 + e->block); a[2 * i + 1] = -500; o[2 * i] = o[2 * i + 1] = 5000; }
        g_ext->slot_audio_feed(e->slot, a, 128);
        g_ext->slot_audio_feed(e->slot + 1, o, 128);         /* another slot's: not heard */
    }
    e->block++;
}
static plugin_api_v2_t api = { MOVE_PLUGIN_API_VERSION_2, e_create, e_destroy, NULL, e_set, e_get, NULL, e_render };
plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *h) { g_host = h; return &api; }
EOF

# The instrument: L = note * 100 + channel, R = vel * gain + 1000 * Starts
# heard + 10 * the tempo its host reported once it had heard one + the base
# its state set.
cat > "$work/fixture_synth.c" <<'EOF'
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "host/plugin_api_v1.h"

static const host_api_v1_t *g_host;
typedef struct { int note, ch, vel, starts, bpm, base; float gain; } syn_t;
static void *s_create(const char *d, const char *c) { (void)d; (void)c; syn_t *s = calloc(1, sizeof *s); s->gain = 1; return s; }
static void s_destroy(void *i) { free(i); }
static void s_midi(void *ip, const uint8_t *m, int len, int src) {
    syn_t *s = ip; (void)src;
    if (len == 1 && m[0] == 0xFA) { s->starts++; return; }
    if (len >= 3 && (m[0] & 0xF0) == 0x90 && m[2]) { s->note = m[1]; s->ch = m[0] & 0x0F; s->vel = m[2]; }
}
static void s_set(void *ip, const char *k, const char *v) {
    syn_t *s = ip;
    if (!strcmp(k, "gain")) s->gain = (float)atof(v);
    else if (!strcmp(k, "state") && !strncmp(v, "G=", 2)) {
        const char *b = strstr(v, " B=");
        s->gain = (float)atof(v + 2);
        if (b) s->base = atoi(b + 3);
    }
}
static int s_get(void *ip, const char *k, char *b, int n) { (void)ip; (void)k; (void)b; (void)n; return -1; }
static void s_render(void *ip, int16_t *out, int frames) {
    syn_t *s = ip;
    int i;
    if (s->starts && !s->bpm && g_host && g_host->get_bpm) s->bpm = (int)(g_host->get_bpm() + 0.5f);
    for (i = 0; i < frames; i++) {
        out[2 * i]     = (int16_t)(s->note * 100 + s->ch);
        out[2 * i + 1] = (int16_t)(s->vel * s->gain + 1000 * s->starts + 10 * s->bpm + s->base);
    }
}
static plugin_api_v2_t api = { MOVE_PLUGIN_API_VERSION_2, s_create, s_destroy, s_midi, s_set, s_get, NULL, s_render };
plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *h) { g_host = h; return &api; }
EOF

# The effect: L + amount.
cat > "$work/fixture_fx.c" <<'EOF'
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "host/plugin_api_v1.h"
#include "host/audio_fx_api_v2.h"
typedef struct { int amount; } fx_t;
static void *f_create(const char *d, const char *c) { (void)d; (void)c; return calloc(1, sizeof(fx_t)); }
static void f_destroy(void *i) { free(i); }
static void f_process(void *ip, int16_t *a, int frames) { fx_t *f = ip; for (int i = 0; i < frames; i++) a[2 * i] += (int16_t)f->amount; }
static void f_set(void *ip, const char *k, const char *v) { fx_t *f = ip; if (!strcmp(k, "amount")) f->amount = atoi(v); }
static int f_get(void *ip, const char *k, char *b, int n) { (void)ip; (void)k; (void)b; (void)n; return -1; }
static audio_fx_api_v2_t api = { AUDIO_FX_API_VERSION_2, f_create, f_destroy, f_process, f_set, f_get, NULL };
audio_fx_api_v2_t *move_audio_fx_init_v2(const host_api_v1_t *h) { (void)h; return &api; }
EOF

cc -std=gnu11 -shared -fPIC -Isrc "$work/fixture_eng.c" -o "$work/eng/dsp.so"
cc -std=gnu11 -shared -fPIC -Isrc "$work/fixture_synth.c" -o "$work/synth/dsp.so"
cc -std=gnu11 -shared -fPIC -Isrc "$work/fixture_fx.c" -o "$work/fx/fx.so"

dl_flag=""
if ! cc -std=gnu11 -x c -o /dev/null - <<'EOF' >/dev/null 2>&1
#include <dlfcn.h>
int main(void) { return dlopen("", 0) != 0; }
EOF
then
  dl_flag="-ldl"
fi

bin="build/tests/test_offline_take"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function \
  -Isrc -Isrc/host \
  -DSCHWUNG_INSTALL_DIR="\"$work\"" -DFIXTURE_DIR="\"$work\"" \
  tests/host/test_offline_take.c src/host/offline_take.c \
  -o "$bin" $dl_flag -lpthread -lm

"$bin"
