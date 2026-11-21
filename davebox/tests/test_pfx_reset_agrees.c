/* tests/test_pfx_reset_agrees.c — resetting the play-effects chain gives the
 * live engine and the stored clip the SAME values: a new clip's.
 *
 * Before: pfx_reset left the live DELAY Level at 0 and the feedback random
 * mode at 0 while the clip stored 127 / Walk; pfx_seq_arp_reset stored Oct 1 /
 * Steps Off while the live arp got Oct 0 / Steps Mute; the DELAY bank reset
 * gave both Level 0 where a new clip has 127. What sounded after a reset then
 * changed again at the next clip reload. Track 2 (t1) is melodic; t0 is drum. */
#include "harness.h"

#define EQ(a, b, what) HX_ASSERT((a) == (b), what)

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[1];
    HX_ASSERT(tr->pad_mode != PAD_MODE_DRUM, "control: t1 is melodic");
    clip_pfx_params_t *cp = &tr->clips[tr->active_clip].pfx_params;
    clip_pfx_params_t d; clip_pfx_params_init(&d);

    /* Whole chain. */
    hx_set_param(h, "t1_delay_level", "50");
    hx_set_param(h, "t1_delay_repeats", "4");
    HX_ASSERT(tr->pfx.delay_level == 50 && cp->delay_level == 50, "control: the knob reached both");
    hx_set_param(h, "t1_pfx_reset", "1");
    EQ(cp->delay_level, d.delay_level, "pfx_reset: stored DELAY Level is a new clip's");
    EQ(tr->pfx.delay_level, cp->delay_level, "pfx_reset: live DELAY Level = stored");
    EQ(tr->pfx.fb_note_random_mode, cp->fb_note_random_mode, "pfx_reset: live fb random mode = stored");
    EQ(tr->pfx.repeat_times, 0, "pfx_reset: repeats cleared");

    /* DELAY bank. */
    hx_set_param(h, "t1_delay_level", "30");
    hx_set_param(h, "t1_pfx_delay_reset", "1");
    EQ(cp->delay_level, d.delay_level, "pfx_delay_reset: stored Level is a new clip's (127)");
    EQ(tr->pfx.delay_level, d.delay_level, "pfx_delay_reset: live Level is a new clip's");
    EQ(cp->delay_retrig, d.delay_retrig, "pfx_delay_reset: retrig is a new clip's");

    /* SEQ ARP bank. */
    hx_set_param(h, "t1_seq_arp_octaves", "2");
    hx_set_param(h, "t1_seq_arp_steps_mode", "2");
    HX_ASSERT(cp->seq_arp_octaves == 2, "control: arp Oct reached the clip");
    hx_set_param(h, "t1_pfx_seq_arp_reset", "1");
    EQ(cp->seq_arp_octaves, d.seq_arp_octaves, "pfx_seq_arp_reset: stored Oct is a new clip's");
    EQ(cp->seq_arp_steps_mode, d.seq_arp_steps_mode, "pfx_seq_arp_reset: stored Steps is a new clip's");
    EQ(tr->pfx.arp.octaves, cp->seq_arp_octaves, "pfx_seq_arp_reset: live Oct = stored");
    EQ(tr->pfx.arp.steps_mode, cp->seq_arp_steps_mode, "pfx_seq_arp_reset: live Steps = stored");
    EQ(tr->pfx.arp.step_loop_len, cp->seq_arp_step_loop_len, "pfx_seq_arp_reset: loop length agrees");

    /* Drum lane. */
    seq8_track_t *dt = &I->tracks[0];
    HX_ASSERT(dt->pad_mode == PAD_MODE_DRUM, "control: t0 is drum");
    drum_pfx_params_t dd; drum_pfx_params_init(&dd);
    hx_set_param(h, "t0_l0_pfx_set", "delay_level 40");
    hx_set_param(h, "t0_l0_pfx_reset", "1");
    drum_pfx_params_t *lp = &dt->drum_clips[dt->active_clip]->lanes[0].pfx_params;
    EQ(lp->delay_level, dd.delay_level, "drum lane reset: Level is a new lane's");
    EQ(dt->drum_lane_pfx[0].delay_level, lp->delay_level, "drum lane reset: live = stored");

    hx_destroy(h);
    printf("PASS: pfx_reset_agrees\n");
    return 0;
}
