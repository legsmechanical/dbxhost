/* tests/test_conditions_survive_without_notes.c — per-step trig conditions on
 * a clip or drum lane with NO notes survive a save and reload.
 *
 * THE BUG THIS PINS (2026-10-04 module review): the melodic writer emitted
 * `_si/_sr/_sx` only inside `if (note_count > 0)`, and an empty drum lane was
 * written (and read back) only when its geometry or play-effects differed —
 * conditions did not count. Lay out ratchets, clear the notes to re-record,
 * save: the conditions were gone. A condition can sit on an empty step (the
 * setters do not require a note).
 *
 * Load is device-faithful: serialize A, destroy it, load into a fresh B. */
#include "harness.h"
#include <unistd.h>

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* Melodic t1, active clip 0: no notes, a ratchet + a random on step 5. */
    hx_set_param(h, "t1_c0_step_5_ratch", "3");
    hx_set_param(h, "t1_c0_step_6_rand", "40");
    HX_ASSERT(inst->tracks[1].clips[0].note_count == 0, "control: t1 c0 has no notes");
    HX_ASSERT(inst->tracks[1].clips[0].step_ratchet[5] == 3, "control: ratchet set");

    /* Drum t0: lane 0 has a hit (allocates the clip); lane 5 none, a ratchet. */
    hx_set_param(h, "t0_l0_step_0_toggle", "110");
    int ac = inst->tracks[0].active_clip;
    HX_ASSERT(inst->tracks[0].drum_clips[ac], "drum clip allocated");
    hx_set_param(h, "t0_l5_step_2_ratch", "2");
    HX_ASSERT(inst->tracks[0].drum_clips[ac]->lanes[5].clip.step_ratchet[2] == 2,
              "control: lane ratchet set");
    HX_ASSERT(inst->tracks[0].drum_clips[ac]->lanes[5].clip.note_count == 0,
              "control: lane 5 has no notes");

    static char buf[262144];
    inst->state_dirty = 1;
    int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
    HX_ASSERT(n > 0, "state_full empty");

    char tmp[128];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_cond_state_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(buf, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);

    hx_destroy(h);
    h = hx_create(NULL);
    HX_ASSERT(h, "second create failed");
    inst = (seq8_instance_t *)h->inst;
    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    inst->state_path[sizeof(inst->state_path) - 1] = '\0';
    seq8_load_state(inst);
    remove(tmp);

    HX_ASSERT(inst->tracks[1].clips[0].step_ratchet[5] == 3,
              "melodic ratchet on a clip with no notes was lost on reload");
    HX_ASSERT(inst->tracks[1].clips[0].step_random[6] == 40,
              "melodic random on a clip with no notes was lost on reload");
    HX_ASSERT(inst->tracks[0].drum_clips[ac], "drum clip reloaded");
    HX_ASSERT(inst->tracks[0].drum_clips[ac]->lanes[5].clip.step_ratchet[2] == 2,
              "drum lane ratchet on a lane with no notes was lost on reload");
    /* Control: the lane with the hit still reloads its hit. */
    HX_ASSERT(inst->tracks[0].drum_clips[ac]->lanes[0].clip.note_count > 0,
              "control: lane 0's hit reloaded");

    hx_destroy(h);
    printf("PASS: conditions_survive_without_notes\n");
    return 0;
}
