/* tests/test_clip_effects_edit_stays_in_its_clip.c — editing a clip's play
 * effects from the browser changes THAT clip, not the one playing.
 *
 * THE BUG THIS PINS (2026-10-04 module review): tN_cC_pfx_set went through
 * pfx_set, which writes the track's live effects and the clip's stored ones
 * together, and re-synced the live set only when C was the active clip. For
 * any other clip the live write stayed: the playing clip sounded with the
 * edited clip's setting until the next clip change. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[1];
    HX_ASSERT(tr->pad_mode != PAD_MODE_DRUM && tr->active_clip == 0, "control: t1 melodic, clip A active");

    hx_set_param(h, "t1_c0_pfx_set", "noteFX_octave 1");
    HX_ASSERT(tr->clips[0].pfx_params.octave_shift == 1 && tr->pfx.octave_shift == 1,
              "control: an edit to the ACTIVE clip is stored and live");
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 40");
    HX_ASSERT(tr->pfx.delay_level == 40, "control: delay level live on the active clip");

    hx_set_param(h, "t1_c3_pfx_set", "noteFX_octave 3");
    hx_set_param(h, "t1_c3_pfx_set", "delay_level 99");
    HX_ASSERT(tr->clips[3].pfx_params.octave_shift == 3, "the edited clip did not store its octave");
    HX_ASSERT(tr->clips[3].pfx_params.delay_level == 99, "the edited clip did not store its delay level");
    HX_ASSERT(tr->clips[0].pfx_params.octave_shift == 1, "the active clip's stored octave changed");
    HX_ASSERT(tr->pfx.octave_shift == 1, "the playing clip took the other clip's octave");
    HX_ASSERT(tr->pfx.delay_level == 40, "the playing clip took the other clip's delay level");

    hx_destroy(h);
    printf("PASS: clip_effects_edit_stays_in_its_clip\n");
    return 0;
}
