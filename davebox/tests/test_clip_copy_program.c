/* tests/test_clip_copy_program.c — a clip's program change and bank select
 * travel with it: clip copy / cut, row copy, drum clip copy / cut.
 * Before: the destination kept its own program/bank (device check: copying a
 * clip with program 42 onto one with 9 left 9). t1 is melodic, t0 drum. */
#include "harness.h"

static clip_t *C(seq8_instance_t *I, int t, int c) { return &I->tracks[t].clips[c]; }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;

    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_program", "42");
    hx_set_param(h, "t1_c0_bank_msb", "3");
    hx_set_param(h, "t1_c0_bank_lsb", "7");
    hx_set_param(h, "t1_c1_program", "9");
    HX_ASSERT(C(I,1,0)->program == 42 && C(I,1,1)->program == 9, "control: programs set");

    hx_set_param(h, "clip_copy", "1 0 1 1");
    HX_ASSERT(C(I,1,1)->program == 42 && C(I,1,1)->bank_msb == 3 && C(I,1,1)->bank_lsb == 7,
              "clip_copy: destination takes the source's program and bank");
    HX_ASSERT(C(I,1,0)->program == 42, "clip_copy: source keeps its own");

    hx_set_param(h, "clip_cut", "1 0 1 2");
    HX_ASSERT(C(I,1,2)->program == 42 && C(I,1,2)->bank_lsb == 7, "clip_cut: destination takes it");
    HX_ASSERT(C(I,1,0)->program == -1 && C(I,1,0)->bank_msb == -1, "clip_cut: source cleared");

    hx_set_param(h, "t2_c4_program", "5");
    hx_set_param(h, "row_copy", "4 5");
    HX_ASSERT(C(I,2,5)->program == 5, "row_copy: each track's clip takes its row's program");

    /* Drum clip copy / cut (t0 is drum by default). */
    HX_ASSERT(I->tracks[0].pad_mode == PAD_MODE_DRUM, "control: t0 is drum");
    hx_set_param(h, "t0_l0_step_0_toggle", "1");
    hx_set_param(h, "t0_c0_program", "77");
    hx_set_param(h, "drum_clip_copy", "0 0 0 1");
    HX_ASSERT(C(I,0,1)->program == 77, "drum_clip_copy: destination takes the program");
    hx_set_param(h, "drum_clip_cut", "0 1 0 2");
    HX_ASSERT(C(I,0,2)->program == 77, "drum_clip_cut: destination takes it");
    HX_ASSERT(C(I,0,1)->program == -1, "drum_clip_cut: source cleared");

    hx_destroy(h);
    printf("PASS: clip_copy_program\n");
    return 0;
}
