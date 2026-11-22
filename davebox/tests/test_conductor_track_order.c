/* tests/test_conductor_track_order.c — the Conductor's shift for a tick is set
 * before any track plays that tick, so every responder hears the same shift
 * whatever its track number, and no responder triggers twice in one tick
 * (ruled 2026-11-21).
 *
 * Before: tracks played a tick in index order, and the Conductor's note set
 * the shift at its own index. On a tick where the Conductor moved, a
 * responder numbered below it played the OLD shift and one above it the new.
 * In "Now" the retrigger then re-fired every sounding responder note — a
 * second note-on for one that had just started at the new shift.
 *
 * Rig: t3 is the Conductor (Lock on, chromatic, key A = root 69): 60 on step
 * 0 (shift -9), 64 on step 4 (shift -5). t1 and t5 respond, each playing 60
 * on step 4 — the Conductor's own tick.
 *  1. Next: each responder sends exactly one note-on on step 4, at 55 (60-5),
 *     never 51 (the old shift).
 *  2. Now: the same — one note-on each on that tick, at 55.
 *  3. Now, a responder note held across shifts -9 -> -5 -> -9 is retriggered
 *     both times and ends at 51: a retriggered note records its new shift. */
#include "harness.h"

static int ons[16], on51[16], on55[16];

static void count(int from) {
    for (int i = from; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0, ch = e->bytes[1] & 0x0F;
        if (st != 0x90 || e->bytes[3] == 0) continue;
        ons[ch]++;
        if (e->bytes[2] == 51) on51[ch]++;
        if (e->bytes[2] == 55) on55[ch]++;
    }
}

static void run(int when) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    HX_NO_LEAD(h);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    hx_set_param(h, "scale_aware", "0");
    hx_set_param(h, "key", "9");                          /* A: root 69 */
    hx_set_param(h, "t3_convert_to_conduct", "1");
    HX_ASSERT(I->conductor_track == 3, "rig: t3 is the Conductor");
    hx_set_param(h, "t3_c0_cond_lock", "1");
    hx_set_param(h, "t3_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t3_c0_step_4_toggle", "64 100");
    char v[16];
    int resp[2] = { 1, 5 };
    for (int r = 0; r < 2; r++) {
        int t = resp[r];
        HX_ASSERT(I->tracks[t].pad_mode == PAD_MODE_MELODIC_SCALE, "rig: responder is melodic");
        snprintf(v, sizeof v, "%d 1", t);
        hx_set_param(h, "t3_c0_cond_resp", v);
        snprintf(v, sizeof v, "%d %d", t, when);
        hx_set_param(h, "t3_c0_cond_when", v);
        char k[32];
        snprintf(k, sizeof k, "t%d_c0_step_4_toggle", t);
        hx_set_param(h, k, "60 100");
        snprintf(k, sizeof k, "t%d_launch_clip", t);
        hx_set_param(h, k, "0");
    }
    hx_set_param(h, "t3_launch_clip", "0");
    HX_ASSERT(I->tracks[1].channel != I->tracks[5].channel, "rig: responders on distinct channels");
    hx_set_param(h, "transport", "play");
    /* Up to step 2: the Conductor's step-0 shift is in place, nothing else played. */
    { int g = 0; while (!(I->tracks[3].current_step >= 2) && g++ < 2000) hx_render(h, 1); }
    HX_ASSERT(I->conductor_sounding && I->conductor_off_semi == -9, "rig: the step-0 shift (-9) holds");
    memset(ons, 0, sizeof ons); memset(on51, 0, sizeof on51); memset(on55, 0, sizeof on55);
    int from = hx_stub_event_count();
    /* Through step 4 and on to step 8 (before any wrap). */
    { int g = 0; while (I->tracks[3].current_step < 8 && g++ < 2000) hx_render(h, 1); }
    HX_ASSERT(I->conductor_off_semi == -5, "rig: the step-4 shift (-5) took");
    count(from);
    for (int r = 0; r < 2; r++) {
        int ch = I->tracks[resp[r]].channel & 0x0F;
        if (ons[ch] != 1 || on55[ch] != 1 || on51[ch] != 0) {
            fprintf(stderr, "FAIL: %s, responder t%d: %d note-on(s) on the Conductor's tick "
                    "(%d at 55, %d at the old 51) — want exactly one, at 55\n",
                    when ? "Now" : "Next", resp[r], ons[ch], on55[ch], on51[ch]);
            exit(1);
        }
    }
    hx_destroy(h);
}

/* 3: t1 holds 60 from step 2 to the bar's end; the Conductor plays 60 (step
 * 0), 64 (step 4), 60 (step 6). In Now the held note goes 51 -> 55 -> 51. */
static void run_back(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    HX_NO_LEAD(h);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    hx_set_param(h, "scale_aware", "0");
    hx_set_param(h, "key", "9");
    hx_set_param(h, "t3_convert_to_conduct", "1");
    hx_set_param(h, "t3_c0_cond_lock", "1");
    hx_set_param(h, "t3_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t3_c0_step_4_toggle", "64 100");
    hx_set_param(h, "t3_c0_step_6_toggle", "60 100");
    hx_set_param(h, "t3_c0_cond_resp", "1 1");
    hx_set_param(h, "t3_c0_cond_when", "1 1");
    hx_set_param(h, "t1_c0_step_2_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_2_gate", "300");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "t3_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    pfx_active_t *an = &I->tracks[1].pfx.active_notes[60];
    { int g = 0; while (I->tracks[3].current_step < 5 && g++ < 2000) hx_render(h, 1); }
    HX_ASSERT(an->active && an->gen_notes[0] == 55, "Now: the held note was retriggered to 55 at step 4");
    { int g = 0; while (I->tracks[3].current_step < 8 && g++ < 2000) hx_render(h, 1); }
    HX_ASSERT(I->conductor_off_semi == -9, "rig: the step-6 shift (-9) took");
    HX_ASSERT(an->active, "rig: the responder note is still held");
    if (an->gen_notes[0] != 51) {
        fprintf(stderr, "FAIL: Now, shift back to -9: the held responder note sounds %d, not 51\n",
                (int)an->gen_notes[0]);
        exit(1);
    }
    hx_destroy(h);
}

int main(void) {
    run(0);   /* Next */
    run(1);   /* Now */
    run_back();
    printf("PASS: conductor_track_order (Next and Now: one note-on per responder, at the new shift)\n");
    return 0;
}
