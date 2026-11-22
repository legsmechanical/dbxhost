/* tests/test_looper_drum_capture_lead.c — a live drum hit is stored in the
 * looper where it was HEARD, the output lead behind the sequencer, exactly as
 * a live melodic note is. Before: drum capture stored the raw loop position,
 * so a looped drum pad replayed ~3 blocks after it was heard. */
#include "harness.h"

static int stored_tick(seq8_instance_t *in, uint8_t track, uint8_t note) {
    int t = -1;
    for (int e = 0; e < (int)in->looper_event_count; e++)
        if (in->looper_events[e].track == track && in->looper_events[e].d1 == note
                && (in->looper_events[e].status & 0xF0) == 0x90 && in->looper_events[e].d2 > 0)
            t = in->looper_events[e].tick;
    return t;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    seq8_track_t *dt = &in->tracks[0];
    HX_ASSERT(dt->pad_mode == PAD_MODE_DRUM, "control: t0 drum");
    hx_set_param(h, "t0_l9_step_0_toggle", "100");     /* allocates the clip */
    int note = dt->drum_clips[dt->active_clip]->lanes[3].midi_note;
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 50);
    int L = (int)lead_ticks(in);
    HX_ASSERT(L > 0, "control: there is an output lead");

    hx_set_param(h, "looper_sync", "0");
    hx_set_param(h, "looper_arm", "96");
    for (int i = 0; i < 400 && !(in->looper_state == LOOPER_STATE_CAPTURING && in->looper_pos >= 25); i++)
        hx_render(h, 1);
    HX_ASSERT(in->looper_state == LOOPER_STATE_CAPTURING && in->looper_pos >= 25, "rig: never reached 25");
    uint32_t pos = in->looper_pos;

    live_note_on(in, dt, (uint8_t)note, 100);           /* a live drum pad */
    live_note_on(in, &in->tracks[1], 61, 90);           /* a live melodic note, same moment */
    int dtick = stored_tick(in, 0, (uint8_t)note), mtick = stored_tick(in, 1, 61);
    HX_ASSERT(dtick >= 0 && mtick >= 0, "rig: both were captured");
    HX_ASSERT(mtick < (int)pos, "control: the melodic note steps back by the lead");
    HX_ASSERT(dtick == mtick, "a live drum hit is stored where it was heard, like a melodic note");

    hx_destroy(h);
    printf("PASS: looper_drum_capture_lead\n");
    return 0;
}
