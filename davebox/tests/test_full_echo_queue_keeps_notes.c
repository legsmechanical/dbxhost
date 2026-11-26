/* tests/test_full_echo_queue_keeps_notes.c — a busy line with many DELAY
 * repeats fills a track's echo queue (256 events; 64 per drum lane). A full
 * queue used to drop whatever came next without a word: a note's own queued
 * note-off (the note hung), or a note-on swing was holding back (the note
 * never played). Now the echo due to sound last gives up its place, with its
 * off. Two bars of 16ths (triads, and a drum line), 16 repeats, then silence:
 * every note starts, nothing is left sounding, and the queue did fill. */
#include "pfx_rig.h"

static const uint8_t LINE[8] = { 60, 62, 64, 65, 67, 69, 71, 72 };

/* 1 = clean; prints what went wrong */
static uint32_t g_ref[32];   /* where each note starts with DELAY off */
static int run(int drum, int reps, int dtime, int swing, int *filled) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    clip_t *cl;
    drum_lane_t *ln = NULL;
    play_fx_t *fx = NULL;
    drum_pfx_t *px = NULL;
    if (drum) {
        hx_set_param(h, "t2_l0_note_add", "0 100 6");
        ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
        HX_ASSERT(ln, "control: the lane");
        cl = &ln->clip;
        ln->pfx_params.delay_level = 100; ln->pfx_params.repeat_times = (uint8_t)reps;
        ln->pfx_params.delay_time_idx = (uint8_t)dtime; ln->pfx_params.delay_retrig = 0;
        px = &inst->tracks[2].drum_lane_pfx[1];
    } else {
        hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
        cl = &inst->tracks[1].clips[0];
        char v[40];
        hx_set_param(h, "t1_c0_pfx_set", "delay_level 100");
        snprintf(v, sizeof v, "delay_repeats %d", reps); hx_set_param(h, "t1_c0_pfx_set", v);
        snprintf(v, sizeof v, "delay_time %d", dtime);   hx_set_param(h, "t1_c0_pfx_set", v);
        hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
        fx = &inst->tracks[1].pfx;
    }
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 128; cl->loop_start = 0;
    for (int s = 0; s < 32; s++) {
        if (drum) { clip_insert_note(cl, (uint32_t)s * 24, 12, ln->midi_note, 100); continue; }
        for (int k = 0; k < 3; k++) clip_insert_note(cl, (uint32_t)s * 24, 12, (uint8_t)(LINE[s % 8] + (k == 0 ? 0 : k == 1 ? 4 : 7)), 100);
    }
    clip_build_steps_from_notes(cl);
    if (swing) {
        char v[16];
        hx_set_param(h, "groove_kind", "1");
        snprintf(v, sizeof v, "%d", swing); hx_set_param(h, "groove_amt", v);
    }
    rig_launch(h, drum ? 2 : 1, 0);

    /* play to just before the loop comes round, watching the queue */
    hx_clear_capture(h);
    g_seen = 0; g_an = 0;
    rig_play(h);
    int maxq = 0, guard = 4000000;
    while (inst->playing && rig_now(h) < ST(126) && guard-- > 0) {
        hx_render(h, 1);
        const int q = drum ? px->event_count : fx->event_count;
        if (q > maxq) maxq = q;
        drain(g_a, &g_an, rig_now(h) ? rig_now(h) - 1 : 0);
    }
    const int cap = drum ? DRUM_PFX_MAX_EVENTS : MAX_PFX_EVENTS;
    if (filled) *filled += maxq >= cap;

    int ok = 1;
    /* every note of the line starts */
    /* every note of the line starts, where it does with DELAY off (not
     * early: a note-on swing holds back must keep its place) */
    int miss = 0;
    for (int s = 0; s < 32; s++) {
        const uint8_t p = drum ? ln->midi_note : LINE[s % 8];
        uint32_t at = UINT32_MAX;
        for (int i = 0; i < g_an && at == UINT32_MAX; i++)
            if (!g_a[i].kind && g_a[i].a == p && g_a[i].tick + 1 >= (uint32_t)s * 24 && g_a[i].tick <= (uint32_t)s * 24 + 14) at = g_a[i].tick;
        if (!reps) g_ref[s] = at;
        miss += at == UINT32_MAX || at != g_ref[s];
    }
    /* nothing left sounding, long after the last echo */
    int hung = 0;
    for (int p = 0; p < 128; p++) {
        int snd = 0;
        for (int i = 0; i < g_an; i++) if (g_a[i].a == p && (g_a[i].kind == 0 || g_a[i].kind == 3)) snd = g_a[i].kind == 0;
        hung += snd;
    }
    if (miss || hung) {
        ok = 0;
        printf("  %s repeats %d delay %d swing %d: queue max %d of %d, %d of 32 notes missing or moved, %d left sounding\n",
               drum ? "drum" : "melodic", reps, dtime, swing, maxq, cap, miss, hung);
    }
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    return ok;
}

int main(void) {
    static const int dts[] = { 5, 8, 11 };          /* 1/16, 1/8, 1/4 */
    static const int reps[] = { 8, 16 };
    int bad = 0, n = 0, filled = 0;
    for (int drum = 0; drum <= 1; drum++)
        for (int sw = 0; sw <= 60; sw += 60) {
            HX_ASSERT(run(drum, 0, 5, sw, NULL), "control: the line plays clean with DELAY off (the reference)");
            for (int r = 0; r < 2; r++)
                for (int d = 0; d < 3; d++) { bad += !run(drum, reps[r], dts[d], sw, &filled); n++; }
        }
    char m[96];
    snprintf(m, sizeof m, "%d of %d runs filled the queue", filled, n);
    printf("  %s; %d with a note lost or hung\n", m, bad);
    HX_ASSERT(filled >= n / 2, "control: the queue fills");
    HX_ASSERT(bad == 0, "a full echo queue loses no note's own event");
    printf("PASS: full echo queue keeps notes\n");
    return 0;
}
