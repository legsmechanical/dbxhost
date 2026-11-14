/* tests/test_step_arrays_loop_window.c — the per-step arrays (Iter, Random,
 * Ratchet, and a Slicer's per-step Rev / Pitch / Start / Len) survive a save
 * and reload on a clip whose loop window does not start at its first step.
 *
 * The arrays are indexed by the clip's ABSOLUTE step and the window is
 * [loop_start, loop_start + length). The writer used to emit `length` entries
 * from step 0 and the reader read the same, so with length 16 and loop_start
 * 16 a setting on step 20 reloaded as nothing. Settings outside a window
 * (one since shrunk) are kept too, as notes there are. */
#include "harness.h"
#include <sys/stat.h>

int main(void) {
    char root[256], p[400];
    hx_t *h; seq8_instance_t *inst; clip_t *cl;
    snprintf(root, sizeof root, "/tmp/dbx-steparr-%d", (int)getpid());
    snprintf(p, sizeof p, "rm -rf '%s' && mkdir -p '%s/proj/dAVEBOx'", root, root);
    HX_ASSERT(system(p) == 0, "could not make the project dir");

    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", root);
    hx_set_param(h, "t5_convert_to_slicer", "");
    HX_ASSERT(inst->tracks[5].pad_mode == PAD_MODE_SLICER, "rig: no Slicer");
    cl = &inst->tracks[5].clips[0];
    cl->length = 16; cl->loop_start = 16;           /* the window is steps 16..31 */
    cl->step_xrev[20] = 1;
    cl->step_xsemi[21] = (uint8_t)(int8_t)-5;
    cl->step_xstart[22] = 40;
    cl->step_xlen[23] = 60;
    cl->step_ratchet[24] = 3;
    cl->step_random[25] = 50;
    cl->step_iter[26] = (2 << 4) | 1;
    cl->step_xrev[40] = 1;                          /* outside the window: kept */
    cl->step_xrev[3] = 1;                           /* before it: kept */
    seq8_save_state(inst);
    hx_destroy(h);

    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", root);
    seq8_load_state(inst);
    cl = &inst->tracks[5].clips[0];
    HX_ASSERT(cl->length == 16 && cl->loop_start == 16, "reloaded: the window changed");
    HX_ASSERT(cl->step_xrev[20] == 1, "reloaded: Rev on step 20 (in the window) lost");
    HX_ASSERT((int8_t)cl->step_xsemi[21] == -5, "reloaded: Pitch on step 21 lost");
    HX_ASSERT(cl->step_xstart[22] == 40 && cl->step_xlen[23] == 60, "reloaded: Start / Len lost");
    HX_ASSERT(cl->step_ratchet[24] == 3 && cl->step_random[25] == 50 && cl->step_iter[26] == ((2 << 4) | 1),
              "reloaded: Ratchet / Random / Iter lost");
    HX_ASSERT(cl->step_xrev[40] == 1 && cl->step_xrev[3] == 1, "reloaded: a setting outside the window lost");
    HX_ASSERT(!cl->step_xrev[41] && !cl->step_xrev[19], "reloaded: a step that had nothing has something");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", root);
    if (system(p)) {}
    printf("PASS: test_step_arrays_loop_window\n");
    return 0;
}
