/* tests/test_scene_launch_matches_clip_launch.c — each track in a launched
 * scene switches exactly as tN_launch_clip would switch that track at the same
 * moment: the same placement, silencing at Launch Now, program / bank sent,
 * the same quantize boundary (ruled 2026-11-21).
 *
 * Before: launch_scene had its own copy of the switch. At Now it placed the
 * new clip at (old step % new length) instead of the song position, sent no
 * note-offs and no program change; quantized, it armed pending_page_stop on
 * every playing track, so a playing track waited for the 16-step page while
 * an idle one switched on the quantize boundary.
 *
 * Every scenario runs twice in fresh instances — once by tN_launch_clip, once
 * by launch_scene — and both must give the same result:
 *  1. Now at song step 29, clip A 16 steps, clip B 12 steps: B comes in at
 *     step 5 (29 % 12); the track is silenced as a clip launch silences it
 *     (clip A's pending gates released, its note ends); B's program change
 *     (42) goes out.
 *  2. Launch 1/4, sent at step 17: the playing track has no page stop armed,
 *     and both it and an idle track switch at step 20.
 * Controls: a scene launched while stopped queues without changing the active
 * clip; launch_scene_quant still arms the page stop. */
#include "harness.h"

enum { BY_CLIP, BY_SCENE };

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    HX_NO_LEAD(h);
    hx_set_param(h, "t1_c0_step_13_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_13_gate", "200");        /* still sounding at step 29 */
    hx_set_param(h, "t1_c1_step_0_toggle", "62 100");
    hx_set_param(h, "t1_c1_loop_set", "12");             /* clip B: 12 steps */
    hx_set_param(h, "t1_c1_program", "42");
    hx_set_param(h, "t2_c1_step_0_toggle", "64 100");    /* t2: idle, clip B has content */
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    HX_ASSERT(I->tracks[1].clips[1].length == 12 && I->tracks[1].clips[0].length == 16, "rig: clip lengths");
    return h;
}

static void launch(hx_t *h, int how) {
    if (how == BY_SCENE) { hx_set_param(h, "launch_scene", "1"); return; }
    for (int t = 0; t < NUM_TRACKS; t++) {
        char k[24];
        snprintf(k, sizeof k, "t%d_launch_clip", t);
        hx_set_param(h, k, "1");
    }
}

static void now_case(int how, int *step_out, int *pend_out, int *off_out, int *prog_out) {
    hx_t *h = rig();
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[1];
    hx_set_param(h, "transport", "play_focus:1:0");
    { int g = 0; while (!(I->global_tick == 29 && I->master_tick_in_step >= 2) && g++ < 4000) hx_render(h, 1); }
    HX_ASSERT(I->global_tick == 29 && tr->clip_playing && tr->active_clip == 0, "rig: clip A playing at song step 29");
    HX_ASSERT(tr->pfx.pitch_refcount[60] == 1, "rig: clip A's note is sounding");
    int from = hx_stub_event_count();
    int ch = tr->channel & 0x0F;
    launch(h, how);
    HX_ASSERT(tr->active_clip == 1, "Now: the track switched at once");
    *step_out = tr->current_step;
    /* Silencing: the old clip's pending gates are released (their offs
     * scheduled through the chain), so nothing of clip A plays on. */
    *pend_out = tr->play_pending_count;
    hx_render(h, 400);
    HX_ASSERT(tr->pfx.pitch_refcount[60] == 0, "clip A's note ended");
    *off_out = 0; *prog_out = 0;
    for (int i = from; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0, c = e->bytes[1] & 0x0F;
        if (c != ch) continue;
        if (e->bytes[2] == 60 && (st == 0x80 || (st == 0x90 && e->bytes[3] == 0))) (*off_out)++;
        if (st == 0xC0 && e->bytes[2] == 42) (*prog_out)++;
    }
    hx_destroy(h);
}

