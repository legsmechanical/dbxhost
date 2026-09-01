/* tests/test_step_record_undo.c — tN_cC_undo_checkpoint makes a SESSION of
 * step-record edits ONE undo/redo unit (Josh's Front-4 ruling, 2026-09-01).
 *
 * The step-record entry ops (_add, _gate, _toggle) take no undo snapshot of
 * their own — that is load-bearing: one checkpoint at session start must be
 * the snapshot undo_restore returns to, however many entries followed. This
 * test would fail two ways worth naming:
 *   - if _undo_checkpoint stops snapshotting, undo restores some OLDER state
 *     (or nothing) and the pre-session note check fails;
 *   - if an entry op GROWS an undo snapshot of its own, undo lands mid-session
 *     instead of at its start (the "shrunken undo unit" regression). */
#include "harness.h"
#include <string.h>

static int step_notes(hx_t *h, const char *key, char *buf, int len) {
    int n = hx_get_param(h, key, buf, len);
    if (n < 0) buf[0] = '\0';
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    char buf[128];

    /* Pre-session content: a note the session must never disturb. */
    hx_set_param(h, "t2_c0_step_2_toggle", "48 90");

    /* --- the session: checkpoint, then a phrase of entries --- */
    hx_set_param(h, "t2_c0_undo_checkpoint", "1");
    hx_set_param(h, "t2_c0_step_0_add", "60 0 100");   /* entry */
    hx_set_param(h, "t2_c0_step_0_add", "64 0 100");   /* chord mate */
    hx_set_param(h, "t2_c0_step_0_gate", "36");        /* tie: 2 steps */
    hx_set_param(h, "t2_c0_step_2_add", "52 0 80");    /* overdub the old step */
    hx_set_param(h, "t2_c0_step_3_add", "67 0 110");

    step_notes(h, "t2_c0_step_0_notes", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "60 64") == 0, "session did not write the chord");
    step_notes(h, "t2_c0_step_2_notes", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "48 52") == 0, "overdub did not land");

    /* --- ONE undo returns to the checkpoint: session gone, old note kept --- */
    hx_set_param(h, "undo_restore", "1");
    step_notes(h, "t2_c0_step_0_notes", buf, sizeof buf);
    HX_ASSERT(buf[0] == '\0', "undo left session notes at step 0");
    step_notes(h, "t2_c0_step_3_notes", buf, sizeof buf);
    HX_ASSERT(buf[0] == '\0', "undo left session notes at step 3");
    step_notes(h, "t2_c0_step_2_notes", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "48") == 0,
              "undo did not restore the PRE-session step");
    hx_get_param(h, "t2_c0_step_0_gate", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "12") == 0, "undo did not restore the default gate");

    /* --- ONE redo brings the whole session back --- */
    hx_set_param(h, "redo_restore", "1");
    step_notes(h, "t2_c0_step_0_notes", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "60 64") == 0, "redo did not restore the chord");
    step_notes(h, "t2_c0_step_2_notes", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "48 52") == 0, "redo did not restore the overdub");
    hx_get_param(h, "t2_c0_step_0_gate", buf, sizeof buf);
    HX_ASSERT(strcmp(buf, "36") == 0, "redo did not restore the tie gate");

    hx_destroy(h);
    printf("PASS: step-record session is one undo/redo unit\n");
    return 0;
}
