/* tests/test_audclip_key.c — tN_audclip, the phrase library's in-time preview.
 *
 *   tN_audclip "<res_idx> <length_steps> <lane|-1>|a tick pitch vel gate;…"  /  "off"
 *
 * The phrase replaces what the track's current clip (or one drum lane) plays,
 * swapped in on the next BEAT while the transport runs and at once while it is
 * stopped; "off" puts the original back exactly. It is never saved: a save
 * taken mid-preview writes the original. It is refused while the track records.
 */
#include "harness.h"

static int geti(hx_t *h, const char *key) { char b[64] = ""; hx_get_param(h, key, b, (int)sizeof b); return atoi(b); }
static char notes[65536];
static const char *snap(hx_t *h, const char *sel) {
    hx_set_param(h, sel, "");
    static char buf[65536];
    hx_get_param(h, "state", buf, (int)sizeof(buf));
    const char *k = strstr(buf, "\"rui_notes\":\"");
    notes[0] = '\0';
    if (!k) return notes;
    k += strlen("\"rui_notes\":\"");
    const char *e = strchr(k, '"');
    int n = e ? (int)(e - k) : 0; if (n >= (int)sizeof notes) n = sizeof notes - 1;
    memcpy(notes, k, (size_t)n); notes[n] = '\0';
    return notes;
}

static void test_stopped_swap_and_restore(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_c0_note_add", "48 50 100 24");                 /* the original */
    hx_set_param(h, "t1_audclip", "2 8 -1|a 0 60 100 40;a 96 63 90 40");
    snap(h, "t1_c0_ruisel");
    HX_ASSERT(strstr(notes, "0:60:") && strstr(notes, "96:63:") && !strstr(notes, "48:50:"),
              "stopped: the phrase did not replace the clip at once");
    HX_ASSERT(geti(h, "t1_c0_tps") == 48 && geti(h, "t1_c0_length") == 8, "the phrase's grid is not in effect");
    /* a save now writes the ORIGINAL */
    static char st[262144];
    hx_get_param(h, "state_full", st, (int)sizeof st);
    HX_ASSERT(strstr(st, "48:50:100:24;") != NULL, "a save mid-preview lost the original notes");
    HX_ASSERT(strstr(st, "96:63:") == NULL, "a save mid-preview wrote the phrase");
    HX_ASSERT(strstr(st, "\"t1c0_len\":16") != NULL, "a save mid-preview wrote the phrase's length");
    hx_set_param(h, "t1_audclip", "off");
    snap(h, "t1_c0_ruisel");
    HX_ASSERT(strstr(notes, "48:50:100:24;") && !strstr(notes, "0:60:"), "off did not restore the original");
    HX_ASSERT(geti(h, "t1_c0_tps") == 24 && geti(h, "t1_c0_length") == 16, "off did not restore the grid");
    hx_destroy(h);
}

static void test_swaps_on_the_beat(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_note_add", "0 50 100 24");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    int guard = 0;
    while (inst->global_tick < 2 && guard++ < 2000) hx_render(h, 1);   /* mid-beat */
    HX_ASSERT(inst->global_tick % 4 != 0, "precondition: mid-beat");
    hx_set_param(h, "t1_audclip", "1 16 -1|a 0 60 100 24");
    HX_ASSERT(!inst->aud.active && inst->aud.pending == 1, "playing: the phrase went in before the beat");
    /* the next STEP is not a beat: still waiting */
    uint32_t g0 = inst->global_tick;
    guard = 0;
    while (inst->global_tick == g0 && guard++ < 2000) hx_render(h, 1);
    HX_ASSERT(inst->global_tick % 4 != 0, "precondition: the next step is not a beat");
    HX_ASSERT(!inst->aud.active, "the phrase went in on a step that is not a beat");
    guard = 0;
    while (inst->global_tick % 4 != 0 && guard++ < 4000) hx_render(h, 1);
    HX_ASSERT(inst->aud.active && !inst->aud.pending, "the phrase did not go in on the beat");
    snap(h, "t1_c0_ruisel");
    HX_ASSERT(strstr(notes, "0:60:") && !strstr(notes, "0:50:"), "the clip does not hold the phrase after the beat");
    hx_set_param(h, "t1_audclip", "off");
    guard = 0;
    while (inst->aud.active && guard++ < 8000) hx_render(h, 1);
    snap(h, "t1_c0_ruisel");
    HX_ASSERT(!inst->aud.active && strstr(notes, "0:50:"), "off did not restore on the next beat");
    hx_destroy(h);
}

static void test_one_drum_lane(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_l0_note_add", "0 100 12");
    hx_set_param(h, "t0_l2_note_add", "96 100 12");
    hx_set_param(h, "t0_audclip", "1 16 2|a 0 100 6;a 48 40 6;a 96 110 6");
    HX_ASSERT(geti(h, "t0_l2_note_count") == 3, "the lane did not take the phrase");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 1, "another lane changed");
    hx_set_param(h, "t0_audclip", "off");
    HX_ASSERT(geti(h, "t0_l2_note_count") == 1, "the lane's original hit is not back");
    hx_destroy(h);
}

static void test_refused_while_recording(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_recording", "1");
    hx_set_param(h, "t1_audclip", "1 16 -1|a 0 60 100 24");
    HX_ASSERT(!inst->aud.active && !inst->aud.pending, "a preview went in on a recording track");
    hx_destroy(h);
}

