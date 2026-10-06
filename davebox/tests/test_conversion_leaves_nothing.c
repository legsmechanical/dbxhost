/* tests/test_conversion_leaves_nothing.c — converting a track's type takes
 * the old type's hidden data with it.
 *
 * THE BUG THIS PINS (2026-10-04 module review):
 *   melodic → drum kept each clip's recorded AFTERTOUCH automation, which the
 *     render path evaluates on drum tracks too — pressure curves from notes
 *     that no longer exist kept playing;
 *   drum → melodic said it discarded the repeat groove and reset only
 *     mute / solo / lane / perform mode — the groove stayed, was saved with
 *     the melodic track, and came back if the track was ever a drum track
 *     again. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;

    /* ---- melodic → drum: aftertouch automation on clip A and clip D */
    seq8_track_t *m = &I->tracks[1];
    HX_ASSERT(m->pad_mode != PAD_MODE_DRUM, "control: t1 is melodic");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    for (int c = 0; c < 4; c += 3) {
        m->clip_at_auto[c].pitch[0]    = 60;
        m->clip_at_auto[c].count[0]    = 2;
        m->clip_at_auto[c].ticks[0][1] = 48;
        m->clip_at_auto[c].vals[0][0]  = 90;
        m->clip_at_auto[c].vals[0][1]  = 20;
    }
    hx_set_param(h, "t1_convert_to_drum", "1");
    HX_ASSERT(m->pad_mode == PAD_MODE_DRUM, "control: t1 became a drum track");
    for (int c = 0; c < 4; c += 3)
        for (int l = 0; l < AT_MAX_LANES; l++)
            HX_ASSERT(m->clip_at_auto[c].count[l] == 0,
                      "a melodic clip's aftertouch automation survived the conversion to drum");

    /* ---- drum → melodic: the repeat groove */
    seq8_track_t *d = &I->tracks[0];
    HX_ASSERT(d->pad_mode == PAD_MODE_DRUM, "control: t0 is a drum track");
    hx_set_param(h, "t0_l0_step_0_toggle", "100");
    d->drum_repeat_gate[2]         = 0x55;
    d->drum_repeat_gate_len[2]     = 4;
    d->drum_repeat2_rate_idx[2]    = 5;
    d->drum_repeat_vel_scale[2][1] = 40;
    d->drum_repeat_nudge[2][3]     = -20;
    hx_set_param(h, "t0_convert_to_melodic", "1");
    HX_ASSERT(d->pad_mode != PAD_MODE_DRUM, "control: t0 became melodic");
    HX_ASSERT(d->drum_repeat_gate[2] == 0xFF && d->drum_repeat_gate_len[2] == 8,
              "the repeat gate pattern survived the conversion to melodic");
    HX_ASSERT(d->drum_repeat2_rate_idx[2] == 2, "the lane repeat rate survived the conversion to melodic");
    HX_ASSERT(d->drum_repeat_vel_scale[2][1] == 255, "the repeat step velocity survived the conversion to melodic");
    HX_ASSERT(d->drum_repeat_nudge[2][3] == 0, "the repeat nudge survived the conversion to melodic");

    hx_destroy(h);
    printf("PASS: conversion_leaves_nothing\n");
    return 0;
}
