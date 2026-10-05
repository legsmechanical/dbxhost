/* tests/test_drum_edits_undoable.c — drum edits that the UI books as undoable
 * really are: Undo puts them back.
 *
 * THE BUGS THIS PINS (2026-10-04 module review):
 *   R-17  tN_lL_step_S_clear (Delete + step on a drum lane) took no snapshot.
 *   R-18  tN_cC_drum_clear / tN_cC_drum_reset took no snapshot.
 *   R-19  tN_lL_pfx_reset (and the reset keys through tN_lL_pfx_set) took the
 *         hidden MELODIC clip's snapshot and discarded the armed drum undo.
 * In each case Undo restored nothing, or an older edit. */
#include "harness.h"

static drum_clip_t *dclip(seq8_instance_t *inst) {
    seq8_track_t *tr = &inst->tracks[0];
    return tr->drum_clips[tr->active_clip];
}

static void check(const char *what, int ok) {
    if (!ok) { fprintf(stderr, "FAIL: %s\n", what); exit(1); }
    printf("  ok   — %s\n", what);
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "control: t0 is drum");
    int ac = inst->tracks[0].active_clip;
    char key[48];

    /* R-17: Delete + step on lane 2. */
    hx_set_param(h, "t0_l2_step_5_toggle", "100");
    HX_ASSERT(dclip(inst)->lanes[2].clip.steps[5], "control: hit placed");
    hx_set_param(h, "t0_l2_step_5_clear", "1");
    HX_ASSERT(!dclip(inst)->lanes[2].clip.steps[5], "control: hit cleared");
    hx_set_param(h, "undo_restore", "1");
    check("Delete + step on a drum lane undoes", dclip(inst)->lanes[2].clip.steps[5]);

    /* R-18: drum_clear. */
    snprintf(key, sizeof(key), "t0_c%d_drum_clear", ac);
    hx_set_param(h, key, "1");
    HX_ASSERT(!dclip(inst)->lanes[2].clip.steps[5], "control: clip cleared");
    hx_set_param(h, "undo_restore", "1");
    check("drum clip clear undoes", dclip(inst)->lanes[2].clip.steps[5]);

    /* R-18: drum_reset. */
    snprintf(key, sizeof(key), "t0_c%d_drum_reset", ac);
    hx_set_param(h, key, "1");
    HX_ASSERT(!dclip(inst)->lanes[2].clip.steps[5], "control: clip reset");
    hx_set_param(h, "undo_restore", "1");
    check("drum clip reset undoes", dclip(inst)->lanes[2].clip.steps[5]);

    /* R-19: a lane's play-effects reset. */
    hx_set_param(h, "t0_l2_pfx_set", "gate_time 250");
    int g = dclip(inst)->lanes[2].pfx_params.gate_time;
    HX_ASSERT(g == 250, "control: lane gate set");
    hx_set_param(h, "t0_l2_pfx_reset", "1");
    HX_ASSERT(dclip(inst)->lanes[2].pfx_params.gate_time != 250, "control: lane fx reset");
    hx_set_param(h, "undo_restore", "1");
    check("a drum lane's play-effects reset undoes (_pfx_reset)",
          dclip(inst)->lanes[2].pfx_params.gate_time == 250);

    hx_set_param(h, "t0_l2_pfx_set", "pfx_reset 1");
    HX_ASSERT(dclip(inst)->lanes[2].pfx_params.gate_time != 250, "control: lane fx reset (via pfx_set)");
    hx_set_param(h, "undo_restore", "1");
    check("a drum lane's play-effects reset undoes (pfx_set pfx_reset)",
          dclip(inst)->lanes[2].pfx_params.gate_time == 250);

    hx_destroy(h);
    printf("PASS: drum_edits_undoable\n");
    return 0;
}
