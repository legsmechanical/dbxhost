/* tests/test_note_repeat_respects_lane_mute.c — Note Repeat on a muted (or
 * soloed-out) drum lane is silent, even while its pad is held (ruled
 * 2026-11-21). Before: both repeat engines checked only TRACK mute, and only
 * for latched repeats, so a muted lane kept repeating under a held pad. */
#include "harness.h"

static int seen;
static int ons_of(int note) {
    int n = hx_stub_event_count(), c = 0;
    for (; seen < n; seen++) {
        const hx_midi_event *e = hx_stub_event(seen);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0 && e->bytes[2] == note) c++;
    }
    return c;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM, "control: t0 drum");
    hx_set_param(h, "t0_l9_step_0_toggle", "100");     /* allocates the clip */
    int ac = tr->active_clip;
    int n0 = tr->drum_clips[ac]->lanes[0].midi_note;
    int n1 = tr->drum_clips[ac]->lanes[1].midi_note;
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 20);

    /* Repeat 1, pad held (not latched), lane 0. */
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat_start", "0 3 100");
    seen = hx_stub_event_count(); hx_render(h, 200);
    HX_ASSERT(ons_of(n0) > 0, "control: the held pad repeats");
    hx_set_param(h, "t0_l0_mute", "1");
    hx_render(h, 4); ons_of(n0);
    hx_render(h, 200);
    HX_ASSERT(ons_of(n0) == 0, "Repeat 1: a muted lane does not repeat under a held pad");
    hx_set_param(h, "t0_l0_mute", "0");
    hx_render(h, 200);
    HX_ASSERT(ons_of(n0) > 0, "Repeat 1: unmuted, it repeats again");
    hx_set_param(h, "t0_l5_solo", "1");                  /* lane 0 soloed out */
    hx_render(h, 4); ons_of(n0);
    hx_render(h, 200);
    HX_ASSERT(ons_of(n0) == 0, "Repeat 1: a soloed-out lane does not repeat");
    hx_set_param(h, "t0_l5_solo", "0");
    hx_set_param(h, "t0_drum_repeat_stop", "1");

    /* Repeat 2, lane 1. */
    hx_set_param(h, "t0_drum_repeat2_lane_on", "1 100");
    hx_render(h, 4); ons_of(n1);
    hx_render(h, 400);
    HX_ASSERT(ons_of(n1) > 0, "control: Repeat 2 repeats lane 1");
    hx_set_param(h, "t0_l1_mute", "1");
    hx_render(h, 4); ons_of(n1);
    hx_render(h, 400);
    HX_ASSERT(ons_of(n1) == 0, "Repeat 2: a muted lane does not repeat");

    hx_destroy(h);
    printf("PASS: note_repeat_respects_lane_mute\n");
    return 0;
}
