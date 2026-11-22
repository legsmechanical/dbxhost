/* tests/test_midi_auto_rest.c — on Stop and on a clip switch, automated pitch
 * bend recentres (8192), automated channel aftertouch returns to 0, and an
 * automated CC goes back to its resting value like any other continuous
 * parameter (ruled 2026-11-21). Before: MIDI targets were skipped by the
 * release, so a bend stayed wherever the playhead left it. A switch to a clip
 * that automates the same target sends no recentre (its own value follows). */
#include "harness.h"

static int last_pb = -1, last_at = -1, last_cc1 = -1, n_pb_centre = 0, last_pat = -1;
static int seen;
static void scan(int ch) {
    int n = hx_stub_event_count();
    for (; seen < n; seen++) {
        const hx_midi_event *e = hx_stub_event(seen);
        int st = e->bytes[1] & 0xF0, c = e->bytes[1] & 0x0F;
        if (c != ch) continue;
        if (st == 0xE0) { last_pb = e->bytes[2] | (e->bytes[3] << 7); if (last_pb == 8192) n_pb_centre++; }
        if (st == 0xD0) last_at = e->bytes[2];
        if (st == 0xB0 && e->bytes[2] == 1) last_cc1 = e->bytes[3];
        if (st == 0xA0 && e->bytes[2] == 67) last_pat = e->bytes[3];
    }
}
static void run(hx_t *h, int n, int ch) { for (int i = 0; i < n; i++) { hx_render(h, 1); scan(ch); } }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    int ch = I->tracks[1].channel & 0x0F;
    hx_set_param(h, "t1_route", "external");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    /* clip 0: bend held high, pressure 90-ish, CC1 at 100-ish; CC1's rest is ~20 */
    hx_set_param(h, "t1_pa_set", "0 pb 0 12000");
    hx_set_param(h, "t1_pa_set", "0 at 0 11600");
    hx_set_param(h, "t1_pa_set", "0 cc:1 0 12900");
    hx_set_param(h, "t1_pa_rest", "0 cc:1 2580");      /* 2580/16383*127 = 20 */
    hx_set_param(h, "t1_c1_step_0_toggle", "62 100");  /* clip 1: nothing automated */
    hx_set_param(h, "t1_c2_step_0_toggle", "64 100");  /* clip 2: its own bend */
    hx_set_param(h, "t1_pa_set", "2 pb 0 4000");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    run(h, 120, ch);
    HX_ASSERT(last_pb == 12000 && last_at > 0 && last_cc1 > 90, "rig: the automation played");

    hx_set_param(h, "transport", "stop");
    run(h, 40, ch);
    HX_ASSERT(last_pb == 8192, "Stop: pitch bend recentred");
    HX_ASSERT(last_at == 0, "Stop: channel aftertouch back to 0");
    HX_ASSERT(last_cc1 == 20, "Stop: CC1 back to its resting value");

    /* A clip switch to an unautomated clip gives them back too. */
    hx_set_param(h, "transport", "play");
    run(h, 120, ch);
    HX_ASSERT(last_pb == 12000, "rig: playing again");
    hx_set_param(h, "t1_launch_clip", "1");
    run(h, 400, ch);
    HX_ASSERT(I->tracks[1].active_clip == 1, "rig: switched to clip 1");
    HX_ASSERT(last_pb == 8192 && last_at == 0 && last_cc1 == 20, "switch: bend / pressure / CC given back");

    /* A switch to a clip that bends itself: no recentre on the wire. */
    hx_set_param(h, "t1_launch_clip", "0");
    run(h, 400, ch);
    HX_ASSERT(last_pb == 12000, "rig: back on clip 0");
    n_pb_centre = 0;
    hx_set_param(h, "t1_launch_clip", "2");
    run(h, 400, ch);
    HX_ASSERT(I->tracks[1].active_clip == 2, "rig: switched to clip 2");
    HX_ASSERT(last_pb == 4000, "the incoming clip's own bend plays");
    HX_ASSERT(n_pb_centre == 0, "no centre-then-jump when the incoming clip bends itself");

    /* Recorded pad pressure (poly aftertouch on key 67) goes back to 0 on Stop. */
    {
        seq8_track_t *m = &I->tracks[1];
        at_auto_t *a = &m->clip_at_auto[2];
        a->pitch[0] = 67; a->count[0] = 2;
        a->ticks[0][0] = 0; a->vals[0][0] = 90;
        a->ticks[0][1] = 300; a->vals[0][1] = 90;
        run(h, 200, ch);
        HX_ASSERT(last_pat == 90, "rig: the pad pressure played");
        hx_set_param(h, "transport", "stop");
        run(h, 40, ch);
        HX_ASSERT(last_pat == 0, "Stop: recorded pad pressure back to 0");
    }

    hx_destroy(h);
    printf("PASS: midi_auto_rest\n");
    return 0;
}
