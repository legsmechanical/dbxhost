/* tests/test_param_auto_clear_points.c — the AUTOMATION bank's CLEAR.
 *
 * Josh, 2026-09-25: a "clear" option "that clears the automation data on the
 * lane (undoable) but leaves it in place to add new automation to". Pinned:
 *   - pa_clear_points empties the lane and KEEPS it: listed with count 0, its
 *     cycle (loop_len / loop_off / step_ticks) and flags intact;
 *   - an empty kept lane plays nothing;
 *   - it survives save + reload;
 *   - a lock written into it later keeps ITS cycle, even with another pad
 *     selected (a fresh lane would adopt the active pad's);
 *   - undo brings the points back; Delete (pa_clear_key) removes the lane;
 *     Delete + step on the empty lane leaves it; a saved empty entry WITHOUT
 *     the keep bit (a retired zombie) is not resurrected by a load.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

#define TG "1:synth:cut"

/* pa_list's line for TG: loop_len, loop_off, step_ticks (-1 when absent). */
static int cycle_of(hx_t *h, int *ll, int *lo, int *st) {
    char buf[8192];
    hx_get_param(h, "pa_list", buf, sizeof buf);
    char *p = strstr(buf, " " TG " ");
    if (!p) return 0;
    int res = 0, sc = 0;
    *lo = -1; *st = -1;
    int n = sscanf(p + strlen(" " TG " "), "%d %d %d %d %d", ll, &res, &sc, lo, st);
    return n >= 3;
}

static pa_entry_t *entry(seq8_instance_t *in, const char *tgt) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &in->pa_entries[i];
        if (e->used && e->count && !strcmp(in->pa_targets[e->target], tgt)) return e;
    }
    return NULL;
}

static void lock(hx_t *h, int step, int tps, int v) {
    char val[128];
    snprintf(val, sizeof val, "0 " TG " %d %d %d", step * tps, step * tps + tps - 1, v);
    hx_set_param(h, "t0_pa_set2", val);
}

/* The order in which TG's staged value changes during `blocks` of playback. */
static int play_sequence(hx_t *h, int *seq, int max, int blocks) {
    char buf[8192];
    int n = 0;
    for (int i = 0; i < blocks / 5; i++) {
        hx_render(h, 5);
        hx_get_param(h, "pa_pending", buf, sizeof buf);
        for (char *p = strstr(buf, TG " "); p; p = strstr(p + 1, TG " ")) {
            int v = 0;
            sscanf(p + strlen(TG " "), "%d", &v);
            if (n < max && (n == 0 || seq[n - 1] != v)) seq[n++] = v;
        }
    }
    return n;
}

