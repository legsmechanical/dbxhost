/* tests/test_param_auto_wrap_playback.c — THE LOOP WRAP under real playback (6b2).
 *
 * Josh, 2026-09-11: "i've got a plock on step 13 turning reverb mix to ~50, then
 * one on step 14 turning mix to 0. but when the loop comes back around (1 bar),
 * it resets back to ~50 even though there's no p-lock on the first step."
 *
 * The same clip, the transport running two passes, the staged values read back
 * in order. RULED: hold the LAST value across the wrap — so after Play the value
 * is 0, step 13 takes it to ~50, step 14 back to 0, and the wrap changes NOTHING.
 * CONTROL: a lane with a single lock stages one value and never moves. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void lock(hx_t *h, const char *tgt, int step, int v) {
    char val[128];
    snprintf(val, sizeof val, "0 %s %d %d %d", tgt, step * 24, step * 24 + 23, v);
    hx_set_param(h, "t0_pa_set2", val);
}

/* The distinct values staged for `tgt`, in order, over `blocks` of playback. */
static int sequence(hx_t *h, const char *tgt, int *seq, int max, int blocks) {
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
    int seq[16];
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");      /* a playing clip */
        lock(h, "1:fx1:mix", 12, 8192);                        /* step 13: ~50 % */
        lock(h, "1:fx1:mix", 13, 0);                           /* step 14: 0 */
        hx_set_param(h, "transport", "play_focus:0:0");
        HX_ASSERT(in->tracks[0].clip_playing, "setup: the clip plays");
        /* ~1600 blocks ≈ 37 steps at the harness tempo: two passes and change. */
        int n = sequence(h, "1:fx1:mix", seq, 16, 1600);
        HX_ASSERT(n >= 1 && seq[0] == 0, "from Play: the LAST value (0) — the old rule started at ~50");
        HX_ASSERT(n >= 3 && seq[1] == 8192 && seq[2] == 0, "step 13 then step 14");
        HX_ASSERT(n == 5 && seq[3] == 8192 && seq[4] == 0,
                  "the second pass: step 13, step 14 again — and NOTHING at the wrap (old: back to ~50 on step 1)");
        OK("⭐ Josh's clip: step 1 stays at 0 across the wrap; only the locks move the value");
        hx_destroy(h);
    }
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
        lock(h, "1:fx1:mix", 12, 8192);                        /* ONE lock */
        hx_set_param(h, "transport", "play_focus:0:0");
        int n = sequence(h, "1:fx1:mix", seq, 16, 1600);
        HX_ASSERT(n == 1 && seq[0] == 8192, "a single lock stages its value once and never moves");
        OK("CONTROL: a lane with one lock behaves exactly as before");
        hx_destroy(h);
    }
    /* ---- Wrap: Reset — the RESTING value until the first point (Josh, 2026-09-11) ---- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        char buf[4096];
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
        lock(h, "1:fx1:mix", 12, 8192);
        lock(h, "1:fx1:mix", 13, 0);
        hx_set_param(h, "t0_pa_rest", "0 1:fx1:mix 3000");     /* where the knob sat, as the UI names it */
        hx_set_param(h, "t0_pa_wrap", "0 1:fx1:mix 1");
        hx_get_param(h, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "0 0 9 2 1:fx1:mix"), "pa_list reports the flag: ACTIVE | WRAP_RESET = 9");
        hx_set_param(h, "transport", "play_focus:0:0");
        int n = sequence(h, "1:fx1:mix", seq, 16, 1600);
        HX_ASSERT(n >= 6 && seq[0] == 3000 && seq[1] == 8192 && seq[2] == 0 &&
                  seq[3] == 3000 && seq[4] == 8192 && seq[5] == 0,
                  "Reset: the RESTING value (3000) from Play and again at every wrap, until step 13's lock");
        OK("⭐ Wrap: Reset goes back to the RESTING value until the first point — every pass");

        /* It persists: through the project's own serialize/parse. Serialized
         * now, parsed into a fresh instance below — ONE hx instance at a time
         * (g_inst is process-global), so this one is destroyed first. */
        char *mem = NULL; size_t len = 0;
        FILE *fp = open_memstream(&mem, &len);
        pa_serialize(in, fp); fclose(fp);

        hx_set_param(h, "t0_pa_wrap", "0 1:fx1:mix 0");
        hx_get_param(h, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "0 0 1 2 1:fx1:mix"), "back to Carry clears only that bit");
        hx_destroy(h);

        hx_t *h2 = hx_create(NULL);
        pa_parse((seq8_instance_t *)h2->inst, mem, len);
        hx_get_param(h2, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "0 0 9 2 1:fx1:mix"), "the Reset flag survives save + load");
        free(mem); hx_destroy(h2);
        OK("the Wrap setting persists with the project, and toggles back");
    }
    /* ---- Scale moves the lane's values, never the resting value ---- */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
        lock(h, "1:fx1:mix", 12, 8192);
        hx_set_param(h, "t0_pa_rest", "0 1:fx1:mix 3000");
        hx_set_param(h, "t0_pa_wrap", "0 1:fx1:mix 1");
        hx_set_param(h, "t0_pa_scale", "0 1:fx1:mix 50");
        hx_set_param(h, "transport", "play_focus:0:0");
        int n = sequence(h, "1:fx1:mix", seq, 16, 1000);
        HX_ASSERT(n >= 2 && seq[0] == 3000 && seq[1] == 4096,
                  "at 50 %: the rest stays 3000, the lock plays 4096 — Scale is the lane's, not the knob's");
        OK("Scale never touches the resting value");
        hx_destroy(h);
    }
    printf("test_param_auto_wrap_playback: %d ok\n", ok_count);
    return 0;
}
