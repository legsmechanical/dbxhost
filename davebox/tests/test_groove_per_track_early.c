/* tests/test_groove_per_track_early.c — a track's own groove amounts where the
 * groove moves notes EARLY, and a groove on a 1/32 grid.
 *
 * An early note is sounded by a look-ahead that runs per track, with that
 * track's own numbers; the drum path has its own copy of it. So each claim is
 * made on the melodic track (1) and on the drum track (0), against the same
 * track in a run where the GLOBAL amount has the value under test.
 *
 * The 1/32 table: both tracks play on every 1/16, which is every OTHER 1/32
 * slot — so a table that moves only the odd slots moves nothing, and one that
 * moves the even slots moves every note. */
#include "harness.h"

typedef struct { int n; struct { int block; uint8_t st, d1, d2; } ev[4000]; } cap_t;

static void collect(cap_t *c, int ch) {
    c->n = 0;
    int total = hx_stub_event_count();
    for (int i = 0; i < total && c->n < 4000; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if ((st != 0x90 && st != 0x80) || (e->bytes[1] & 0x0F) != ch) continue;
        c->ev[c->n].block = e->block; c->ev[c->n].st = e->bytes[1];
        c->ev[c->n].d1 = e->bytes[2]; c->ev[c->n].d2 = e->bytes[3];
        c->n++;
    }
}
/* same events at the same times (velocities too when `vel`) */
static int same(const cap_t *a, const cap_t *b, int vel) {
    if (a->n != b->n) return 0;
    for (int i = 0; i < a->n; i++)
        if (a->ev[i].block != b->ev[i].block || a->ev[i].st != b->ev[i].st || a->ev[i].d1 != b->ev[i].d1
                || (vel && a->ev[i].d2 != b->ev[i].d2)) return 0;
    return 1;
}
/* Every one of the first 24 note-ons after the first, in order, same pitch,
 * moved by lo..hi blocks against `ref` (a tick is 1.8 blocks at 120 BPM). */
static int moved(const cap_t *c, const cap_t *ref, int lo, int hi) {
    int ci = 0, ri = 0, seen = 0;
    for (;;) {
        while (ci < c->n   && !((c->ev[ci].st & 0xF0) == 0x90 && c->ev[ci].d2 > 0)) ci++;
        while (ri < ref->n && !((ref->ev[ri].st & 0xF0) == 0x90 && ref->ev[ri].d2 > 0)) ri++;
        if (ci >= c->n || ri >= ref->n) return 0;
        if (seen > 0) {
            int d = c->ev[ci].block - ref->ev[ri].block;
            if (c->ev[ci].d1 != ref->ev[ri].d1 || d < lo || d > hi) return 0;
        }
        if (++seen > 24) return 1;
        ci++; ri++;
    }
}
static int first_on_vel(const cap_t *c, int nth) {
    for (int i = 0; i < c->n; i++)
        if ((c->ev[i].st & 0xF0) == 0x90 && c->ev[i].d2 > 0 && nth-- == 0) return c->ev[i].d2;
    return -1;
}

/* `params`: "key=value;key=value" set after the pattern is built (a
 * resolution change comes first: it rescales notes). `begin` / `slots`: the
 * table to load. */
static void run(const char *params, const char *begin, const char *slots, cap_t *mel, cap_t *drum) {
    char k[64], v[64];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        snprintf(v, sizeof(v), "%d 100", 48 + s);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        hx_set_param(h, k, "12");
        snprintf(k, sizeof(k), "t0_l0_step_%d_toggle", s);
        hx_set_param(h, k, "100");
    }
    {
        seq8_track_t *tr = &inst->tracks[0];
        tr->active_clip = 0; tr->queued_clip = -1; tr->will_relaunch = 1;
        pfx_sync_from_clip(tr);
    }
    hx_set_param(h, "groove_begin", begin);
    hx_set_param(h, "groove_slots_0", slots);
    hx_set_param(h, "groove_commit", "1");
    char buf[512];
    snprintf(buf, sizeof(buf), "%s", params);
    for (char *p = strtok(buf, ";"); p; p = strtok(NULL, ";")) {
        char *eq = strchr(p, '=');
        HX_ASSERT(eq, "rig: bad param");
        *eq = 0;
        hx_set_param(h, p, eq + 1);
    }
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 1340);
    collect(mel,  inst->tracks[1].channel);
    collect(drum, inst->tracks[0].channel);
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
}


#define EARLY "24 2 100 0 0 0 E", "0 0 -96 0"      /* every other 1/16 six ticks early */