static void test_project_load_drops_it(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_audclip", "1 16 -1|a 0 60 100 24");
    HX_ASSERT(inst->aud.active, "precondition");
    seq8_load_state(inst);
    HX_ASSERT(!inst->aud.active && !inst->aud.pending, "a preview survived a project load");
    hx_destroy(h);
}

/* Loading while a preview holds the clip: the load replaces it, and one Undo
 * returns the ORIGINAL — never the auditioned phrase. */
static void test_load_during_preview_undoes_to_original(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_note_add", "48 50 100 24");
    hx_set_param(h, "t1_audclip", "1 16 -1|a 0 60 100 24");        /* previewing */
    hx_set_param(h, "t1_c0_import", "1 1 16|a 0 60 100 24");       /* load it */
    HX_ASSERT(!inst->aud.active && !inst->aud.pending, "the preview outlived the load");
    snap(h, "t1_c0_ruisel");
    HX_ASSERT(strstr(notes, "0:60:") && !strstr(notes, "48:50:"), "the load did not replace the clip");
    hx_set_param(h, "undo_restore", "1");
    snap(h, "t1_c0_ruisel");
    HX_ASSERT(strstr(notes, "48:50:") && !strstr(notes, "0:60:"), "undo returned the preview, not the original");
    /* drum lane too */
    hx_set_param(h, "t0_l1_note_add", "96 100 12");
    hx_set_param(h, "t0_audclip", "1 16 1|a 0 100 6;a 48 100 6");
    hx_set_param(h, "t0_l1_import", "1 1 16|a 0 100 6;a 48 100 6");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 1, "drum: undo returned the preview, not the original");
    hx_destroy(h);
}


/* Several drum lanes at once (lane -2): all go in together; a re-staging that
 * drops a lane puts that lane back on the same beat; off restores them all; a
 * save mid-preview writes every original. */
static void test_several_lanes(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_l1_note_add", "96 100 12");                     /* originals */
    hx_set_param(h, "t0_l4_note_add", "192 100 12");
    hx_set_param(h, "t0_audclip", "1 16 -2|L1;a 0 100 6;a 48 80 6;L4;a 24 90 6;L4;a 72 90 6;a 120 90 6");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 2, "lane 1 did not take its hits");
    HX_ASSERT(geti(h, "t0_l4_note_count") == 1, "lane 4 took the repeated L4's hits, or none");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 0, "a lane not named changed");
    static char st[262144];
    hx_get_param(h, "state_full", st, (int)sizeof st);
    HX_ASSERT(strstr(st, "48:") == NULL, "a save mid-preview wrote a previewed hit");
    /* re-stage onto lanes 4 and 7: lane 1 comes back */
    hx_set_param(h, "t0_audclip", "1 16 -2|L4;a 0 100 6;a 96 100 6;a 288 100 6;L7;a 0 50 6");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 1, "the dropped lane did not come back");
    HX_ASSERT(geti(h, "t0_l4_note_count") == 3 && geti(h, "t0_l7_note_count") == 1, "the new staging did not go in");
    hx_set_param(h, "t0_audclip", "off");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 1 && geti(h, "t0_l4_note_count") == 1 && geti(h, "t0_l7_note_count") == 0,
              "off did not restore every lane");
    /* a melodic track refuses lane previews */
    hx_set_param(h, "t1_audclip", "1 16 -2|L1;a 0 100 6");
    HX_ASSERT(!((seq8_instance_t *)h->inst)->aud.active, "a melodic track took a lane preview");
    hx_destroy(h);
}

/* Several lanes swap on ONE beat while playing, the dropped one included. */
static void test_several_lanes_one_beat(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t0_l1_note_add", "96 100 12");
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    int guard = 0;
    hx_set_param(h, "t0_audclip", "1 16 -2|L1;a 0 100 6;L2;a 0 100 6");
    while (!inst->aud.active && guard++ < 4000) hx_render(h, 1);
    while (inst->global_tick % 4 != 2 && guard++ < 8000) hx_render(h, 1);    /* mid-beat */
    hx_set_param(h, "t0_audclip", "1 16 -2|L2;a 0 100 6;a 48 100 6;L3;a 0 100 6");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 1 && geti(h, "t0_l3_note_count") == 0, "precondition: nothing moved before the beat");
    uint32_t g0 = inst->global_tick;
    while (inst->aud.pending && guard++ < 8000) hx_render(h, 1);
    HX_ASSERT(inst->global_tick % 4 == 0 && inst->global_tick > g0, "the swap was not on a beat");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 1 && geti(h, "t0_l2_note_count") == 2 && geti(h, "t0_l3_note_count") == 1,
              "the lanes did not all change on that one beat");
    hx_destroy(h);
}

int main(void) {
    test_load_during_preview_undoes_to_original();
    test_stopped_swap_and_restore();
    test_swaps_on_the_beat();
    test_one_drum_lane();
    test_refused_while_recording();
    test_project_load_drops_it();
    test_several_lanes();
    test_several_lanes_one_beat();
    printf("PASS: audclip key (swap, restore, save writes original, on the beat, one lane, several lanes, recording, load)\n");
    return 0;
}
