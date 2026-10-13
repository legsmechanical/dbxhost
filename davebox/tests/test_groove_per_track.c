/* tests/test_groove_per_track.c — each track's own say over the global
 * groove's amounts.
 *
 * There is one groove. A track follows its four amounts — Amount, Timing,
 * Velocity, Random — until it is given its own (tN_groove_amt / _timing /
 * _velocity / _random: -1 follows, 0..100 overrides). Track 1 (melodic) and
 * track 0 (a drum lane) both play a note on every 1/16; they are told apart by
 * MIDI channel, and each claim is made by comparing a track against the same
 * track in a run where the GLOBAL amount has the value under test. */
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
static int first_on_vel(const cap_t *c, int nth) {
    for (int i = 0; i < c->n; i++)
        if ((c->ev[i].st & 0xF0) == 0x90 && c->ev[i].d2 > 0 && nth-- == 0) return c->ev[i].d2;
    return -1;
}

/* `params`: "key=value;key=value" set after the pattern is built. `table`:
 * load a two-slot table (slot 2 six ticks late, velocity 64) instead of
 * relying on the swing. */
static void run(const char *params, int table, cap_t *mel, cap_t *drum) {
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
    if (table) {
        hx_set_param(h, "groove_begin", "24 2 100 0 0 0 T");
        hx_set_param(h, "groove_slots_0", "0 0 96 64");
        hx_set_param(h, "groove_commit", "1");
    }
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

static cap_t M100, D100, M40, D40, M0, D0, Mx, Dx;

int main(void) {
    /* ---- defaults, clamps, the old switch ---- */
    {
        hx_t *h = hx_create(NULL);
        char b[64];
        hx_get_param(h, "t3_groove_ovr", b, sizeof(b));
        HX_ASSERT(!strcmp(b, "-1 -1 -1 -1"), "a track follows all four amounts by default");
        hx_set_param(h, "t3_groove_amt", "250");
        hx_set_param(h, "t3_groove_timing", "-7");
        hx_set_param(h, "t3_groove_velocity", "33");
        hx_get_param(h, "t3_groove_ovr", b, sizeof(b));
        HX_ASSERT(!strcmp(b, "100 -1 33 -1"), "an override is 0..100; anything below 0 is 'follow'");
        hx_set_param(h, "t3_groove_on", "0");
        hx_get_param(h, "t3_groove_amt", b, sizeof(b));
        HX_ASSERT(atoi(b) == 0, "the old Groove Off is the track's own amount of 0");
        hx_set_param(h, "t3_groove_on", "1");
        hx_get_param(h, "t3_groove_amt", b, sizeof(b));
        HX_ASSERT(atoi(b) == -1, "…and On puts it back to following");
        hx_destroy(h);
    }

    /* ---- Amount, under a swing ---- */
    run("swing_amt=100", 0, &M100, &D100);
    run("swing_amt=40",  0, &M40,  &D40);
    run("swing_amt=0",   0, &M0,   &D0);
    HX_ASSERT(M100.n > 60 && D100.n > 60, "rig: both tracks play");
    HX_ASSERT(!same(&M100, &M40, 0) && !same(&M40, &M0, 0) && !same(&D100, &D40, 0),
              "rig: the three amounts are told apart on both tracks");

    run("swing_amt=100;t1_groove_amt=40", 0, &Mx, &Dx);
    HX_ASSERT(same(&Mx, &M40, 0), "a track with its own amount plays that amount");
    HX_ASSERT(same(&Dx, &D100, 0), "…and the track beside it still follows the global one");

    run("swing_amt=0;t0_groove_amt=100", 0, &Mx, &Dx);
    HX_ASSERT(same(&Dx, &D100, 0), "a track can groove when the global amount is none (drum track)");
    HX_ASSERT(same(&Mx, &M0, 0), "…while the others stay straight");

    run("swing_amt=100;t1_groove_amt=40;t1_groove_amt=-1", 0, &Mx, &Dx);
    HX_ASSERT(same(&Mx, &M100, 0), "set back to -1, the track follows the global amount again");
    printf("  ok   — Amount: a track's own, the neighbour untouched, and back to following\n");

    /* ---- Timing, Velocity and Random, under a table ---- */
    {
        static cap_t Mt, Dt, Mh, Dh, Mv, Dv;
        run("groove_amt=100", 1, &Mt, &Dt);                       /* timing 100, velocity 0 */
        run("groove_amt=100;groove_timing=50", 1, &Mh, &Dh);
        HX_ASSERT(!same(&Mt, &Mh, 0), "rig: Timing 50 moves notes less than Timing 100");
        run("groove_amt=100;t1_groove_timing=50", 1, &Mx, &Dx);
        HX_ASSERT(same(&Mx, &Mh, 0) && same(&Dx, &Dt, 0), "Timing: a track's own, the neighbour untouched");

        run("groove_amt=100;groove_velocity=100", 1, &Mv, &Dv);
        HX_ASSERT(first_on_vel(&Mv, 1) < 60 && first_on_vel(&Mt, 1) == 100, "rig: the table's velocity is heard at Velocity 100");
        run("groove_amt=100;t0_groove_velocity=100", 1, &Mx, &Dx);
        HX_ASSERT(same(&Dx, &Dv, 1), "Velocity: the drum track takes the table's velocities by its own setting");
        HX_ASSERT(same(&Mx, &Mt, 1), "…and the melodic track, following a global 0, keeps its own");

        run("groove_amt=100;t1_groove_random=100", 1, &Mx, &Dx);
        HX_ASSERT(!same(&Mx, &Mt, 0), "Random: the track with its own Random wanders");
        HX_ASSERT(same(&Dx, &Dt, 0), "…and the track beside it does not");
        run("groove_amt=100;groove_random=100;t1_groove_random=0", 1, &Mx, &Dx);
        HX_ASSERT(same(&Mx, &Mt, 0), "a track's own Random of 0 holds it still while the others wander");
        HX_ASSERT(!same(&Dx, &Dt, 0), "…and they do");
    }
    printf("  ok   — Timing, Velocity and Random: each a track's own, each leaving the neighbour alone\n");

    /* ---- saved, sparsely; and the switch it replaced ---- */
    {
        hx_t *h = hx_create(NULL);
        static char blob[65536];
        hx_set_param(h, "bpm", "120");
        hx_set_param(h, "t2_groove_amt", "35");
        hx_set_param(h, "t2_groove_random", "0");
        hx_set_param(h, "t5_groove_velocity", "90");
        int n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0, "state_full"); blob[n] = '\0';
        HX_ASSERT(strstr(blob, "\"t2_goa\":35") && strstr(blob, "\"t2_gor\":0") && strstr(blob, "\"t5_gov\":90"),
                  "a track's own amounts are written");
        HX_ASSERT(!strstr(blob, "\"t2_got\"") && !strstr(blob, "\"t1_goa\""), "…and the ones it follows are not");
        hx_destroy(h);

        char tmp[256];
        snprintf(tmp, sizeof(tmp), "/tmp/hx_groove_pt_%d.json", (int)getpid());
        for (int old = 0; old < 2; old++) {
            if (old) {      /* a file from the build with the On/Off switch */
                char *p = strstr(blob, "\"t2_goa\":35");
                HX_ASSERT(p, "rig");
                memcpy(p, "\"t2_gon\":0 ", 11);
            }
            FILE *wf = fopen(tmp, "w");
            HX_ASSERT(wf && fwrite(blob, 1, strlen(blob), wf) == strlen(blob), "tmp write failed");
            fclose(wf);
            h = hx_create(NULL);
            seq8_instance_t *inst = (seq8_instance_t *)h->inst;
            strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
            seq8_load_state(inst);
            char b[64];
            hx_get_param(h, "t2_groove_ovr", b, sizeof(b));
            if (!old) HX_ASSERT(!strcmp(b, "35 -1 -1 0"), "a track's own amounts come back, the rest still following");
            else      HX_ASSERT(!strcmp(b, "0 -1 -1 0"), "a project saved with Groove Off opens with that track's amount at 0");
            hx_get_param(h, "t5_groove_ovr", b, sizeof(b));
            HX_ASSERT(!strcmp(b, "-1 -1 90 -1"), "another track's own Velocity comes back");
            hx_destroy(h);
        }
        remove(tmp);
    }
    printf("  ok   — saved only where a track has its own; an old Groove Off opens as amount 0\n");

    printf("PASS: test_groove_per_track\n");
    return 0;
}
