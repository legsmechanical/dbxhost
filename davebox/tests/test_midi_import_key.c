/* tests/test_midi_import_key.c — tN_cC_import, the one engine step an Import
 * MIDI performs.
 *
 *   tN_cC_import "<flags> <res_idx> <length_steps>|a tick pitch vel gate;…"
 *
 * One call sets the clip's resolution and length, optionally wipes it
 * (flags bit0), and adds every note; Undo takes the whole thing back. On a
 * drum track each note lands on the lane of THAT clip whose pitch it matches —
 * including a clip that is not the active one — and a pitch no lane plays is
 * dropped. Track 0 defaults to drum, so the melodic cases use track 1.
 */
#include "harness.h"

static void snap_notes(hx_t *h, const char *sel, char *out, int out_len) {
    hx_set_param(h, sel, "");
    static char buf[65536];
    hx_get_param(h, "state", buf, (int)sizeof(buf));
    const char *k = strstr(buf, "\"rui_notes\":\"");
    out[0] = '\0';
    if (!k) return;
    k += strlen("\"rui_notes\":\"");
    const char *e = strchr(k, '"');
    if (!e) return;
    int n = (int)(e - k); if (n >= out_len) n = out_len - 1;
    memcpy(out, k, (size_t)n); out[n] = '\0';
}
static int count_notes(const char *s) { int n = 0; for (; *s; s++) if (*s == ';') n++; return n; }
static int geti(hx_t *h, const char *key) { char b[64] = ""; hx_get_param(h, key, b, (int)sizeof b); return atoi(b); }

static void test_melodic_lands(void) {
    hx_t *h = hx_create(NULL);
    /* res 2 = 48 ticks/step (1/8); 32 steps = 4 bars of 4/4 */
    hx_set_param(h, "t1_c3_import", "0 2 32|a 0 60 100 96;a 384 64 90 48;a 1500 67 80 24");
    HX_ASSERT(geti(h, "t1_c3_tps") == 48, "resolution not set to 1/8");
    HX_ASSERT(geti(h, "t1_c3_length") == 32, "length not set");
    HX_ASSERT(geti(h, "t1_c3_loop_start") == 0, "loop not from the top");
    char notes[8192]; snap_notes(h, "t1_c3_ruisel", notes, sizeof notes);
    HX_ASSERT(strstr(notes, "0:60:100:96;") != NULL, "first note missing");
    HX_ASSERT(strstr(notes, "384:64:90:48;") != NULL, "second note missing");
    HX_ASSERT(strstr(notes, "1500:67:80:24;") != NULL, "third note missing");
    HX_ASSERT(geti(h, "t1_c3_active") == 1, "clip not marked as having content");
    HX_ASSERT(geti(h, "t1_c0_active") == 0, "another clip changed");
    hx_destroy(h);
}

static void test_melodic_cap_and_clamp(void) {
    hx_t *h = hx_create(NULL);
    static char payload[65536];
    int n = snprintf(payload, sizeof payload, "0 1 256|");
    int i;
    for (i = 0; i < 600; i++)
        n += snprintf(payload + n, sizeof payload - (size_t)n, "a %d %d 100 6;", i * 10, 40 + (i % 40));
    hx_set_param(h, "t1_c2_import", payload);
    static char notes[65536]; snap_notes(h, "t1_c2_ruisel", notes, sizeof notes);
    HX_ASSERT(count_notes(notes) == 512, "note cap is not 512");
    hx_destroy(h);

    h = hx_create(NULL);
    hx_set_param(h, "t1_c2_import", "0 1 16|a 9999 60 100 24");   /* past 16 steps x 24 */
    snap_notes(h, "t1_c2_ruisel", notes, sizeof notes);
    HX_ASSERT(strstr(notes, "383:60:") != NULL, "a tick past the end is not clamped into the clip");
    hx_destroy(h);
}

static void test_replace_and_undo(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_c1_note_add", "24 50 100 24");
    char notes[8192];
    /* no replace flag: the existing note stays */
    hx_set_param(h, "t1_c1_import", "0 1 16|a 0 60 100 24");
    snap_notes(h, "t1_c1_ruisel", notes, sizeof notes);
    HX_ASSERT(strstr(notes, "24:50:") && strstr(notes, "0:60:"), "merge lost a note");
    /* replace: only the import remains */
    hx_set_param(h, "t1_c1_import", "1 3 8|a 96 72 100 96");
    snap_notes(h, "t1_c1_ruisel", notes, sizeof notes);
    HX_ASSERT(count_notes(notes) == 1 && strstr(notes, "96:72:"), "replace kept old notes");
    HX_ASSERT(geti(h, "t1_c1_tps") == 96 && geti(h, "t1_c1_length") == 8, "replace grid");
    /* one undo returns the clip as it was before the replace */
    hx_set_param(h, "undo_restore", "1");
    snap_notes(h, "t1_c1_ruisel", notes, sizeof notes);
    HX_ASSERT(strstr(notes, "24:50:") && strstr(notes, "0:60:") && !strstr(notes, "96:72:"),
              "undo did not restore the pre-import notes");
    HX_ASSERT(geti(h, "t1_c1_tps") == 24 && geti(h, "t1_c1_length") == 16, "undo did not restore the grid");
    hx_destroy(h);
}

