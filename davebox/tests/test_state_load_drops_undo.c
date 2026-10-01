/* tests/test_state_load_drops_undo.c — Undo never reaches across a project switch.
 *
 * Found 2026-10-01 auditing what a new project inherits: the undo/redo slots
 * were not reset by state_load, so an Undo right after opening another project
 * restored the PREVIOUS project's clip into it — that project's notes written
 * into this one. state_load now drops every slot (melodic, drum, drum row). */
#include "harness.h"
#include <stdio.h>

int main(void) {
    int checks = 0;
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    hx_set_param(h, "state_load", "aaaaaaaa-2222-3333-4444-555555555555");   /* project A */
    hx_set_param(h, "t1_c1_step_3_toggle", "64 100");     /* A: a note in track 2, clip B */
    hx_set_param(h, "clip_copy", "1 0 1 1");              /* A: copy the empty clip A over it (undoable) */
    HX_ASSERT(in->tracks[1].clips[1].steps[3] == 0 && in->undo_valid, "rig: the copy did not arm undo"); checks++;
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(in->tracks[1].clips[1].steps[3] != 0, "control: Undo inside project A did not restore the note"); checks++;
    HX_ASSERT(in->redo_valid, "control: no redo after the undo"); checks++;

    hx_set_param(h, "clip_copy", "1 0 1 1");              /* undo armed again, redo dropped */
    in->drum_undo_valid = 1; in->drum_redo_valid = 1;     /* every other slot set too */
    in->drum_row_undo_valid = 1; in->drum_row_redo_valid = 1; in->redo_valid = 1;

    hx_set_param(h, "state_load", "bbbbbbbb-2222-3333-4444-555555555555");   /* open project B */
    HX_ASSERT(!in->undo_valid && !in->redo_valid, "melodic undo/redo survived the switch"); checks++;
    HX_ASSERT(!in->drum_undo_valid && !in->drum_redo_valid, "drum undo/redo survived the switch"); checks++;
    HX_ASSERT(!in->drum_row_undo_valid && !in->drum_row_redo_valid, "drum row undo/redo survived the switch"); checks++;
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(in->tracks[1].clips[1].steps[3] == 0, "Undo in project B wrote project A's note into it"); checks++;

    hx_destroy(h);
    printf("PASS: test_state_load_drops_undo (%d checks)\n", checks);
    return 0;
}
