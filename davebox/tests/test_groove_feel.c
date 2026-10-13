/* tests/test_groove_feel.c — a table groove's Velocity and Random.
 *
 * Velocity pulls a sequenced note's velocity towards the slot's own, by the
 * Velocity amount; a slot with no velocity leaves the note alone. Random moves
 * each sequenced note-on by its own roll, up to half a slot either way at 100,
 * and is different on every run. Neither touches a track whose Groove is off,
 * and neither does anything under the two swings. */
#include "harness.h"

typedef struct { int n; struct { int block; uint8_t on, pitch, vel; } ev[2000]; } cap_t;

static void collect(cap_t *c) {
    c->n = 0;
    for (int i = 0; i < hx_stub_event_count() && c->n < 2000; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if (st != 0x90 && st != 0x80) continue;
        c->ev[c->n].block = e->block;
        c->ev[c->n].on = (uint8_t)(st == 0x90 && e->bytes[3] > 0);
        c->ev[c->n].pitch = e->bytes[2]; c->ev[c->n].vel = e->bytes[3];
        c->n++;
    }
}
static int find(const cap_t *c, int on, int pitch, int occ) {
    for (int i = 0; i < c->n; i++)
        if (c->ev[i].on == on && c->ev[i].pitch == pitch && occ-- == 0) return i;
    return -1;
}

typedef void (*setup_fn)(hx_t *h);

/* Track 1, sixteen notes at velocity 100, two bars less a little. */
static void run(setup_fn setup, cap_t *out) {
    char k[48], v[48];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        snprintf(v, sizeof(v), "%d 100", 48 + s);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        hx_set_param(h, k, "12");
    }
    if (setup) setup(h);
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 2 * 689 - 30);
    hx_set_param(h, "transport", "stop");
    hx_render(h, 200);
    collect(out);
    hx_destroy(h);
}

static groove_t *tab(hx_t *h) {
    groove_t *g = &((seq8_instance_t *)h->inst)->groove;
    g->kind = GROOVE_TABLE; g->base = 24; g->n_slots = 2; g->amt = 100;
    g->off[0] = g->off[1] = 0; g->vel[0] = g->vel[1] = 0;
    return g;
}
static void s_vel_full(hx_t *h)  { groove_t *g = tab(h); g->vel[1] = 64; g->velocity = 100; }
static void s_vel_half(hx_t *h)  { groove_t *g = tab(h); g->vel[1] = 64; g->velocity = 50; }
static void s_vel_amt(hx_t *h)   { groove_t *g = tab(h); g->vel[1] = 64; g->velocity = 100; g->amt = 50; }
static void s_vel_zero(hx_t *h)  { groove_t *g = tab(h); g->vel[1] = 64; g->velocity = 0; }
static void s_vel_loud(hx_t *h)  { groove_t *g = tab(h); g->vel[1] = 127; g->vel[0] = 1; g->velocity = 100; }
static void s_vel_off(hx_t *h)   { s_vel_full(h); hx_set_param(h, "t1_groove_on", "0"); }
static void s_vel_early(hx_t *h) { groove_t *g = tab(h); g->vel[1] = 64; g->velocity = 100; g->off[1] = -6 * GROOVE_FINE; }
static void s_swing_vel(hx_t *h) { groove_t *g = tab(h); g->vel[1] = 64; g->velocity = 100; g->kind = GROOVE_SWING_16; g->amt = 0; }
static void s_rnd_full(hx_t *h)  { groove_t *g = tab(h); g->random = 100; }
static void s_rnd_half(hx_t *h)  { groove_t *g = tab(h); g->random = 50; }
static void s_rnd_off(hx_t *h)   { s_rnd_full(h); hx_set_param(h, "t1_groove_on", "0"); }
static void s_rnd_swing(hx_t *h) { groove_t *g = tab(h); g->random = 100; g->kind = GROOVE_SWING_16; g->amt = 0; }

static cap_t A, B, C;

static int vel_of(const cap_t *c, int step) { int i = find(c, 1, 48 + step, 0); return i < 0 ? -1 : c->ev[i].vel; }
static int same_timing(const cap_t *a, const cap_t *b) {
    if (a->n != b->n) return 0;
    for (int i = 0; i < a->n; i++)
        if (a->ev[i].block != b->ev[i].block || a->ev[i].pitch != b->ev[i].pitch) return 0;
    return 1;
}

