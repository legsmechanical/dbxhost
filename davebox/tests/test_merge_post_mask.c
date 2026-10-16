/* tests/test_merge_post_mask.c — a Live Merge over a POST track tells the UI
 * to bypass that track's module (Josh, 2026-10-15: "live merge - a)").
 *
 * A POST module runs first, so what a merge records on its track already has
 * the module in it; replayed through the module again it would be applied
 * twice. merge_post_mask names the tracks the placement wrote on whose module
 * was in (the UI bypasses those, as a print does):
 *   - a POST track the merge wrote on: in;
 *   - a track with no module, and a POST track the merge did not write on:
 *     out;
 *   - a PRINT is not a merge here: it bypasses its own module;
 *   - each placement starts the mask afresh. */
#include "harness.h"

static int mask(hx_t *h) {
    char b[16];
    return hx_get_param(h, "merge_post_mask", b, sizeof b) > 0 ? atoi(b) : -1;
}
static void capture(seq8_instance_t *inst, int t, uint8_t pitch) {
    inst->merge_pending[t][inst->merge_pending_count[t]].pitch = pitch;
    inst->merge_pending[t][inst->merge_pending_count[t]].tick_at_on = 0;
    inst->merge_pending[t][inst->merge_pending_count[t]].vel = 100;
    inst->merge_pending[t][inst->merge_pending_count[t]].gate = 12;
    inst->merge_pending_count[t]++;
}
static void captured(seq8_instance_t *inst) {
    inst->merge_state = MERGE_STATE_CAPTURED;
    inst->merge_tps = TICKS_PER_STEP;
    inst->merge_end_abs = TICKS_PER_STEP * 16;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t2_route", "schwung");
    hx_set_param(h, "t3_route", "schwung");
    hx_set_param(h, "t1_fxpost", "1");      /* written on, module in   -> in */
    hx_set_param(h, "t3_fxpost", "1");      /* module in, not written on -> out */
    HX_ASSERT(mask(h) == 0, "nothing placed yet");

    captured(inst);
    capture(inst, 1, 60);
    capture(inst, 2, 62);                   /* no module */
    hx_set_param(h, "merge_place_row", "4");
    HX_ASSERT(inst->tracks[1].clips[4].note_count == 1, "rig: the merge was placed");
    HX_ASSERT(mask(h) == (1 << 1), "the mask is not exactly the POST track the merge wrote on");

    /* the next placement starts afresh */
    captured(inst);
    capture(inst, 2, 64);
    hx_set_param(h, "merge_place_row", "5");
    HX_ASSERT(mask(h) == 0, "the last placement's mask carried over");

    /* a print bypasses its own module: not reported as a merge */
    captured(inst);
    capture(inst, 1, 65);
    inst->print_state = 2; inst->print_track = 1;
    hx_set_param(h, "merge_place_row", "6");
    HX_ASSERT(mask(h) == 0, "a print was reported as a merge to bypass");
    inst->print_state = 0;

    hx_destroy(h);
    printf("PASS: a Live Merge names the POST tracks it wrote on, for the UI to bypass their modules\n");
    return 0;
}
