/* tests/test_restart_at_page_loop_start.c — Loop+Play on a page (transport
 * restart_at) honours the clip's loop start and resets the loop cycles, as a
 * plain restart does (ruled 2026-11-21).
 *
 * Before: the offset was page*16 steps from the clip's step 0, then wrapped by
 * the loop length and added to loop_start — so with a loop starting at step 16
 * a press on page 2 (step 32) landed on step 16; and the loop-cycle counters
 * (step conditions' pass count) carried on from before the restart.
 *
 *  1. t1 loop 16..47: page 2 lands on step 32, page 1 on step 16, and page 0
 *     (before the window) wraps into it, at step 32.
 *  2. loop_cycle goes back to 0 on every clip.
 *  3. another track (loop 0..23) lands at the same musical offset: 16 steps.
 *  4. CONTROL: loop start 0 — page 1 is step 16, as before. */
#include "harness.h"

static seq8_instance_t *rig(hx_t **hp, int ls, int len) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char v[24];
    snprintf(v, sizeof v, "%d", ls * 65536 + len);
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_loop_set", v);
    snprintf(v, sizeof v, "%d", 0 * 65536 + 24);
    hx_set_param(h, "t2_c0_loop_set", v);
    HX_ASSERT(inst->tracks[1].clips[0].loop_start == ls && inst->tracks[1].clips[0].length == len,
              "rig: t1 loop window");
    HX_ASSERT(inst->tracks[1].clips[0].ticks_per_step == 24, "rig: 1/16");
    *hp = h;
    return inst;
}

static void restart_at(hx_t *h, int page) {
    char v[40];
    snprintf(v, sizeof v, "restart_at:1:%d:-1", page);
    hx_set_param(h, "transport", v);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst = rig(&h, 16, 32);
    hx_set_param(h, "transport", "play");
    hx_render(h, 50);
    inst->tracks[1].clips[0].loop_cycle = 3;
    inst->tracks[2].clips[0].loop_cycle = 5;
    restart_at(h, 2);
    if (inst->tracks[1].current_step != 32) {
        fprintf(stderr, "FAIL: loop start 16, page 2 landed on step %d, not 32\n",
                (int)inst->tracks[1].current_step);
        return 1;
    }
    HX_ASSERT(inst->tracks[1].clips[0].loop_cycle == 0, "restart_at resets the loop cycle");
    HX_ASSERT(inst->tracks[2].clips[0].loop_cycle == 0, "restart_at resets every clip's loop cycle");
    HX_ASSERT(inst->tracks[2].current_step == 16, "another track lands at the same offset (16 of its 24)");

    restart_at(h, 1);
    HX_ASSERT(inst->tracks[1].current_step == 16, "page 1 = the loop start, step 16");
    HX_ASSERT(inst->tracks[2].current_step == 0, "another track at offset 0");

    restart_at(h, 0);
    HX_ASSERT(inst->tracks[1].current_step == 32, "page 0, before the window, wraps into it (step 32)");
    hx_destroy(h);

    /* CONTROL: loop start 0. */
    inst = rig(&h, 0, 32);
    hx_set_param(h, "transport", "play");
    hx_render(h, 50);
    restart_at(h, 1);
    HX_ASSERT(inst->tracks[1].current_step == 16, "control: loop start 0, page 1 = step 16");
    HX_ASSERT(inst->tracks[2].current_step == 16, "control: the other track at offset 16");
    hx_destroy(h);

    printf("PASS: restart_at_page_loop_start\n");
    return 0;
}
