/* tests/pfx_rig.h — play a Session clip and capture every MIDI event with the
 * master tick it went out on. Shared by the play-FX / Bake tests: they launch
 * a clip, press Play, and compare what live playback sent with what a Bake
 * wrote. */
#ifndef PFX_RIG_H
#define PFX_RIG_H
#include "harness.h"
#define ST(n) ((uint32_t)(n) * TICKS_PER_STEP)
typedef struct { uint32_t tick; uint8_t kind, a, b; } ev_t;   /* kind 0 on, 1 CC, 2 pressure, 3 off */
#define EV_MAX 16384
static ev_t g_a[EV_MAX], g_b[EV_MAX];
static int g_an, g_bn, g_seen;

/* a drum clip's lane (main keeps all 32 in the clip) */
#define RIG_LANE(dc, l) (&(dc)->lanes[l])
static uint32_t rs;
static uint32_t rnd(uint32_t n) { rs = rs * 1664525u + 1013904223u; return n ? (rs >> 8) % n : 0; }

static uint32_t rig_now(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    return inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step;
}
static void drain(ev_t *out, int *n, uint32_t tick) {
    for (; g_seen < hx_stub_event_count(); g_seen++) {
        const hx_midi_event *e = hx_stub_event(g_seen);
        if (e->kind == HX_PARAM_SET) continue;
        const uint8_t st = e->bytes[1] & 0xF0;
        if (*n >= EV_MAX) continue;
        if (st == 0x90 && e->bytes[3] > 0) out[(*n)++] = (ev_t){ tick, 0, e->bytes[2], e->bytes[3] };
        else if (st == 0xB0) out[(*n)++] = (ev_t){ tick, 1, e->bytes[2], e->bytes[3] };
        else if (st == 0xD0) out[(*n)++] = (ev_t){ tick, 2, e->bytes[2], 0 };
        else if (st == 0x80 || st == 0x90) out[(*n)++] = (ev_t){ tick, 3, e->bytes[2], 0 };
    }
}
/* Clip c of track t is the one that plays when the transport starts. */
static void rig_launch(hx_t *h, int t, int c) {
    char k[32], v[8];
    snprintf(k, sizeof k, "t%d_launch_clip", t);
    snprintf(v, sizeof v, "%d", c);
    hx_set_param(h, k, v);
}
static void rig_play(hx_t *h) { hx_set_param(h, "transport", "play"); }
/* Play from the top to step `end`, then stop and let the offs go out. */
static void play(hx_t *h, uint32_t end, ev_t *out, int *n) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_clear_capture(h);
    g_seen = 0; *n = 0;
    rig_play(h);
    int guard = 4000000;
    while (inst->playing && rig_now(h) < ST(end) && guard-- > 0) {
        hx_render(h, 1);
        drain(out, n, rig_now(h) ? rig_now(h) - 1 : 0);
    }
    hx_set_param(h, "transport", "stop");
    for (int i = 0; i < 64; i++) hx_render(h, 1);
    /* echoes still queued after the stop would sound at the next play's start */
    for (int t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].pfx.event_count = 0;
        for (int l = 0; l < DRUM_LANES; l++) inst->tracks[t].drum_lane_pfx[l].event_count = 0;
    }
}
#endif
