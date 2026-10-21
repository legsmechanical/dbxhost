/* tests/test_param_auto_add.c — tN_pa_add, the AUTOMATION list's "+ Add lane".
 *
 * Josh, 2026-10-21: "we should also allow empty lanes to be created from the
 * automation lane list. we can already have empty lanes but we can't create
 * one." Pinned:
 *   - pa_add makes an EMPTY lane, listed (count 0, on), that plays nothing;
 *   - it survives save + reload;
 *   - a drum lane takes the active pad's cycle, as a first write would;
 *   - a lane already there is left as it is (points, settings);
 *   - a target another track owns is refused, and the conflict flagged;
 *   - a DELETED lane re-added comes back on, empty;
 *   - the first write into it lands with a start point, as into any lane.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* pa_list's line for `tg` on track `track`: flags, count, loop_len, step_ticks. */
static int listed(hx_t *h, int track, const char *tg, int *flags, int *count, int *ll, int *st) {
    char buf[8192], pat[96];
    hx_get_param(h, "pa_list", buf, sizeof buf);
    snprintf(pat, sizeof pat, " %s ", tg);
    for (char *p = strstr(buf, pat); p; p = strstr(p + 1, pat)) {
        char *ls = p;
        while (ls > buf && ls[-1] != '\n') ls--;
        int t = -1, c = 0, res = 0, sc = 0, lo = 0;
        *ll = 0; *st = 0;
        if (sscanf(ls, "%d %d %d %d", &t, &c, flags, count) != 4 || t != track) continue;
        sscanf(p + strlen(pat), "%d %d %d %d %d", ll, &res, &sc, &lo, st);
        return 1;
    }
    return 0;
}

static char big[sizeof(((seq8_instance_t *)0)->state_buf) * 2];
static void save_reload(hx_t **hp) {
    seq8_instance_t *in = (seq8_instance_t *)(*hp)->inst;
    FILE *fp = fmemopen(big, sizeof(big) - 1, "w");
    HX_ASSERT(fp, "fmemopen failed");
    seq8_do_serialize(in, fp);
    long n = ftell(fp);
    fclose(fp);
    HX_ASSERT(n > 0 && n < (long)sizeof(big) - 1, "serialized size out of range");
    char tmp[256];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_pa_add_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(big, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    hx_destroy(*hp);
    *hp = hx_create(NULL);
    in = (seq8_instance_t *)(*hp)->inst;
    strncpy(in->state_path, tmp, sizeof(in->state_path) - 1);
    seq8_load_state(in);
    remove(tmp);
}

int main(void) {
    int fl, cnt, ll, st;
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_pad_mode", "0");

    /* ---- an empty lane, listed, on, playing nothing ---------------------- */
    HX_ASSERT(!listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st), "setup: no lane yet");
    hx_set_param(h, "t1_pa_add", "0 2:synth:cutoff");
    HX_ASSERT(listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st), "⭐ the added lane is LISTED");
    HX_ASSERT(cnt == 0, "...empty");
    HX_ASSERT((fl & PA_FLAG_ACTIVE) && (fl & PA_FLAG_KEEP), "...on, and kept");
    {
        hx_set_param(h, "transport", "play_focus:1:0");
        char buf[8192];
        int any = 0;
        for (int i = 0; i < 40; i++) {
            hx_render(h, 5);
            hx_get_param(h, "pa_pending", buf, sizeof buf);
            if (strstr(buf, "2:synth:cutoff")) any = 1;
        }
        HX_ASSERT(!any, "the empty added lane staged a value");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 5);
    }
    OK("⭐ pa_add makes an empty lane: listed, on, silent");

    save_reload(&h);
    HX_ASSERT(listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st) && cnt == 0, "⭐ the added lane survives a reload");
    OK("an added lane is saved and loaded");

    /* ---- the first write lands in it, with a start point ----------------- */
    hx_set_param(h, "t1_pad_mode", "0");
    hx_set_param(h, "t1_pa_rest", "0 2:synth:cutoff 1000");
    hx_set_param(h, "t1_pa_hold_write", "0 2:synth:cutoff 4 4 24 9000 0 0");
    HX_ASSERT(listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st) && cnt == 2, "a POINT write: the start point and the point");
    OK("the first write into an added lane lands with its start point");

    /* ---- a lane already there is left alone ------------------------------ */
    hx_set_param(h, "t1_pa_wrap", "0 2:synth:cutoff 0");
    hx_set_param(h, "t1_pa_add", "0 2:synth:cutoff");
    HX_ASSERT(listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st) && cnt == 2, "⭐ pa_add emptied an existing lane");
    HX_ASSERT(!(fl & PA_FLAG_WRAP_RESET), "...or changed its settings");
    OK("⭐ pa_add on an existing lane changes nothing");

    /* ---- ownership -------------------------------------------------------- */
    {
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        in->pa_owner_conflict = 0;
        hx_set_param(h, "t3_pa_add", "0 2:synth:cutoff");
        HX_ASSERT(!listed(h, 3, "2:synth:cutoff", &fl, &cnt, &ll, &st), "⭐ another track added a lane for a target track 1 owns");
        HX_ASSERT(in->pa_owner_conflict == 2, "...and the conflict is flagged (owner track 1 + 1)");
    }
    OK("⭐ a target another track owns is refused, the conflict flagged");

    /* ---- a deleted lane re-added: on, empty ------------------------------- */
    hx_set_param(h, "t1_pa_active", "0 2:synth:cutoff 0");
    hx_set_param(h, "t1_pa_clear_key", "0 2:synth:cutoff");
    HX_ASSERT(!listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st), "setup: deleted");
    hx_set_param(h, "t1_pa_add", "0 2:synth:cutoff");
    HX_ASSERT(listed(h, 1, "2:synth:cutoff", &fl, &cnt, &ll, &st) && cnt == 0 && (fl & PA_FLAG_ACTIVE),
              "⭐ a deleted (muted) lane re-added is listed, empty and ON");
    OK("a deleted lane can be added again");

    /* ---- a drum lane takes the active pad's cycle ------------------------- */
    hx_set_param(h, "t0_l0_note_add", "0 100 24");
    hx_set_param(h, "t0_l2_clip_length", "12");
    hx_set_param(h, "t0_active_drum_lane", "2");
    hx_set_param(h, "t0_pa_add", "0 1:synth:res");
    HX_ASSERT(listed(h, 0, "1:synth:res", &fl, &cnt, &ll, &st), "setup: listed");
    HX_ASSERT(ll == 288 && st == 24, "⭐ the drum lane did not take the active pad's 12-step cycle");
    OK("⭐ a drum lane added takes the active pad's cycle");

    hx_destroy(h);
    printf("test_param_auto_add: %d ok\n", ok_count);
    return 0;
}
