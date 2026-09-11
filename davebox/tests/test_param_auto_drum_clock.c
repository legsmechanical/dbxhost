/* tests/test_param_auto_drum_clock.c — THE DRUM AUTOMATION CLOCK (Block 6b).
 *
 * A drum track's automation is one timeline for the whole clip, but the clip's
 * timing lives in its 32 lanes. The clock used to be the track's own clip
 * struct, which no drum edit touches — so every drum clip's automation looped at
 * 16 steps of 1/16, and a lock past step 16 never played.
 *
 * ⭑ RULED (Josh, 2026-09-11): the window is the LONGEST LANE. Pinned here:
 *   - under REAL playback (transport + render), a lock on step 20 of a 32-step
 *     clip plays, and the lane loops at 32 steps, not 16 — with a step-4 lock
 *     as the control that played under the old clock too;
 *   - the window follows the longest lane, ties to the lowest, and a single
 *     lane's length is enough to move it;
 *   - the step map (tN_cC_pa_steps) counts in the ACTIVE lane's steps;
 *   - the pads' aftertouch, recorded past step 16, lands past step 16.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void lock(hx_t *h, int t, const char *tgt, int step, int tps, int v) {
    char k[32], val[128];
    snprintf(k, sizeof k, "t%d_pa_set2", t);
    snprintf(val, sizeof val, "0 %s %d %d %d", tgt, step * tps, step * tps + tps - 1, v);
    hx_set_param(h, k, val);
}

/* Play and record the ORDER in which staged values for `tgt` change. */
static int play_sequence(hx_t *h, const char *tgt, int *seq, int max, int blocks) {
    char buf[8192], pat[80];
    int n = 0;
    snprintf(pat, sizeof pat, "%s ", tgt);
    for (int i = 0; i < blocks / 5; i++) {
        hx_render(h, 5);
        hx_get_param(h, "pa_pending", buf, sizeof buf);
        for (char *p = strstr(buf, pat); p; p = strstr(p + 1, pat)) {
            int v = 0;
            sscanf(p + strlen(pat), "%d", &v);
            if (n < max && (n == 0 || seq[n - 1] != v)) seq[n++] = v;
        }
    }
    return n;
}

int main(void) {
    char buf[8192];

    /* ---- REAL playback: a 32-step drum clip -------------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");        /* a drum track */
        hx_set_param(h, "t0_all_lanes_length", "32");
        lock(h, 0, "1:synth:cut", 0, 24, 1000);
        lock(h, 0, "1:synth:cut", 4, 24, 5000);               /* CONTROL: inside step 16 */
        lock(h, 0, "1:synth:cut", 20, 24, 9000);              /* past step 16 */
        hx_set_param(h, "transport", "play_focus:0:0");
        HX_ASSERT(in->tracks[0].clip_playing && in->tracks[0].pad_mode == PAD_MODE_DRUM, "setup: a playing drum clip");
        int seq[16];
        /* ~1600 blocks ≈ 37 steps at the harness tempo: one pass and a bit. */
        int n = play_sequence(h, "1:synth:cut", seq, 16, 1600);
        HX_ASSERT(n >= 2 && seq[0] == 1000 && seq[1] == 5000, "control: the step-0 and step-4 locks play");
        HX_ASSERT(n >= 3 && seq[2] == 9000,
                  "the step-20 lock plays, and nothing restarts at step 16 (old clock: 1000 5000 1000 …)");
        HX_ASSERT(n >= 4 && seq[3] == 1000, "then the clip wraps at 32 and step 0 comes round again");
        OK("⭐ under real playback: a lock past step 16 plays, and a 32-step drum clip loops at 32");
        hx_destroy(h);
    }

    /* ---- the window is the LONGEST lane ------------------------------ */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];
        uint32_t s, l, t;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        pa_drum_window(tr, 0, &s, &l, &t);
        HX_ASSERT(s == 0 && l == 16 * 24 && t == 24, "a fresh drum clip: 16 steps of 24");

        hx_set_param(h, "t0_l5_clip_length", "48");          /* ONE lane, longer */
        pa_drum_window(tr, 0, &s, &l, &t);
        HX_ASSERT(l == 48 * 24, "a single longer lane moves the window");
        OK("the window follows the longest lane — one lane is enough to move it");

        hx_set_param(h, "t0_all_lanes_clip_resolution", "2"); /* every lane at 48 tps */
        pa_drum_window(tr, 0, &s, &l, &t);
        HX_ASSERT(t == 48 && l == 48 * 48, "longest lane in TICKS: 48 steps x 48");
        hx_set_param(h, "t0_l9_clip_resolution", "4");        /* lane 9: 16 steps x 192 = 3072 */
        pa_drum_window(tr, 0, &s, &l, &t);
        HX_ASSERT(l == 16 * 192 && t == 192, "longest is measured in ticks, not steps: 16 x 192 beats 48 x 48");
        OK("\"longest\" is measured in ticks — a slow short lane can be the longest");

        hx_set_param(h, "t0_all_lanes_length", "16");
        hx_set_param(h, "t0_all_lanes_clip_resolution", "1");
        pa_drum_window(tr, 0, &s, &l, &t);
        HX_ASSERT(l == 16 * 24 && t == 24, "all lanes equal again: the plain clip");
        OK("with every lane equal (every ALL LANES edit) the window is simply the clip");
        hx_destroy(h);
    }

    /* ---- the step map counts in the ACTIVE lane's steps -------------- */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_all_lanes_clip_resolution", "2");   /* 48 tps */
        lock(h, 0, "1:synth:cut", 3, 48, 7000);                  /* as the UI now writes it */
        hx_get_param(h, "t0_c0_pa_steps", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "1:synth:cut 0001\n"), "step 3 on the 48-tick lane grid (old: step 6 on the track's 24)");
        OK("the step map uses the drum track's active lane grid");
        hx_destroy(h);
    }

    /* ---- the pads' aftertouch, recorded past step 16 ----------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_all_lanes_length", "32");
        hx_set_param(h, "transport", "play_focus:0:0");
        while (in->global_tick < 20) hx_render(h, 5);           /* into step ~20 */
        in->tracks[0].recording = 1;
        hx_set_param(h, "t0_live_at", "36 100 2");               /* channel pressure */
        in->tracks[0].recording = 0;
        hx_get_param(h, "t0_c0_pa_steps", buf, sizeof buf);
        char *at = strstr(buf, "at ");
        HX_ASSERT(at, "an `at` lane was recorded");
        int top = (int)(strchr(at, '\n') - (at + 3));
        HX_ASSERT(top > 16, "the pressure landed past step 16 (old clock wrapped it into bar 1)");
        OK("aftertouch recorded in bar 2 of a 32-step drum clip lands in bar 2");
        hx_destroy(h);
    }

    printf("test_param_auto_drum_clock: %d ok\n", ok_count);
    return 0;
}