int main(void) {
    static cap_t Mt, Dt, Mh, Dh, M0, D0, Mx, Dx;
    run("groove_amt=100", EARLY, &Mt, &Dt);
    run("groove_amt=100;groove_timing=50", EARLY, &Mh, &Dh);
    run("groove_amt=0", EARLY, &M0, &D0);
    HX_ASSERT(Mt.n > 60 && Dt.n > 60, "rig: both tracks play");
    HX_ASSERT(!same(&Mt, &Mh, 0) && !same(&Mh, &M0, 0) && !same(&Dt, &Dh, 0) && !same(&Dh, &D0, 0),
              "rig: the three amounts are told apart on both tracks");

    run("groove_amt=100;t1_groove_timing=50", EARLY, &Mx, &Dx);
    HX_ASSERT(same(&Mx, &Mh, 0), "early notes: the melodic track's own Timing is the one it plays");
    HX_ASSERT(same(&Dx, &Dt, 0), "…and the drum track beside it follows the global one");
    run("groove_amt=100;t0_groove_timing=50", EARLY, &Mx, &Dx);
    HX_ASSERT(same(&Dx, &Dh, 0), "early notes: the drum track's own Timing is the one it plays");
    HX_ASSERT(same(&Mx, &Mt, 0), "…and the melodic track beside it follows the global one");

    run("groove_amt=0;t1_groove_amt=100", EARLY, &Mx, &Dx);
    HX_ASSERT(same(&Mx, &Mt, 0) && same(&Dx, &D0, 0), "a melodic track plays early by its own amount while the rest are straight");
    run("groove_amt=0;t0_groove_amt=100", EARLY, &Mx, &Dx);
    HX_ASSERT(same(&Dx, &Dt, 0) && same(&Mx, &M0, 0), "…and so does a drum track");
    run("groove_amt=100;t1_groove_amt=0", EARLY, &Mx, &Dx);
    HX_ASSERT(same(&Mx, &M0, 0) && same(&Dx, &Dt, 0), "a track's own 0 holds it straight while the rest play early");
    run("groove_amt=100;t0_groove_amt=0", EARLY, &Mx, &Dx);
    HX_ASSERT(same(&Dx, &D0, 0) && same(&Mx, &Mt, 0), "…a drum track too");
    printf("  ok   — early notes: each track's own amounts, melodic and drum, the neighbour untouched\n");

    /* ---- a 1/32 grid ---- */
    {
        static cap_t Ms, Ds, Mo, Do, Me, De, Mee, Dee;
        run("groove_amt=0",   "12 2 100 0 0 0 T", "0 0 64 0", &Ms, &Ds);    /* straight */
        run("groove_amt=100", "12 2 100 0 0 0 T", "0 0 64 0", &Mo, &Do);    /* odd 1/32s late */
        HX_ASSERT(same(&Mo, &Ms, 0) && same(&Do, &Ds, 0),
                  "1/32 grid: a table that moves only the off 1/32s leaves notes on the 1/16s where they are");
        run("groove_amt=100", "12 2 100 0 0 0 T", "64 0 0 0", &Me, &De);    /* even 1/32s four ticks late */
        HX_ASSERT(!same(&Me, &Ms, 0) && !same(&De, &Ds, 0), "1/32 grid: a table that moves the on 1/32s moves them");
        HX_ASSERT(moved(&Me, &Ms, 6, 9) && moved(&De, &Ds, 6, 9), "…every note, four ticks late, none lost");
        HX_ASSERT(!moved(&Ms, &Ms, 6, 9) && moved(&Ms, &Ms, 0, 0), "CONTROL: the measure tells moved from not");
        run("groove_amt=100", "12 2 100 0 0 0 T", "-64 0 0 0", &Mee, &Dee); /* …and four ticks early */
        HX_ASSERT(moved(&Mee, &Ms, -9, -6) && moved(&Dee, &Ds, -9, -6),
                  "1/32 grid: early is heard too — every note four ticks early, none lost");
        /* a four-slot 1/32 table repeats every 1/8: slot 2 is every other 1/16 */
        static cap_t M4, D4, Msw, Dsw;
        run("groove_amt=100", "12 4 100 0 0 0 T", "0 0 0 0 64 0 0 0", &M4, &D4);
        run("groove_amt=100", "24 2 100 0 0 0 T", "0 0 64 0", &Msw, &Dsw);
        HX_ASSERT(same(&M4, &Msw, 0) && same(&D4, &Dsw, 0),
                  "1/32 grid: the same shift written on 1/32s and on 1/16s plays the same");
    }
    printf("  ok   — a groove on a 1/32 grid: the right notes move, late and early, none lost\n");

    printf("PASS: test_groove_per_track_early\n");
    return 0;
}