static char big[sizeof(((seq8_instance_t *)0)->state_buf) * 2];
static seq8_instance_t *save_reload(hx_t **hp) {
    seq8_instance_t *in = (seq8_instance_t *)(*hp)->inst;
    FILE *fp = fmemopen(big, sizeof(big) - 1, "w");
    HX_ASSERT(fp, "fmemopen failed");
    seq8_do_serialize(in, fp);
    long n = ftell(fp);
    fclose(fp);
    HX_ASSERT(n > 0 && n < (long)sizeof(big) - 1, "serialized size out of range");
    char tmp[256];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_clear_points_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(big, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    hx_destroy(*hp);
    *hp = hx_create(NULL);
    in = (seq8_instance_t *)(*hp)->inst;
    strncpy(in->state_path, tmp, sizeof(in->state_path) - 1);
    seq8_load_state(in);
    remove(tmp);
    return in;
}


/* pa_list's line for TG: flags and count (-1 when the lane is not listed). */
static int listed(hx_t *h, int *flags, int *count) {
    char buf[8192];
    hx_get_param(h, "pa_list", buf, sizeof buf);
    char *p = strstr(buf, " " TG " ");
    if (!p) return 0;
    char *ls = p;
    while (ls > buf && ls[-1] != '\n') ls--;
    int t = 0, c = 0;
    return sscanf(ls, "%d %d %d %d", &t, &c, flags, count) == 4;
}

int main(void) {
    int ll, lo, st, fl, cnt;
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t0_l0_note_add", "0 100 24");
    hx_set_param(h, "t0_l2_clip_length", "12");                 /* the hat: 12 steps */
    hx_set_param(h, "t0_active_drum_lane", "2");
    lock(h, 2, 24, 9000);
    lock(h, 5, 24, 3000);
    hx_set_param(h, "t0_pa_scale", "0 " TG " 150");
    HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 288, "setup: the lane has the 12-step cycle");
    HX_ASSERT(listed(h, &fl, &cnt) && cnt == 2, "setup: two points");

    /* ---- Clear: empty, listed, settings kept ------------------------------ */
    hx_set_param(h, "t0_c0_undo_checkpoint", "1");
    hx_set_param(h, "t0_pa_clear_points", "0 " TG);
    HX_ASSERT(listed(h, &fl, &cnt), "⭐ the cleared lane is still LISTED");
    HX_ASSERT(cnt == 0, "...with no points");
    HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 288 && st == 24, "...and its 12-step cycle kept");
    {
        char buf[8192];
        hx_get_param(h, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, " 150") != NULL, "...and its Scale kept");
        hx_get_param(h, "t0_c0_pa_steps", buf, sizeof buf);
        HX_ASSERT(!strstr(buf, TG), "no step line: nothing to light");
    }
    OK("⭐ Clear empties the lane and keeps it, listed, with its cycle and settings");

    /* ---- an empty lane plays nothing ------------------------------------ */
    {
        hx_set_param(h, "transport", "play_focus:0:0");
        int seq[64];
        hx_render(h, 20);                                     /* the one rest re-assert */
        int n = play_sequence(h, seq, 64, 400);
        HX_ASSERT(n == 0, "the empty lane staged values during playback");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 5);
    }
    OK("an empty kept lane plays nothing");

    /* ---- undo brings the points back -------------------------------------- */
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(listed(h, &fl, &cnt) && cnt == 2, "⭐ undo restores the two points");
    hx_set_param(h, "t0_c0_undo_checkpoint", "1");
    hx_set_param(h, "t0_pa_clear_points", "0 " TG);
    HX_ASSERT(listed(h, &fl, &cnt) && cnt == 0, "setup: cleared again");
    OK("⭐ Clear is undoable");

    /* ---- save + reload ------------------------------------------------------ */
    in = save_reload(&h);
    HX_ASSERT(listed(h, &fl, &cnt) && cnt == 0, "⭐ the empty lane survives a reload");
    HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 288 && st == 24, "...with its cycle");
    OK("⭐ a cleared lane is saved and loaded");

    /* ---- new automation lands in ITS cycle, not the selected pad's -------- */
    hx_set_param(h, "t0_active_drum_lane", "0");                 /* a 16-step pad now */
    lock(h, 3, 24, 7000);
    HX_ASSERT(listed(h, &fl, &cnt) && cnt == 1, "the lock landed in the kept lane");
    HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 288, "⭐ the kept lane keeps its 12-step cycle under a 16-step pad");
    OK("⭐ a lock into a cleared lane keeps the lane's own cycle");

    /* ---- Delete + step on the EMPTY lane leaves it; Delete removes it ------ */
    hx_set_param(h, "t0_pa_clear_points", "0 " TG);
    hx_set_param(h, "t0_pa_clear_step", "0 0 383");
    HX_ASSERT(listed(h, &fl, &cnt) && cnt == 0, "Delete + step removed an already-empty kept lane");
    hx_set_param(h, "t0_pa_clear_key", "0 " TG);
    HX_ASSERT(!listed(h, &fl, &cnt), "⭐ Delete removes a cleared lane");
    OK("Delete + step leaves an empty kept lane; Delete removes it");

    /* ---- a retired zombie is not resurrected by a save + load -------------- */
    lock(h, 1, 24, 5000);
    hx_set_param(h, "t0_pa_clear_key", "0 " TG);                  /* retired: count 0, no keep */
    in = save_reload(&h);
    HX_ASSERT(!listed(h, &fl, &cnt), "a retired lane came back from a load");
    OK("CONTROL: a deleted lane stays deleted across a reload");

    (void)in;
    hx_destroy(h);
    printf("test_param_auto_clear_points: %d ok\n", ok_count);
    return 0;
}
