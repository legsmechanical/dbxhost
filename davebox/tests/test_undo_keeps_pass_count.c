/* tests/test_undo_keeps_pass_count.c — Undo / Redo restore a clip's content,
 * not its playback: a playing clip on pass 3 stays on pass 3. Before: the
 * snapshot is a whole clip_t, so Undo put loop_cycle back to the value it had
 * at the edit, and the clip's Iter conditions jumped phase. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    clip_t *c = &I->tracks[1].clips[0];

    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    c->loop_cycle = 1;                                   /* pass 1 at the edit */
    hx_set_param(h, "t1_c0_step_0_clear", "1");          /* an undoable edit */
    HX_ASSERT(c->step_note_count[0] == 0, "control: the note is gone");
    c->loop_cycle = 3;                                   /* playback moved on */

    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(c->step_note_count[0] > 0, "control: undo put the note back");
    HX_ASSERT(c->loop_cycle == 3, "undo keeps the live pass count");

    c->loop_cycle = 5;
    hx_set_param(h, "redo_restore", "1");
    HX_ASSERT(c->step_note_count[0] == 0, "control: redo removed it again");
    HX_ASSERT(c->loop_cycle == 5, "redo keeps the live pass count");

    hx_destroy(h);
    printf("PASS: undo_keeps_pass_count\n");
    return 0;
}