static void quant_case(int how, int *pps_out, int *flip1, int *flip2) {
    hx_t *h = rig();
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    hx_set_param(h, "launch_quant", "3");                 /* 1/4 = 4 steps */
    hx_set_param(h, "transport", "play_focus:1:0");
    { int g = 0; while (!(I->global_tick == 17 && I->master_tick_in_step >= 2) && g++ < 4000) hx_render(h, 1); }
    HX_ASSERT(I->tracks[1].clip_playing && !I->tracks[2].clip_playing, "rig: t1 playing, t2 idle");
    launch(h, how);
    *pps_out = I->tracks[1].pending_page_stop;
    *flip1 = *flip2 = -1;
    for (int g = 0; g < 4000 && (*flip1 < 0 || *flip2 < 0) && I->global_tick < 40; g++) {
        hx_render(h, 1);
        if (*flip1 < 0 && I->tracks[1].active_clip == 1) *flip1 = (int)I->global_tick;
        if (*flip2 < 0 && I->tracks[2].active_clip == 1) *flip2 = (int)I->global_tick;
    }
    hx_destroy(h);
}

int main(void) {
    int st[2], pend[2], off[2], prog[2];
    for (int how = BY_CLIP; how <= BY_SCENE; how++) now_case(how, &st[how], &pend[how], &off[how], &prog[how]);
    HX_ASSERT(st[BY_CLIP] == 5, "control: tN_launch_clip at Now places B at the song position (29 % 12 = 5)");
    HX_ASSERT(pend[BY_CLIP] == 0 && off[BY_CLIP] >= 1 && prog[BY_CLIP] == 1,
              "control: tN_launch_clip at Now releases clip A's gates, ends its note, sends the program");
    if (st[BY_SCENE] != st[BY_CLIP]) {
        fprintf(stderr, "FAIL: scene launch at Now placed B at step %d, a clip launch at %d\n", st[BY_SCENE], st[BY_CLIP]);
        return 1;
    }
    HX_ASSERT(pend[BY_SCENE] == 0, "scene launch at Now: clip A's pending gates are released, as a clip launch does");
    HX_ASSERT(off[BY_SCENE] >= 1, "scene launch at Now: the held note gets its note-off");
    HX_ASSERT(prog[BY_SCENE] == 1, "scene launch at Now: the incoming clip's program change goes out");

    int pps[2], f1[2], f2[2];
    for (int how = BY_CLIP; how <= BY_SCENE; how++) quant_case(how, &pps[how], &f1[how], &f2[how]);
    HX_ASSERT(pps[BY_CLIP] == 0 && f1[BY_CLIP] == 20 && f2[BY_CLIP] == 20,
              "control: tN_launch_clip at 1/4 switches both tracks at step 20");
    if (pps[BY_SCENE] != 0 || f1[BY_SCENE] != 20 || f2[BY_SCENE] != 20) {
        fprintf(stderr, "FAIL: scene launch at 1/4: page stop %d, playing track switched at %d, idle at %d (want 0, 20, 20)\n",
                pps[BY_SCENE], f1[BY_SCENE], f2[BY_SCENE]);
        return 1;
    }

    /* CONTROL: stopped — the scene queues; nothing switches until Play. */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "launch_scene", "1");
        HX_ASSERT(I->tracks[1].active_clip == 0 && I->tracks[1].queued_clip == 1,
                  "control: a stopped scene launch queues without changing the active clip");
        hx_destroy(h);
    }
    /* CONTROL: launch_scene_quant still waits for the page. */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, 30);
        hx_set_param(h, "launch_scene_quant", "1");
        HX_ASSERT(I->tracks[1].pending_page_stop == 1 && I->tracks[1].queued_clip == 1,
                  "control: launch_scene_quant arms the page stop");
        hx_destroy(h);
    }
    printf("PASS: scene_launch_matches_clip_launch (Now and 1/4, placement, note-off, program)\n");
    return 0;
}
