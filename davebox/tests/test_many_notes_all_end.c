/* tests/test_many_notes_all_end.c — every note a track plays gets its
 * note-off, however many sound at once. A track kept the notes it was
 * sounding in a list of 32 to end each at its gate; a note played while the
 * list was full went out with no entry, and never got its note-off. The list
 * holds 64 now, and a note played while it is full ends the note nearest its
 * own end to make room. */
#include "pfx_rig.h"

static int run(int count) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    for (int i = 0; i < count; i++) clip_insert_note(cl, (uint32_t)i, 96, (uint8_t)(30 + i), 100);   /* all overlapping */
    clip_build_steps_from_notes(cl);
    rig_launch(h, 1, 0);
    hx_clear_capture(h);
    g_seen = 0; g_an = 0;
    rig_play(h);
    int guard = 400000;
    while (inst->playing && rig_now(h) < 300 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    int on[128] = { 0 }, ons = 0, hung = 0, cut = 0;
    uint32_t at[128] = { 0 };
    for (int i = 0; i < g_an; i++) {
        if (g_a[i].kind == 0) { on[g_a[i].a]++; ons++; at[g_a[i].a] = g_a[i].tick; }
        else if (g_a[i].kind == 3 && on[g_a[i].a] > 0) {
            on[g_a[i].a]--;
            /* the newest 64 keep their whole length (96 ticks); past 64 the
             * oldest, nearest their end, make room */
            const int idx = g_a[i].a - 30;
            if (idx >= count - 64 && g_a[i].tick - at[g_a[i].a] + 1 < 96) cut++;
        }
    }
    for (int p = 0; p < 128; p++) hung += on[p] > 0;
    printf("  %d notes at once: %d played, %d never ended, %d of the newest 64 cut short\n", count, ons, hung, cut);
    hung += cut;
    HX_ASSERT(ons == count, "control: every note played");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    return hung;
}

int main(void) {
    int bad = 0;
    bad += run(32) != 0;   /* fitted before too */
    bad += run(40) != 0;   /* the list of 32 overflowed */
    bad += run(64) != 0;
    bad += run(80) != 0;   /* past the list of 64: the nearest end makes room */
    HX_ASSERT(bad == 0, "every note gets its note-off");
    printf("PASS: many notes all end\n");
    return 0;
}
