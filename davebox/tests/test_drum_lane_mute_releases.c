/* tests/test_drum_lane_mute_releases.c — muting (or soloing away) a drum lane
 * releases its sounding hit at once.
 *
 * THE BUG THIS PINS (2026-10-04 module review): `tN_lL_mute` / `_solo` sent the
 * note-off through the track's MELODIC engine (pfx_note_off), but a drum hit
 * lives in the lane's own drum_lane_pfx[lane]. The melodic engine had nothing
 * to release, so a long-gate hit rang on after Mute until its gate ran out. */
#include "harness.h"

static int count_offs(int note) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0;
        if (e->bytes[2] == (uint8_t)note && (st == 0x80 || (st == 0x90 && e->bytes[3] == 0))) n++;
    }
    return n;
}
static int count_ons(int note) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == (uint8_t)note && e->bytes[3] > 0) n++;
    }
    return n;
}

/* Start a long hit on lane `lane` (step 0, gate = 15 steps), play until it
 * sounds; returns its pitch. */
static int start_long_hit(hx_t *h, seq8_instance_t *inst, int lane) {
    char k[64];
    snprintf(k, sizeof(k), "t0_l%d_step_0_toggle", lane); hx_set_param(h, k, "100");
    snprintf(k, sizeof(k), "t0_l%d_step_0_gate", lane);   hx_set_param(h, k, "360");
    seq8_track_t *tr = &inst->tracks[0];
    int pitch = tr->drum_clips[tr->active_clip]->lanes[lane].midi_note;
    hx_stub_reset_capture();
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    for (int i = 0; i < 2000 && !count_ons(pitch); i++) hx_render(h, 1);
    return pitch;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "control: t0 is drum");

    /* Mute. */
    int p0 = start_long_hit(h, inst, 0);
    HX_ASSERT(count_ons(p0) == 1, "control: lane 0's hit sounded");
    HX_ASSERT(count_offs(p0) == 0, "control: still sounding (long gate)");
    hx_set_param(h, "t0_l0_mute", "1");
    HX_ASSERT(count_offs(p0) == 1, "muting the lane did not release its sounding hit");
    hx_set_param(h, "t0_l0_mute", "0");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 8);

    /* Solo another lane: the sounding one is silenced. */
    int p2 = start_long_hit(h, inst, 2);
    HX_ASSERT(count_ons(p2) >= 1, "control: lane 2's hit sounded");
    int before = count_offs(p2);
    hx_set_param(h, "t0_l5_solo", "1");
    HX_ASSERT(count_offs(p2) == before + 1, "soloing another lane did not release lane 2's hit");

    hx_destroy(h);
    printf("PASS: drum_lane_mute_releases\n");
    return 0;
}
