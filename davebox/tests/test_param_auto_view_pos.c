/* tests/test_param_auto_view_pos.c — the AUTOMATION bank's playhead source.
 *
 * tN_pa_view names the lane selected on the AUTOMATION bank; state_snapshot's
 * fields 57..64 then report, per track, where that lane IS in its own lane
 * ticks — taken from the same pa_entry_tick playback evaluates it at, so the
 * playhead cannot disagree with what plays. Pinned here against the lane's
 * own loop arithmetic (an 8-step loop inside a 16-step clip wraps twice per
 * clip pass), and against the cases that must read -1: nothing viewed, a
 * target with no lane, "-", and the transport stopped. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* Field `i` of state_snapshot (0-based). */
static long snap_field(hx_t *h, int i) {
    char buf[1024];
    hx_get_param(h, "state_snapshot", buf, sizeof buf);
    char *p = buf;
    for (int k = 0; k < i; k++) { p = strchr(p, ' '); if (!p) return -99999; p++; }
    return strtol(p, NULL, 10);
}

int main(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t0_c0_step_0_toggle", "60 100");          /* a playing clip */
    hx_set_param(h, "t0_pa_set", "0 1:synth:cutoff 0 100");
    hx_set_param(h, "t0_pa_loop", "0 1:synth:cutoff 192 0 0"); /* its own 8-step loop */

    HX_ASSERT(snap_field(h, 57) == -1, "nothing viewed: -1");
    hx_set_param(h, "t0_pa_view", "0 1:synth:nope");
    HX_ASSERT(in->tracks[0].pa_view_slot == 0, "a target with no lane views nothing");
    HX_ASSERT(pa_target_lookup(in, "1:synth:nope") < 0, "...and viewing it did NOT create the target");
    hx_set_param(h, "t0_pa_view", "0 1:synth:cutoff");
    HX_ASSERT(in->tracks[0].pa_view_slot != 0, "the lane is viewed");
    HX_ASSERT(snap_field(h, 57) == -1, "stopped: -1");
    OK("no position while nothing is viewed, the target has no lane, or the transport is stopped");

    hx_set_param(h, "transport", "play_focus:0:0");
    HX_ASSERT(in->tracks[0].clip_playing, "setup: the clip plays");
    int seen_wrap = 0, prev = -1, ct_past_loop = 0;
    for (int i = 0; i < 400; i++) {
        hx_render(h, 5);
        const seq8_track_t *tr = &in->tracks[0];
        const long lt = snap_field(h, 57);
        /* The clip tick the last scan was handed (pa_last_ct), folded by THIS
         * test into the lane's own 8-step loop — the arithmetic, redone here
         * independently, must match what the snapshot reports, exactly. */
        const uint32_t ct = tr->pa_last_ct;
        HX_ASSERT(lt >= 0 && lt < 192, "the lane position stays inside its 8-step loop");
        HX_ASSERT(lt == (long)(ct % 192), "the position is the clip tick folded into the lane's 8-step loop");
        if (ct >= 192) ct_past_loop = 1;
        if (prev >= 0 && lt < prev) seen_wrap++;
        prev = (int)lt;
    }
    HX_ASSERT(ct_past_loop, "setup: the clip ran past the lane's loop, so folding was exercised");
    HX_ASSERT(seen_wrap >= 2, "the lane wrapped inside the clip (an 8-step loop in a 16-step clip)");
    OK("⭐ the viewed lane's position follows its OWN loop, the same arithmetic playback uses");

    HX_ASSERT(snap_field(h, 58) == -1, "another track: -1");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 5);
    HX_ASSERT(snap_field(h, 57) == -1, "after the transport STOPS: -1, not the last position");
    OK("stopping the transport takes the position away");
    hx_set_param(h, "t0_pa_view", "-");
    HX_ASSERT(snap_field(h, 57) == -1 && in->tracks[0].pa_view_slot == 0, "\"-\" clears the view");
    OK("\"-\" views nothing; other tracks report -1");

    hx_destroy(h);
    printf("test_param_auto_view_pos: %d ok\n", ok_count);
    return 0;
}
