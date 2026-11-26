/* tests/test_delay_retrig_keeps_notes.c — DELAY's Retrig (on by default)
 * drops the echoes still waiting when a new note starts, and cuts one that is
 * sounding. It used to send a note-off for every queued echo, sounded or not:
 * an echo that never played took a note of its pitch with it. A chord played
 * only its last note, a held note ended when the next one started, and the
 * off due when a dropped echo's note ended cut a later note of its pitch.
 * Each case: a note must still sound where it is held. Plus: a chord echoes
 * as a chord, and an echo already sounding is still cut. And under SEQ ARP a
 * chord held to the loop's end keeps playing into the next pass (a note's
 * own off, queued, now stays in the queue — it must still go ahead of the
 * same note struck again). */
#include "pfx_rig.h"

typedef struct { uint32_t at; uint16_t gate; uint8_t p; } nt_t;

static hx_t *rig(const nt_t *n, int nn, const char *const *set) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 32; cl->loop_start = 0;
    for (int i = 0; i < nn; i++) clip_insert_note(cl, n[i].at, n[i].gate, n[i].p, 100);
    clip_build_steps_from_notes(cl);
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
    for (; *set; set++) hx_set_param(h, "t1_c0_pfx_set", *set);
    return h;
}

/* pitch p is sounding at tick t: its last on or off at or before t is an on */
static int sounding(uint8_t p, uint32_t t) {
    int on = 0;
    for (int i = 0; i < g_an && g_a[i].tick <= t; i++)
        if (g_a[i].a == p && (g_a[i].kind == 0 || g_a[i].kind == 3)) on = g_a[i].kind == 0;
    return on;
}

static int g_fail;
static void want(int ok, const char *what) {
    printf("  %s %s\n", ok ? "ok  " : "FAIL", what);
    g_fail += !ok;
}

/* plays the clip once (and a little) with Retrig as given; 1 = p sounds at t */
static int run(const nt_t *n, int nn, const char *const *set, int retrig, uint8_t p, uint32_t t) {
    hx_t *h = rig(n, nn, set);
    hx_set_param(h, "t1_c0_pfx_set", retrig ? "delay_retrig 1" : "delay_retrig 0");
    rig_launch(h, 1, 0);
    play(h, 32, g_a, &g_an);
    const int r = sounding(p, t);
    hx_destroy(h);
    return r;
}

int main(void) {
    static const char *const q[] = { "delay_time 11", NULL };            /* 1/4: 96 ticks */
    static const char *const qf[] = { "delay_time 11", "delay_pitch_fb 5", NULL };
    static const char *const ef[] = { "delay_time 8", "delay_pitch_fb 5", NULL };   /* 48 ticks */

    /* a held note, the next one starting under it */
    { nt_t n[] = { { 0, 48, 60 }, { 24, 12, 64 } };
      want(run(n, 2, q, 1, 60, 40), "a held note sounds on when the next one starts");
      want(run(n, 2, q, 0, 60, 40), "control: so it does with Retrig off"); }
    /* a note's own off still queued when the next note starts (a note swung
     * late, ending past the next, on-time step): it keeps its length */
    { nt_t n[] = { { 24, 36, 60 }, { 48, 12, 64 } };
      hx_t *h = rig(n, 2, q);
      hx_set_param(h, "groove_kind", "1"); hx_set_param(h, "groove_amt", "60");
      rig_launch(h, 1, 0);
      play(h, 32, g_a, &g_an);
      want(sounding(60, 58), "a swung note sounds on past the next note's start");
      hx_destroy(h); }
    /* a pitch struck again while it sounds, its echo (on a held note's pitch)
     * still waiting: the echo goes silently */
    { nt_t n[] = { { 0, 200, 65 }, { 10, 48, 60 }, { 30, 12, 60 } };
      static const char *const sp[] = { "delay_time 8", "delay_pitch_fb 5", NULL };
      want(run(n, 3, sp, 1, 65, 150), "a note struck again, its echo dropped, leaves a held note on the echo's pitch alone"); }
    /* a chord, and its echo */
    { nt_t n[] = { { 0, 24, 60 }, { 0, 24, 64 }, { 0, 24, 67 } };
      int all = 1, echo = 1;
      for (int i = 0; i < 3; i++) { all &= run(n, 3, q, 1, n[i].p, 12); echo &= run(n, 3, q, 1, n[i].p, 104); }
      want(all, "every note of a chord sounds");
      want(echo, "the chord echoes as a chord"); }
    /* an echo dropped before it sounds, on a held note's pitch */
    { nt_t n[] = { { 0, 96, 65 }, { 12, 6, 60 }, { 36, 6, 72 } };
      want(run(n, 3, qf, 1, 65, 90), "a dropped echo on a held note's pitch leaves the note alone"); }
    /* a dropped echo: nothing of it later, when its note ends */
    { nt_t n[] = { { 0, 60, 60 }, { 24, 6, 72 }, { 100, 96, 65 } };
      want(run(n, 3, ef, 1, 65, 190), "a dropped echo's note ending later cuts nothing"); }
    { nt_t n[] = { { 0, 120, 60 }, { 24, 300, 65 } };
      want(run(n, 2, ef, 1, 65, 300), "nor a note of its pitch struck before that"); }
    /* an echo sounding is still cut by the next note (fixed Gate: its off is
     * queued with its on) */
    { static const char *const fx[] = { "delay_time 8", "delay_pitch_fb 5", "delay_gate_fb 16", NULL };
      nt_t n[] = { { 0, 6, 60 }, { 60, 6, 72 } };
      const int with = run(n, 2, fx, 1, 65, 64), without = run(n, 2, fx, 0, 65, 64);
      want(!with && without, "an echo sounding is cut by the next note (and not with Retrig off)"); }

    /* SEQ ARP: a chord held the whole loop, struck again at the loop's start */
    {
        hx_t *h = hx_create(NULL);
        HX_NO_LEAD(h);
        hx_set_param(h, "bpm", "120");
        hx_set_param(h, "t3_c0_step_0_add",  "84 0 100 88 0 100 91 0 100");
        hx_set_param(h, "t3_c0_step_0_gate", "384");
        hx_set_param(h, "t3_c0_pfx_set",     "seq_arp_style 1");
        rig_launch(h, 3, 0);
        play(h, 48, g_a, &g_an);
        int late = 0;
        for (int i = 0; i < g_an; i++) late += g_a[i].kind == 0 && g_a[i].tick >= 384 + 96;
        char m[96]; snprintf(m, sizeof m, "SEQ ARP: a held chord plays on into the next pass (%d notes there)", late);
        want(late >= 4, m);
        hx_destroy(h);
    }

    HX_ASSERT(g_fail == 0, "Retrig drops waiting echoes and keeps the notes");
    printf("PASS: delay retrig keeps notes\n");
    return 0;
}
