/* tests/test_drum_undo_checkpoint.c — tN_drum_undo_checkpoint makes a SESSION
 * of per-step drum edits ONE undo unit (spec §2, the held step, 2026-09-02):
 * the drum lane step ops (_toggle, _vel, _gate, ...) take no snapshot of their
 * own, so one checkpoint before the first write is the whole hold's undo. */
#include "harness.h"
#include <string.h>

int main(void) {
    hx_t *h = hx_create(NULL);
    char buf[64];
    hx_set_param(h, "t0_pad_mode", "1");                 /* drum track */
    hx_set_param(h, "t0_l0_step_3_toggle", "100");       /* pre-session hit at 100 */
    hx_set_param(h, "t0_l0_step_3_vel", "100");

    /* --- the hold: checkpoint, then a session of edits --- */
    hx_set_param(h, "t0_drum_undo_checkpoint", "1");
    hx_set_param(h, "t0_l0_step_3_vel", "40");
    hx_set_param(h, "t0_l0_step_3_gate", "48");
    hx_set_param(h, "t0_l0_step_5_toggle", "90");        /* a hit created in the same hold */
    hx_get_param(h, "t0_l0_step_3_vel", buf, sizeof(buf));
    HX_ASSERT(strcmp(buf, "40") == 0, "session did not write the velocity");

    /* --- ONE undo returns to the checkpoint --- */
    hx_set_param(h, "undo_restore", "1");
    hx_get_param(h, "t0_l0_step_3_vel", buf, sizeof(buf));
    HX_ASSERT(strcmp(buf, "100") == 0, "undo did not restore the pre-session velocity");
    hx_get_param(h, "t0_l0_step_3_gate", buf, sizeof(buf));
    HX_ASSERT(strcmp(buf, "48") != 0, "undo left the session's gate");
    hx_get_param(h, "t0_l0_step_5_vel", buf, sizeof(buf));
    HX_ASSERT(strcmp(buf, "90") != 0, "undo left the hit the session created");
    printf("PASS: tN_drum_undo_checkpoint — a held drum step's edits are ONE undo unit\n");
    hx_destroy(h);
    return 0;
}