/* An import clears the clip's pad-pressure automation (the UI's pa_clear takes
 * the parameter automation right after), and one Undo brings it back. */
static void test_clears_aftertouch_automation(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    at_auto_t *at = &inst->tracks[1].clip_at_auto[2];
    at->count[0] = 5; at->pitch[0] = 60;
    hx_set_param(h, "t1_c2_import", "0 1 16|a 0 60 100 24");
    HX_ASSERT(at->count[0] == 0 && at->pitch[0] == AT_LANE_FREE, "the import left the clip's aftertouch automation");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(at->count[0] == 5 && at->pitch[0] == 60, "undo did not bring the aftertouch automation back");
    hx_destroy(h);
}

static void test_refused_while_recording(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_recording", "1");
    hx_set_param(h, "t1_c0_import", "0 1 16|a 0 60 100 24");
    hx_set_param(h, "t1_recording", "0");
    char notes[4096]; snap_notes(h, "t1_c0_ruisel", notes, sizeof notes);
    HX_ASSERT(strstr(notes, "0:60:") == NULL, "import landed while the track recorded");
    hx_destroy(h);
}

static void test_drum_lanes(void) {
    hx_t *h = hx_create(NULL);
    /* active clip 0: 36 → lane 0, 38 → lane 2, 20 → no lane (dropped) */
    hx_set_param(h, "t0_c0_import", "0 1 32|a 0 36 100 24;a 96 38 90 24;a 192 20 80 24;a 384 36 70 24");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 2, "lane 0 (pitch 36) did not get 2 hits");
    HX_ASSERT(geti(h, "t0_l2_note_count") == 1, "lane 2 (pitch 38) did not get 1 hit");
    int l, total = 0;
    char key[32];
    for (l = 0; l < 32; l++) { snprintf(key, sizeof key, "t0_l%d_note_count", l); total += geti(h, key); }
    HX_ASSERT(total == 3, "a pitch with no lane was not dropped");
    for (l = 0; l < 32; l += 7) {
        snprintf(key, sizeof key, "t0_l%d_length", l);
        HX_ASSERT(geti(h, key) == 32, "every lane's length is set, hit or not");
        snprintf(key, sizeof key, "t0_l%d_tps", l);
        HX_ASSERT(geti(h, key) == 24, "every lane's resolution is set");
    }
    /* a clip that is NOT the active one */
    HX_ASSERT(geti(h, "t0_c2_drum_has_content") == 0, "clip 2 started non-empty");
    hx_set_param(h, "t0_c2_import", "0 1 16|a 0 37 100 24");
    HX_ASSERT(geti(h, "t0_c2_drum_has_content") == 1, "import into a non-active drum clip landed nothing");
    HX_ASSERT(geti(h, "t0_l1_note_count") == 0, "the non-active import leaked into the active clip");
    hx_destroy(h);
}

static void test_drum_replace(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_c0_import", "0 1 16|a 0 40 100 24");      /* lane 4 */
    HX_ASSERT(geti(h, "t0_l4_note_count") == 1, "precondition");
    hx_set_param(h, "t0_c0_import", "1 1 16|a 0 36 100 24");      /* replace */
    HX_ASSERT(geti(h, "t0_l4_note_count") == 0, "drum replace kept an old hit on another lane");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 1, "drum replace lost the import");
    hx_destroy(h);
}

static void test_drum_undo(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t0_c0_import", "1 1 16|a 0 36 100 24");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 1, "precondition");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(geti(h, "t0_l0_note_count") == 0, "undo did not take the drum import back");
    hx_destroy(h);

    /* The GRID comes back too: undo rebuilds the hits on the lane's grid, so a
     * grid left at the import's would play the restored pattern at the wrong
     * speed. */
    h = hx_create(NULL);
    hx_set_param(h, "t0_c0_import", "0 1 16|a 0 36 100 24");     /* lane 0 on 1/16 */
    hx_set_param(h, "t0_c0_import", "1 3 8|a 0 36 100 96");      /* replace on 1/4 */
    HX_ASSERT(geti(h, "t0_l0_tps") == 96, "precondition: the import's grid");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(geti(h, "t0_l0_tps") == 24 && geti(h, "t0_l0_length") == 16,
              "undo left the drum lanes on the import's grid");
    hx_set_param(h, "redo_restore", "1");
    HX_ASSERT(geti(h, "t0_l0_tps") == 96 && geti(h, "t0_l0_length") == 8,
              "redo did not put the import's grid back");
    hx_destroy(h);
}

int main(void) {
    test_melodic_lands();
    test_melodic_cap_and_clamp();
    test_replace_and_undo();
    test_clears_aftertouch_automation();
    test_refused_while_recording();
    test_drum_lanes();
    test_drum_replace();
    test_drum_undo();
    printf("PASS: midi import key (melodic, cap, clamp, replace, undo, recording, drum lanes)\n");
    return 0;
}
