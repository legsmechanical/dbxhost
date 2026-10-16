/* tests/test_bake_post_offline_drum.c — the OFFLINE bake of a DRUM clip whose
 * track has a POST MIDI FX module (seq8_bake_post.c). The host job is the
 * harness's stand-in, set to answer every hit `up` higher so lane 0's hits come
 * back as lane 2's note:
 *
 *   - every lane's hits go into the module as the lane's note, at their ticks,
 *     raw (the lane's velocity offset comes after);
 *   - what comes back lands on the lane whose note it is — lane 0's hits on
 *     lane 2 — with THAT lane's velocity offset, and a pitch no lane has is
 *     dropped;
 *   - the clip is N passes long, the lanes' effects are reset, one undo step;
 *   - the instant bake path is not taken. */
#include "harness.h"

static int state(hx_t *h, const char *k) {
    char b[16];
    return hx_get_param(h, k, b, sizeof b) > 0 ? atoi(b) : -1;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM, "rig: track 0 is a drum track");
    hx_set_param(h, "t0_route", "schwung");
    hx_set_param(h, "t0_fxpost", "1");
    inst->active_track = 0;
    hx_render(h, 2);
    const int c = tr->active_clip;
    drum_clip_t *dc = tr->drum_clips[c];
    HX_ASSERT(dc, "rig: a drum clip");
    const uint8_t n0 = dc->lanes[0].midi_note, n2 = dc->lanes[2].midi_note;
    const int up = (int)n2 - (int)n0;
    hx_stub_mfo_module(up, 0);
    hx_set_param(h, "t0_l0_note_add", "0 100 12");
    hx_set_param(h, "t0_l0_note_add", "192 90 12");
    hx_set_param(h, "t0_l1_note_add", "96 100 12");
    /* lane 1 is re-tuned AFTER its hit was written: it plays (and goes into
     * the module as) its CURRENT note — one that comes back (+up) as a pitch
     * no lane plays, but still a real MIDI note */
    const uint8_t stray_in = (uint8_t)(120 - up);
    {
        int l;
        for (l = 0; l < DRUM_LANES; l++) HX_ASSERT(dc->lanes[l].midi_note != 120, "rig: 120 is a lane's note");
    }
    dc->lanes[1].midi_note = stray_in;
    dc->lanes[2].pfx_params.velocity_offset = -20;           /* lane 2's own effect */
    dc->lanes[0].pfx_params.velocity_offset = 15;            /* lane 0's: must NOT reach the module */
    hx_render(h, 2);
    HX_ASSERT(dc->lanes[0].clip.note_count == 2 && dc->lanes[1].clip.note_count == 1, "rig: the lanes hold their hits");
    const uint16_t len0 = dc->lanes[0].clip.length, tps = dc->lanes[0].clip.ticks_per_step;

    hx_set_param(h, "print_offline", "0 0 2 0");
    HX_ASSERT(state(h, "print_state") == 2, "the drum job did not start");
    {
        int n = 0, i, ons = 0, lane0 = 0;
        const move_midi_fx_offline_ev_t *in = hx_stub_mfo_input(&n, NULL, NULL, NULL, NULL);
        for (i = 0; i < n; i++) {
            if ((in[i].status & 0xF0) != 0x90) continue;
            ons++;
            if (in[i].d1 == n0) { lane0++; HX_ASSERT(in[i].d2 == 100 || in[i].d2 == 90, "a lane's velocity offset reached the module"); }
        }
        {
            int j, l1 = 0;
            for (j = 0; j < n; j++) if ((in[j].status & 0xF0) == 0x90 && in[j].d1 == stray_in) l1++;
            HX_ASSERT(l1 == 2, "a re-tuned lane went in as its old note, not its current one");
        }
        HX_ASSERT(ons == 6 && lane0 == 4, "not every lane's hits, twice, went in as the lane's note");
    }
    hx_render(h, 1);
    HX_ASSERT(state(h, "print_state") == 3, "the drum bake did not finish");
    HX_ASSERT(dc->lanes[0].clip.length == (uint16_t)(len0 * 2), "the lanes are not two passes long");
    HX_ASSERT(dc->lanes[0].clip.note_count == 0, "lane 0 kept hits the module moved away");
    HX_ASSERT(dc->lanes[2].clip.note_count == 4, "lane 0's hits did not land on lane 2 (the lane whose note they came back as), twice");
    {
        int i, ok = 1;
        for (i = 0; i < dc->lanes[2].clip.note_count; i++) {
            const note_t *nt = &dc->lanes[2].clip.notes[i];
            if (!nt->active) continue;
            if (nt->vel != 80 && nt->vel != 70) ok = 0;
        }
        HX_ASSERT(ok, "lane 2's own velocity offset (-20) is not on the hits that landed there");
    }
    {
        int l, total = 0;
        for (l = 0; l < DRUM_LANES; l++) total += dc->lanes[l].clip.note_count;
        HX_ASSERT(total == 4, "a pitch no lane has was kept somewhere");
    }
    HX_ASSERT(dc->lanes[2].pfx_params.velocity_offset == 0, "the lanes' effects were not reset (they would apply twice)");
    HX_ASSERT(tps == dc->lanes[2].clip.ticks_per_step, "the lanes' resolution changed");
    hx_set_param(h, "print_done", "1");
    hx_set_param(h, "undo_restore", "1");
    hx_render(h, 2);
    HX_ASSERT(dc->lanes[0].clip.note_count == 2 && dc->lanes[2].clip.note_count == 0, "the drum bake is not one undo step");

    hx_destroy(h);
    printf("PASS: a drum clip bakes offline through a Post module: hits in raw, back on the lane whose note they are, that lane's effects, one undo\n");
    return 0;
}
