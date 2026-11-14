/* seq8_repeat.h — REPEAT: a beat-repeat on one bar of events, after REMIX.
 *
 * Josh, 2026-11-14: "implement the 2 other slice/audio track effects banks" —
 * the beat-repeat put to him beside REMIX ("grabs the last 1/4 down to 1/32
 * and repeats it"). Deterministic, every bar alike, as REMIX: it works on the
 * same events (rmx_ev_t), so whatever plays a remixed bar — a Loop clip's
 * piece scheduler, the Warp map, a Slicer's rebuilt notes, Bake, Export, the
 * bar picture — plays a repeated one.
 *
 * In a bar of L ticks (16 slots of L/16): the events starting in
 * [at, at + len) are replaced by copies of those starting in [at, at + g),
 * the copy r shifted r*g later (r = 0, 1, ...) and cut at at + len; repeat r
 * has its gate scaled by Gate % (and never longer than g), r*Pitch semitones
 * added (held to +-24), its velocity times (1 - Fade)^r (a repeat at 0
 * dropped). at, len in slots; g = L / {4, 8, 16, 32, 64}.
 *
 * A pure function, no allocation; in and out may not overlap.
 */
#ifndef SEQ8_REPEAT_H
#define SEQ8_REPEAT_H
#include <stdint.h>
#include "seq8_remix.h"

#define RPT_GRIDS 5                  /* 1/4 1/8 1/16 1/32 1/64 */
static const uint8_t rpt_grid_div[RPT_GRIDS] = { 4, 8, 16, 32, 64 };

typedef struct {
    uint8_t grid;       /* 0..4: rpt_grid_div */
    uint8_t at;         /* 0..15: the slot it grabs from */
    uint8_t len;        /* 1..16: slots it repeats for */
    uint8_t gate;       /* 10..100 % */
    int8_t  pitch;      /* -12..12 semitones a repeat */
    uint8_t fade;       /* 0..100 % lost a repeat */
} rpt_dials_t;

static int rpt_bar(const rpt_dials_t *d, int32_t L, const rmx_ev_t *in, int nin, rmx_ev_t *out, int maxout) {
    int i, j, n = 0, r;
    if (!d || L < 64) {
        for (i = 0; i < nin && n < maxout; i++) out[n++] = in[i];
        return n;
    }
    int32_t s = L / 16;
    int grid = d->grid < RPT_GRIDS ? d->grid : RPT_GRIDS - 1;
    int32_t g = L / rpt_grid_div[grid];
    int at = d->at > 15 ? 15 : d->at, len = d->len < 1 ? 1 : d->len > 16 ? 16 : d->len;
    int32_t w0 = at * s, w1 = (at + len) * s;
    if (w1 > L) w1 = L;
    if (g > w1 - w0) g = w1 - w0;                       /* a piece no longer than the window */
    if (g < 1) g = 1;
    int gate = d->gate < 10 ? 10 : d->gate > 100 ? 100 : d->gate;
    int fade = d->fade > 100 ? 100 : d->fade;
    /* outside the window: as it was */
    for (i = 0; i < nin && n < maxout; i++)
        if (in[i].tick < w0 || in[i].tick >= w1) out[n++] = in[i];
    /* inside: the grabbed piece, again and again */
    double lvl = 1.0;
    for (r = 0; w0 + (int32_t)r * g < w1; r++) {
        int32_t sh = (int32_t)r * g;
        for (i = 0; i < nin && n < maxout; i++) {
            const rmx_ev_t *e = &in[i];
            if (e->tick < w0 || e->tick >= w0 + g) continue;
            int32_t tk = e->tick + sh;
            if (tk >= w1) continue;
            rmx_ev_t c = *e;
            c.tick = tk;
            int32_t gl = (int32_t)((int64_t)e->gate * gate / 100);
            if (gl > g) gl = g * gate / 100;
            if (gl < 1) gl = 1;
            c.gate = gl;
            int p = (int)e->pitch + r * (int)d->pitch;
            c.pitch = (int8_t)(p > 24 ? 24 : p < -24 ? -24 : p);
            int v = (int)((double)e->vel * lvl + 0.5);
            if (v < 1) continue;                        /* faded out */
            c.vel = (uint8_t)(v > 127 ? 127 : v);
            out[n++] = c;
        }
        lvl *= (100 - fade) / 100.0;
    }
    /* in time order (stable: a repeat follows what was there at the same tick) */
    for (i = 1; i < n; i++) {
        rmx_ev_t e = out[i];
        for (j = i; j > 0 && out[j - 1].tick > e.tick; j--) out[j] = out[j - 1];
        out[j] = e;
    }
    return n;
}
#endif