int main(void) {
    run(NULL, &A);
    HX_ASSERT(vel_of(&A, 0) == 100 && vel_of(&A, 1) == 100, "rig: notes play at 100");

    /* ---- Velocity ---- */
    run(s_vel_full, &B);
    HX_ASSERT(vel_of(&B, 1) == 51 && vel_of(&B, 3) == 51, "Velocity 100: a note takes the slot's share (100 x 64/127)");
    HX_ASSERT(vel_of(&B, 0) == 100 && vel_of(&B, 2) == 100, "a slot with no velocity leaves the note alone");
    HX_ASSERT(same_timing(&A, &B), "Velocity does not move a note");
    run(s_vel_half, &B);
    HX_ASSERT(vel_of(&B, 1) == 76, "Velocity 50 goes half way");
    run(s_vel_amt, &B);
    HX_ASSERT(vel_of(&B, 1) == 76, "the groove's amount scales Velocity too");
    run(s_vel_zero, &B);
    HX_ASSERT(vel_of(&B, 1) == 100, "Velocity 0 changes nothing");
    run(s_vel_loud, &B);
    HX_ASSERT(vel_of(&B, 1) == 100, "a slot at full velocity leaves the note where it is");
    HX_ASSERT(vel_of(&B, 0) == 1, "velocity never falls to 0 (a note-off)");
    run(s_vel_off, &B);
    HX_ASSERT(vel_of(&B, 1) == 100, "a track with Groove off keeps its velocities");
    run(s_swing_vel, &B);
    HX_ASSERT(vel_of(&B, 1) == 100, "the swings have no velocities");
    run(s_vel_early, &B);
    HX_ASSERT(vel_of(&B, 1) == 51 && vel_of(&B, 0) == 100,
              "a note played ahead of its tick takes ITS slot's velocity, not the slot it was fired in");
    printf("  ok   — Velocity pulls towards the slot's own, by its amount, on the right slot\n");

    /* ---- Random ---- */
    {
        /* half a slot is 12 ticks = 21.5 blocks */
        int early = 0, late = 0, moved = 0;
        run(s_rnd_full, &B);
        HX_ASSERT(B.n == A.n, "Random adds or loses no notes");
        for (int s = 0; s < 16; s++) for (int o = 0; o < 2; o++) {
            int ia = find(&A, 1, 48 + s, o), ib = find(&B, 1, 48 + s, o);
            HX_ASSERT(ia >= 0 && ib >= 0, "rig: every note plays");
            int d = B.ev[ib].block - A.ev[ia].block;
            HX_ASSERT(d >= -23 && d <= 23, "Random moved a note more than half a slot");
            if (s == 0 && o == 0) HX_ASSERT(d >= 0, "nothing can come before the launch");
            if (d < -1) early++;
            if (d > 1) late++;
            if (d) moved++;
            /* length kept */
            int la = A.ev[find(&A, 0, 48 + s, o)].block - A.ev[ia].block;
            int lb = B.ev[find(&B, 0, 48 + s, o)].block - B.ev[ib].block;
            /* (not the last two notes: the stop cuts them, wherever they landed) */
            if (o == 0 || s < 14) HX_ASSERT(lb - la >= -1 && lb - la <= 1, "Random resized a note");
        }
        HX_ASSERT(moved >= 20, "Random 100 left most notes where they were");
        HX_ASSERT(early >= 3 && late >= 3, "Random moves notes both ways");
        run(s_rnd_full, &C);
        HX_ASSERT(!same_timing(&B, &C), "two runs of Random came out the same");

        run(s_rnd_half, &B);
        moved = 0;
        for (int s = 0; s < 16; s++) {
            int d = B.ev[find(&B, 1, 48 + s, 1)].block - A.ev[find(&A, 1, 48 + s, 1)].block;
            HX_ASSERT(d >= -12 && d <= 12, "Random 50 reaches a quarter of a slot, no more");
            if (d) moved++;
        }
        HX_ASSERT(moved >= 6, "Random 50 moved almost nothing");
        run(s_rnd_off, &B);
        HX_ASSERT(same_timing(&A, &B), "a track with Groove off is not randomised");
        run(s_rnd_swing, &B);
        HX_ASSERT(same_timing(&A, &B), "the swings have no Random");
    }
    printf("  ok   — Random: both ways, within its reach, different each run, lengths kept\n");

    printf("PASS: test_groove_feel\n");
    return 0;
}
