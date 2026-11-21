/* tests/test_resets_and_clears_complete.c — a drum lane reset resets the
 * lane's effects too (as the manual says), and clearing a lane, a drum clip
 * or a melodic clip clears step conditions with the notes. Before (device
 * check): after a lane _hard_reset its gate 150 / velocity +20 / DELAY level 90
 * / repeats 3 survived; after a lane _clear Iter / Random / Ratchet survived;
 * a melodic clip clear kept them too. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *dt = &I->tracks[0];
    HX_ASSERT(dt->pad_mode == PAD_MODE_DRUM, "control: t0 drum");
    drum_pfx_params_t dd; drum_pfx_params_init(&dd);

    hx_set_param(h, "t0_l1_step_3_toggle", "100");
    int ac = dt->active_clip;
    drum_lane_t *ln = &dt->drum_clips[ac]->lanes[1];
    hx_set_param(h, "t0_l1_pfx_set", "gate_time 150");
    hx_set_param(h, "t0_l1_pfx_set", "delay_level 90");
    hx_set_param(h, "t0_l1_pfx_set", "repeat_times 3");
    HX_ASSERT(ln->pfx_params.gate_time == 150 && ln->pfx_params.repeat_times == 3, "control: lane effects set");
    hx_set_param(h, "t0_l1_hard_reset", "1");
    HX_ASSERT(ln->pfx_params.gate_time == dd.gate_time, "lane reset: gate back to a new lane's");
    HX_ASSERT(ln->pfx_params.delay_level == dd.delay_level, "lane reset: DELAY level back");
    HX_ASSERT(ln->pfx_params.repeat_times == dd.repeat_times, "lane reset: repeats back");
    HX_ASSERT(dt->drum_lane_pfx[1].repeat_times == dd.repeat_times && dt->drum_lane_pfx[1].gate_time == dd.gate_time,
              "lane reset: the live lane follows");

    /* Lane clear */
    hx_set_param(h, "t0_l2_step_3_toggle", "100");
    hx_set_param(h, "t0_l2_step_3_iter", "51");
    hx_set_param(h, "t0_l2_step_3_rand", "40");
    hx_set_param(h, "t0_l2_step_3_ratch", "3");
    clip_t *lc = &dt->drum_clips[ac]->lanes[2].clip;
    HX_ASSERT(lc->step_iter[3] == 51, "control: lane conditions set");
    hx_set_param(h, "t0_l2_clear", "1");
    HX_ASSERT(lc->step_note_count[3] == 0, "control: lane clear removed the hit");
    HX_ASSERT(lc->step_iter[3] == 0 && lc->step_random[3] == 0 && lc->step_ratchet[3] == 0, "lane clear: conditions cleared");

    /* Drum clip clear */
    hx_set_param(h, "t0_l4_step_5_toggle", "100");
    hx_set_param(h, "t0_l4_step_5_rand", "30");
    hx_set_param(h, "t0_c0_drum_clear", "1");
    HX_ASSERT(dt->drum_clips[0]->lanes[4].clip.step_random[5] == 0, "drum clip clear: conditions cleared");

    /* Melodic clip clear, and clear-keep */
    clip_t *mc = &I->tracks[1].clips[0];
    hx_set_param(h, "t1_c0_step_2_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_2_iter", "33");
    hx_set_param(h, "t1_c0_step_2_ratch", "2");
    hx_set_param(h, "t1_c0_clear", "1");
    HX_ASSERT(mc->step_note_count[2] == 0, "control: clip clear removed the note");
    HX_ASSERT(mc->step_iter[2] == 0 && mc->step_ratchet[2] == 0, "melodic clip clear: conditions cleared");
    hx_set_param(h, "t1_c0_step_2_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_2_rand", "20");
    hx_set_param(h, "t1_c0_clear_keep", "1");
    HX_ASSERT(mc->step_random[2] == 0, "melodic clear_keep: conditions cleared");

    hx_destroy(h);
    printf("PASS: resets_and_clears_complete\n");
    return 0;
}
