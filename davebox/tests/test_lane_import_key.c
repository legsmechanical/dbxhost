/* tests/test_lane_import_key.c — tN_lL_import, loading a phrase into ONE drum
 * lane of the active clip.
 *
 *   tN_lL_import "<flags> <res_idx> <length_steps>|a tick vel gate;…"
 *
 * Only that lane changes (its hits, grid and length); the lane's own pitch is
 * used; flags bit0 wipes the lane first; one Undo restores it. Loaded while
 * the transport plays, the lane lands in phase with the master clock rather
 * than restarting. Track 0 is a drum track by default.
 */
#include "harness.h"

static int geti(hx_t *h, const char *key) { char b[64] = ""; hx_get_param(h, key, b, (int)sizeof b); return atoi(b); }

static void test_one_lane_only(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_l0_note_add", "0 100 12");                 /* kick lane has a hit */
    hx_set_param(h, "t0_l6_import", "0 2 8|a 0 100 6;a 48 60 6;a 96 110 20;a 144 70 6");
    HX_ASSERT(geti(h, "t0_l6_note_count") == 4, "lane 6 did not get the 4 hits");
    HX_ASSERT(geti(h, "t0_l6_tps") == 48 && geti(h, "t0_l6_length") == 8, "lane 6 grid/length not set");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 1, "another lane changed");
    HX_ASSERT(geti(h, "t0_l0_tps") == 24 && geti(h, "t0_l0_length") == 16, "another lane's grid changed");
    char st[300]; hx_get_param(h, "t0_l6_step_0_notes", st, sizeof st);
    char ln[16]; hx_get_param(h, "t0_l6_lane_note", ln, sizeof ln);
    HX_ASSERT(strstr(st, ln) != NULL, "the hit is not at the lane's own pitch");
    hx_destroy(h);
}

static void test_replace_and_undo(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_l2_note_add", "24 90 12");
    hx_set_param(h, "t0_l2_import", "0 1 16|a 0 100 6");          /* merge */
    HX_ASSERT(geti(h, "t0_l2_note_count") == 2, "merge lost the existing hit");
    hx_set_param(h, "t0_l2_import", "1 3 4|a 96 100 6");          /* replace, 1/4 grid */
    HX_ASSERT(geti(h, "t0_l2_note_count") == 1, "replace kept old hits");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(geti(h, "t0_l2_note_count") == 2 && geti(h, "t0_l2_tps") == 24 && geti(h, "t0_l2_length") == 16,
              "undo did not restore the lane's hits and grid");
    hx_destroy(h);
}

static void test_in_phase_while_playing(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    inst->playing = 1;
    inst->global_tick = 13;                                       /* 13 steps into the song */
    inst->master_tick_in_step = 5;
    hx_set_param(h, "t0_l3_import", "0 1 4|a 0 100 6");          /* 4-step lane on 1/16 */
    HX_ASSERT(inst->tracks[0].drum_current_step[3] == 13 % 4, "the lane restarted instead of landing in phase");
    HX_ASSERT(inst->tracks[0].drum_tick_in_step[3] == 5, "the lane's position within the step was lost");
    hx_destroy(h);
}

static void test_refused_while_recording(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_recording", "1");
    hx_set_param(h, "t0_l4_import", "0 1 16|a 0 100 6");
    hx_set_param(h, "t0_recording", "0");
    HX_ASSERT(geti(h, "t0_l4_note_count") == 0, "a lane loaded while the track recorded");
    hx_destroy(h);
}


/* tN_lanes_import: several lanes, ONE undo unit, only the named lanes. */
static void test_lanes_import(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_l0_note_add", "0 100 12");
    hx_set_param(h, "t0_l3_note_add", "24 100 12");
    hx_set_param(h, "t0_lanes_import", "1 2 8|L3;a 0 100 6;a 96 90 6;L5;a 48 70 6;L99;a 0 1 1");
    HX_ASSERT(geti(h, "t0_l3_note_count") == 2 && geti(h, "t0_l5_note_count") == 1, "the named lanes did not load");
    HX_ASSERT(geti(h, "t0_l3_tps") == 48 && geti(h, "t0_l5_length") == 8, "grid/length not set on the named lanes");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 1 && geti(h, "t0_l0_tps") == 24, "a lane not named changed");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(geti(h, "t0_l3_note_count") == 1 && geti(h, "t0_l5_note_count") == 0 && geti(h, "t0_l3_tps") == 24,
              "one undo did not restore every lane");
    /* merge (flags 0) keeps what a lane had */
    hx_set_param(h, "t0_lanes_import", "0 1 16|L3;a 0 100 6");
    HX_ASSERT(geti(h, "t0_l3_note_count") == 2, "merge lost the lane's hit");
    /* refused on a melodic track and while recording */
    hx_set_param(h, "t1_lanes_import", "1 1 16|L3;a 0 100 6");
    hx_set_param(h, "t0_recording", "1");
    hx_set_param(h, "t0_lanes_import", "1 1 16|L3;a 96 100 6");
    HX_ASSERT(geti(h, "t0_l3_note_count") == 2, "loaded while recording");
    hx_destroy(h);
}

int main(void) {
    test_lanes_import();
    test_one_lane_only();
    test_replace_and_undo();
    test_in_phase_while_playing();
    test_refused_while_recording();
    printf("PASS: lane import key (one lane, pitch, replace, undo, in phase, recording)\n");
    return 0;
}
