/* tests/test_param_auto_steps.c — tN_cC_pa_steps, the step map the AUTOMATION
 * bank lights on the step row while its cursor sits on a lane.
 *
 * Covers: a point lands in the step the WRITER meant (a held step writes at
 * step * tps), the clip's OWN ticks_per_step is the unit (not the 24 default),
 * only this track + clip is listed, an empty clip answers an empty STRING, and
 * the mask stops after the last occupied step. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* A p-lock exactly as the UI writes it: pa_set2 over one step's tick span. */
static void plock(hx_t *h, int t, int c, const char *tgt, int step, int tps, int val) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_set2", t);
    snprintf(v, sizeof(v), "%d %s %d %d %d", c, tgt, step * tps, step * tps + tps - 1, val);
    hx_set_param(h, k, v);
}
static void pa_set(hx_t *h, int t, int c, const char *tgt, int tick, int val) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_set", t);
    snprintf(v, sizeof(v), "%d %s %d %d", c, tgt, tick, val);
    hx_set_param(h, k, v);
}
static int steps(hx_t *h, int t, int c, char *buf, int len) {
    char k[64];
    snprintf(k, sizeof(k), "t%d_c%d_pa_steps", t, c);
    buf[0] = 'X'; buf[1] = '\0';                  /* a stale buffer must not survive */
    return hx_get_param(h, k, buf, len);
}

int main(void) {
    char buf[8192];

    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create failed");

        /* ---- the empty answer ---------------------------------------- */
        steps(h, 1, 2, buf, sizeof(buf));
        HX_ASSERT(buf[0] == '\0', "an empty clip must answer an empty string, not leave the buffer");
        OK("a clip with no automation answers an empty string");

        /* ---- p-locks land where the writer put them ------------------- */
        plock(h, 1, 2, "0:synth:cutoff", 0, 24, 4000);
        plock(h, 1, 2, "0:synth:cutoff", 5, 24, 9000);
        plock(h, 1, 2, "cc:74", 3, 24, 100);
        steps(h, 1, 2, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "0:synth:cutoff 100001\n"), "cutoff: steps 0 and 5, mask ends at step 5");
        HX_ASSERT(strstr(buf, "cc:74 0001\n"), "cc:74: step 3 only");
        OK("each lane lists exactly the steps its p-locks were written on");

        /* ---- a point inside a step lights that step -------------------- */
        pa_set(h, 1, 2, "cc:74", 7 * 24 + 12, 50);     /* a recorded half-step cell */
        steps(h, 1, 2, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "cc:74 00010001\n"), "a mid-step point lights its step");
        OK("a point part-way into a step lights that step");

        /* ---- only this track and this clip ----------------------------- */
        plock(h, 1, 3, "0:synth:reso", 1, 24, 1);      /* other clip */
        plock(h, 2, 2, "1:synth:reso", 1, 24, 1);      /* other track */
        steps(h, 1, 2, buf, sizeof(buf));
        HX_ASSERT(!strstr(buf, "reso"), "another clip's or track's lanes must not be listed");
        steps(h, 1, 3, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "0:synth:reso 01\n") && !strstr(buf, "cutoff"), "clip 3 lists only its own");
        OK("the read is scoped to one track's one clip");

        /* ---- the clip's own ticks_per_step is the unit ----------------- */
        hx_set_param(h, "t3_c0_resolution", "2");      /* TPS_VALUES[2] = 48 */
        plock(h, 3, 0, "2:fx1:mix", 2, 48, 1);         /* the writer uses the clip's tps */
        steps(h, 3, 0, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "2:fx1:mix 001\n"), "at 48 tps, tick 96 is step 2 — not step 4");
        OK("steps are counted in the clip's own resolution");

        /* ---- a cleared lane leaves the map ----------------------------- */
        hx_set_param(h, "t1_pa_clear_key", "2 cc:74");
        steps(h, 1, 2, buf, sizeof(buf));
        HX_ASSERT(!strstr(buf, "cc:74") && strstr(buf, "0:synth:cutoff"), "cleared lane gone, sibling kept");
        OK("a cleared lane leaves the map; its siblings stay");

        hx_destroy(h);
    }

    printf("test_param_auto_steps: %d ok\n", ok_count);
    return 0;
}
